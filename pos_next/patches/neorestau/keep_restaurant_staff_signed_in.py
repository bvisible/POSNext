# //// Neoffice — added file (no upstream equivalent). A till's staff stay signed in for the number of days its POS Settings say
# //// (`keep_signed_in_days`, pos_next.api.session, NeoResto lot 1, product owner, 01.11.2026: 30 days for the restaurant's
# //// waiters). A till that becomes a restaurant till takes the 30 days when it is saved (POSSettings.validate_keep_signed_in_days);
# //// this gives them, once, to the restaurant tills that already were, whose row was written before the field existed. A
# //// counter till is left at 0, the site's rule, and a restaurant till whose manager already chose a number is left alone.
"""Give the restaurant tills that exist the 30 days of the waiters' phones, once."""

import frappe

from pos_next.api.session import RESTAURANT_KEEP_SIGNED_IN_DAYS


def execute():
	# A direct write, as a migration does it: the document's own validation would ask for the right of a till manager, and a
	# save would stamp `modified` on rows nobody edited. Only the tills ticked as restaurant tills, only where nothing is chosen.
	frappe.db.sql(
		"""
		update `tabPOS Settings`
		set keep_signed_in_days = %s
		where ifnull(enable_restaurant_mode, 0) = 1 and ifnull(keep_signed_in_days, 0) = 0
		""",
		(RESTAURANT_KEEP_SIGNED_IN_DAYS,),
	)
