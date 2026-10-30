# //// Neoffice — added file (no upstream equivalent).
"""A till is a restaurant till by its own setting, and only where NeoRestau runs (NeoRestau lot 1, task 4).

The restaurant switch of the till's header, and the per-device memory behind it, are gone (lot 0): what makes a till a
restaurant till is its POS Settings (`enable_restaurant_mode`, one row per POS Profile, ticked at the desk). It counts
only where the site runs NeoRestau (the site flag `neorestau_active`, off unless the site switches it on), and only for
a till that names its restaurant. Every way the till reads its settings answers that effective mode, so that with
NeoRestau off nothing of the restaurant shows at the till: the entry points of the guests refuse as well.

The suite relies on neither the patches nor any POS Settings row: a fresh CI site runs no patch, while the clone of a
working site holds a real restaurant till. Every test builds the rows it needs and nothing here commits. The site's
flag is set by patching the configuration the code reads, and the one function that writes it
(`frappe.installer.update_site_config`) is replaced by a mock: no test leaves a site_config.json changed.
The users, the restaurant and the tills a class needs are made once for the class; a test rolls back to its savepoint.
"""

import unittest
from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.api import bootstrap, guest_ordering, pos_profile, reservations
from pos_next.integrations import registry
from pos_next.patches.neorestau.switch_neorestau_on_where_restaurant_mode_runs import execute
from pos_next.pos_next.doctype.pos_settings.pos_settings import get_pos_settings, update_pos_settings
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import mode
from pos_next.restaurant.mode import effective_restaurant_mode, neorestau_active
from pos_next.tests.test_a_site_that_used_the_restaurant import a_site_that_never_used_the_restaurant
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

ABSENT = object()
RESTAURANT = "_Test Mode Restaurant"
COUNTER_TILL = "_Test Mode Counter Till"
SAVEPOINT = "neorestau_mode_test"
SITE_FLAG = "neorestau_active"
MODE_HOOK = "pos_next.restaurant.mode.extend_bootstrap_settings"
BOOT_HOOK = "pos_next.restaurant.mode.extend_boot"
SWITCH_ON_PATCH = "pos_next.patches.neorestau.switch_neorestau_on_where_restaurant_mode_runs"
ATTACH_PATCH = "pos_next.patches.neorestau.attach_records_to_the_default_restaurant"

TOKEN = "_Test unknown token"
NEXT_WEEK = add_days(nowdate(), 7)
# What a visitor can start through the guest and booking pages, with arguments that reach nothing of their own: the guard
# of NeoRestau comes before everything the entry point does
STARTS_SOMETHING = (
	(guest_ordering.validate_token, (TOKEN,)),
	(guest_ordering.get_guest_menu, (TOKEN,)),
	(guest_ordering.create_takeaway_token, ()),
	(guest_ordering.submit_guest_order, (TOKEN, "[]")),
	(guest_ordering.submit_takeaway_order, (TOKEN, "[]")),
	(guest_ordering.create_guest_payment, (TOKEN, 10)),
	(reservations.get_available_slots, (NEXT_WEEK,)),
	(reservations.get_available_tables, (NEXT_WEEK, "20:00:00")),
	(
		reservations.submit_guest_reservation,
		(NEXT_WEEK, "20:00:00", 2, "_Test Guest", "0790000000", "mode-guest@yopmail.com"),
	),
)
# What finishes, or reads back, something a visitor already started: a payment in flight is never lost
FINISHES_SOMETHING = (
	(guest_ordering.confirm_guest_payment, (TOKEN, 10)),
	(guest_ordering.get_order_status, (TOKEN,)),
	(guest_ordering.get_guest_receipt_pdf, (TOKEN,)),
	(reservations.verify_reservation, (TOKEN,)),
)


class TheGuardWasAsked(Exception):
	"""What an entry point raises when its guard is replaced by a mock that raises it."""


@contextmanager
def a_site_where_neorestau_is(value):
	"""The site's `neorestau_active` as the code reads it (ABSENT: the key is not in the configuration)."""
	with patch.dict(frappe.conf):
		if value is ABSENT:
			frappe.conf.pop(SITE_FLAG, None)
		else:
			frappe.conf[SITE_FLAG] = value
		yield


