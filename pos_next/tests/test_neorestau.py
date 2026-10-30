# //// Neoffice — added file (no upstream equivalent).
"""NeoRestau, the restaurant's business application, declared to the theme (NeoRestau lot 1, task 6).

The declaration is NeoAuto's (the garage's, `neoffice_activity/test_neoauto.py`): off unless the site switches it on, then a
space of the restaurant's tabs at the top of the menu, with its overview figures, and a menu entry made once where it runs.
The theme is not a dependency of this app: a test that reads it, or that needs its menu entries, is skipped on a site
without it (a fresh CI site has none), where `setup()` is a no-op.

Every test builds what it needs under names of its own (`_Test`) and nothing here commits: a test deletes what it made or
works inside a savepoint. The site's flag is set by patching the configuration the code reads; nothing writes a
site_config.json. The clone of a working site holds real tills, a real restaurant and an open shift of Administrator, so the
figures are tested on tables, bookings, tills, sales and shifts built here, for restaurants of the test's own.
"""

import importlib
import os
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import frappe
from frappe import _
from frappe.desk.doctype.workspace.workspace import Workspace
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, getdate, now_datetime, nowdate
from pymysql.err import OperationalError

from pos_next import install
from pos_next.restaurant import mode, neorestau
from pos_next.restaurant.neorestau import business_apps, setup, tabs
from pos_next.tests.test_opening_a_restaurant_till import (
	BAD_FIELD_ERROR,
	MIXED,
	WAITER,
	Tills,
	a_read_of_the_settings_that_fails,
	the_statements_run,
)
from pos_next.tests.test_restaurant_mode_comes_from_the_till import ABSENT, a_site_where_neorestau_is
from pos_next.tests.test_till_writes_need_the_till import _user

EXPECTED_SPEC = {
	"name": "neorestau",
	"title": "NeoRestau",
	"workspaces": ["NeoRestau"],
	"follows": "Retail",
	"gestures": ["invoice", "payment", "search"],
	"active_by_default": 0,
}
TAB_KEYS = [
	"overview",
	"floor",
	"cards",
	"items",
	"options",
	"stations",
	"reservations",
	"tips",
	"sales",
	"settings",
]
ESSENTIAL = {"overview", "floor", "cards", "reservations", "sales"}
# The restaurant's own lists: what this module declares (the items and the sales are the theme's)
OUR_LISTS = {
	"floor": "Restaurant Table",
	"cards": "Restaurant Card",
	"options": "Product Option Group",
	"stations": "Preparation Station",
	"reservations": "Restaurant Reservation",
	"tips": "Restaurant Tip",
}

# What a test makes under names of its own, so that a real menu entry, page or restaurant is never touched
TEST_APP = "_test_neorestau"
TEST_WORKSPACE = "_Test NeoRestau"
FOLLOWED = "_Test NeoRestau followed page"
FOLLOWER = "_test_neorestau_follower"
CONTROL = "_Test NeoRestau export control"
EARLIER_STEP = "_Test NeoRestau work of an earlier step of the migrate"
SECOND_RESTAURANT = "_Test Second Restaurant"
# The Error Log title of a menu entry that could not be made at a migrate
MENU_ENTRY_ERROR = "POS Next: NeoRestau menu entry"
THE_BLIND_READER = "neorestau-blind-reader@yopmail.com"

# The flags that tell Frappe a save is the system's (install, patch, migrate, a test run): a workspace saved while one is
# set is never written into its app's files (frappe/desk/doctype/workspace/workspace.py, disable_saving_as_public)
SYSTEM_FLAGS = ("in_install", "in_uninstall", "in_patch", "in_test", "in_fixtures", "in_migrate")


def theme_or_skip(module, attribute=None):
	"""A module of the theme, or skip the test: this app does not depend on it, and a fresh CI site does not have it."""
	try:
		found = importlib.import_module(module)
	except ImportError:
		raise unittest.SkipTest("neoffice_theme is not installed on this site")
	if attribute and not hasattr(found, attribute):
		raise unittest.SkipTest(f"neoffice_theme has no {module}.{attribute} yet")
	return found


@contextmanager
def none_of_the_system_flags():
	"""The state of `bench execute` (and of a web request): none of the flags that name a save the system's is set."""
	before = {flag: frappe.flags.get(flag) for flag in SYSTEM_FLAGS}
	for flag in SYSTEM_FLAGS:
		frappe.flags[flag] = False
	try:
		yield
	finally:
		for flag, value in before.items():
			frappe.flags[flag] = value


def a_site_without_the_theme():
	"""`frappe.db.exists`, but the theme's App Customization is not a doctype of the site."""
	real = frappe.db.exists

	def exists(doctype, name=None, *args, **kwargs):
		if (doctype, name) == ("DocType", "App Customization"):
			return None
		return real(doctype, name, *args, **kwargs)

	return patch.object(frappe.db, "exists", side_effect=exists)


@contextmanager
def a_migrate_of_which_only_the_menu_entry_is_real(earlier_step=lambda: None):
	"""`install.after_migrate()` with the steps that are not NeoRestau's replaced by nothing (`earlier_step` stands for the
	work of the one before it) and nothing committed: yields the commit, to see that the migrate went on to it."""
	with (
		patch.multiple(
			install,
			reclaim_pos_settings_doctype=lambda **kwargs: None,
			ensure_coupon_code_field=lambda **kwargs: None,
			setup_default_print_format=lambda **kwargs: None,
			grant_cashier_permissions=lambda: None,
			grant_restaurant_rights=earlier_step,
		),
		patch.object(frappe, "clear_cache"),
		patch.object(frappe.db, "commit") as commit,
	):
		yield commit


# ───────────────────────── the declaration ─────────────────────────


