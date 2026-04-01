# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import json
import frappe
from frappe import _
from frappe.utils import now_datetime, flt


# ==========================================
# Internal helpers
# ==========================================


def _get_token_doc(token):
	"""Fetch Guest Order Token by token value. Throws if not found."""
	name = frappe.db.get_value("Guest Order Token", {"token": token}, "name")
	if not name:
		frappe.throw(_("Invalid or unknown token."), frappe.AuthenticationError)
	return frappe.get_doc("Guest Order Token", name)


def _require_valid_token(token):
	"""Return the token doc if valid, throw AuthenticationError otherwise."""
	token_doc = _get_token_doc(token)
	if not token_doc.is_valid():
		frappe.throw(_("This session has expired or is no longer active."), frappe.AuthenticationError)
	return token_doc


def _get_restaurant_settings():
	"""Return Restaurant Settings as a dict."""
	return frappe.get_single("Restaurant Settings")


def _get_active_pos_opening(pos_profile):
	"""Return the name of the current open POS Opening Entry for a profile."""
	result = frappe.db.get_value(
		"POS Opening Entry",
		{"pos_profile": pos_profile, "status": "Open", "docstatus": 1},
		"name",
		order_by="creation desc",
	)
	return result


def _get_or_create_invoice(token_doc):
	"""Return the existing draft invoice for this token's table, or None if missing."""
	if token_doc.invoice:
		if frappe.db.exists("Sales Invoice", {"name": token_doc.invoice, "docstatus": 0}):
			return frappe.get_doc("Sales Invoice", token_doc.invoice)
		# Invoice was submitted or cancelled — clear the link via DB (avoids TimestampMismatchError)
		frappe.db.set_value("Guest Order Token", token_doc.name, "invoice", None)
		token_doc.invoice = None

	if token_doc.mode == "restaurant" and token_doc.table:
		# Look for an existing draft on the table
		existing = frappe.db.get_value(
			"Sales Invoice",
			{"docstatus": 0, "restaurant_table": token_doc.table},
			"name",
			order_by="creation desc",
		)
		if existing:
			# Link token to invoice via DB (avoids TimestampMismatchError)
			frappe.db.set_value("Guest Order Token", token_doc.name, "invoice", existing)
			token_doc.invoice = existing
			return frappe.get_doc("Sales Invoice", existing)

	return None


def _get_timeslot_cards(settings):
	"""Find restaurant cards active for the current time slot (Opening Hours logic)."""
	import calendar
	from frappe.utils import nowtime, get_time, nowdate, getdate

	if not settings.opening_hours:
		return []

	today_name = calendar.day_name[getdate(nowdate()).weekday()]
	now = get_time(nowtime())

	matching_cards = []
	for row in settings.opening_hours:
		if row.day_of_week != today_name:
			continue
		ft_str = row.from_time
		tt_str = row.to_time
		if not ft_str or not tt_str:
			continue

		ft = get_time(str(ft_str))
		tt = get_time(str(tt_str))

		in_slot = False
		if ft <= tt:
			in_slot = ft <= now <= tt
		else:
			in_slot = now >= ft or now <= tt

		if in_slot and row.restaurant_card:
			if row.restaurant_card not in matching_cards:
				matching_cards.append(row.restaurant_card)

	return matching_cards


def _get_guest_menu_card(settings):
	"""Return the Restaurant Card to use as guest menu."""
	if settings.guest_menu:
		return settings.guest_menu
	# Fall back to a card flagged as is_guest_menu
	name = frappe.db.get_value("Restaurant Card", {"is_guest_menu": 1, "is_active": 1}, "name")
	return name


