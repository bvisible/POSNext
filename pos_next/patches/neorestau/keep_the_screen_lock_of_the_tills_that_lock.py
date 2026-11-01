# //// Neoffice — added file (no upstream equivalent). Until the personal till code (NeoRestau lot 1, product owner, 01.11.2026) a
# //// lock locked the moment the browser tab was left; the new setting `session_lock_on_leave` makes that a choice, and its default
# //// is "wait for the delay" (a waiter whose phone goes to sleep between two tables must not type a code each time). A till that
# //// ALREADY locks keeps what it had: this ticks the setting, once, for the tills whose lock is on.
"""Keep the present behaviour of the tills that already lock: they lock as soon as the screen is left."""

import frappe


def execute():
	# A direct write, as a migration does it: the document's own validation would ask for the right of a till manager, and a
	# save would stamp `modified` on rows nobody edited. Only the tills whose lock is on, so a till without a lock is untouched.
	frappe.db.sql(
		"""
		update `tabPOS Settings`
		set session_lock_on_leave = 1
		where ifnull(enable_session_lock, 0) = 1 and ifnull(session_lock_on_leave, 0) = 0
		"""
	)