class TestTheDeclaration(FrappeTestCase):
	def tearDown(self):
		# The theme remembers the declarations for the length of a request
		frappe.local.neo_declared_business_apps = None
		super().tearDown()

	def test_off_until_the_site_switches_it_on(self):
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			self.assertFalse(neorestau.active())
			self.assertEqual(tabs(), {})
		with patch.dict(frappe.conf, {"neorestau_active": 1}):
			self.assertTrue(neorestau.active())
		self.assertEqual(business_apps(), [EXPECTED_SPEC])

	def test_a_site_that_does_not_say_so_does_not_run_it(self):
		with a_site_where_neorestau_is(ABSENT):
			self.assertFalse(neorestau.active())
			self.assertEqual(tabs(), {})

	def test_the_switch_is_the_one_the_till_reads(self):
		for value in (0, 1, "1", ABSENT):
			with self.subTest(value=value), a_site_where_neorestau_is(value):
				self.assertEqual(neorestau.active(), mode.neorestau_active())

	def test_the_app_declares_itself_in_its_hooks(self):
		hooks = frappe.get_hooks(app_name="pos_next")
		self.assertEqual(hooks["neoffice_business_apps"], ["pos_next.restaurant.neorestau.business_apps"])
		self.assertEqual(hooks["neoffice_workspace_tabs"], ["pos_next.restaurant.neorestau.tabs"])
		self.assertIs(frappe.get_attr("pos_next.restaurant.neorestau.business_apps"), business_apps)
		self.assertIs(frappe.get_attr("pos_next.restaurant.neorestau.tabs"), tabs)

	def test_the_theme_reads_the_declaration(self):
		guard = theme_or_skip("neoffice_theme.workspace_guard", "declared_business_apps")
		access_model = theme_or_skip("neoffice_theme.access_model", "with_declared")
		frappe.local.neo_declared_business_apps = None
		declared = guard.declared_business_apps()
		self.assertIn("neorestau", declared)
		self.assertEqual(declared["neorestau"]["workspaces"], ["NeoRestau"])
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			self.assertFalse(guard.app_switched_on("neorestau"))
			self.assertIn("neorestau", guard.get_hidden_owning_apps())
		with patch.dict(frappe.conf, {"neorestau_active": 1}):
			self.assertTrue(guard.app_switched_on("neorestau"))
			self.assertNotIn("neorestau", guard.get_hidden_owning_apps())
		# Whoever holds the point of sale holds NeoRestau: the restaurant's cashier opens it from the menu
		self.assertIn("NeoRestau", access_model.with_declared({"Retail"}))
		self.assertNotIn("NeoRestau", access_model.with_declared({"Activities"}))

	def test_a_migrate_makes_the_menu_entry_and_the_roles_once_each(self):
		# The roles are made by the migrate already (task 3): the menu entry does not make them a second time
		with (
			patch.multiple(
				install,
				reclaim_pos_settings_doctype=lambda **kwargs: None,
				ensure_coupon_code_field=lambda **kwargs: None,
				setup_default_print_format=lambda **kwargs: None,
				grant_cashier_permissions=lambda: None,
			),
			patch.object(frappe, "clear_cache"),
			patch.object(frappe.db, "commit"),
			patch("pos_next.restaurant.permissions.ensure_restaurant_roles") as roles,
			patch("pos_next.restaurant.permissions.grant_restaurant_permissions"),
			patch("pos_next.restaurant.neorestau.setup") as menu_entry,
		):
			install.after_migrate()
		menu_entry.assert_called_once_with()
		roles.assert_called_once_with()


# ───────────────────────── the tabs ─────────────────────────