def _build_menu_from_card(card_name, warehouse=None):
	"""Build menu structure (categories + items) from a Restaurant Card."""
	card = frappe.get_doc("Restaurant Card", card_name)
	card_items = frappe.get_all(
		"Restaurant Card Item",
		filters={"parent": card_name},
		fields=["item_type", "label", "item", "price", "sort_order", "disabled"],
		order_by="sort_order asc, idx asc",
	)

	categories = []
	current_category = {"label": "", "menu_items": []}

	for ci in card_items:
		if ci.get("disabled"):
			continue

		if ci.item_type == "Category":
			if current_category["menu_items"] or current_category["label"]:
				categories.append(current_category)
			current_category = {"label": ci.label or "", "menu_items": []}
			continue

		if ci.item_type != "Item" or not ci.item:
			continue

		item_doc = frappe.get_cached_doc("Item", ci.item)
		price = ci.price or item_doc.get("standard_rate") or 0

		raw_desc = item_doc.get("description") or ""
		clean_desc = frappe.utils.strip_html_tags(raw_desc).strip() if raw_desc else ""

		item_data = {
			"item_code": ci.item,
			"item_name": ci.label or item_doc.item_name,
			"description": clean_desc,
			"price": float(price),
			"image": item_doc.get("image") or "",
			"product_options": _get_item_product_options(ci.item),
		}

		# Add stock info for stock items
		if item_doc.get("is_stock_item"):
			item_data["is_stock_item"] = True
			stock_qty = 0
			if warehouse:
				stock_qty = frappe.db.get_value(
					"Bin", {"item_code": ci.item, "warehouse": warehouse}, "actual_qty"
				) or 0
			else:
				stock_qty = frappe.db.sql(
					"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code=%s",
					ci.item,
				)[0][0] or 0
			item_data["actual_qty"] = float(stock_qty)

		current_category["menu_items"].append(item_data)

	if current_category["menu_items"]:
		categories.append(current_category)

	# Drop empty categories
	categories = [c for c in categories if c["menu_items"]]

	return {
		"card": {
			"card_name": card.card_name,
			"description": card.description or "",
			"image": card.image or "",
		},
		"categories": categories,
	}


def _get_item_product_options(item_code):
	"""Return product option groups applicable to an item."""
	item_group = frappe.db.get_value("Item", item_code, "item_group")
	direct = frappe.get_all(
		"Product Option Group Item",
		filters={"item": item_code, "parenttype": "Product Option Group"},
		pluck="parent",
	)
	group_based = frappe.get_all(
		"Product Option Group Item Group",
		filters={"item_group": item_group, "parenttype": "Product Option Group"},
		pluck="parent",
	)
	group_names = list(set(direct + group_based))
	if not group_names:
		return []

	groups = frappe.get_all(
		"Product Option Group",
		filters={"name": ("in", group_names)},
		fields=["name", "group_name", "selection_type", "required"],
	)
	result = []
	for g in groups:
		options = frappe.get_all(
			"Product Option",
			filters={"parent": g.name},
			fields=["option_name", "price_adjustment"],
			order_by="idx asc",
		)
		result.append({
			"group_name": g.group_name,
			"selection_type": g.selection_type,
			"required": bool(g.required),
			"options": [
				{
					"option_name": o.option_name,
					"price_adjustment": float(o.price_adjustment or 0),
				}
				for o in options
			],
		})
	return result


def _broadcast_order_update(table_name, event_type, data):
	"""Publish a realtime event to all clients watching a table."""
	payload = {"event": event_type, "table": table_name}
	payload.update(data)
	frappe.publish_realtime(
		"guest_order_update",
		payload,
		room=f"guest_table_{table_name}",
	)


# ==========================================
# Public guest API endpoints
# ==========================================


@frappe.whitelist(allow_guest=True)
def validate_token(token):
	"""
	Validate a guest token and return table + settings info.
	Used on guest app mount to check session validity.
	"""
	token_doc = _require_valid_token(token)
	settings = _get_restaurant_settings()

	table_info = None
	if token_doc.table:
		table_info = frappe.db.get_value(
			"Restaurant Table",
			token_doc.table,
			["name", "table_name", "area", "capacity", "status"],
			as_dict=True,
		)

	# Get currency from POS Profile
	currency = None
	company = None
	if token_doc.pos_profile:
		profile_data = frappe.db.get_value(
			"POS Profile", token_doc.pos_profile, ["currency", "company"], as_dict=True
		)
		currency = profile_data.currency if profile_data else None
		company = profile_data.company if profile_data else None
	if not currency:
		currency = frappe.defaults.get_global_default("currency") or "CHF"
	if not company:
		company = frappe.defaults.get_defaults().get("company")

	# Get company logo
	company_logo = ""
	if company:
		company_logo = frappe.db.get_value("Company", company, "company_logo") or ""

	return {
		"valid": True,
		"mode": token_doc.mode,
		"table": table_info,
		"pos_profile": token_doc.pos_profile,
		"currency": currency,
		"company_logo": company_logo,
		"qr_order_validation": settings.qr_order_validation or "Direct to Kitchen",
		"guest_account_mode": settings.guest_account_mode or "Not Proposed",
		"has_loyalty_program": bool(frappe.db.get_single_value("POS Settings", "enable_loyalty_program") or 0),
	}


