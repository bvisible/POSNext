from pos_next.utils import get_build_version

# //// Neoffice — ERPNext v16 ships coupon_code natively on Sales Invoice, v15 does not, and a
# //// fixture recreating it as a Custom Field aborts the migration with a ValidationError. The
# //// ERPNext package is probed on disk (importlib, because __file__ here resolves inside the app)
# //// so the field is only declared on v15. Drop this once the fleet is on v16 (efe964ae +
# //// 5846bd04, 2026-02-18; restored by f0c960ff, 2026-03-21).
# //// restore hooks.py and custom_field.json with all coupon/gift card fiel… — f0c960f + 82b2493 (+1 more)


def _has_native_coupon_code_field():
	"""Check if ERPNext has a native coupon_code field on Sales Invoice (v16+)."""
	try:
		# //// Neoffice — TO REVIEW: "feat(neoresto-purchases): the supplies a restaurant buys are written in the ERP's own fiches, and the Achats page reads them" (439df202) — reason not stated in the commit
		import importlib
		import json
		import os

		erpnext_mod = importlib.import_module("erpnext")
		erpnext_dir = os.path.dirname(erpnext_mod.__file__)
		si_json_path = os.path.join(erpnext_dir, "accounts", "doctype", "sales_invoice", "sales_invoice.json")
		if os.path.exists(si_json_path):
			with open(si_json_path) as f:
				meta = json.load(f)
			return any(f.get("fieldname") == "coupon_code" for f in meta.get("fields", []))
	except Exception:
		pass
	return False


app_name = "pos_next"
# //// Neoffice — the fork is sold as Neopos; app_title is what the user reads in the app list, the
# //// switcher and the browser tab. app_name stays pos_next: it is the module path, and renaming
# //// it would break every import and every DocType module reference (771950bd, 2026-04-02
# //// "rebrand: rename POS Next to Neopos").
# //// rebrand: rename POS Next to Neopos — 771950b
app_title = "Neopos"
app_publisher = "BrainWise"
app_description = "POS built on ERPNext that brings together real-time billing, stock management, multi-user access, offline mode, and direct ERP integration. Run your store or restaurant with confidence and control, while staying 100% open source."
app_email = "support@brainwise.me"
app_license = "agpl-3.0"

# Apps
# ------------------