class TestTheTabs(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")
		theme_or_skip("neoffice_theme.workspace_spaces.operations", "tabs")
		super().setUpClass()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(setattr, frappe.local, "neo_declared_business_apps", None)
		# The site runs NeoRestau unless a test says otherwise
		flag = a_site_where_neorestau_is(1)
		flag.__enter__()
		self.addCleanup(flag.__exit__, None, None, None)

	def space(self):
		return {tab["key"]: tab for tab in tabs()["NeoRestau"]}

	def test_the_restaurant_tabs(self):
		space = tabs()["NeoRestau"]
		self.assertEqual([t["key"] for t in space], TAB_KEYS)
		self.assertTrue(all(t["bundle"][0] == "NeoRestau" for t in space))
		self.assertEqual({t["key"] for t in space if t.get("essential")}, ESSENTIAL)

	def test_the_space_is_the_declared_one(self):
		declared = business_apps()[0]
		self.assertEqual(list(tabs()), [neorestau.SPACE])
		overview = self.space()["overview"]
		self.assertEqual(overview["archetype"], "overview")
		self.assertEqual(overview["workspace"], declared["workspaces"][0])
		self.assertEqual(overview["workspaces"], declared["workspaces"])

	def test_the_overview_opens_the_restaurant_door_of_the_till(self):
		overview = self.space()["overview"]
		self.assertEqual(
			overview["action"],
			{
				"label": _("Open the restaurant till"),
				"route": "/pos?mode=restaurant",
				"requires": ["POS Opening Shift", "POS Profile"],
			},
		)
		# The door the tills' list answers to (get_pos_profiles(mode="restaurant"), task 5)
		route = urlparse(overview["action"]["route"])
		self.assertEqual((route.path, parse_qs(route.query)), ("/pos", {"mode": ["restaurant"]}))
		self.assertIs(overview["figures"], neorestau.overview_figures)

	def test_the_restaurants_own_lists(self):
		space = self.space()
		for key, doctype in OUR_LISTS.items():
			with self.subTest(tab=key):
				self.assertEqual((space[key]["archetype"], space[key]["doctype"]), ("document", doctype))
		today = getdate(nowdate())
		self.assertEqual(
			[v["key"] for v in space["floor"]["views"](today)], ["free", "occupied", "cleaning", "all"]
		)
		self.assertEqual(
			[v["key"] for v in space["reservations"]["views"](today)], ["today", "upcoming", "no_show"]
		)
		self.assertEqual([v["key"] for v in space["tips"]["views"](today)], ["collected", "distributed"])

	def test_the_cards_lead_to_the_menus(self):
		link = self.space()["cards"]["view_link"]
		self.assertEqual(
			link, {"label": _("Menus"), "route": "/app/restaurant-menu", "doctype": "Restaurant Menu"}
		)

	def test_every_view_filters_on_what_its_list_has_and_counts(self):
		today = getdate(nowdate())
		for key, doctype in OUR_LISTS.items():
			tab = self.space()[key]
			meta = frappe.get_meta(doctype)
			views = tab["views"](today)
			self.assertEqual(len({v["key"] for v in views}), len(views), f"{key}: two views of one key")
			for view in views:
				filters = [*(tab.get("base") or []), *view["filters"]]
				for field, _operator, value in filters:
					with self.subTest(tab=key, view=view["key"], field=field):
						self.assertIn(field, meta.get_valid_columns())
						df = meta.get_field(field)
						if df and df.fieldtype == "Select":
							values = value if isinstance(value, list) else [value]
							self.assertTrue(set(values) <= set(df.options.split("\n")), values)
				with self.subTest(tab=key, view=view["key"], what="counted"):
					found = frappe.get_all(doctype, filters=filters, fields=["count(name) as total"])
					self.assertIsInstance(found[0].total, int)

	def test_the_sales_and_the_items_are_the_themes_own_tabs(self):
		retail = theme_or_skip("neoffice_theme.workspace_spaces.retail", "tabs")
		operations = theme_or_skip("neoffice_theme.workspace_spaces.operations", "tabs")
		invoices = next(t for t in retail.tabs() if t["key"] == "invoices")
		items = next(t for t in operations.tabs() if t["key"] == "items")
		space = self.space()
		# The same list, with the same views and figures, kept in step with the theme: a change there is a change here
		sales = space["sales"]
		for field in ("archetype", "doctype", "base", "views", "figures"):
			self.assertEqual(sales[field], invoices[field], field)
		self.assertEqual(sales["bundle"], ["NeoRestau", *invoices["bundle"]])
		self.assertTrue(sales["essential"])
		self.assertEqual(sales["label"], _("Sales"))
		self.assertEqual(space["items"]["doctype"], "Item")
		self.assertEqual(space["items"]["bundle"], ["NeoRestau", *items["bundle"]])
		self.assertFalse(space["items"]["essential"])
		# Borrowing copies: the theme's tabs are as they were
		self.assertEqual(
			next(t for t in retail.tabs() if t["key"] == "invoices")["bundle"], invoices["bundle"]
		)
		self.assertEqual(next(t for t in operations.tabs() if t["key"] == "items")["bundle"], items["bundle"])

	def test_the_settings_group_what_a_restaurant_sets_up(self):
		settings = self.space()["settings"]
		self.assertEqual(settings["archetype"], "settings")
		self.assertEqual(
			[(group["label"], group["items"]) for group in settings["groups"]],
			[
				(_("Restaurants"), ["Restaurant"]),
				(_("Tills"), ["POS Settings", "POS Profile"]),
				(_("Preparation"), ["Preparation Workflow", "Menu Badge", "Menu Design Template"]),
			],
		)

	def test_the_theme_builds_the_space_from_the_declaration(self):
		wt = theme_or_skip("neoffice_theme.workspace_tabs", "_code_catalogue")
		frappe.local.neo_declared_business_apps = None
		catalogue = wt._code_catalogue()
		self.assertEqual([t["key"] for t in catalogue["NeoRestau"]], TAB_KEYS)
		# Every list of the space opens for a reader who holds everything, the settings' groups with their entries
		visible = {t["key"]: t for t in wt._visible_tabs("NeoRestau", with_reports=False)}
		self.assertTrue(set(TAB_KEYS) - {"overview"} <= set(visible), set(visible))
		# ... the cards with the way to the menus, which a reader of the menus is offered
		link = wt._view_link(visible["cards"])
		self.assertEqual((link["label"], link["route"]), (_("Menus"), "/app/restaurant-menu"))
		panel = wt._settings_panel(visible["settings"])
		self.assertEqual(
			[group["label"] for group in panel["groups"]], [_("Restaurants"), _("Tills"), _("Preparation")]
		)
		self.assertEqual(panel["groups"][0]["items"][0]["route"], "/app/restaurant")
		# A site that does not run NeoRestau has no such space
		with a_site_where_neorestau_is(0):
			self.assertNotIn("NeoRestau", wt._code_catalogue())

	def test_the_theme_draws_the_overview_with_the_figures_and_the_door(self):
		wt = theme_or_skip("neoffice_theme.workspace_tabs", "get_overview")
		frappe.local.neo_declared_business_apps = None
		self.addCleanup(
			frappe.cache().delete_value,
			f"{wt.CACHE_PREFIX}:overview:NeoRestau:{frappe.local.lang}:{frappe.session.user}",
		)
		overview = wt.get_overview(space="NeoRestau", fresh=1)
		self.assertTrue(overview["enabled"])
		self.assertEqual(overview["action"]["route"], "/pos?mode=restaurant")
		# The overview's row has room for three figures beside the door
		self.assertEqual(len(overview["figures"]), 3)


# ───────────────────────── the menu entry ─────────────────────────


class TestTheMenuEntry(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		theme_or_skip("neoffice_theme.workspace_guard", "declared_business_apps")
		if not frappe.db.exists("DocType", "App Customization"):
			raise unittest.SkipTest("the site has no App Customization")
		super().setUpClass()

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		# The entry and the page of the test's own: a real NeoRestau of the site is never touched
		names = patch.multiple(neorestau, APP=TEST_APP, WORKSPACE=TEST_WORKSPACE)
		names.start()
		self.addCleanup(names.stop)
		flag = a_site_where_neorestau_is(1)
		flag.__enter__()
		self.addCleanup(flag.__exit__, None, None, None)

	def tearDown(self):
		self.forget_what_was_made()
		frappe.local.neo_declared_business_apps = None
		super().tearDown()

	@staticmethod
	def forget_what_was_made():
		for name in (TEST_APP, FOLLOWER):
			if frappe.db.exists("App Customization", name):
				frappe.delete_doc("App Customization", name, force=True, ignore_permissions=True)
		for name in (TEST_WORKSPACE, FOLLOWED, CONTROL):
			if frappe.db.exists("Workspace", name):
				frappe.delete_doc("Workspace", name, force=True, ignore_permissions=True)

	@staticmethod
	def the_page_followed_and_its_entry(logo, **entry):
		"""A page NeoRestau follows, and the menu entry that lists it (the point of sale's), with the given icon."""
		frappe.get_doc(
			{"doctype": "Workspace", "label": FOLLOWED, "title": FOLLOWED, "public": 1, "content": "[]"}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "App Customization",
				"app_name": FOLLOWER,
				"app_title": "Point of sale",
				"app_logo": logo,
				"is_virtual": 1,
				"enabled": 1,
				"workspaces": [{"workspace_name": FOLLOWED}],
				**entry,
			}
		).insert(ignore_permissions=True)

	def test_the_menu_entry_is_made_once_where_neorestau_runs(self):
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			setup()
			self.assertFalse(frappe.db.exists("App Customization", TEST_APP))
			self.assertFalse(frappe.db.exists("Workspace", TEST_WORKSPACE))
		with patch.dict(frappe.conf, {"neorestau_active": 1}):
			setup()
			self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
			self.assertEqual(frappe.db.get_value("App Customization", TEST_APP, "is_virtual"), 1)
			# Its administrators' choices stay: the next migrate leaves the entry as it is
			frappe.db.set_value("App Customization", TEST_APP, "app_title", "Our restaurant")
			setup()
			self.assertEqual(
				frappe.db.get_value("App Customization", TEST_APP, "app_title"), "Our restaurant"
			)

	def test_the_entry_is_the_virtual_application_the_theme_lists(self):
		setup()
		entry = frappe.get_doc("App Customization", TEST_APP)
		self.assertEqual(
			(entry.app_name, entry.app_title, entry.is_virtual, entry.is_installed_app, entry.enabled),
			(TEST_APP, "NeoRestau", 1, 0, 1),
		)
		self.assertEqual((entry.interface_mode, entry.sort_order), ("Tous", 49))
		self.assertEqual(
			[(row.workspace_name, row.sort_order, row.hidden) for row in entry.workspaces],
			[(TEST_WORKSPACE, 0, 0)],
		)
		# The theme opens the first page of the entry
		self.assertEqual(entry.app_route, "/app/" + TEST_WORKSPACE.lower().replace(" ", "-"))

	def test_the_page_is_a_public_empty_page_of_the_module(self):
		setup()
		page = frappe.db.get_value(
			"Workspace",
			TEST_WORKSPACE,
			["label", "title", "module", "public", "content", "for_user"],
			as_dict=True,
		)
		self.assertEqual(
			(page.label, page.title, page.module, page.public, page.content, page.for_user or ""),
			(TEST_WORKSPACE, TEST_WORKSPACE, "POS Next", 1, "[]", ""),
		)

	def test_it_takes_the_icon_of_the_point_of_sale(self):
		with patch.object(neorestau, "FOLLOWS", FOLLOWED):
			self.the_page_followed_and_its_entry(logo="_TestPointOfSaleIcon")
			setup()
		self.assertEqual(
			frappe.db.get_value("App Customization", TEST_APP, "app_logo"), "_TestPointOfSaleIcon"
		)

	def test_without_the_icon_of_the_point_of_sale_it_has_the_default_one(self):
		# No entry lists the page it follows ...
		with patch.object(neorestau, "FOLLOWS", FOLLOWED):
			setup()
		self.assertEqual(frappe.db.get_value("App Customization", TEST_APP, "app_logo"), "Activites")
		# ... or the one that does is switched off, or has no icon of its own
		for entry in ({"enabled": 0}, {"app_logo": ""}):
			with self.subTest(entry=entry):
				self.forget_what_was_made()
				with patch.object(neorestau, "FOLLOWS", FOLLOWED):
					self.the_page_followed_and_its_entry(**{"logo": "_TestPointOfSaleIcon", **entry})
					setup()
				self.assertEqual(frappe.db.get_value("App Customization", TEST_APP, "app_logo"), "Activites")

	def test_where_the_site_does_not_run_neorestau_nothing_is_made_and_nothing_is_deleted(self):
		setup()
		for value in (0, ABSENT):
			with self.subTest(value=value), a_site_where_neorestau_is(value):
				setup()
				# Switching NeoRestau off hides it (the theme) without deleting anything
				self.assertTrue(frappe.db.exists("App Customization", TEST_APP))
				self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
		self.forget_what_was_made()
		with a_site_where_neorestau_is(0):
			setup()
		self.assertFalse(frappe.db.exists("App Customization", TEST_APP))
		self.assertFalse(frappe.db.exists("Workspace", TEST_WORKSPACE))

	def test_nothing_is_made_where_the_theme_is_absent(self):
		with a_site_without_the_theme():
			setup()
		self.assertFalse(frappe.db.exists("App Customization", TEST_APP))
		self.assertFalse(frappe.db.exists("Workspace", TEST_WORKSPACE))

	def test_a_page_that_exists_gets_its_entry_and_what_exists_is_not_made_again(self):
		frappe.get_doc(
			{
				"doctype": "Workspace",
				"label": TEST_WORKSPACE,
				"title": TEST_WORKSPACE,
				"public": 1,
				"content": "[]",
			}
		).insert(ignore_permissions=True)
		modified = frappe.db.get_value("Workspace", TEST_WORKSPACE, "modified")
		setup()
		self.assertTrue(frappe.db.exists("App Customization", TEST_APP))
		self.assertEqual(frappe.db.get_value("Workspace", TEST_WORKSPACE, "modified"), modified)
		# Both are there: a second call makes no document
		with patch.object(frappe, "get_doc", side_effect=AssertionError("a second call made something")):
			setup()

	def test_the_page_is_never_exported_into_the_app(self):
		"""`bench execute pos_next.restaurant.neorestau.setup`, right after the site's config gets the flag: no migrate, no
		install, no test flag, and a developer site (a development instance, and every new instance until it is set up).
		Frappe writes a public workspace that has a module into its app's files on a developer site unless one of the
		system flags is set, and a JSON file under apps/pos_next makes the next `git pull` of the app refuse."""
		export, delete = MagicMock(), MagicMock()
		with (
			patch("frappe.desk.doctype.workspace.workspace.export_to_files", export),
			patch("frappe.desk.doctype.workspace.workspace.delete_folder", delete),
			patch.dict(frappe.conf, {"neorestau_active": 1, "developer_mode": 1}),
			none_of_the_system_flags(),
		):
			# The control: a page of a module saved the usual way is written out in these very conditions
			frappe.get_doc(
				{
					"doctype": "Workspace",
					"label": CONTROL,
					"title": CONTROL,
					"module": "POS Next",
					"public": 1,
					"content": "[]",
				}
			).insert(ignore_permissions=True)
			export.assert_called_once()
			export.reset_mock()
			# The page and its entry are made, and exported nowhere, the first time and every time
			setup()
			self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
			self.assertTrue(frappe.db.exists("App Customization", TEST_APP))
			setup()
		export.assert_not_called()
		delete.assert_not_called()
		self.assertFalse(
			os.path.exists(
				frappe.get_app_path("pos_next", "pos_next", "workspace", frappe.scrub(TEST_WORKSPACE))
			)
		)

	def test_the_flag_that_keeps_the_page_from_being_exported_is_given_back(self):
		self.addCleanup(setattr, frappe.flags, "in_fixtures", None)
		for before in (False, True):
			with self.subTest(before=before):
				self.forget_what_was_made()
				frappe.flags.in_fixtures = before
				setup()
				self.assertIs(bool(frappe.flags.in_fixtures), before)
				# Also when the page cannot be saved
				self.forget_what_was_made()
				with (
					patch.object(Workspace, "insert", side_effect=RuntimeError("the page cannot be saved")),
					self.assertRaises(RuntimeError),
				):
					setup()
				self.assertIs(bool(frappe.flags.in_fixtures), before)

	# What a migrate seeds never raises (house rule): an exception in the migrate's hook rolls the migrate back and exits it
	# non-zero, and a fleet update stops on it - for a menu entry. The provisioning of a restaurant client calls setup()
	# itself, with `bench execute`, and wants to see a failure: the migrate guards its call, setup() stays loud.

	def test_a_migrate_makes_the_page_and_the_entry(self):
		logged = frappe.db.count("Error Log", {"method": MENU_ENTRY_ERROR})
		with a_migrate_of_which_only_the_menu_entry_is_real() as commit:
			install.after_migrate()
		self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
		self.assertTrue(frappe.db.exists("App Customization", TEST_APP))
		commit.assert_called()
		self.assertEqual(frappe.db.count("Error Log", {"method": MENU_ENTRY_ERROR}), logged)

	def test_setup_itself_stays_loud_and_the_half_it_made_is_for_its_caller_to_undo(self):
		with patch.object(neorestau, "_logo", side_effect=RuntimeError("the icon cannot be read")):
			with self.assertRaises(RuntimeError):
				setup()
		# It made the page before it failed, and not the entry: the half-made state the migrate's guard undoes
		self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
		self.assertFalse(frappe.db.exists("App Customization", TEST_APP))

	def test_a_menu_entry_that_cannot_be_made_does_not_stop_the_migrate(self):
		logged = frappe.db.count("Error Log", {"method": MENU_ENTRY_ERROR})
		with (
			a_migrate_of_which_only_the_menu_entry_is_real() as commit,
			patch.object(neorestau, "_logo", side_effect=RuntimeError("the icon cannot be read")),
		):
			install.after_migrate()
		# The migrate went on to its commit, and said why in the Error Log
		commit.assert_called()
		self.assertEqual(frappe.db.count("Error Log", {"method": MENU_ENTRY_ERROR}), logged + 1)
		self.assertIn(
			"the icon cannot be read", frappe.get_last_doc("Error Log", {"method": MENU_ENTRY_ERROR}).error
		)
		# Nothing half-made is left to be committed: the page setup() made before it failed is undone
		self.assertFalse(frappe.db.exists("Workspace", TEST_WORKSPACE))
		self.assertFalse(frappe.db.exists("App Customization", TEST_APP))
		# ... and "made once" repairs it at the next migrate
		with a_migrate_of_which_only_the_menu_entry_is_real():
			install.after_migrate()
		self.assertTrue(frappe.db.exists("Workspace", TEST_WORKSPACE))
		self.assertTrue(frappe.db.exists("App Customization", TEST_APP))
		self.assertEqual(frappe.db.count("Error Log", {"method": MENU_ENTRY_ERROR}), logged + 1)

	def test_the_guard_undoes_the_menu_entry_and_nothing_else_of_the_migrate(self):
		def work_of_an_earlier_step():
			frappe.get_doc({"doctype": "ToDo", "description": EARLIER_STEP}).insert(ignore_permissions=True)

		self.addCleanup(frappe.db.delete, "ToDo", {"description": EARLIER_STEP})
		with (
			a_migrate_of_which_only_the_menu_entry_is_real(work_of_an_earlier_step),
			patch.object(neorestau, "_logo", side_effect=RuntimeError("the icon cannot be read")),
		):
			install.after_migrate()
		self.assertTrue(frappe.db.exists("ToDo", {"description": EARLIER_STEP}))
		self.assertFalse(frappe.db.exists("Workspace", TEST_WORKSPACE))


# ───────────────────────── the overview figures ─────────────────────────


def an_area(restaurant, label):
	return (
		frappe.get_doc({"doctype": "Restaurant Area", "restaurant": restaurant, "area_name": label})
		.insert(ignore_permissions=True)
		.name
	)


def some_tables(area, *states):
	"""One table per state given, in the room `area` (a table is in the restaurant of its room)."""
	for number, state in enumerate(states, 1):
		frappe.get_doc(
			{
				"doctype": "Restaurant Table",
				"table_name": f"{area} {number}",
				"area": area,
				"status": state,
				"capacity": 2,
			}
		).insert(ignore_permissions=True)


def a_booking(restaurant, day, status="Confirmed"):
	"""A booking of `day` (a booking is not made in the past: the day is set once it is saved)."""
	booking = frappe.get_doc(
		{
			"doctype": "Restaurant Reservation",
			"restaurant": restaurant,
			"status": status,
			"reservation_date": add_days(nowdate(), 1),
			"reservation_time": "20:00:00",
			"no_of_guests": 2,
			"guest_name": "_Test Guest",
		}
	).insert(ignore_permissions=True)
	if str(day) != str(booking.reservation_date):
		frappe.db.set_value("Restaurant Reservation", booking.name, "reservation_date", day)
	return booking.name


def a_sale(till, day, amount=10, **changes):
	"""A sales invoice as the figures read it, saved row by row: the figure counts columns, not what a till writes."""
	frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"name": f"_Test-NR-SINV-{frappe.generate_hash(length=8)}",
			"is_pos": 1,
			"docstatus": 1,
			"is_return": 0,
			"posting_date": day,
			"pos_profile": till,
			"company": frappe.db.get_value("POS Profile", till, "company"),
			"base_grand_total": amount,
			"grand_total": amount,
			"idx": 0,
			**changes,
		}
	).db_insert()