@frappe.whitelist(allow_guest=True)
def get_guest_menu(token):
	"""
	Return the guest menu (categories + items) for a valid token.
	Uses time-slot based card selection (same as Opening Hours), falling back to
	settings.guest_menu or the card flagged as_guest_menu.
	"""
	token_doc = _require_valid_token(token)
	settings = _get_restaurant_settings()

	# Resolve warehouse from POS Profile for stock display
	warehouse = None
	if token_doc.pos_profile:
		warehouse = frappe.db.get_value("POS Profile", token_doc.pos_profile, "warehouse")

	# Try time-slot based card selection first
	card_names = _get_timeslot_cards(settings)
	if not card_names:
		# Fall back to configured guest menu or flagged card
		fallback = _get_guest_menu_card(settings)
		if fallback:
			card_names = [fallback]

	if not card_names:
		frappe.throw(_("No guest menu is configured. Please contact staff."))

	# Build menu from all matching cards (merge if multiple)
	all_categories = []
	for card_name in card_names:
		result = _build_menu_from_card(card_name, warehouse=warehouse)
		all_categories.extend(result.get("categories", []))

	return {
		"card": {"card_name": ", ".join(card_names), "description": "", "image": ""},
		"categories": all_categories,
	}


@frappe.whitelist(allow_guest=True)
def submit_guest_order(token, items):
	"""
	Add items to the invoice linked to this guest token.
	Creates a new draft invoice if none exists yet.
	Respects the qr_order_validation setting (direct or server-approval).
	"""
	token_doc = _require_valid_token(token)

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided."))

	settings = _get_restaurant_settings()
	validation_mode = settings.qr_order_validation or "Direct to Kitchen"

	invoice_doc = _get_or_create_invoice(token_doc)
	is_new_invoice = not invoice_doc

	if is_new_invoice:
		# Create a new draft invoice
		if not token_doc.pos_profile:
			frappe.throw(_("No POS Profile linked to this session."))

		pos_profile_doc = frappe.get_cached_doc("POS Profile", token_doc.pos_profile)
		invoice_data = {
			"doctype": "Sales Invoice",
			"is_pos": 1,
			"pos_profile": token_doc.pos_profile,
			"company": pos_profile_doc.company,
			"currency": pos_profile_doc.currency or frappe.defaults.get_global_default("currency"),
			"customer": pos_profile_doc.customer or frappe.db.get_single_value("Selling Settings", "customer") or "Guest",
			"items": [],
		}
		if token_doc.table:
			invoice_data["restaurant_table"] = token_doc.table

		invoice_doc = frappe.get_doc(invoice_data)

	# Append incoming items (before insert for new invoices to avoid validation errors)
	has_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	has_kds_batch = frappe.db.has_column("Sales Invoice Item", "kds_batch")

	# Determine next batch number
	next_batch = 1
	if has_kds_batch and not is_new_invoice:
		existing_batches = [flt(row.get("kds_batch") or 0) for row in invoice_doc.items]
		next_batch = int(max(existing_batches, default=0)) + 1

	# Build map of existing items to prevent re-adding items already on the invoice
	import json as _json
	existing_item_keys = set()
	for row in invoice_doc.items:
		key = row.item_code
		if hasattr(row, "posa_item_modifiers") and row.posa_item_modifiers:
			key += "|" + str(row.posa_item_modifiers)
		existing_item_keys.add(key)

	for item in items:
		item_code = item.get("item_code")
		if not item_code:
			continue

		# Build dedup key: item_code + modifiers
		modifiers = item.get("modifiers")
		mod_str = _json.dumps(modifiers) if modifiers and not isinstance(modifiers, str) else (modifiers or "")
		item_key = item_code + ("|" + mod_str if mod_str else "")

		# Skip if this exact item (same code + modifiers) already exists in the invoice
		if item_key in existing_item_keys:
			continue

		qty = flt(item.get("qty", 1))
		rate = flt(item.get("rate") or item.get("price") or 0)
		if not rate:
			rate = flt(frappe.db.get_value("Item", item_code, "standard_rate") or 0)

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})

		if has_kds:
			if validation_mode == "Direct to Kitchen":
				row.kds_status = "Pending"
			else:
				row.kds_status = "Waiting"

		if has_kds_batch:
			row.kds_batch = next_batch

		if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
			row.posa_special_instructions = item.get("special_instructions") or ""

		if frappe.db.has_column("Sales Invoice Item", "posa_item_modifiers"):
			if mod_str:
				row.posa_item_modifiers = mod_str

		# Track so subsequent duplicates in same submission are also caught
		existing_item_keys.add(item_key)

	invoice_doc.flags.ignore_permissions = True
	if is_new_invoice:
		invoice_doc.insert()
		# Link invoice to token
		token_doc.invoice = invoice_doc.name
		token_doc.flags.ignore_version = True
		token_doc.save(ignore_permissions=True)
	else:
		invoice_doc.flags.ignore_version = True
		invoice_doc.save()

	if token_doc.table:
		event_type = "order_submitted" if validation_mode == "Direct to Kitchen" else "order_pending_approval"
		_broadcast_order_update(token_doc.table, event_type, {
			"invoice": invoice_doc.name,
			"items_count": len(items),
			"validation_mode": validation_mode,
		})

		# Notify all POS clients (global, not room-scoped)
		frappe.publish_realtime("guest_order_submitted", {
			"table": token_doc.table,
			"invoice": invoice_doc.name,
			"items_count": len(items),
		})
		frappe.publish_realtime("table_update")

		if validation_mode == "Server Approval":
			frappe.publish_realtime("guest_order_pending", {
				"table": token_doc.table,
				"invoice": invoice_doc.name,
				"items": items,
			})

	return {
		"invoice": invoice_doc.name,
		"grand_total": flt(invoice_doc.grand_total),
		"status": "pending_approval" if validation_mode == "Server Approval" else "sent_to_kitchen",
	}


