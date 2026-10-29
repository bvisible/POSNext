# //// Neoffice — added file (no upstream equivalent).
"""The tip line's msgid has a context of its own, so HRMS keeps "Gratification" (NeoRestau lot 1, task 1).

HRMS translates the plain msgid "Gratuity" (its payroll doctype of that name, a tab, a section) as "Gratification".
Frappe merges the apps' catalogues in installed-app order and the last one wins, so a plain "Gratuity" of ours
("Pourboire") would either replace HRMS's on a French desk or be replaced by it on a French till. The tip line is
therefore asked with a context, and our French catalogue carries no plain "Gratuity" at all.
"""

import re
import tempfile
from pathlib import Path
from unittest.mock import patch

import frappe
from babel.messages.mofile import write_mo
from babel.messages.pofile import read_po
from frappe.gettext.translate import get_translations_from_mo
from frappe.tests.utils import FrappeTestCase

CONTEXT = "Restaurant tip line"
# What HRMS's French catalogue says of its own "Gratuity"
HRMS = {"Gratuity": "Gratification"}


def our_french_translations() -> dict[str, str]:
	"""What Frappe's loader reads of our French catalogue once it is compiled, the way `bench compile-po-to-mo` does."""
	app_path = Path(frappe.get_app_path("pos_next"))
	with open(app_path / "locale" / "fr.po", "rb") as po_file:
		catalog = read_po(po_file)
	with tempfile.TemporaryDirectory() as folder:
		mo_path = Path(folder) / "pos_next.mo"
		with open(mo_path, "wb") as mo_file:
			write_mo(mo_file, catalog)
		with patch("frappe.gettext.translate.get_mo_path", return_value=mo_path):
			return get_translations_from_mo("fr", "pos_next")


class TestTheTipLineMsgidHasItsOwnContext(FrappeTestCase):
	def test_our_catalogue_carries_the_tip_line_under_its_context(self):
		self.assertEqual(our_french_translations()[f"Gratuity:{CONTEXT}"], "Pourboire")

	def test_our_catalogue_carries_no_plain_gratuity(self):
		self.assertNotIn("Gratuity", our_french_translations())

	def test_each_gratuity_reads_in_its_own_sense_whichever_app_loads_last(self):
		ours = our_french_translations()
		for order in ((HRMS, ours), (ours, HRMS)):
			merged = {}
			for catalogue in order:
				merged.update(catalogue)
			with patch("frappe.translate.get_all_translations", return_value=merged):
				self.assertEqual(frappe._("Gratuity", lang="fr", context=CONTEXT), "Pourboire")
				self.assertEqual(frappe._("Gratuity", lang="fr"), "Gratification")

	def test_every_gratuity_of_our_code_names_the_context(self):
		app_path = Path(frappe.get_app_path("pos_next"))
		call = re.compile(r"""\b_\(\s*["']Gratuity["'](?P<rest>[^)]*)\)""")
		sites = []
		for path in app_path.rglob("*.py"):
			if path.name.startswith("test_") or "node_modules" in path.parts:
				continue
			source = path.read_text(encoding="utf-8")
			self.assertNotIn("Gratuity / Pourboire", source, f"{path.name}: the bilingual msgid is gone")
			sites += [(path.name, m.group("rest")) for m in call.finditer(source)]
		# The Restaurant and the former single, the invoice's tip line and the guest payment
		self.assertGreaterEqual(len(sites), 4)
		for name, rest in sites:
			self.assertIn(f'context="{CONTEXT}"', rest, f"{name}: _('Gratuity') without its context")