class TestWhereNeoRestauRuns(FrappeTestCase):
	def test_neorestau_runs_only_where_the_site_says_so(self):
		for value, runs in (
			(1, True),
			("1", True),
			(True, True),
			(0, False),
			("0", False),
			("", False),
			(None, False),
			(False, False),
			(ABSENT, False),
		):
			with self.subTest(value=value), a_site_where_neorestau_is(value):
				self.assertIs(neorestau_active(), runs)

	def test_restaurant_mode_is_off_where_neorestau_is_off(self):
		till = {"enable_restaurant_mode": 1, "restaurant": RESTAURANT}
		for value in (0, ABSENT):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				self.assertFalse(effective_restaurant_mode(till))

	def test_restaurant_mode_follows_the_till_where_neorestau_runs(self):
		with a_site_where_neorestau_is(1):
			self.assertTrue(
				effective_restaurant_mode({"enable_restaurant_mode": 1, "restaurant": RESTAURANT})
			)
			self.assertFalse(
				effective_restaurant_mode({"enable_restaurant_mode": 0, "restaurant": RESTAURANT})
			)

	def test_a_till_that_names_no_restaurant_is_not_a_restaurant_till(self):
		with a_site_where_neorestau_is(1):
			for restaurant in (None, ""):
				with self.subTest(restaurant=restaurant):
					self.assertFalse(
						effective_restaurant_mode({"enable_restaurant_mode": 1, "restaurant": restaurant})
					)
			self.assertFalse(effective_restaurant_mode({"enable_restaurant_mode": 1}))
			self.assertFalse(effective_restaurant_mode({}))


class Tills:
	"""A restaurant and a till of the test's own (a real POS Profile with its cashier), made once for the class: the users
	are written once, not for every test (each write of a user waits for the clone's locks). A test works inside a
	savepoint and is rolled back to it."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Whatever the class built is rolled back with the class, by the base class
		cls.addClassCleanup(frappe.set_user, "Administrator")
		# A few endpoints commit: nothing of a test may stay
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			raise unittest.SkipTest("The site has no company")
		cls.company = company[0]
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			cls.addClassCleanup(patcher.stop)
		cls.restaurant = (
			frappe.get_doc({"doctype": "Restaurant", "restaurant_name": RESTAURANT, "company": cls.company})
			.insert(ignore_permissions=True)
			.name
		)
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		cls.fx = _till_fixture()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# Whatever a test built, and a setUp that stops halfway, is rolled back: cleanups run in both cases
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")

	def make_till(self, **values):
		"""The POS Settings row of the fixture's POS Profile (the profile's only row)."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{"doctype": "POS Settings", "pos_profile": self.fx.profile, "enabled": 1, **values}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def stored(self, *fields):
		return frappe.db.get_value("POS Settings", {"pos_profile": self.fx.profile}, list(fields))

	def every_read(self):
		"""(source, read): the three ways the till gets its settings, each as the code that serves it."""
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		return {
			"the bootstrap": lambda: bootstrap._get_pos_settings(profile),
			"the profile's settings": lambda: pos_profile.get_pos_settings(self.fx.profile),
			"the settings dialog": lambda: get_pos_settings(self.fx.profile),
		}