@frappe.whitelist(allow_guest=True)
def get_order_status(token):
	"""
	Return current items and totals for the guest session.
	Also finds submitted invoices (after guest payment).
	"""
	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	# If no draft found, check for a recently submitted invoice for this table
	if not invoice_doc and token_doc.table:
		submitted = frappe.db.get_value(
			"Sales Invoice",
			{"docstatus": 1, "restaurant_table": token_doc.table},
			"name",
			order_by="modified desc",
		)
		if submitted:
			invoice_doc = frappe.get_doc("Sales Invoice", submitted)

	if not invoice_doc:
		return {"invoice": None, "items": [], "grand_total": 0, "net_total": 0}

	item_fields = ["item_code", "item_name", "qty", "rate", "amount"]
	if frappe.db.has_column("Sales Invoice Item", "kds_status"):
		item_fields.append("kds_status")
	if frappe.db.has_column("Sales Invoice Item", "kds_batch"):
		item_fields.append("kds_batch")
	if frappe.db.has_column("Sales Invoice Item", "posa_special_instructions"):
		item_fields.append("posa_special_instructions")

	items = frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": invoice_doc.name},
		fields=item_fields,
	)

	return {
		"invoice": invoice_doc.name,
		"items": items,
		"grand_total": flt(invoice_doc.grand_total),
		"net_total": flt(invoice_doc.net_total),
		"paid_amount": flt(invoice_doc.paid_amount) if hasattr(invoice_doc, "paid_amount") else 0,
		"total_taxes_and_charges": flt(invoice_doc.total_taxes_and_charges) if hasattr(invoice_doc, "total_taxes_and_charges") else 0,
		"company": invoice_doc.company or "",
		"posting_date": str(invoice_doc.posting_date or invoice_doc.creation),
	}


