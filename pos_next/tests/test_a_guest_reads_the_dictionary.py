# //// Neoffice — added file (no upstream equivalent).
"""The page a phone opens from the QR code of a table is read in the guest's language (NeoRestau lot 1, Daniel's test of 01.11: « il faut traduire »).

The page asks the server for the dictionary of the app and for its stamp, as a guest: nobody is signed in on a guest's phone. Both endpoints were closed to a
guest, so the page never had a French word. The dictionary is public text (the strings are in the open-source repo): a guest reads it, in the language the
request asks for.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import localization


class AGuestReadsTheDictionary(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.set_user, frappe.session.user)
		self.addCleanup(setattr, frappe.local, "lang", frappe.local.lang)

	def test_the_dictionary_and_its_stamp_are_open_to_a_guest(self):
		for endpoint in (localization.get_app_translations, localization.get_translations_stamp):
			with self.subTest(endpoint=endpoint.__name__):
				self.assertIn(endpoint, frappe.guest_methods)

	def test_a_guest_is_answered_in_the_language_of_the_request(self):
		frappe.set_user("Guest")

		frappe.local.lang = "fr"
		french = localization.get_app_translations()
		frappe.local.lang = "en"
		english = localization.get_app_translations()

		# the words come from every installed app (the test site's own copy of this app is not the one under test): a French dictionary has thousands,
		# and it is not the English one
		self.assertGreater(len(french), 1000)
		self.assertNotEqual(french, english)

	def test_the_stamp_a_guest_gets_is_the_stamp_of_the_dictionary_it_gets(self):
		frappe.local.lang = "fr"
		frappe.set_user("Guest")

		stamp = localization.get_translations_stamp()

		self.assertEqual(stamp, localization._stamp_of(localization.get_app_translations()))
		frappe.local.lang = "en"
		self.assertNotEqual(stamp, localization.get_translations_stamp())
