# //// Neoffice — added file (no upstream equivalent). Upstream POSNext shows a table order's lines on the
# //// kitchen screens only. Apps that print kitchen tickets (cloudprnt: one ticket per preparation station on
# //// its own printer) listen to the moment lines go to the kitchen through the hook pos_next_kitchen_send,
# //// declared in their own hooks.py; POSNext names the moment and the send, nothing more (maintenance#1935).
# Copyright (c) 2026, POS Next and contributors
# For license information, please see license.txt

import frappe

HOOK = "pos_next_kitchen_send"


def kitchen_send(invoice, batch):
	"""Lines of table order `invoice` went to the kitchen as send `batch`: call every listener of HOOK with
	(invoice, batch). A listener's failure is logged and never stops the order."""
	if not invoice or not batch:
		return
	for method in frappe.get_hooks(HOOK):
		try:
			frappe.get_attr(method)(invoice, int(batch))
		except Exception:
			frappe.log_error(f"POS Next: kitchen-send listener {method} failed", frappe.get_traceback())