@frappe.whitelist(allow_guest=True)
def get_guest_receipt_pdf(token):
	"""Generate and return a receipt PDF for a guest token's invoice."""
	# Accept both Active and Expired tokens (guest may re-download receipt)
	token_doc = _get_token_doc(token)
	if not token_doc.invoice:
		frappe.throw(_("No invoice found for this session."))

	invoice_name = token_doc.invoice
	if not frappe.db.exists("Sales Invoice", invoice_name):
		frappe.throw(_("Invoice not found."))

	# Get print format from POS Profile (same as POS receipt printing)
	print_format = None
	if token_doc.pos_profile:
		print_format = frappe.db.get_value("POS Profile", token_doc.pos_profile, "print_format")
	if not print_format:
		print_format = "POS Next Receipt"

	from frappe.utils.pdf import get_pdf

	# Bypass print permissions — guest is authenticated via token, not via Frappe session
	frappe.flags.ignore_permissions = True
	frappe.flags.ignore_print_permissions = True
	try:
		try:
			html = frappe.get_print("Sales Invoice", invoice_name, print_format)
		except Exception:
			html = frappe.get_print("Sales Invoice", invoice_name)
		pdf = get_pdf(html)
	finally:
		frappe.flags.ignore_print_permissions = False
		frappe.flags.ignore_permissions = False

	frappe.local.response.filename = f"receipt-{invoice_name}.pdf"
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"


@frappe.whitelist(allow_guest=True)
def create_guest_payment(token, amount, payment_items=None, tip=0, success_url=None, failed_url=None):
	"""
	Create a Wallee transaction for a guest payment.
	Supports tip amount and redirect URLs for Wallee payment page.
	Returns the Wallee payment URL for redirect.
	"""
	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	if not invoice_doc:
		frappe.throw(_("No active order found for this session."))

	amount = flt(amount)
	tip = flt(tip)
	if amount <= 0:
		frappe.throw(_("Payment amount must be greater than zero."))

	currency = invoice_doc.currency or frappe.defaults.get_global_default("currency")

	try:
		from wallee_integration.wallee_integration.api.transaction import create_transaction

		# Unique payment counter for split payments (prevents Wallee duplicate rejection)
		existing_payment_count = frappe.db.count("Sales Invoice Payment", {"parent": invoice_doc.name})
		payment_num = existing_payment_count + 1

		# Build line items: order amount + optional tip
		line_items = [
			{
				"name": _("Order {0}").format(invoice_doc.name),
				"quantity": 1,
				"amount_including_tax": round(float(amount - tip), 2),
				"type": "PRODUCT",
				"unique_id": f"{invoice_doc.name}-p{payment_num}",
			}
		]
		if tip > 0:
			line_items.append({
				"name": _("Tip"),
				"quantity": 1,
				"amount_including_tax": round(float(tip), 2),
				"type": "FEE",
				"unique_id": f"{invoice_doc.name}-tip-p{payment_num}",
			})

		result = create_transaction(
			line_items=line_items,
			currency=currency,
			merchant_reference=invoice_doc.name,
			success_url=success_url or None,
			failed_url=failed_url or None,
		)
	except ImportError:
		frappe.throw(_("Wallee integration is not available on this instance."))
	except Exception as e:
		import traceback
		frappe.log_error("Guest payment creation failed",
			f"Amount: {amount}, Tip: {tip}, Invoice: {invoice_doc.name}\n"
			f"Error: {str(e)}\n{traceback.format_exc()}")
		frappe.throw(_("Failed to initiate payment. Please try again or contact staff."))

	# Store pending payment info in the transaction result for later confirmation
	# Do NOT record payment or change table status yet — Wallee hasn't confirmed
	result["_pending"] = {
		"invoice": invoice_doc.name,
		"amount": amount,
		"tip": tip,
		"table": token_doc.table,
	}

	if token_doc.table:
		_broadcast_order_update(token_doc.table, "payment_initiated", {
			"invoice": invoice_doc.name,
			"amount": amount,
			"paid_amount": flt(invoice_doc.paid_amount),
			"grand_total": flt(invoice_doc.grand_total),
		})

	return result


