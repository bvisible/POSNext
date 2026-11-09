# //// Neoffice — added file (no upstream equivalent). The TIP item grants no commission (tips at a shop till, NeoCoiffeur study, product
# //// owner, 09.11.2026). The restaurant made it before a till could share a sale between sales persons, and Frappe's default is « grants
# //// commission »: a tip would then be counted in the turnover the person is paid a percentage on. The item is set right once, on the
# //// sites that already have it; the code that makes it (pos_next.till_tips.ensure_tip_item) does it for the others.
"""The tip item of every restaurant (and the default TIP) earns no commission."""

import frappe


def execute():
	"""Only the items that are the tip item of a restaurant, or the default one; nothing where there are none."""
	codes = {"TIP"}
	if frappe.db.table_exists("Restaurant"):
		codes |= {code for code in frappe.get_all("Restaurant", pluck="tip_item") if code}
	for code in codes:
		if frappe.db.exists("Item", code):
			frappe.db.set_value("Item", code, "grant_commission", 0, update_modified=False)