class TestTheTillReadsItsEffectiveMode(Tills, FrappeTestCase):
	def assert_every_read_says(self, mode_is, neorestau_is):
		for source, read in self.every_read().items():
			with self.subTest(source=source):
				answer = read()
				self.assertEqual(answer["enable_restaurant_mode"], mode_is)
				self.assertIs(answer["neorestau_active"], neorestau_is)

	def test_a_restaurant_till_is_a_restaurant_till_where_neorestau_runs(self):
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		with a_site_where_neorestau_is(1):
			self.assert_every_read_says(1, True)

	def test_nothing_of_the_restaurant_shows_where_neorestau_is_off(self):
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		for value in (0, ABSENT):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				self.assert_every_read_says(0, False)

	def test_a_counter_till_stays_a_counter_till_where_neorestau_runs(self):
		self.make_till(enable_restaurant_mode=0, restaurant=self.restaurant)
		with a_site_where_neorestau_is(1):
			self.assert_every_read_says(0, True)

	def test_a_till_in_restaurant_mode_that_names_no_restaurant_is_a_counter_till(self):
		self.make_till(enable_restaurant_mode=1)
		with a_site_where_neorestau_is(1):
			self.assert_every_read_says(0, True)

	def test_the_flag_is_told_to_the_till_whatever_its_mode(self):
		# A site running NeoRestau says so to every till, the ones that are not restaurant tills included
		self.make_till(enable_restaurant_mode=0)
		with a_site_where_neorestau_is(1):
			self.assertIs(get_pos_settings(self.fx.profile)["neorestau_active"], True)
		with a_site_where_neorestau_is(0):
			self.assertIs(get_pos_settings(self.fx.profile)["neorestau_active"], False)

	def test_the_settings_a_till_falls_back_on_still_say_whether_the_site_runs_neorestau(self):
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		for value, told in ((1, True), (0, False)):
			with a_site_where_neorestau_is(value), patch.object(frappe, "log_error"):
				with patch("pos_next.api.bootstrap.merge_pos_settings", side_effect=RuntimeError("no read")):
					broken_bootstrap = bootstrap._get_pos_settings(profile)
				with patch("pos_next.api.constants.merge_pos_settings", side_effect=RuntimeError("no read")):
					broken_profile = pos_profile.get_pos_settings(self.fx.profile)
				no_profile = pos_profile.get_pos_settings(None)
			for source, answer in (
				("a bootstrap whose read failed", broken_bootstrap),
				("a profile's settings whose read failed", broken_profile),
				("no profile at all", no_profile),
			):
				with self.subTest(neorestau=value, source=source):
					self.assertIs(answer["neorestau_active"], told)
					self.assertEqual(answer["enable_restaurant_mode"], 0)

	def test_the_hook_that_derives_the_mode_comes_last_among_the_apps_own(self):
		# Last, so that no hook of the app that comes after it can rewrite the effective mode
		own = [
			hook for hook in frappe.get_hooks("pos_next_bootstrap_settings") if hook.startswith("pos_next.")
		]
		self.assertGreater(len(own), 1)
		self.assertEqual(own[-1], MODE_HOOK)

	def test_the_mode_is_derived_even_when_another_hook_of_the_seam_fails(self):
		# The seam calls each hook on its own and logs the one that fails: the restaurant must not show at a till
		# where NeoRestau is off because the hook that tells its rights was down
		settings = {"enable_restaurant_mode": 1, "restaurant": self.restaurant}
		with (
			a_site_where_neorestau_is(0),
			patch(
				"pos_next.restaurant.permissions.rights_of_the_user",
				side_effect=RuntimeError("rights are down"),
			),
			patch.object(frappe, "log_error") as logged,
		):
			registry.extend_bootstrap_settings(settings, None)
		self.assertTrue(logged.called, "the failing hook should have been logged")
		self.assertEqual(settings["enable_restaurant_mode"], 0)
		self.assertIs(settings["neorestau_active"], False)

	def test_the_dialog_never_writes_back_the_tick_it_read(self):
		# The dialog reads the settings as the till does (the effective mode) and sends them back whole when a setting
		# changes: where NeoRestau is off, that answer says "counter" for a till whose tick is on, and writing it back
		# would switch the tick off at the first unrelated save. The tick and the restaurant are the desk's.
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant, max_discount_allowed=5)
		with a_site_where_neorestau_is(0):
			settings = get_pos_settings(self.fx.profile)
			self.assertEqual(settings["enable_restaurant_mode"], 0)
			settings["max_discount_allowed"] = 12
			update_pos_settings(self.fx.profile, settings)
		self.assertEqual(
			self.stored("enable_restaurant_mode", "restaurant", "max_discount_allowed"),
			(1, self.restaurant, 12),
		)

	def test_a_save_answers_the_settings_as_the_till_reads_them(self):
		# What the dialog merges back into its own state is the effective mode, never the stored tick
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		for value, mode_is, neorestau_is in ((0, 0, False), (1, 1, True)):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				answer = update_pos_settings(self.fx.profile, {"max_discount_allowed": 9})
				self.assertEqual(answer["max_discount_allowed"], 9)
				self.assertEqual(answer["enable_restaurant_mode"], mode_is)
				self.assertIs(answer["neorestau_active"], neorestau_is)
				# The whole seam answered: the restaurant's label and what the user may manage of it
				self.assertEqual(answer["restaurant_name"], RESTAURANT)
				self.assertIn("restaurant_can", answer)
		self.assertEqual(self.stored("enable_restaurant_mode"), 1)

	def test_a_save_from_the_till_changes_neither_the_tick_nor_the_restaurant(self):
		self.make_till(enable_restaurant_mode=1, restaurant=self.restaurant)
		with a_site_where_neorestau_is(1):
			update_pos_settings(self.fx.profile, {"enable_restaurant_mode": 0, "restaurant": ""})
		self.assertEqual(self.stored("enable_restaurant_mode", "restaurant"), (1, self.restaurant))
		self.make_till(enable_restaurant_mode=0)
		with a_site_where_neorestau_is(1):
			update_pos_settings(
				self.fx.profile,
				{"enable_restaurant_mode": 1, "restaurant": self.restaurant, "max_discount_allowed": 7},
			)
		self.assertEqual(
			self.stored("enable_restaurant_mode", "restaurant", "max_discount_allowed"), (0, None, 7)
		)

	def test_a_row_the_till_creates_is_no_restaurant_till(self):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		update_pos_settings(self.fx.profile, {"enable_restaurant_mode": 1, "restaurant": self.restaurant})
		self.assertEqual(self.stored("enable_restaurant_mode", "restaurant"), (0, None))