@frappe.whitelist(allow_guest=True)
def confirm_guest_payment(token, amount, tip=0):
	"""
	Confirm a guest payment after Wallee redirect success.
	Records the payment via Frappe ORM (same as POS).
	If fully paid, submits the invoice (creates GL entries).
	"""
	token_doc = _require_valid_token(token)
	invoice_doc = _get_or_create_invoice(token_doc)

	if not invoice_doc:
		frappe.throw(_("No active order found for this session."))

	amount = flt(amount)
	tip = flt(tip)
	order_payment = flt(amount) - flt(tip)

	try:
		# Get mode of payment from Wallee Settings
		wallee_mop = frappe.db.get_single_value("Wallee Settings", "pos_mode_of_payment")
		if not wallee_mop:
			wallee_mop = "Carte de crédit"

		# Prevent duplicate confirmation
		current_paid = flt(invoice_doc.paid_amount)
		grand_total = flt(invoice_doc.grand_total)
		if grand_total > 0 and current_paid + order_payment > grand_total * 1.01:
			return {"status": "already_paid", "paid_amount": current_paid, "grand_total": grand_total}

		# Reload full invoice via ORM (not stale cached version)
		invoice_doc = frappe.get_doc("Sales Invoice", invoice_doc.name)
		frappe.log_error("Guest payment debug",
			f"Invoice: {invoice_doc.name}, table: {invoice_doc.restaurant_table}, "
			f"docstatus: {invoice_doc.docstatus}, grand_total: {invoice_doc.grand_total}, "
			f"paid: {invoice_doc.paid_amount}, payment: {order_payment}, tip: {tip}, "
			f"token_table: {token_doc.table}, existing_payments: {[(p.mode_of_payment, p.amount) for p in invoice_doc.payments]}"
		)

		# Find existing payment row with same mode_of_payment, or create one
		existing_row = None
		for row in invoice_doc.payments:
			if row.mode_of_payment == wallee_mop:
				existing_row = row
				break

		if existing_row:
			existing_row.amount = flt(existing_row.amount) + order_payment
		else:
			invoice_doc.append("payments", {
				"mode_of_payment": wallee_mop,
				"amount": order_payment,
			})

		# Remove zero-amount payment rows (e.g. default "Espèce" at 0.00)
		invoice_doc.payments = [p for p in invoice_doc.payments if flt(p.amount) > 0]

		# Recalculate paid_amount
		new_paid = sum(flt(p.amount) for p in invoice_doc.payments)
		invoice_doc.paid_amount = new_paid

		# Set payment accounts (same as POS submit flow)
		from pos_next.api.invoices import _set_payment_accounts
		_set_payment_accounts(invoice_doc.payments, invoice_doc.company)

		fully_paid = new_paid >= grand_total and grand_total > 0

		if fully_paid:
			# Submit the invoice (creates GL entries, Payment Entry, etc.)
			invoice_doc.ignore_pricing_rule = 1
			invoice_doc.flags.ignore_pricing_rule = True
			invoice_doc.flags.ignore_permissions = True
			invoice_doc.flags.ignore_version = True
			frappe.flags.ignore_account_permission = True
			invoice_doc.save()
			invoice_doc.submit()

			# Table → Paid (guest payment — cashier sees it and decides next step)
			if token_doc.table and frappe.db.exists("Restaurant Table", token_doc.table):
				frappe.db.set_value("Restaurant Table", token_doc.table, "status", "Paid")
			frappe.publish_realtime("table_update")
		else:
			# Partial payment — just save the draft
			invoice_doc.flags.ignore_permissions = True
			invoice_doc.flags.ignore_version = True
			invoice_doc.save()

		frappe.db.commit()

		# Create Restaurant Tip record (always create if guest sends a tip)
		if flt(tip) > 0 and frappe.db.exists("DocType", "Restaurant Tip"):
			try:
				frappe.get_doc({
					"doctype": "Restaurant Tip",
					"tip_date": frappe.utils.today(),
					"sales_invoice": invoice_doc.name,
					"restaurant_table": token_doc.table,
					"server": invoice_doc.owner or "Administrator",
					"amount": flt(tip),
					"payment_method": wallee_mop,
					"status": "Collected",
				}).insert(ignore_permissions=True)
				frappe.db.commit()
			except Exception as tip_err:
				frappe.log_error("Guest tip record failed", str(tip_err))

		if token_doc.table:
			frappe.publish_realtime("guest_payment_received", {
				"table": token_doc.table,
				"invoice": invoice_doc.name,
				"paid_amount": new_paid,
				"grand_total": grand_total,
				"submitted": fully_paid,
			})

		return {"status": "success", "paid_amount": new_paid, "grand_total": grand_total, "submitted": fully_paid}

	except Exception as e:
		import traceback
		frappe.log_error(
			"Guest payment confirmation failed",
			f"Invoice: {invoice_doc.name}, Amount: {amount}\n"
			f"Error: {str(e)}\n{traceback.format_exc()}"
		)
		return {"status": "error"}