# //// Neoffice — upstream talks to payment providers itself. Neoffice routes every card / TWINT
# //// payment through the unified `payments` app (Provider x Channel x Driver, ADR-001), so that
# //// app is a hard dependency: without it pos_next.api.payments has nothing to call (9ff7305f,
# //// 2026-05-13 "Phase 3 — wire POSNext into unified Payments app").
# //// Phase 3 — wire POSNext into unified Payments app — 9ff7305
# The unified payments app provides the Provider x Channel x Driver layer that
# POSNext uses via `pos_next.api.payments.*` (see ADR-001 in
# `/Users/jeremy/GitHub/payments/docs/adr/ADR-001-unification-paiements.md`).
required_apps = ["payments"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "pos_next",
# 		"logo": "/assets/pos_next/logo.png",
# 		"title": "POS Next",
# 		"route": "/pos_next",
# 		"has_permission": "pos_next.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# Get unique build version for cache busting
_asset_version = get_build_version()

# include js, css files in header of desk.html
# app_include_css = f"/assets/pos_next/css/pos_next.css?v={_asset_version}"
# app_include_js = f"/assets/pos_next/js/pos_next.js?v={_asset_version}"

# include js, css files in header of web template
# web_include_css = "/assets/pos_next/css/pos_next.css"
# web_include_js = "/assets/pos_next/js/pos_next.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "pos_next/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	# //// Neoffice — the restaurant's column of the supplier table of an article hides without NeoResto (maintenance#2233): a table column does not read depends_on.
	"Item": "public/js/item.js",
	"Customer": "public/js/customer.js",
	"User": "public/js/user.js",
	"POS Profile": "public/js/pos_profile.js",
	# //// Neoffice — no "Pricing Rule" / "Promotional Scheme" entries: upstream develop deleted
	# //// public/js/pricing_rule.js and promotional_scheme.js with the Min/Max discounts (moved to its
	# //// optional POSNext Promotions app) but kept the two entries pointing at the missing files.
}
# //// Neoffice — gift cards are ERPNext Coupon Code documents here, so the "Create Gift Card"
# //// entry point belongs on that list view in the desk; upstream shipped no desk surface for
# //// its own POS Coupon (b14d3066 2026-01-13, restored by f0c960ff 2026-03-21).
doctype_list_js = {
	"Coupon Code": "public/js/coupon_code_list.js",
	# //// Neoffice — the lists of the tills and of their settings say where a till is made and set up (06.11.2026)
	"POS Profile": "public/js/pos_profile_list.js",
	"POS Settings": "public/js/pos_settings_list.js",
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "pos_next/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
jinja = {
	"methods": [
		"pos_next.pos_next.utils.pos_closing_print.get_items_sold",
		# //// Neoffice — the end-of-day print's line of what was offered (« Offert », NeoResto lot 1, task 24).
		"pos_next.offered.get_offered_line",
	]
}

# Fixtures
# --------
# //// Neoffice — the fixture list is built at import time instead of being a literal: ERPNext
# //// v16 ships a native `coupon_code` field on Sales Invoice and our Custom Field of the same
# //// name would collide on install, so it is added only on v15. Drop the branch once the whole
# //// fleet is on v16. The rest of the list is the fork's own fields — gift-card tracking on
# //// Coupon Code, restaurant table / KDS status / preparation station / modifiers on Sales
# //// Invoice (Item), cash entry templates on POS Profile (f0c960ff 2026-03-21; efe964ae and
# //// 5846bd04 2026-02-18 for the v16 detection; d2a64f30 2026-01-12, 4df0caf1 and 831857f2
# //// 2026-03-21, 82b2493a 2026-03-28).
# Build custom field list dynamically: skip coupon_code on Sales Invoice
# if ERPNext already has it natively (v16+)
_custom_field_names = [
	"Sales Invoice-posa_pos_opening_shift",
	"Sales Invoice-posa_is_printed",
	"Sales Invoice-posa_coupon_code",
	"POS Profile-posa_cash_mode_of_payment",
	"POS Profile-posa_allow_delete",
	"POS Profile-posa_cash_entry_templates",
	"POS Profile-posa_block_sale_beyond_available_qty",
	"Mode of Payment-is_wallet_payment",
	"Coupon Code-pos_next_section",
	"Coupon Code-pos_next_gift_card",
	"Coupon Code-gift_card_amount",
	"Coupon Code-original_gift_card_amount",
	"Coupon Code-coupon_code_residual",
	"Coupon Code-source_invoice",
	"Coupon Code-referral_code",
	"Sales Invoice-restaurant_table",
	# //// Neoffice — the people seated at a table (NeoResto lot 1, covers): kept on the table's open order and told to the kitchen's screens and ticket.
	# //// Shipped by the fixture file; listed so that an export does not drop it.
	"Sales Invoice-restaurant_covers",
	# //// Neoffice — the notes of a table (NeoResto lot 1, notes): the rank of an order on its table (.1, .2, .3) and the optional name of its party. A note is a
	# //// draft Sales Invoice on a table, and a table may hold several. Shipped by the fixture file; listed so that an export does not drop them.
	"Sales Invoice-restaurant_note",
	"Sales Invoice-restaurant_note_name",
	"Sales Invoice-kds_status",
	# //// Neoffice — the ticket number of a restaurant order and the business day it was counted in (NeoResto lot 1,
	# //// task 38b, rulings 122 and 124): the kitchen shows it instead of the draft's Sales Invoice number.
	"Sales Invoice-posa_ticket_no",
	"Sales Invoice-posa_ticket_day",
	"Sales Invoice Item-posa_special_instructions",
	"Sales Invoice Item-preparation_station",
	"Sales Invoice Item-kds_status",
	"Sales Invoice Item-posa_item_modifiers",
	# //// Neoffice — the service families (NeoResto lot 1): the family of an Item Group, and the family each line of an order
	# //// carries. The fixture file ships them at every migrate whatever this list says; the names are listed here so that an
	# //// export of the fixtures does not drop them.
	"Item Group-service_family",
	"Sales Invoice Item-service_family",
	# //// Neoffice — the color of an Item Group on the kitchen and runner tickets (NeoResto lot 1, Daniel's request of 01.11)
	"Item Group-service_color",
	# //// Neoffice — the purchases of a restaurant (NeoResto, purchases lot A): an article the restaurant buys regularly, and where it
	# //// is kept. The fixture file ships them at every migrate; the names are listed here so that an export does not drop them.
	"Item-is_restaurant_supply",
	"Item-supply_place",
	# //// Neoffice — the ingredients of a dish (NeoResto purchases, lot E): a reminder, never a bill of materials.
	"Item-dish_ingredients_section",
	"Item-dish_ingredients",
	# //// Neoffice — the recipe of a dish (NeoResto, lot R3): a link on the article sold, which the desk shows only where the site runs
	# //// NeoResto (`frappe.boot.neoresto_active`). Shipped by the fixture file; listed so that an export does not drop it.
	"Item-restaurant_recipe",
	"Item Supplier-supply_uom",
	# //// Neoffice — how the restaurant orders from a supplier (NeoResto purchases, lot B): by e-mail, by phone or on site.
	"Supplier-restaurant_purchases_section",
	"Supplier-order_mode",
	"Supplier-order_email",
	# //// Neoffice — scanning in the shop: the articles a seller checks before they are sold (pos_next.shop_scan). Shipped by the
	# //// fixture file; listed so that an export does not drop them.
	"Item-requires_counter_validation",
	"Item Group-requires_counter_validation",
	"Supplier-usual_delivery",
]
if not _has_native_coupon_code_field():
	_custom_field_names.insert(3, "Sales Invoice-coupon_code")

# //// Neoffice — the receipt Print Format is "Neopos Receipt": a Print Format's name IS its id, so
# //// the rebrand had to rename the document itself (771950bd, 2026-04-02). Menu Badge and Menu
# //// Design Template are doctypes of the restaurant menu-PDF generator, which has no upstream
# //// equivalent (b6e757dd, 2026-03-26 "add menu PDF generator with badges").
fixtures = [
	# //// add custom POS print format with discount display — eca6f13 + f0c960f (+5 more)
	{"dt": "Print Format", "filters": [["name", "in", ["Neopos Receipt"]]]},
	{"dt": "Role", "filters": [["role_name", "in", ["POSNext Cashier", "POSNext Manager"]]]},
	# //// Neoffice — no Custom DocPerm fixture. Frappe imports every file of fixtures/ at each
	# //// migrate whatever these filters say, and a Custom DocPerm fixture either freezes a doctype
	# //// on the author's snapshot or lands next to a site's own rules as duplicates. The cashier's
	# //// rules are granted by install.grant_cashier_permissions() from setup/custom_docperm.json.
	{"dt": "Menu Badge"},
	{"dt": "Menu Design Template"},
]

# Installation
# ------------

# before_install = "pos_next.install.before_install"
after_install = "pos_next.install.after_install"
# //// Neoffice — a second step after the first: the cards of buttons of NeoResto's page (neoresto.after_migrate), which needs the
# //// page install.after_migrate makes. A list: Frappe runs them in this order.
after_migrate = ["pos_next.install.after_migrate", "pos_next.restaurant.neoresto.after_migrate"]

# Uninstallation
# ------------

before_uninstall = "pos_next.uninstall.before_uninstall"
# after_uninstall = "pos_next.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "pos_next.utils.before_app_install"
# after_app_install = "pos_next.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "pos_next.utils.before_app_uninstall"
# after_app_uninstall = "pos_next.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "pos_next.notifications.get_notification_config"

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {"Sales Invoice": "pos_next.overrides.sales_invoice.CustomSalesInvoice"}

# Document Events
# ---------------
# Hook on document methods and events

# //// wallet functionality with loyalty points conversion — 77e7448
doc_events = {
	# //// Neoffice — added entry (no upstream equivalent): keep the end-of-day report as a PDF
	# //// attached to the closing shift, and e-mailed when the profile asks for it, both in the
	# //// background after the commit so closing stays fast (neoffice-maintenance#1235).
	"POS Closing Shift": {
		# //// Neoffice — on_submit became a list: closing a session moves the « sessions open » of the restaurant's overview (neoffice-maintenance#2163).
		"on_submit": [
			"pos_next.api.eod_report.enqueue_after_close",
			"pos_next.restaurant.figures.figures_changed",
		],
	},
	# //// Neoffice — added entry (no upstream equivalent): the restaurant's overview counts the sessions open and the bookings of the day, and is told
	# //// when they change (neoffice-maintenance#2163).
	"POS Opening Shift": {
		"on_submit": "pos_next.restaurant.figures.figures_changed",
		"on_cancel": "pos_next.restaurant.figures.figures_changed",
	},
	# //// Neoffice — added entry (no upstream equivalent): a web takeaway order the provider has paid is settled and sent to the kitchen by the server,
	# //// whether or not the customer's page comes back (neoffice-maintenance#2132). Played for real: the order stayed a draft with its lines held.
	"Payment Intent": {
		# //// Neoffice — a list: a shop cart paid on the phone is booked the same way, and waits for its check (scan in the shop, lot 4)
		"on_update": [
			"pos_next.api.guest_ordering.settle_takeaway_on_payment",
			"pos_next.shop_scan.payment.book_on_payment",
		],
	},
	"Restaurant Reservation": {
		"on_update": "pos_next.restaurant.figures.figures_changed",
		"on_trash": "pos_next.restaurant.figures.figures_changed",
	},
	"Customer": {
		"after_insert": [
			"pos_next.api.customers.auto_assign_loyalty_program",
			"pos_next.realtime_events.emit_customer_event",
			"pos_next.api.wallet.create_wallet_on_customer_insert",
		],
		"on_update": "pos_next.realtime_events.emit_customer_event",
		# //// Neoffice — on_trash became a list so the unused-wallet cleanup runs before Frappe's
		# //// link-integrity check, which otherwise lets an auto-created wallet block every customer
		# //// deletion (c42d1cfc, 2026-06-29).
		"on_trash": [
			"pos_next.api.wallet.delete_unused_wallet_on_customer_trash",
			"pos_next.realtime_events.emit_customer_event",
		],
	},
	"Sales Invoice": {
		# //// Neoffice — a takeaway sale at a restaurant till takes the restaurant's takeaway tax category, and each item
		# //// its takeaway template, before ERPNext's validate computes the taxes from them (NeoResto lot 1, task 10).
		# //// Neoffice — a list: a phone's cart in the shop keeps the prices it was given whoever saves its draft (the payment's
		# //// booking by the payments app saved it plainly, and ERPNext set the price list rate back under an offer; lot 4).
		"before_validate": [
			"pos_next.restaurant.takeaway_tax.apply_takeaway_tax_category",
			"pos_next.shop_scan.pricing.keep_the_phones_prices",
		],
		"validate": [
			"pos_next.api.sales_invoice_hooks.validate",
			# //// Neoffice — coupon validation hangs off the invoice's native ERPNext `coupon_code` link
			# //// now; upstream validated its own POS Coupon doctype, which no longer exists here
			# //// (9bc096de 2026-02-05, restored by f0c960ff 2026-03-21).
			"pos_next.api.sales_invoice_hooks.validate_coupon_on_invoice",
			"pos_next.api.wallet.validate_wallet_payment",
			# //// Neoffice — an offered row (« Offert », NeoResto lot 1, task 24) stays at 100 %, never a promotion's free
			# //// row, and only on a till that lets its cashiers change a discount, whatever path saves it.
			"pos_next.offered.validate_offered_rows",
		],
		"before_submit": "pos_next.authorization.gate.enforce_document",
		"before_cancel": "pos_next.api.sales_invoice_hooks.before_cancel",
		# //// Neoffice — restaurant mode: the floor plan follows the document, not the browser, so a
		# //// table flips to Occupied / Cleaning from the invoice's own lifecycle — otherwise a till
		# //// that crashed or went offline left tables stuck (458d81a9 2026-03-20, restored by
		# //// f0c960ff 2026-03-21).
		# //// Neoffice — the tills hear of an order that holds a counted product (the portions the kitchen made, NeoResto lot 1,
		# //// Daniel, 02.11.2026), saved, cancelled or deleted, so that a sold-out dish follows the room.
		"on_update": [
			"pos_next.api.restaurant.on_invoice_update",
			"pos_next.restaurant.portions.invoice_changed",
		],
		# //// Neoffice — a table's draft order that had been at the kitchen and is deleted is told to the kitchen's printers, which cancel it on paper
		"on_trash": [
			"pos_next.restaurant.portions.invoice_changed",
			"pos_next.api.kitchen_events.void_on_trash",
		],
		# //// Neoffice — everything booked on submit except the stock event and upstream's one-time
		# //// offer record (v2.0.0, last line) is ours: ERPNext's
		# //// coupon usage counter (coupons moved onto the native Coupon Code — 9bc096de,
		# //// 2026-02-05), loyalty converted into wallet balance, gift cards issued and spent, and
		# //// the restaurant table released. Each is a side effect of a sale upstream never had to
		# //// book (458d81a9 2026-03-20 for the restaurant side; the whole list restored by
		# //// f0c960ff, 2026-03-21).
		"on_submit": [
			# //// Neoffice — a cart paid on the phone is checked: its session closed, what the sale holds more or less than was paid written on it (scan in the shop, lot 4)
			"pos_next.shop_scan.control.note_the_difference",
			"pos_next.api.sales_invoice_hooks.update_coupon_usage_on_submit",
			"pos_next.realtime_events.emit_stock_update_event",
			# //// use native ERPNext coupon_code field on Sales Invoice — 9bc096d + f0c960f (+1 more)
			"pos_next.api.wallet.process_loyalty_to_wallet",
			"pos_next.api.gift_cards.create_gift_card_from_invoice",
			"pos_next.api.gift_cards.process_gift_card_on_submit",
			"pos_next.api.restaurant.on_invoice_update",
			"pos_next.api.sales_invoice_hooks.record_one_time_offer_usage",
		],
		"on_cancel": [
			# //// Neoffice — fix: restore hooks.py and custom_field.json with all coupon/gift card fields, clean P3 changes (f0c960ff, 2026-03-21).
			"pos_next.api.sales_invoice_hooks.update_coupon_usage_on_cancel",
			"pos_next.realtime_events.emit_stock_update_event",
			# //// Neoffice — on_cancel became a list: upstream published one stock event. A cancelled sale
			# //// must also give the gift-card balance back, bring the coupon usage counter down and
			# //// release the table (5091779d / 9bc096de for the coupon side, 458d81a9 for the restaurant
			# //// side, restored by f0c960ff 2026-03-21). Upstream's v2.0.0 one-time offer release follows.
			"pos_next.api.gift_cards.process_gift_card_on_cancel",
			"pos_next.api.restaurant.on_invoice_update",
			"pos_next.api.sales_invoice_hooks.release_one_time_offer_usage",
			# //// Neoffice — a cancelled order gives its portions back: the tills hear of it (NeoResto lot 1, Daniel, 02.11.2026).
			"pos_next.restaurant.portions.invoice_changed",
		],
		"after_insert": "pos_next.realtime_events.emit_invoice_created_event",
	},
	# //// Neoffice — POS Invoice gets the same gift-card hooks as Sales Invoice: an instance running
	# //// ERPNext's POS Invoice flow would otherwise sell a gift card without ever creating it, or
	# //// cancel one without giving the balance back (f0c960ff, 2026-03-21).
	# //// The Min/Max `validate` that sat here left with upstream develop, which moved Min/Max
	# //// discounts out of the core into its optional POSNext Promotions app (removed 2026-10-28,
	# //// measured unused on 12 instances).
	"POS Invoice": {
		"on_submit": [
			"pos_next.api.gift_cards.create_gift_card_from_invoice",
			"pos_next.api.gift_cards.process_gift_card_on_submit",
		],
		"on_cancel": "pos_next.api.gift_cards.process_gift_card_on_cancel",
	},
	"POS Profile": {
		# //// Neoffice — a new profile has its POSNext settings (POS Settings) from the moment it exists, not from the first time
		# //// the till opens with it (NeoResto lot 1, task 13b, 05.11.2026).
		"after_insert": "pos_next.pos_profile_settings.create_for_new_profile",
		# //// Neoffice — the profile's on / off switch is the till's one switch: its POS Settings row follows it (06.11.2026).
		"on_update": [
			"pos_next.realtime_events.emit_pos_profile_updated_event",
			"pos_next.pos_profile_settings.follow_the_profile",
		],
		"on_trash": "pos_next.pos_profile_settings.remove_with_the_profile",
	},
	"Sales Person": {
		"validate": "pos_next.pos_next.utils.sales_person_commission.validate_sales_person_commission_tables"
	},
	# //// Neoffice — added entries (no upstream equivalent): the sales persons of a salon are its employees (NeoSalon, step 1, lot G1.2, product owner,
	# //// 09.11.2026). Both act only on a site where a till asks for a sales person; see pos_next/sales_staff.py.
	"Employee": {"on_update": "pos_next.sales_staff.employee_saved"},
	"POS Settings": {"on_update": "pos_next.sales_staff.till_settings_saved"},
	"Mode of Payment": {
		"after_insert": "pos_next.api.wallet.clear_wallet_payment_modes_cache",
		"on_update": "pos_next.api.wallet.clear_wallet_payment_modes_cache",
		"on_trash": "pos_next.api.wallet.clear_wallet_payment_modes_cache",
	},
	# //// Neoffice — Restaurant mode: a Restaurant Card (the menu shown to guests) and the opening
	# //// hours are edited at the desk but read by the tills and by the public menu page, so a
	# //// change has to reach them without a reload — hence the realtime emitters, rename included
	# //// (34ee11a8, 2026-03-25 "merge all restaurant enhancements").
	"Restaurant Card": {
		"on_update": "pos_next.realtime_events.emit_card_updated_event",
		"after_rename": "pos_next.realtime_events.emit_card_updated_event",
	},
	# //// Neoffice — the opening hours and the other settings moved from the single `Restaurant Settings`
	# //// onto each Restaurant (NeoResto lot 1, task 1): a restaurant's save is what tells the tills now.
	"Restaurant": {
		"on_update": "pos_next.realtime_events.emit_restaurant_settings_updated_event",
		# //// Neoffice — a deleted restaurant takes its tablets with it (sessions ended, accounts disabled): a restaurant
		# //// made again under the same name inherits none (NeoResto lot 1, task 16). After the delete, not on_trash:
		# //// on_trash runs before the link check, and ending a session commits, so a restaurant whose delete its links
		# //// refuse would have lost its tablets all the same.
		"after_delete": "pos_next.restaurant.devices.forget_the_tablets_of",
	},
	# //// Neoffice — a restaurant tablet's account stays a portal account with no role, no password, no API key, no other
	# //// name and no OAuth token, whoever saves it; only the pairing writes it (pos_next.restaurant.devices, NeoResto
	# //// lot 1, task 16). Upstream has no User hook here.
	"User": {
		"before_validate": "pos_next.restaurant.devices.guard_device_account_before_validate",
		"validate": "pos_next.restaurant.devices.guard_device_account",
		"before_rename": "pos_next.restaurant.devices.guard_device_rename",
		# //// Neoffice — an account given a role of the till makes the sales person of its employee, where a till asks for one (NeoSalon, lot G1.2, product owner, 09.11.2026).
		"on_update": "pos_next.sales_staff.user_saved",
	},
	"OAuth Bearer Token": {
		"validate": "pos_next.restaurant.devices.guard_oauth_token",
	},
}

# Scheduled Tasks
# ---------------

# //// Neoffice — upstream scheduled three `pos_next.tasks.branding_monitor` jobs here (hourly
# //// integrity check, daily session validation, monthly tamper-counter reset) policing its own
# //// `BrainWise Branding` doctype. That doctype, `pos_next/api/branding.py` and
# //// `pos_next/tasks/branding_monitor.py` were all removed by 458d81a9 (2026-03-20): a POS we
# //// sell under our own name does not police its supplier's logo. A deletion leaves nothing to
# //// mark inside those files, so it is recorded here, where the hooks were unregistered.
scheduler_events = {
	"hourly": [
		# //// restaurant reservation system with POS dialog, online booking, and em… — ebc3ecc
		"pos_next.api.reservations.send_reminders",
		"pos_next.api.reservations.auto_no_show",
		# //// Neoffice — the till finalizes a POS payment in the browser, so any
		# //// browser-side failure charges the customer with no sale recorded and
		# //// nothing to say so. Reconcile server-side (read-only) and alert.
		"pos_next.tasks.detect_uncollected_payments.detect_uncollected_payments",
	],
	"daily": [
		# //// Neoffice — a deletion:
		# //// "pos_next.tasks.branding_monitor.validate_all_active_sessions" was the second entry
		# //// of this daily list and went with the BrainWise Branding doctype (see the block above
		# //// scheduler_events for the why). Only cleanup_expired_promotions is left (458d81a9,
		# //// 2026-03-20).
		# //// add support for standalone pricing rules in promotions — 1ed8d44
		"pos_next.tasks.cleanup_expired_promotions.cleanup_expired_promotions",
		# //// Neoffice — a phone's cart nobody paid nor took over is deleted after the lifetime its till sets (scanning in the shop)
		"pos_next.shop_scan.purge.purge_abandoned_carts",
	],
	# //// Neoffice — an online booking whose guest has not confirmed it from the e-mail by its deadline expires
	# //// (NeoResto lot 1, task 18). It frees its tables at the deadline itself; this job writes it down soon after,
	# //// so that the till's list and the statistics stop counting it.
	"cron": {
		"*/5 * * * *": [
			"pos_next.api.reservations.expire_unconfirmed_reservations",
			# //// Neoffice — the safety net of the settlement above: a paid web takeaway order nobody settled (neoffice-maintenance#2132).
			"pos_next.api.guest_ordering.settle_paid_takeaway_orders",
			# //// Neoffice — the safety net of a shop cart paid on the phone that nobody booked (scan in the shop, lot 4)
			"pos_next.shop_scan.payment.book_paid_carts",
		],
	},
}

# Testing
# -------

# before_tests = "pos_next.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "pos_next.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "pos_next.task.get_dashboard_data"
# }
# //// Neoffice — the Connections of the POS Profile form point at the documents a till of this app makes (its sales invoices, its
# //// opening and closing sessions, its POSNext settings), not at ERPNext's own point of sale's (NeoResto lot 1, task 13b).
override_doctype_dashboards = {"POS Profile": "pos_next.pos_profile_dashboard.get_dashboard_data"}

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]
# //// Neoffice — a restaurant's tablet and its spent pairing codes (NeoResto lot 1, task 16) never keep a
# //// station, a restaurant or an account from being deleted: they are bindings and history, and a tablet whose
# //// station or restaurant is gone shows nothing (pos_next.restaurant.devices). Upstream ignores none.
ignore_links_on_delete = ["Restaurant Device", "Restaurant Device Pairing"]