class TestTheGuestEntryPointsNeedNeoRestau(FrappeTestCase):
	"""Where the site does not run NeoRestau nothing of the restaurant shows: the pages a diner opens on a phone (the QR
	menu, the web takeaway, the booking form) are refused, with a short message, at every entry point that starts
	something. What finishes, or reads back, something already started stays open: a payment in flight is never lost."""

	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		frappe.set_user("Guest")
		# What the guard says, read from the guard itself
		with a_site_where_neorestau_is(0), self.assertRaises(frappe.ValidationError) as refused:
			mode.require_neorestau()
		self.refusal = str(refused.exception)

	def test_the_guard_refuses_only_where_neorestau_is_off(self):
		self.assertTrue(self.refusal)
		self.assertLess(len(self.refusal), 80)
		with a_site_where_neorestau_is(1):
			self.assertIsNone(mode.require_neorestau())
		for value in (0, "0", None, ABSENT):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				with self.assertRaises(frappe.ValidationError):
					mode.require_neorestau()

	def test_a_visitor_is_refused_where_neorestau_is_off(self):
		for value in (0, ABSENT):
			for entry_point, arguments in STARTS_SOMETHING:
				with self.subTest(neorestau=value, entry_point=entry_point.__name__):
					with (
						a_site_where_neorestau_is(value),
						self.assertRaises(frappe.ValidationError) as refused,
					):
						entry_point(*arguments)
					self.assertEqual(str(refused.exception), self.refusal)

	def test_every_entry_point_that_starts_something_asks_the_guard_first(self):
		with (
			patch.object(guest_ordering, "require_neorestau", side_effect=TheGuardWasAsked),
			patch.object(reservations, "require_neorestau", side_effect=TheGuardWasAsked),
		):
			for entry_point, arguments in STARTS_SOMETHING:
				with self.subTest(entry_point=entry_point.__name__):
					with self.assertRaises(TheGuardWasAsked):
						entry_point(*arguments)

	def test_what_finishes_or_reads_back_something_started_is_not_refused(self):
		for value in (0, ABSENT):
			with a_site_where_neorestau_is(value):
				for entry_point, arguments in FINISHES_SOMETHING:
					with self.subTest(neorestau=value, entry_point=entry_point.__name__):
						with self.assertRaises(Exception) as answered:
							entry_point(*arguments)
						# The unknown token is refused as it always was: not by the guard of NeoRestau
						self.assertNotEqual(str(answered.exception), self.refusal)

	def test_no_entry_point_that_finishes_something_asks_the_guard(self):
		with (
			patch.object(guest_ordering, "require_neorestau", side_effect=TheGuardWasAsked),
			patch.object(reservations, "require_neorestau", side_effect=TheGuardWasAsked),
		):
			for entry_point, arguments in FINISHES_SOMETHING:
				with self.subTest(entry_point=entry_point.__name__):
					try:
						entry_point(*arguments)
					except TheGuardWasAsked:
						self.fail(
							"the guard of NeoRestau stands in front of a call that finishes what was started"
						)
					except Exception:
						pass  # the unknown token is refused, as it always was