# ==========================================
# Authenticated endpoints (server-side)
# ==========================================


@frappe.whitelist()
def create_table_token(table, pos_profile):
	"""
	Create a Guest Order Token for a restaurant table.
	Called by the server POS when opening a table with QR ordering enabled.
	Returns the token value and the guest URL.
	"""
	if not frappe.has_permission("Guest Order Token", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.db.exists("Restaurant Table", table):
		frappe.throw(_("Table {0} not found.").format(table))

	# Find the current open POS opening
	pos_opening = _get_active_pos_opening(pos_profile)

	# Expire any existing active token for this table
	existing_tokens = frappe.get_all(
		"Guest Order Token",
		filters={"table": table, "status": "Active"},
		pluck="name",
	)
	for t_name in existing_tokens:
		try:
			t_doc = frappe.get_doc("Guest Order Token", t_name)
			t_doc.expire()
		except Exception as e:
			# Force expire via DB if ORM fails (e.g. validation errors on old tokens)
			frappe.db.set_value("Guest Order Token", t_name, "status", "Expired")
			frappe.log_error("Token expire fallback", f"Token {t_name}: {str(e)}")

	# Compute expires_at from settings
	settings = _get_restaurant_settings()
	expires_at = None
	if settings.token_expiry_mode == "Timed":
		days = settings.token_expiry_days or 7
		expires_at = frappe.utils.add_days(now_datetime(), days)

	token_doc = frappe.get_doc({
		"doctype": "Guest Order Token",
		"mode": "restaurant",
		"table": table,
		"pos_profile": pos_profile,
		"pos_opening": pos_opening,
		"expires_at": expires_at,
	})
	token_doc.flags.ignore_permissions = True
	token_doc.flags.ignore_validate = True
	token_doc.insert()

	# Mark table as Occupied when QR is generated (guests are seated)
	current_status = frappe.db.get_value("Restaurant Table", table, "status")
	if current_status == "Empty":
		frappe.db.set_value("Restaurant Table", table, "status", "Occupied")
		frappe.publish_realtime("table_update")

	site_url = frappe.utils.get_url()
	guest_url = f"{site_url}/pos/guest/{token_doc.token}"

	return {
		"token": token_doc.token,
		"url": guest_url,
		"name": token_doc.name,
	}


# ==========================================
# Takeaway-specific endpoints
# ==========================================


@frappe.whitelist(allow_guest=True, methods=["POST"])
def create_takeaway_token():
	"""
	Create a Guest Order Token for a takeaway web order (no table binding).
	Called when a visitor starts a takeaway order.
	Rate-limited: max 10 tokens per IP per hour.
	"""
	# Rate limiting: max 10 takeaway tokens per IP per hour
	client_ip = frappe.local.request_ip
	one_hour_ago = frappe.utils.add_to_date(now_datetime(), hours=-1)
	recent_count = frappe.db.count(
		"Guest Order Token",
		{"mode": "takeaway", "creation": (">=", one_hour_ago), "owner": "Guest"}
	)
	if recent_count >= 50:
		frappe.throw(_("Too many requests. Please try again later."), frappe.RateLimitExceededError)

	settings = _get_restaurant_settings()
	if not settings.enable_web_takeaway:
		frappe.throw(_("Takeaway web ordering is not enabled."))

	# Compute expires_at from settings
	expires_at = None
	if settings.token_expiry_mode == "Timed":
		days = settings.token_expiry_days or 7
		expires_at = frappe.utils.add_days(now_datetime(), days)

	token_doc = frappe.get_doc({
		"doctype": "Guest Order Token",
		"mode": "takeaway",
		"expires_at": expires_at,
	})
	token_doc.flags.ignore_permissions = True
	token_doc.insert()

	return {"token": token_doc.token, "name": token_doc.name}


@frappe.whitelist(allow_guest=True)
def submit_takeaway_order(token, items, customer=None):
	"""
	Finalize a takeaway order after payment.
	Creates a POS Invoice flagged as takeaway.
	Payment must be completed before this endpoint will finalize the order.
	"""
	token_doc = _require_valid_token(token)

	if token_doc.mode != "takeaway":
		frappe.throw(_("This endpoint is only valid for takeaway sessions."))

	if isinstance(items, str):
		items = json.loads(items)

	if not items:
		frappe.throw(_("No items provided."))

	# Takeaway orders require a valid customer
	customer_name = customer or frappe.session.user
	if not customer_name or customer_name == "Guest":
		frappe.throw(_("A customer account is required for takeaway orders."))
	# Validate that the customer exists in ERPNext
	if not frappe.db.exists("Customer", customer_name):
		frappe.throw(_("Customer {0} not found.").format(customer_name))

	# Enforce payment before order finalization
	# Check if a Wallee transaction was created and completed for this token
	has_payment = frappe.db.exists(
		"Wallee Transaction",
		{"merchant_reference": token_doc.invoice, "status": ("in", ["Fulfill", "Completed", "Authorized"])}
	) if token_doc.invoice else False
	if not has_payment:
		frappe.throw(_("Payment must be completed before placing a takeaway order."))

	settings = _get_restaurant_settings()
	card_name = settings.takeaway_menu or _get_guest_menu_card(settings)
	if not card_name:
		frappe.throw(_("No takeaway menu is configured."))

	# Determine POS profile — use first available if not linked to token
	pos_profile = token_doc.pos_profile
	if not pos_profile:
		available = frappe.get_all("POS Profile", filters={"disabled": 0}, limit=1, pluck="name")
		if available:
			pos_profile = available[0]

	if not pos_profile:
		frappe.throw(_("No POS Profile is available for takeaway orders."))

	pos_profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)

	invoice_data = {
		"doctype": "Sales Invoice",
		"is_pos": 1,
		"pos_profile": pos_profile,
		"company": pos_profile_doc.company,
		"currency": pos_profile_doc.currency or frappe.defaults.get_global_default("currency"),
		"customer": customer_name,
		"items": [],
	}

	# Set takeaway flag if it exists
	if frappe.db.has_column("Sales Invoice", "is_takeaway"):
		invoice_data["is_takeaway"] = 1

	invoice_doc = frappe.get_doc(invoice_data)

	has_kds = frappe.db.has_column("Sales Invoice Item", "kds_status")
	for item in items:
		item_code = item.get("item_code")
		if not item_code:
			continue
		qty = flt(item.get("qty", 1))
		rate = flt(item.get("rate") or item.get("price") or 0)
		if not rate:
			rate = flt(frappe.db.get_value("Item", item_code, "standard_rate") or 0)

		row = invoice_doc.append("items", {
			"item_code": item_code,
			"qty": qty,
			"rate": rate,
		})
		if has_kds:
			row.kds_status = "Pending"

	invoice_doc.flags.ignore_permissions = True
	invoice_doc.insert()

	token_doc.invoice = invoice_doc.name
	token_doc.flags.ignore_version = True
	token_doc.save(ignore_permissions=True)

	# Notify POS of new takeaway web order
	frappe.publish_realtime("takeaway_web_order", {
		"invoice": invoice_doc.name,
		"customer": customer_name,
		"grand_total": flt(invoice_doc.grand_total),
	})

	return {
		"invoice": invoice_doc.name,
		"grand_total": flt(invoice_doc.grand_total),
		"status": "created",
	}
