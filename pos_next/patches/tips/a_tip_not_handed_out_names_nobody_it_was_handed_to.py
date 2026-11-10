# //// Neoffice — added file (no upstream equivalent). Frappe filled `distributed_to` of every tip with the employee of the user who rang
# //// it up (the default of a Link to Employee for a user with one Employee user permission): a tip only collected said it was handed
# //// out to the cashier, his colleague's share included, and his colleagues' own permission hid it from them (10.11.2026). The
# //// controller clears it from now on (RestaurantTip.validate); this clears what was written before, once.
"""Clear « distributed to » and its date on the tips that are not distributed."""

import frappe


def execute():
	if not frappe.db.table_exists("Restaurant Tip"):
		return
	frappe.db.sql(
		"""update `tabRestaurant Tip` set distributed_to = null, distribution_date = null
		where ifnull(status, '') != 'Distributed' and (distributed_to is not null or distribution_date is not null)"""
	)