def a_shift(till, user="Administrator", status="Open", **changes):
	"""A till session as the figures read it."""
	name = f"_Test-NR-SHIFT-{frappe.generate_hash(length=8)}"
	frappe.get_doc(
		{
			"doctype": "POS Opening Shift",
			"name": name,
			"docstatus": 1,
			"status": status,
			"user": user,
			"pos_profile": till,
			"company": frappe.db.get_value("POS Profile", till, "company"),
			"period_start_date": now_datetime(),
			"posting_date": nowdate(),
			"idx": 0,
			**changes,
		}
	).db_insert()
	return name


class TestTheOverviewFigures(Tills, FrappeTestCase):
	"""The figures count the restaurant the reader works for (his open till's, else the default one), as the lists the
	till reads do, and only what the reader may read.

	`Tills` makes the first restaurant, a counter till and two restaurant tills; a second restaurant takes the second
	restaurant till here."""

	@classmethod
	def setUpClass(cls):
		theme_or_skip("neoffice_theme.permitted", "count")
		theme_or_skip("neoffice_theme.workspace_spaces.common", "counted")
		super().setUpClass()
		company = frappe.db.get_value("Restaurant", cls.restaurant, "company")
		cls.other = (
			frappe.get_doc(
				{"doctype": "Restaurant", "restaurant_name": SECOND_RESTAURANT, "company": company}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def setUp(self):
		super().setUp()
		self.today = getdate(nowdate())
		self.change_settings(self.second_restaurant_till, restaurant=self.other)

	def a_service(self):
		"""What the two restaurants hold today.

		The first one: five tables (two with guests, one paid at the table, one free, one to clean); seven bookings of
		today (three still to come, a seated, a completed, a cancelled and a missed one), two for tomorrow, one missed
		yesterday; of its till, two sales of today and a returned, an unsubmitted, an older and a non-POS one, an open
		session and a closed one. The second one: three tables (two with guests, one free), one booking of today to come,
		one sale and one session. The counter till sold and opened a session too."""
		a, b = self.restaurant, self.other
		some_tables(an_area(a, "_Test Room A"), "Occupied", "Occupied", "Paid", "Empty", "Cleaning")
		some_tables(an_area(b, "_Test Room B"), "Occupied", "Occupied", "Empty")
		day = str(self.today)
		for status in ("Confirmed", "Confirmed", "Pending", "Seated", "Completed", "Cancelled", "No Show"):
			a_booking(a, day, status)
		a_booking(a, add_days(day, 1), "Pending")
		a_booking(a, add_days(day, 1), "Confirmed")
		a_booking(a, add_days(day, -1), "No Show")
		a_booking(b, day, "Confirmed")
		mine, theirs, counter = self.restaurant_till, self.second_restaurant_till, self.grocery_till
		a_sale(mine, day, 10)
		a_sale(mine, day, 20)
		a_sale(mine, day, -3, is_return=1)
		a_sale(mine, day, 5, docstatus=0)
		a_sale(mine, add_days(day, -1), 7)
		a_sale(mine, day, 9, is_pos=0)
		a_sale(theirs, day, 100)
		a_sale(counter, day, 40)
		a_shift(mine, MIXED)
		a_shift(mine, MIXED, status="Closed")
		a_shift(theirs, WAITER)
		a_shift(counter, MIXED)

	def figures(self, restaurant, today=None):
		"""The overview's figures for a reader who works for `restaurant`, by their label."""
		with patch.object(neorestau, "current_restaurant", return_value=restaurant):
			return {f["label"]: f for f in neorestau.overview_figures(today or self.today)}

	@staticmethod
	def labels():
		from neoffice_theme.workspace_spaces.common import company_currency

		return {
			"tables": _("tables occupied"),
			"taken": _("{0} · taken today").format(company_currency()),
			"coming": _("reservations still to come today"),
			"sessions": _("sessions open"),
		}

	def test_the_figures_of_the_restaurant_the_reader_works_for(self):
		from neoffice_theme.workspace_spaces.common import counted, money

		self.a_service()
		label = self.labels()
		first = self.figures(self.restaurant)
		self.assertEqual(list(first), [label["tables"], label["taken"], label["coming"], label["sessions"]])
		self.assertEqual(first[label["tables"]]["value"], counted(3))
		self.assertEqual(first[label["taken"]]["value"], money(30))
		self.assertEqual(first[label["taken"]]["context"], _("{0} tickets").format(counted(2)))
		self.assertEqual(first[label["coming"]]["value"], counted(3))
		self.assertEqual(first[label["sessions"]]["value"], counted(1))
		second = self.figures(self.other)
		self.assertEqual(second[label["tables"]]["value"], counted(2))
		self.assertEqual(second[label["taken"]]["value"], money(100))
		self.assertEqual(second[label["taken"]]["context"], _("{0} tickets").format(counted(1)))
		self.assertEqual(second[label["coming"]]["value"], counted(1))
		self.assertEqual(second[label["sessions"]]["value"], counted(1))

	def test_only_the_restaurant_tills_of_the_restaurant_and_its_submitted_sales_of_the_day_are_counted(self):
		from neoffice_theme.workspace_spaces.common import counted, money

		self.a_service()
		label = self.labels()
		# The second restaurant's till stops being a restaurant till: its sale and its session are nobody's
		self.change_settings(self.second_restaurant_till, enable_restaurant_mode=0)
		gone = self.figures(self.other)
		self.assertEqual(gone[label["taken"]]["value"], money(0))
		self.assertEqual(gone[label["sessions"]]["value"], counted(0))
		# ... and the first restaurant's figures do not take them in
		kept = self.figures(self.restaurant)
		self.assertEqual(kept[label["taken"]]["value"], money(30))
		self.assertEqual(kept[label["sessions"]]["value"], counted(1))
		# Yesterday's sale is yesterday's takings
		yesterday = self.figures(self.restaurant, add_days(self.today, -1))
		self.assertEqual(yesterday[label["taken"]]["value"], money(7))
		self.assertEqual(yesterday[label["coming"]]["value"], counted(0))

	def test_where_neorestau_is_off_no_till_is_a_restaurant_till(self):
		from neoffice_theme.workspace_spaces.common import counted, money

		self.a_service()
		label = self.labels()
		with a_site_where_neorestau_is(0):
			off = self.figures(self.restaurant)
		self.assertEqual(off[label["taken"]]["value"], money(0))
		self.assertEqual(off[label["sessions"]]["value"], counted(0))
		# The restaurant's own lists are the restaurant's whatever the flag says
		self.assertEqual(off[label["tables"]]["value"], counted(3))

	def test_the_scope_is_the_restaurant_of_the_readers_open_till(self):
		from neoffice_theme.workspace_spaces.common import counted, money

		self.a_service()
		label = self.labels()
		for till, tables, takings in ((self.second_restaurant_till, 2, 100), (self.restaurant_till, 3, 30)):
			with self.subTest(till=till):
				# Administrator opens the till now: his latest shift is the one the till reads him at
				a_shift(till)
				found = {f["label"]: f for f in neorestau.overview_figures(self.today)}
				self.assertEqual(found[label["tables"]]["value"], counted(tables))
				self.assertEqual(found[label["taken"]]["value"], money(takings))
				# His own session is one of the open sessions of the restaurant
				self.assertEqual(found[label["sessions"]]["value"], counted(2))

	def test_a_reader_whose_open_till_is_a_counter_till_gets_the_default_restaurants_figures(self):
		# The desk is not a till: a manager who has the shop's till open does not read a blank overview
		from neoffice_theme.workspace_spaces.common import counted, money

		self.a_service()
		label = self.labels()
		a_shift(self.grocery_till)
		# A counter till belongs to no restaurant (the lists of a till are empty for it), and the default restaurant is the
		# first one here
		with patch.object(neorestau, "default_restaurant", return_value=self.restaurant):
			found = {f["label"]: f for f in neorestau.overview_figures(self.today)}
		self.assertEqual(list(found), list(self.labels().values()))
		self.assertEqual(found[label["tables"]]["value"], counted(3))
		self.assertEqual(found[label["taken"]]["value"], money(30))
		self.assertEqual(found[label["coming"]]["value"], counted(3))
		# The counter till's session is nobody's: the first restaurant's one open session is the other cashier's
		self.assertEqual(found[label["sessions"]]["value"], counted(1))

	def test_a_reader_whose_open_till_is_a_restaurant_till_keeps_that_restaurant_over_the_default_one(self):
		from neoffice_theme.workspace_spaces.common import counted

		self.a_service()
		label = self.labels()
		a_shift(self.second_restaurant_till)
		with patch.object(neorestau, "default_restaurant", return_value=self.restaurant):
			found = {f["label"]: f for f in neorestau.overview_figures(self.today)}
		self.assertEqual(found[label["tables"]]["value"], counted(2))

	def test_a_figure_is_there_only_for_a_reader_of_its_documents(self):
		self.a_service()
		label = self.labels()
		for doctype, figure in (
			("Restaurant Table", "tables"),
			("Sales Invoice", "taken"),
			("Restaurant Reservation", "coming"),
			("POS Opening Shift", "sessions"),
		):
			with (
				self.subTest(doctype=doctype),
				patch(
					"neoffice_theme.permitted.readable",
					side_effect=lambda name, hidden=doctype: name != hidden,
				),
			):
				found = self.figures(self.restaurant)
				self.assertEqual(len(found), 3)
				self.assertNotIn(label[figure], found)

	def test_a_reader_who_may_read_none_of_them_gets_no_figure(self):
		_user(THE_BLIND_READER, ["Blogger"], "System User")
		self.assertEqual(len(self.figures(self.restaurant)), 4)
		frappe.set_user(THE_BLIND_READER)
		try:
			self.assertEqual(neorestau.overview_figures(self.today), [])
		finally:
			frappe.set_user("Administrator")

	def test_the_tills_of_a_restaurant_are_its_restaurant_tills(self):
		self.assertEqual(neorestau.restaurant_tills(self.restaurant), [self.restaurant_till])
		self.assertEqual(neorestau.restaurant_tills(self.other), [self.second_restaurant_till])
		self.assertEqual(neorestau.restaurant_tills(None), [])
		# Its tick off, its settings disabled: not a restaurant till
		self.change_settings(self.second_restaurant_till, enable_restaurant_mode=0)
		self.assertEqual(neorestau.restaurant_tills(self.other), [])
		self.change_settings(self.second_restaurant_till, enable_restaurant_mode=1, enabled=0)
		self.assertEqual(neorestau.restaurant_tills(self.other), [])
		self.change_settings(self.second_restaurant_till, enabled=1)
		self.assertEqual(neorestau.restaurant_tills(self.other), [self.second_restaurant_till])
		# ... and none is one where the site does not run NeoRestau
		with a_site_where_neorestau_is(0):
			self.assertEqual(neorestau.restaurant_tills(self.restaurant), [])

	def test_which_tills_are_restaurant_tills_is_the_doors_answer(self):
		# Said once, by the door (task 5); this module only keeps the tills of the restaurant it is asked for
		with patch.object(
			neorestau,
			"restaurants_of_the_restaurant_tills",
			return_value={"A till": self.restaurant, "Another": self.other, "A third": self.restaurant},
		) as door:
			self.assertEqual(neorestau.restaurant_tills(self.restaurant), ["A third", "A till"])
			self.assertEqual(neorestau.restaurant_tills(self.other), ["Another"])
		# Every till of the site is asked about, in one call each time
		self.assertEqual(door.call_count, 2)
		for call in door.call_args_list:
			self.assertEqual(sorted(call.args[0]), sorted(frappe.get_all("POS Profile", pluck="name")))

	def test_a_site_not_migrated_yet_has_no_restaurant_till(self):
		# The code is updated and the site is not migrated yet: the settings have no column for the restaurant
		missing = OperationalError(BAD_FIELD_ERROR, "Unknown column 'restaurant' in 'field list'")
		with a_read_of_the_settings_that_fails(missing):
			self.assertEqual(neorestau.restaurant_tills(self.restaurant), [])
		# Any other failure is not hidden
		with a_read_of_the_settings_that_fails(RuntimeError("the database is down")):
			with self.assertRaises(RuntimeError):
				neorestau.restaurant_tills(self.restaurant)

	def test_the_scope_and_the_tills_are_worked_out_only_for_the_figures_that_need_them(self):
		def what_it_costs(*readable):
			"""(figures, times the scope was worked out, times the tills were looked up, reads of POS Profile)."""
			with (
				patch("neoffice_theme.permitted.readable", side_effect=lambda name: name in readable),
				patch.object(neorestau, "current_restaurant", wraps=neorestau.current_restaurant) as scope,
				patch.object(neorestau, "restaurant_tills", wraps=neorestau.restaurant_tills) as tills,
				the_statements_run() as statements,
			):
				found = neorestau.overview_figures(self.today)
			profiles = [statement for statement in statements if "tabPOS Profile" in statement]
			return len(found), scope.call_count, tills.call_count, len(profiles)

		everything = ("Restaurant Table", "Sales Invoice", "Restaurant Reservation", "POS Opening Shift")
		# A reader of nothing costs nothing
		self.assertEqual(what_it_costs(), (0, 0, 0, 0))
		# The tables and the bookings need the restaurant, never the tills
		self.assertEqual(what_it_costs("Restaurant Table"), (1, 1, 0, 0))
		self.assertEqual(what_it_costs("Restaurant Table", "Restaurant Reservation"), (2, 1, 0, 0))
		# The sales and the sessions need the tills, which are looked up once for both
		self.assertEqual(what_it_costs("Sales Invoice"), (1, 1, 1, 1))
		self.assertEqual(what_it_costs("POS Opening Shift"), (1, 1, 1, 1))
		self.assertEqual(what_it_costs("Sales Invoice", "POS Opening Shift"), (2, 1, 1, 1))
		self.assertEqual(what_it_costs(*everything), (4, 1, 1, 1))

	def test_the_views_of_the_lists_split_them_the_way_the_figures_count(self):
		self.a_service()
		space = {tab["key"]: tab for tab in tabs()["NeoRestau"]}
		restaurants = ["restaurant", "in", [self.restaurant, self.other]]

		def counts(key):
			tab = space[key]
			return {
				view["key"]: len(
					frappe.get_all(
						tab["doctype"],
						filters=[*(tab.get("base") or []), *view["filters"], restaurants],
						pluck="name",
					)
				)
				for view in tab["views"](self.today)
			}

		# 8 tables: free 2 (one in each restaurant), with guests 5 (a table paid at the table still has them), to clean 1
		self.assertEqual(counts("floor"), {"free": 2, "occupied": 5, "cleaning": 1, "all": 8})
		# Today's but the cancelled one (6 and 1), the two of tomorrow, the two missed (today's and yesterday's)
		self.assertEqual(counts("reservations"), {"today": 7, "upcoming": 2, "no_show": 2})