# Request Events
# ----------------
# before_request = ["pos_next.utils.before_request"]
# after_request = ["pos_next.utils.after_request"]

# Job Events
# ----------
# before_job = ["pos_next.utils.before_job"]
# after_job = ["pos_next.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# Restrict POSNext Manager Journal Entry desk/report access to POS expenses only.
# Broader accounting roles are left unrestricted (see get_journal_entry_permission_query_conditions).
permission_query_conditions = {
	"Journal Entry": "pos_next.api.expenses.get_journal_entry_permission_query_conditions",
	# //// Neoffice — added entry (no upstream equivalent): at a shop till set to « each their own share », a member of the staff
	# //// lists only his own tips (pos_next.till_tips, product owner, 10.11.2026); everywhere else the tips are listed as before.
	"Restaurant Tip": "pos_next.till_tips.tips_query_conditions",
}

# //// Neoffice — added hook (no upstream equivalent): the same rule for one tip record opened by its name (pos_next.till_tips.may_read_tip
# //// refuses, never grants).
has_permission = {
	"Restaurant Tip": "pos_next.till_tips.may_read_tip",
}

# auth_hooks = [
# 	"pos_next.auth.validate"
# ]
# //// Neoffice — a restaurant's tablet signs in with an account of its own (NeoResto lot 1, task 16). Its session
# //// reaches the page and the calls of its screens and nothing else, whatever other app serves signed-in users: an
# //// auth hook runs for every request once the caller is known, by cookie, token or key. Upstream has none.
auth_hooks = [
	"pos_next.restaurant.devices.confine_tablet_session",
	# //// Neoffice — so does the customer display's own account, which signs in with its key (maintenance#2296,
	# //// audit Q2): the display's calls and pages, nothing else (pos_next.api.customer_display).
	"pos_next.api.customer_display.confine_display_session",
]
# //// Neoffice — and it signs in by its pairing only: a password, a link, impersonation or `bench browse` are refused
# //// before any session is made (pos_next.restaurant.devices.guard_device_login). Upstream has no on_login hook.
on_login = ["pos_next.restaurant.devices.guard_device_login"]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }


# Extension points consumed by POS Next, implemented by optional apps
pos_next_loyalty_provider = []
pos_next_bootstrap_settings = []
# //// Neoffice — the salon mode of the till (NeoSalon, step 2, lot G4; pos_next.api.appointments). Extension points, each a list of dotted paths whose first answer
# //// that is not None counts, so that POS Next names neither a reservation app nor a client. The planning lane fills the day, the check of a move and the move; the
# //// money lane the list, the draft of an appointment, the sale that replaces it, cancel, the services, the free slots and booking; the time lane the gestures of the time
# //// and its state (note 10 of the vault, § G4, « Contrat v2 », and the notes of the lanes).
# //// Neoffice — the planning lane: the day of the salon (who is there, what each holds)
pos_next_salon_day = []
# //// Neoffice — the planning lane: whether an appointment could go to this hour, and the move itself
pos_next_appointment_check_move = []
# //// Neoffice — the planning lane: the move
pos_next_appointment_move = []
# //// Neoffice — the money lane: where each appointment stands, what it announces, what was paid
pos_next_appointments_of_the_day = []
# //// Neoffice — the money lane: the draft invoice of one appointment
pos_next_appointment_draft = []
# //// Neoffice — the money lane: a sale made offline takes the place of the draft
pos_next_appointment_sold = []
# //// Neoffice — the money lane: cancel (and refund what was paid online)
pos_next_appointment_cancel = []
# //// Neoffice — the money lane: what can be booked, the free slots, book
pos_next_appointment_services = []
pos_next_appointment_slots = []
pos_next_appointment_book = []
# //// Neoffice — the time lane: the gestures of the time of an appointment, and its state
pos_next_appointment_time_action = []
pos_next_appointment_time_state = []
# //// Neoffice — the restaurant rides the seam upstream gave satellite apps: the bootstrap, the settings dialog, the
# //// profile data and the answer of a save all call it after they read the till's POS Settings. One function tells every
# //// screen which restaurant (`restaurant`, `restaurant_name`) the till works for (NeoResto lot 1, task 2), the next what
# //// its user may manage there (`restaurant_can`, task 3), the last whether the till is a restaurant till
# //// (`enable_restaurant_mode`, effective only where the site runs NeoResto) and whether the site does
# //// (`neoresto_active`, task 4). The seam calls each hook on its own and logs the one that fails: the mode is a hook of
# //// its own so that no other hook failing can leave the stored tick in its place, and the last of the app's, so that no
# //// hook of the app rewrites the effective mode after it. Added to upstream's empty list, which stays as upstream ships it.
pos_next_bootstrap_settings += [
	"pos_next.restaurant.scope.extend_bootstrap_settings",
	"pos_next.restaurant.bootstrap.extend_bootstrap_settings",
	"pos_next.restaurant.mode.extend_bootstrap_settings",
]
pos_next_customer_validators = []
pos_next_customer_prepare = []
pos_next_customer_after_insert = []


