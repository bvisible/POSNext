# //// Neoffice — added file (no upstream equivalent).
"""The tip line's msgid has a context of its own, so HRMS keeps "Gratification" (NeoRestau lot 1, task 1).

HRMS translates the plain msgid "Gratuity" (its payroll doctype of that name, a tab, a section) as "Gratification".
Frappe merges the apps' catalogues in installed-app order and the last one wins, so a plain "Gratuity" of ours
("Pourboire") would either replace HRMS's on a French desk or be replaced by it on a French till. The tip line is
therefore asked with a context, and our French catalogue carries no plain "Gratuity" at all. The last two tests hold
the app's own sources, this file included, to what `bench generate-pot-file` would extract from them.
"""

import tempfile
from pathlib import Path
from unittest.mock import patch

import frappe
from babel.messages.extract import extract
from babel.messages.mofile import write_mo
from babel.messages.pofile import read_po
from frappe.gettext.extractors.python import extract as python_extractor
from frappe.gettext.translate import PYTHON_KEYWORDS, get_translations_from_mo
from frappe.tests.utils import FrappeTestCase

# The msgid, the language and the context are kept in constants on purpose: `bench generate-pot-file` reads
# every .py of the app, tests included, and would take a literal `_("Gratuity", lang="fr")` of this file for a
# msgid "Gratuity" under the context "fr" (a test below holds this file to that)
MSGID = "Gratuity"
OLD_MSGID = "Gratuity / Pourboire"
LANG = "fr"
CONTEXT = "Restaurant tip line"
# What HRMS's French catalogue says of its own "Gratuity"
HRMS = {MSGID: "Gratification"}


def extracted_by_the_pot_generator(path: Path) -> list[tuple[str, str | None]]:
	"""The (msgid, msgctxt) pairs `bench generate-pot-file` takes out of a Python file, with frappe's own extractor.

	It reads every .py of the app, tests included, and takes the string literals of any call named `_` for msgids
	(and for a context): a test that calls `_()` with a literal msgid, or a literal `lang=`, would feed the catalogues.
	"""
	with open(path, "rb") as source:
		return [
			(message, context)
			for _line, message, _comments, context in extract(python_extractor, source, keywords=PYTHON_KEYWORDS)
		]


def our_french_translations() -> dict[str, str]:
	"""What Frappe's loader reads of our French catalogue once it is compiled, the way `bench compile-po-to-mo` does."""
	app_path = Path(frappe.get_app_path("pos_next"))
	with open(app_path / "locale" / f"{LANG}.po", "rb") as po_file:
		catalog = read_po(po_file)
	with tempfile.TemporaryDirectory() as folder:
		mo_path = Path(folder) / "pos_next.mo"
		with open(mo_path, "wb") as mo_file:
			write_mo(mo_file, catalog)
		with patch("frappe.gettext.translate.get_mo_path", return_value=mo_path):
			return get_translations_from_mo(LANG, "pos_next")


class TestTheTipLineMsgidHasItsOwnContext(FrappeTestCase):
	def test_our_catalogue_carries_the_tip_line_under_its_context(self):
		self.assertEqual(our_french_translations()[f"{MSGID}:{CONTEXT}"], "Pourboire")

	def test_our_catalogue_carries_no_plain_gratuity(self):
		self.assertNotIn(MSGID, our_french_translations())

	def test_each_gratuity_reads_in_its_own_sense_whichever_app_loads_last(self):
		ours = our_french_translations()
		for order in ((HRMS, ours), (ours, HRMS)):
			merged = {}
			for catalogue in order:
				merged.update(catalogue)
			with patch("frappe.translate.get_all_translations", return_value=merged):
				self.assertEqual(frappe._(MSGID, lang=LANG, context=CONTEXT), "Pourboire")
				self.assertEqual(frappe._(MSGID, lang=LANG), "Gratification")

	def test_no_python_file_feeds_a_plain_gratuity_to_the_pot(self):
		app_path = Path(frappe.get_app_path("pos_next"))
		homes = set()
		for path in sorted(app_path.rglob("*.py")):
			if {"node_modules", "__pycache__"} & set(path.parts):
				continue
			name = path.relative_to(app_path).as_posix()
			for message, context in extracted_by_the_pot_generator(path):
				self.assertNotEqual(message, OLD_MSGID, f"{name}: the bilingual msgid is gone")
				if message == MSGID:
					self.assertEqual(context, CONTEXT, f"{name}: the POT would get a {MSGID} under {context!r}")
					homes.add(name)
		# The tip lines of the Restaurant, the invoice and the guest payment (the former single's controller
		# carries the same line until it is retired, and is held to the same rule above)
		expected = {
			"pos_next/doctype/restaurant/restaurant.py",
			"api/invoices.py",
			"api/guest_ordering.py",
		}
		self.assertFalse(expected - homes, f"No tip line any more in: {sorted(expected - homes)}")

	def test_this_file_feeds_nothing_to_the_pot(self):
		self.assertEqual(extracted_by_the_pot_generator(Path(__file__)), [])
