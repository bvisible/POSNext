# //// Neoffice — added file (no upstream equivalent).
"""The POS Profile form no longer shows the fields a till of this app does not act on (NeoResto lot 1, task 13b; product owner,
30.10.2026 and 05.11.2026: « on ne fait jamais revenir un champ caché exprès », « je vois rien du tout »).

The list of the till's settings (`registry.NOT_LISTED`) says which fields of the POS Profile the till does not read, with the reason;
the form's script (`public/js/pos_profile.js`) hides them on refresh. The two must say the same: a field set aside is hidden, a field
hidden is set aside, and a listed setting is never hidden. `country` is set aside as information only, and stays shown.
"""

import os
import re

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.till_settings import registry

SCRIPT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "js", "pos_profile.js")
# Set aside because it is information, not a setting: it is shown, read-only, as the company's country
SHOWN_ON_PURPOSE = {"country"}
NOT_EVERYWHERE = {
	"link_gift_card",
	"enable_gift_card",
	"number_of_valid_months",
	"cloudprnt_printer",
	"cloudprnt_printer_name",
	"disable_auto_price",
	"update_stock",
}


def hidden_by_the_script():
	text = open(SCRIPT, encoding="utf-8").read()
	block = re.search(r"const UNUSED_PROFILE_FIELDS = \[(.*?)\];", text, re.S)
	if not block:
		raise AssertionError("pos_profile.js does not list the fields it hides")
	return re.findall(r'"([a-z_0-9]+)"', block.group(1))


class TestThePosProfileFormHidesWhatTheTillDoesNotUse(FrappeTestCase):
	def test_the_script_hides_a_field_once(self):
		fields = hidden_by_the_script()

		self.assertEqual(len(fields), len(set(fields)))

	def test_every_field_the_script_hides_is_set_aside_by_the_list_with_its_reason(self):
		aside = registry.NOT_LISTED[registry.POS_PROFILE]

		for field in hidden_by_the_script():
			with self.subTest(field=field):
				self.assertIn(field, aside)
				self.assertTrue(str(aside[field]).strip())

	def test_every_field_the_list_sets_aside_is_hidden_except_the_information(self):
		hidden = set(hidden_by_the_script())

		for field in registry.NOT_LISTED[registry.POS_PROFILE]:
			with self.subTest(field=field):
				self.assertEqual(field in hidden, field not in SHOWN_ON_PURPOSE)

	def test_a_setting_the_till_shows_is_never_hidden(self):
		listed = {setting.key for setting in registry.document_settings(registry.POS_PROFILE)}

		self.assertFalse(listed & set(hidden_by_the_script()))

	def test_every_field_it_hides_is_a_field_of_the_profile_or_one_that_is_not_there_everywhere(self):
		meta = frappe.get_meta(registry.POS_PROFILE)
		missing = {field for field in hidden_by_the_script() if not meta.has_field(field)}

		# Absent where an app that adds it is not installed (the theme's custom fields, the gift cards of the POS Awesome set), or
		# in a version of ERPNext that has not got it (`update_stock`): the form hides only the fields it finds
		self.assertLessEqual(missing, NOT_EVERYWHERE, missing)
