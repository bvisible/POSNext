# //// Neoffice — added file (no upstream equivalent). The till's own print formats follow the language of the document (17.11.2026, maintenance#1133).
"""The receipt, the end-of-day report and the shopping list of the till said `default_print_language: en`, as upstream's
receipt does, and a format's own language is what a document that says nothing is printed in. The till printed, and sent
by e-mail, its receipts in English on sites that speak French. The format files and the fixture no longer say it; this
patch clears it on the sites that already hold the format.

Only the language `en` is cleared, only on these three formats: a format a person gave another language, or one of
ERPNext's (which keep their own), is left as it is. Nothing else of the format moves, not even its modification date, so a
person's own changes to the receipt stay. It can be run again.
"""

import frappe

FORMATS = ("Neopos Receipt", "POS Next EOD Report", "Restaurant Shopping List")
FORCED = ("en", "en-US")


def execute():
	for name in FORMATS:
		if frappe.db.get_value("Print Format", name, "default_print_language") in FORCED:
			frappe.db.set_value("Print Format", name, "default_print_language", None, update_modified=False)
