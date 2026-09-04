#//// Neoffice — added file (no upstream equivalent). The restaurant Single: weekly opening hours,
#//// time-based card availability, runner toggle, tips. It also PROVISIONS what tipping needs the
#//// first time it is enabled — a TIP service item (0% VAT template, is_internal_item so it never
#//// shows up in a client's item list) and transit account 2211 — because a Swiss tip is a
#//// pass-through (Durchlaufkonto) collected for the staff, not turnover: booking it to a revenue
#//// account would inflate both the turnover and the VAT base (32f2415d + a750c5e3, 2026-03-23;
#//// account type and label d08c57e7; 0% tax template 07f2e560 + f46164e4; internal-item flag
#//// e18d1885, 2026-04).
import frappe
from frappe import _
from frappe.model.document import Document


class RestaurantSettings(Document):
	def validate(self):
		if self.enable_tips:
			self._ensure_tip_account()
			self._ensure_tip_item()

	def _ensure_tip_account(self):
		"""Create the tip transit account (2211) if it doesn't exist."""
		if self.tip_account:
			return

		company = frappe.db.get_single_value("Global Defaults", "default_company")
		if not company:
			return

		# Check if account 2211 already exists
		existing = frappe.db.get_value("Account", {"account_number": "2211", "company": company}, "name")
		if existing:
			self.tip_account = existing
			return

		# Find parent account (2210 or 220)
		parent = frappe.db.get_value("Account", {"account_number": "2210", "company": company}, "name")
		if not parent:
			parent = frappe.db.get_value("Account", {"account_number": "220", "company": company}, "name")
		if not parent:
			frappe.msgprint(_("Could not find parent account 2210 or 220. Please set the tip account manually."))
			return

		# Ensure parent is a group
		if not frappe.db.get_value("Account", parent, "is_group"):
			frappe.db.set_value("Account", parent, "is_group", 1)

		account = frappe.get_doc({
			"doctype": "Account",
			"account_name": _("Tip Transit Account"),
			"account_number": "2211",
			"parent_account": parent,
			"company": company,
			"account_type": "Income Account",
			"is_group": 0,
		})
		account.insert(ignore_permissions=True)
		self.tip_account = account.name
		frappe.msgprint(_("Created tip transit account: {0}").format(account.name))

	def _ensure_tip_item(self):
		"""Create the TIP service item if it doesn't exist."""
		if self.tip_item:
			return

		# Check if TIP item already exists
		if frappe.db.exists("Item", "TIP"):
			self.tip_item = "TIP"
			# Ensure 0% tax template is assigned even on existing item
			item = frappe.get_doc("Item", "TIP")
			if not item.taxes:
				self._assign_zero_tax_template(item)
			return

		company = frappe.db.get_single_value("Global Defaults", "default_company")

		# Ensure "Services" item group exists
		if not frappe.db.exists("Item Group", "Services"):
			frappe.get_doc({
				"doctype": "Item Group",
				"item_group_name": "Services",
				"parent_item_group": "All Item Groups",
			}).insert(ignore_permissions=True)

		# Create TIP item (marked as internal — hidden from user lists/searches)
		item = frappe.get_doc({
			"doctype": "Item",
			"item_code": "TIP",
			"item_name": _("Tip"),
			"item_group": "Services",
			"is_stock_item": 0,
			"standard_rate": 0,
			"is_internal_item": 1,
			"description": _("Gratuity / Pourboire"),
		})

		# Set default income account to the tip transit account
		if self.tip_account:
			item.append("item_defaults", {
				"company": company,
				"income_account": self.tip_account,
			})

		item.insert(ignore_permissions=True)
		self.tip_item = "TIP"

		# Auto-assign 0% tax template (e.g. "Sans TVA") if one exists
		self._assign_zero_tax_template(item)

		frappe.msgprint(_("Created tip item: TIP"))

	def _assign_zero_tax_template(self, item):
		"""Assign a 0% tax template to the TIP item if available."""
		# Find an Item Tax Template where all tax rates are 0
		zero_tax_templates = frappe.db.sql("""
			SELECT DISTINCT parent
			FROM `tabItem Tax Template Detail`
			WHERE tax_rate = 0
			AND parent IN (
				SELECT name FROM `tabItem Tax Template`
				WHERE name NOT IN (
					SELECT DISTINCT parent
					FROM `tabItem Tax Template Detail`
					WHERE tax_rate != 0
				)
			)
		""", pluck=True)

		if not zero_tax_templates:
			return

		template_name = zero_tax_templates[0]
		item.append("taxes", {"item_tax_template": template_name})
		item.save(ignore_permissions=True)
