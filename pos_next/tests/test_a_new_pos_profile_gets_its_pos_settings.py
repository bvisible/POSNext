# //// Neoffice — added file (no upstream equivalent).
"""A new POS Profile has its POSNext settings from the moment it exists (NeoResto lot 1, task 13b; product owner, 05.11.2026).

A till's POSNext settings are a document of their own (POS Settings, one per profile, `pos_profile` unique). Nothing made it when the
profile was made: it came with the defaults the first time the till opened with the profile, or when someone opened the settings
page, and the profile's connection « POS Settings » said 0 until then. It is now made by the profile's `after_insert`, and what goes
wrong there never stops the profile. The suite rolls everything back.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next import pos_profile_settings
from pos_next.pos_next.doctype.pos_settings.pos_settings import get_pos_settings
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

NEW_PROFILE = "_Test A New Profile Gets Its Settings"
SAVEPOINT = "new_profile_settings_test"


def rows(profile):
	return frappe.get_all(
		"POS Settings",
		filters={"pos_profile": profile},
		fields=["name", "enabled", "enable_restaurant_mode", "restaurant"],
	)


class TestANewPosProfileGetsItsPosSettings(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.addClassCleanup(frappe.set_user, "Administrator")
		# The users the two tills of the fixture are assigned to
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		cls.fx = _till_fixture()

	def setUp(self):
		frappe.set_user("Administrator")
		# Each test is rolled back to its own savepoint: the next one finds the fixture as the class made it
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")

	def a_copy_of_the_fixture(self, name=NEW_PROFILE):
		new = frappe.copy_doc(frappe.get_doc("POS Profile", self.fx.profile))
		new.name = name
		return new

	def test_the_hook_is_registered_on_the_profile(self):
		hooks = frappe.get_hooks("doc_events").get("POS Profile", {})

		self.assertIn("pos_next.pos_profile_settings.create_for_new_profile", hooks.get("after_insert", []))

	def test_a_profile_has_its_settings_the_moment_it_is_made(self):
		# The fixture made its two tills through a plain insert, and nothing else
		for profile in (self.fx.profile, self.fx.other_profile):
			with self.subTest(profile=profile):
				found = rows(profile)
				self.assertEqual(len(found), 1)
				# The defaults of a till that is not a restaurant till
				self.assertEqual(found[0].enabled, 1)
				self.assertEqual(found[0].enable_restaurant_mode, 0)
				self.assertFalse(found[0].restaurant)

	def test_a_profile_inserted_now_gets_one_row_and_only_one(self):
		new = self.a_copy_of_the_fixture().insert(ignore_permissions=True)

		self.assertEqual(len(rows(new.name)), 1)
		pos_profile_settings.create_for_new_profile(new)
		self.assertEqual(len(rows(new.name)), 1)

	def test_the_row_is_the_one_the_till_would_have_made(self):
		new = self.a_copy_of_the_fixture().insert(ignore_permissions=True)
		made = frappe.get_doc("POS Settings", rows(new.name)[0].name)
		frappe.delete_doc("POS Settings", made.name, force=True, ignore_permissions=True)

		later = get_pos_settings(new.name)

		for fieldname in (
			"enabled",
			"enable_restaurant_mode",
			"return_validity_days",
			"session_lock_timeout",
			"allow_credit_sale",
			"tiles_per_row",
		):
			with self.subTest(field=fieldname):
				self.assertEqual(made.get(fieldname), later.get(fieldname))

	def test_a_profile_made_before_still_gets_its_row_at_the_first_need(self):
		frappe.delete_doc(
			"POS Settings", rows(self.fx.other_profile)[0].name, force=True, ignore_permissions=True
		)
		self.assertEqual(rows(self.fx.other_profile), [])

		get_pos_settings(self.fx.other_profile)

		self.assertEqual(len(rows(self.fx.other_profile)), 1)

	def test_a_profile_made_again_under_a_name_an_earlier_one_had_keeps_the_settings_that_are_there(self):
		new = self.a_copy_of_the_fixture().insert(ignore_permissions=True)
		name = rows(new.name)[0].name
		frappe.db.set_value("POS Settings", name, "return_validity_days", 11)
		# An earlier profile deleted before its row went with it (on_trash, 06.11.2026): its row is still there. A profile deleted
		# now takes its row along (test_a_till_is_deleted_from_the_office_page), and the next one is made with the defaults.
		with patch("pos_next.pos_profile_settings.remove_with_the_profile"):
			frappe.delete_doc("POS Profile", new.name, force=True, ignore_permissions=True)
		self.assertEqual([row.name for row in rows(new.name)], [name])

		again = self.a_copy_of_the_fixture().insert(ignore_permissions=True)

		self.assertEqual([row.name for row in rows(again.name)], [name])
		self.assertEqual(frappe.db.get_value("POS Settings", name, "return_validity_days"), 11)

	def test_what_goes_wrong_is_logged_and_never_stops_the_profile(self):
		module = "pos_next.pos_next.doctype.pos_settings.pos_settings.create_default_settings"
		with (
			patch(module, side_effect=frappe.ValidationError("no settings today")),
			patch.object(frappe, "log_error") as logged,
		):
			new = self.a_copy_of_the_fixture().insert(ignore_permissions=True)

		self.assertTrue(frappe.db.exists("POS Profile", new.name))
		self.assertEqual(rows(new.name), [])
		logged.assert_called_once()
		title = logged.call_args.args[0]
		self.assertLessEqual(len(title), 140)
		self.assertIn("settings of a new POS Profile", title)
		# The message is the traceback: it names what went wrong
		self.assertIn("no settings today", logged.call_args.args[1])