class TestTheSwitchOnPatch(FrappeTestCase):
	"""A site that used the restaurant keeps it: the patch switches NeoRestau on there, once, and never switches it off."""

	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		# The one function that writes site_config.json never runs for real in a test
		writer = patch("frappe.installer.update_site_config")
		self.write_flag = writer.start()
		self.addCleanup(writer.stop)
		# A guard against a call that would not go through the mock: the file is what it was
		self.flag_on_disk = frappe.get_site_config().get(SITE_FLAG, ABSENT)
		self.addCleanup(self.assert_the_flag_on_disk_is_unchanged)
		# The clone of a working site holds a real restaurant, its till and its records: start from a client that
		# never used it, inside the transaction (its single keeps the defaults a migrate wrote)
		a_site_that_never_used_the_restaurant()

	def assert_the_flag_on_disk_is_unchanged(self):
		self.assertEqual(frappe.get_site_config().get(SITE_FLAG, ABSENT), self.flag_on_disk)

	def a_till_in_restaurant_mode(self, **values):
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": COUNTER_TILL,
				"enabled": 1,
				"enable_restaurant_mode": 1,
				**values,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		return doc.insert(ignore_permissions=True).name

	def a_room(self):
		room = frappe.get_doc({"doctype": "Restaurant Area", "area_name": "_Test Mode Room"})
		room.flags.ignore_validate = True
		return room.insert(ignore_permissions=True).name

	def test_a_site_already_running_restaurant_mode_keeps_it(self):
		self.a_till_in_restaurant_mode()
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_called_once_with(SITE_FLAG, 1)

	def test_a_till_that_is_switched_off_still_counts_as_running_restaurant_mode(self):
		# The site once ran restaurant mode and the till may be switched on again: the flag must be there
		self.a_till_in_restaurant_mode(enabled=0)
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_called_once_with(SITE_FLAG, 1)

	def test_a_site_that_ran_the_restaurant_without_ticking_a_till_keeps_it(self):
		# Restaurant mode was a switch of the header, which ticked nothing: its rooms, its tables, its cards say it ran
		self.a_room()
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_called_once_with(SITE_FLAG, 1)

	def test_a_site_without_restaurant_mode_is_left_off(self):
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_not_called()

	def test_a_site_that_holds_only_the_defaults_of_the_single_is_left_off(self):
		# A migrate writes them on every site, a client that never used the restaurant included
		self.assertTrue(frappe.db.get_singles_dict("Restaurant Settings"))
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_not_called()

	def test_a_counter_till_does_not_switch_neorestau_on(self):
		self.a_till_in_restaurant_mode(enable_restaurant_mode=0)
		with a_site_where_neorestau_is(ABSENT):
			execute()
		self.write_flag.assert_not_called()

	def test_a_site_whose_configuration_names_the_flag_is_left_as_it_says(self):
		# Idempotent, and never switched off: a flag that is there, on or off, is somebody's decision (an explicit 0
		# is not the absence of a decision), whatever the tills and the records say
		self.a_till_in_restaurant_mode()
		self.a_room()
		for value in (1, 0, "0", None):
			with self.subTest(value=value), a_site_where_neorestau_is(value):
				execute()
				execute()
		self.write_flag.assert_not_called()

	def test_running_it_twice_switches_on_once(self):
		self.a_till_in_restaurant_mode()
		with a_site_where_neorestau_is(ABSENT):
			execute()
			# The first run wrote the flag; the code reads it as the site now has it
			frappe.conf[SITE_FLAG] = 1
			execute()
		self.write_flag.assert_called_once_with(SITE_FLAG, 1)

	def test_the_patch_runs_after_the_one_that_attaches_the_tills_to_a_restaurant(self):
		with open(frappe.get_app_path("pos_next", "patches.txt")) as patches_file:
			entries = [line.strip() for line in patches_file if line.strip() and not line.startswith("#")]
		self.assertIn(SWITCH_ON_PATCH, entries)
		self.assertEqual(entries.count(SWITCH_ON_PATCH), 1)
		self.assertGreater(entries.index(SWITCH_ON_PATCH), entries.index(ATTACH_PATCH))
		# After the doctype sync, which is what makes the POS Settings columns it reads
		self.assertGreater(entries.index(SWITCH_ON_PATCH), entries.index("[post_model_sync]"))


class TestTheDeskIsToldWhereNeoRestauRuns(FrappeTestCase):
	"""The POS Settings form shows its Restaurant section (the tick, the restaurant, the area, the takeaway) only where
	NeoRestau runs: the tick stays on the desk, and it is not there when NeoRestau is off."""

	def test_the_boot_of_the_desk_says_whether_neorestau_runs(self):
		for value, told in ((1, True), (0, False), (ABSENT, False)):
			with self.subTest(neorestau=value), a_site_where_neorestau_is(value):
				bootinfo = frappe._dict()
				mode.extend_boot(bootinfo)
				# A bool, like the one the till is told
				self.assertIs(bootinfo.neorestau_active, told)

	def test_the_boot_hook_is_registered(self):
		self.assertIn(BOOT_HOOK, frappe.get_hooks("boot_session"))

	def test_the_restaurant_section_of_the_form_depends_on_it(self):
		meta = frappe.get_meta("POS Settings")
		self.assertEqual(
			meta.get_field("section_break_restaurant").depends_on, "eval:frappe.boot.neorestau_active"
		)
		# The tick and the restaurant sit inside that section: hiding it hides both, whatever the tick says
		fields = [field.fieldname for field in meta.fields]
		section = fields.index("section_break_restaurant")
		next_section = next(
			i for i in range(section + 1, len(fields)) if fields[i].startswith("section_break_")
		)
		self.assertIn("enable_restaurant_mode", fields[section:next_section])
		self.assertIn("restaurant", fields[section:next_section])
