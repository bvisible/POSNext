# //// Neoffice — added file (no upstream equivalent).
"""The till's print formats do not force English (neoffice-maintenance#1133).

A print format's own language is what a document that says nothing is printed in, and an address that names a language
wins over all of them: the receipt, the end-of-day report and the shopping list said `en`, so a French till printed and
mailed them in English. The files no longer say it, and the patch clears it on the sites that already hold the formats,
leaving every other format and every other language alone."""

import json
from pathlib import Path

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.patches.print_formats.follow_the_language_of_the_document import FORMATS, execute

APP = Path(__file__).resolve().parents[1]
FILES = [
	APP / "pos_next" / "print_format" / "pos_next_receipt" / "pos_next_receipt.json",
	APP / "pos_next" / "print_format" / "pos_next_eod_report" / "pos_next_eod_report.json",
	APP / "pos_next" / "print_format" / "restaurant_shopping_list" / "restaurant_shopping_list.json",
]
FIXTURE = APP / "fixtures" / "print_format.json"


class TestTheTillsPrintFormatsFollowTheLanguageOfTheDocument(FrappeTestCase):
	def test_no_format_file_forces_a_language(self):
		for path in FILES:
			with self.subTest(file=path.name):
				self.assertFalse(json.loads(path.read_text(encoding="utf-8")).get("default_print_language"))

	def test_the_receipt_of_the_fixture_does_not_either(self):
		receipts = [row for row in json.loads(FIXTURE.read_text(encoding="utf-8")) if row["name"] == "Neopos Receipt"]
		self.assertEqual(len(receipts), 1)
		self.assertFalse(receipts[0].get("default_print_language"))

	def test_the_patch_clears_an_english_format_and_keeps_its_modification_date(self):
		name = FORMATS[0]
		if not frappe.db.exists("Print Format", name):
			self.skipTest("no receipt format on this site")
		before = frappe.db.get_value("Print Format", name, "modified")
		frappe.db.set_value("Print Format", name, "default_print_language", "en", update_modified=False)
		execute()
		self.assertFalse(frappe.db.get_value("Print Format", name, "default_print_language"))
		self.assertEqual(frappe.db.get_value("Print Format", name, "modified"), before)

	def test_the_patch_leaves_another_language_and_another_format_alone(self):
		name = FORMATS[0]
		if not frappe.db.exists("Print Format", name):
			self.skipTest("no receipt format on this site")
		frappe.db.set_value("Print Format", name, "default_print_language", "de", update_modified=False)
		other = frappe.db.get_value("Print Format", {"standard": "Yes", "default_print_language": "en"}, "name")
		execute()
		self.assertEqual(frappe.db.get_value("Print Format", name, "default_print_language"), "de")
		if other:
			self.assertEqual(frappe.db.get_value("Print Format", other, "default_print_language"), "en")