website_route_rules = [
	{"from_route": "/pos/<path:app_path>", "to_route": "pos"},
]

# /pos is not the Desk: expose optional-app install flags to the Vue app.
update_website_context = ["pos_next.optional_apps.update_pos_page_context"]

# //// Neoffice — a core Frappe hook, not an extension point of POS Next: the desk is told whether the site runs NeoResto
# //// (`frappe.boot.neoresto_active`), which the POS Settings form reads to show its Restaurant section, the tick that makes
# //// a till a restaurant till included, only where it does (NeoResto lot 1, task 4). Upstream has no boot hook.
boot_session = ["pos_next.restaurant.mode.extend_boot"]

# //// Neoffice — NeoResto, the restaurant as a business application (NeoResto lot 1, task 6). Two hooks of neoffice_theme,
# //// not extension points of POS Next, which nothing reads on a site without the theme: it lists NeoResto with the
# //// applications of their own and builds its space of tabs from them, the way NeoAuto (the garage) declares itself. The
# //// application shows only where the site's `neoresto_active` says 1. Upstream has neither hook.
neoffice_business_apps = ["pos_next.restaurant.neoresto.business_apps"]
# //// Neoffice — the point of sale's space gets a Settings tab with the till settings page (06.11.2026)
neoffice_workspace_tabs = ["pos_next.restaurant.neoresto.tabs", "pos_next.till_settings.workspace.tabs"]
# //// Neoffice — the point of sale's Tills tab gets a « New till » gesture that opens the page's dialog (06.11.2026)
neoffice_tab_additions = ["pos_next.till_settings.workspace.tab_additions"]
# //// Neoffice — the Reports card of NeoResto's overview (09.11.2026): a hook of neoffice_theme, not an extension point of POS Next.
# //// The space had a reports tab and its overview listed the settings only. Upstream has no such hook.
neoffice_workspace_more = ["pos_next.restaurant.neoresto.workspace_more"]
