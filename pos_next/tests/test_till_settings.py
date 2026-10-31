# //// Neoffice — added file (no upstream equivalent).
"""The till's settings screen reads one list and saves through one door (NeoRestau lot 1, task 13).

The list (`pos_next.till_settings.registry`) describes every setting once: where it lives, its tab, its help, which
till shows it, what it depends on, whether it is set at the office only. It names no field the code does not have,
and every field of POS Settings and of the Restaurant is either listed or set aside with its reason.

The screen reads and saves through `pos_next.till_settings.api`: a till manager reads and saves every tab, with no
right needed on POS Profile or POS Settings themselves; a restaurant manager the restaurant's tabs of a restaurant
till, and only the restaurant's own settings; anybody else is refused. A save writes the POS Profile, the POS Settings
and the Restaurant together or not at all.

The suite relies on no patch and no after_migrate (a fresh CI site runs neither): it builds its users, a restaurant,
two tills and a warehouse, and rolls everything back. Nothing here commits.
"""

import ast
import math
import os
import re
import unittest
from unittest.mock import patch

import frappe

# Layout only: every other field, a table included, holds a value the list must classify
from frappe.model import display_fieldtypes
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.api import pos_profile as pos_profile_api
from pos_next.pos_next.doctype.pos_settings import pos_settings as pos_settings_doctype
from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.restaurant import bootstrap as restaurant_bootstrap
from pos_next.restaurant.permissions import ensure_restaurant_roles, grant_restaurant_permissions
from pos_next.tests.test_till_writes_need_the_till import (
	CASHIER_ROLE,
	OTHER_TILL,
	TILL,
	_cash_mode,
	_company,
	_till_fixture,
	_user,
)
from pos_next.till_settings import api as till_settings_api
from pos_next.till_settings import registry
from pos_next.till_settings.api import get_till_settings, save_till_settings

TILL_MANAGER = "till-settings-manager@yopmail.com"
RESTAURANT_MANAGER = "till-settings-restaurant@yopmail.com"
PORTAL = "till-settings-portal@yopmail.com"
RESTAURANT_NAME = "_Test Till Settings Restaurant"
OTHER_RESTAURANT_NAME = "_Test Till Settings Other Restaurant"
AREA = "_Test Till Settings Terrace"
WAREHOUSE = "_Test Till Settings Store"
SAVEPOINT = "till_settings_test"

SHOP_TABS = ["general", "sale_screen", "prices", "sales", "stock", "printing", "closing"]
RESTAURANT_TABS = ["restaurant", "hours", "online", "reservations"]

# The family of doctype field types each widget of the list draws
WIDGET_FIELDTYPES = {
	"check": {"Check"},
	"int": {"Int"},
	"float": {"Float", "Currency"},
	"percent": {"Float", "Percent"},
	"duration": {"Duration"},
	"select": {"Select"},
	"segmented": {"Select"},
	"link": {"Link"},
	"multiselect": {"Table", "Table MultiSelect"},
	"table": {"Table"},
	"text": {"Small Text", "Text", "Data"},
	"email": {"Data"},
	"lines": {"Small Text", "Text"},
	"special": {"Table"},
}


def till_tabs(answer):
	return [tab["key"] for tab in answer["tabs"]]


def by_key(answer):
	return {setting["key"]: setting for setting in answer["settings"]}


class TestTheList(FrappeTestCase):
	"""What the list says, checked against itself and against the doctypes of the site."""

	def test_every_key_is_listed_once(self):
		keys = [setting.key for setting in registry.SETTINGS]
		self.assertEqual(sorted(keys), sorted(set(keys)))

	def test_every_setting_has_its_place_its_label_and_its_help(self):
		tabs = {tab.key for tab in registry.TABS}
		for setting in registry.SETTINGS:
			with self.subTest(setting=setting.key):
				self.assertIn(setting.group, registry.GROUPS)
				self.assertIn(setting.tab, tabs)
				self.assertIn(setting.till, registry.TILL_TYPES)
				self.assertIn(setting.widget, registry.WIDGETS)
				self.assertTrue(str(setting.label).strip())
				if setting.kind == registry.SETTING:
					# The lightbulb always says what the setting does
					self.assertTrue(setting.help and str(setting.help).strip())
				if setting.widget in ("select", "segmented") and not setting.desk_only:
					# The till offers these values only (the office's form offers the doctype's own)
					self.assertTrue(setting.options)

	def test_a_setting_depends_only_on_a_setting_its_till_shows(self):
		for setting in registry.SETTINGS:
			for when in setting.depends_on:
				with self.subTest(setting=setting.key, depends_on=when.key):
					other = registry.get(when.key)
					for restaurant_till in (False, True):
						if registry.shown_on(setting, restaurant_till):
							self.assertTrue(registry.shown_on(other, restaurant_till))
					self.assertEqual(other.desk_only and not setting.desk_only, False)

	def test_the_tabs_of_the_till_are_the_eleven_of_the_mockup(self):
		till = [tab.key for tab in registry.TABS if tab.section != registry.SECTION_DESK]
		self.assertEqual(till, RESTAURANT_TABS + SHOP_TABS)
		# The office's own settings never sit in a tab of the restaurant
		for setting in registry.SETTINGS:
			if setting.desk_only:
				with self.subTest(setting=setting.key):
					self.assertNotIn(setting.tab, RESTAURANT_TABS)

	def test_the_restaurant_managers_set_three_settings_of_the_till_named_one_by_one(self):
		# Ruling 63 is granted by a flag on the setting, never by the tab it is drawn in: a setting of POS Settings or
		# POS Profile moved into a restaurant tab stays the till manager's
		flagged = {setting.key for setting in registry.SETTINGS if setting.restaurant_manager_may_edit}
		self.assertEqual(flagged, {"default_restaurant_area", "enable_takeaway", "takeaway_card"})
		for key in flagged:
			with self.subTest(key=key):
				setting = registry.get(key)
				self.assertEqual(setting.doctype, registry.POS_SETTINGS)
				self.assertEqual(registry.TAB_BY_KEY[setting.tab].section, registry.SECTION_RESTAURANT)
		moved = registry.Setting(
			"allow_credit_sale", "takeaway", "Moved", "Moved", "check", doctype=registry.POS_SETTINGS
		)
		self.assertEqual(registry.TAB_BY_KEY[moved.tab].section, registry.SECTION_RESTAURANT)
		self.assertFalse(till_settings_api._editable(moved, {"till": False, "restaurant": True}))
		self.assertTrue(till_settings_api._editable(moved, {"till": True, "restaurant": False}))

	def test_the_office_keeps_what_the_product_owner_kept_there(self):
		for key in (
			"company",
			"applicable_for_users",
			"payments",
			"custom_active_payment_devices",
			"write_off_account",
			"income_account",
			"enable_restaurant_mode",
			"restaurant",
			"allow_negative_stock",
		):
			with self.subTest(key=key):
				self.assertTrue(registry.get(key).desk_only)

	def test_every_listed_field_exists_on_its_doctype(self):
		installed = set(frappe.get_installed_apps())
		for setting in registry.SETTINGS:
			if setting.store != registry.DOCUMENT:
				continue
			if setting.provided_by and setting.provided_by not in installed:
				continue
			with self.subTest(setting=setting.key, doctype=setting.doctype):
				if setting.provided_by:
					# Added by the other app (a patch of the theme): it is on the site where that app runs
					field = frappe.get_meta(setting.doctype).get_field(setting.key)
					field = field.as_dict() if field else None
				else:
					field = _defined_fields(setting.doctype).get(setting.key)
				self.assertIsNotNone(field, f"{setting.doctype} has no field {setting.key}")
				self.assertIn(field["fieldtype"], WIDGET_FIELDTYPES[setting.widget])
				if setting.widget in ("select", "segmented"):
					stored = (field.get("options") or "").split("\n")
					for value, _label in setting.options:
						self.assertIn(value, stored)
				if setting.search:
					self.assertEqual(field.get("options"), setting.search)
				if setting.widget == "email":
					self.assertEqual(field.get("options"), "Email")

	def test_every_field_of_pos_settings_and_of_the_restaurant_is_listed_or_set_aside(self):
		for doctype in (registry.POS_SETTINGS, registry.RESTAURANT):
			listed = {setting.key for setting in registry.document_settings(doctype)}
			aside = set(registry.NOT_LISTED[doctype])
			with self.subTest(doctype=doctype):
				self.assertFalse(listed & aside, "a field is both listed and set aside")
				for fieldname, field in _defined_fields(doctype).items():
					if field["fieldtype"] in display_fieldtypes:
						continue
					self.assertIn(
						fieldname,
						listed | aside,
						f"{doctype}.{fieldname} is new: list it or set it aside with its reason",
					)

	def test_every_field_erpnext_and_this_app_give_pos_profile_is_listed_or_set_aside(self):
		listed = {setting.key for setting in registry.document_settings(registry.POS_PROFILE)}
		aside = set(registry.NOT_LISTED[registry.POS_PROFILE])
		self.assertFalse(listed & aside, "a field is both listed and set aside")
		for fieldname, field in _defined_fields(registry.POS_PROFILE).items():
			if field["fieldtype"] in display_fieldtypes:
				continue
			with self.subTest(field=fieldname):
				self.assertIn(fieldname, listed | aside)

	def test_every_setting_the_till_shows_is_read_by_the_code(self):
		"""No dead switch: a field the till shows is read somewhere besides the settings' own plumbing (the
		doctype, the defaults, the change events, the settings screen, the list itself and the tests)."""
		sources = _sources()
		if not sources:
			raise unittest.SkipTest("the source of the app is not there")
		getters = _store_getters()
		for setting in registry.till_settings():
			if setting.store != registry.DOCUMENT or setting.provided_by:
				continue
			with self.subTest(setting=setting.key):
				# A field the till reads through a getter of its settings store is read where the getter is
				names = [setting.key, *getters.get(setting.key, ())]
				field = _defined_fields(setting.doctype).get(setting.key)
				if field and field["fieldtype"] in ("Table", "Table MultiSelect"):
					# A table may be read through its child doctype
					names.append(field["options"])
				pattern = re.compile("|".join(rf"\b{re.escape(name)}\b" for name in names))
				self.assertTrue(
					any(pattern.search(text) for text in sources.values()),
					f"nothing reads {setting.doctype}.{setting.key}",
				)

	def test_a_condition_reads_as_a_desk_expression(self):
		self.assertIsNone(registry.condition(registry.get("enable_runner")))
		self.assertEqual(registry.condition(registry.get("takeaway_card")), "eval:!(doc.enable_takeaway)")
		self.assertEqual(
			registry.condition(registry.get("token_expiry_days")),
			"eval:!(doc.enable_qr_ordering && doc.token_expiry_mode=='Timed')",
		)
		self.assertEqual(
			registry.condition(registry.get("use_exact_amount")),
			"eval:!(!doc.allow_credit_sale && !doc.allow_partial_payment)",
		)


# The plumbing of the settings themselves: what lists, defaults, sends or edits a setting is not what acts on it
PLUMBING = (
	"pos_next/till_settings/",
	"pos_next/tests/",
	"pos_next/patches/",
	"pos_next/fixtures/",
	"pos_next/locale/",
	"pos_next/public/",
	"pos_next/api/constants.py",
	"pos_next/pos_next/doctype/pos_settings/",
	"pos_next/restaurant/settings.py",
	"POS/src/stores/posSettings.js",
	"POS/src/stores/posEvents.js",
	"POS/src/components/settings/",
	"/__tests__/",
	"/test_",
	".spec.",
)
# Functions that copy a setting from a form onto its document (the POS Profile's own create and update endpoints): naming
# a field there is writing it, not acting on it
PLUMBING_FUNCTIONS = {
	"pos_next/api/pos_profile.py": ("get_create_pos_profile", "create_pos_profile", "update_pos_profile"),
}


def _defined_fields(doctype):
	"""{fieldname: field} of a doctype as the code under test defines it, not as the site's database holds it: the
	clone is shared, and another session may have migrated it with other code. POS Settings and the Restaurant are
	this app's JSON; POS Profile is ERPNext's JSON and the custom fields this app ships (another app's custom fields,
	the theme's or the hub's, are that app's to classify; the list knows the ones it uses)."""
	if doctype in (registry.POS_SETTINGS, registry.RESTAURANT):
		name = frappe.scrub(doctype)
		data = frappe.get_file_json(
			frappe.get_app_path("pos_next", "pos_next", "doctype", name, f"{name}.json")
		)
		return {field["fieldname"]: field for field in data["fields"]}
	erpnext = frappe.get_file_json(
		frappe.get_app_path("erpnext", "accounts", "doctype", "pos_profile", "pos_profile.json")
	)
	fields = {field["fieldname"]: field for field in erpnext["fields"]}
	custom = frappe.get_file_json(frappe.get_app_path("pos_next", "pos_next", "custom", "pos_profile.json"))
	fixtures = frappe.get_file_json(frappe.get_app_path("pos_next", "fixtures", "custom_field.json"))
	for field in custom.get("custom_fields", []) + [row for row in fixtures if row.get("dt") == doctype]:
		fields[field["fieldname"]] = field
	return fields


def _store_getters():
	"""{field: the names of the getters of the till's settings store that read it} (POS/src/stores/posSettings.js:
	`const allowItemDiscount = computed(() => Boolean(settings.value.allow_user_to_edit_item_discount))`)."""
	path = os.path.join(
		os.path.abspath(frappe.get_app_path("pos_next", "..")), "POS", "src", "stores", "posSettings.js"
	)
	if not os.path.exists(path):
		return {}
	with open(path, encoding="utf-8") as file:
		text = file.read()
	getters = {}
	for chunk in re.split(r"\n\tconst ", text):
		found = re.match(r"(\w+) = computed\(", chunk)
		if not found:
			continue
		for field in set(re.findall(r"settings\.value\.(\w+)", chunk.split("\n\n")[0])):
			getters.setdefault(field, []).append(found.group(1))
	return getters


def _sources():
	"""{path: text} of the app's Python and of the till's sources (POS/src next to the app, when it is there)."""
	root = os.path.abspath(frappe.get_app_path("pos_next", ".."))
	found = {}
	for top, extensions in (("pos_next", (".py",)), (os.path.join("POS", "src"), (".js", ".vue"))):
		base = os.path.join(root, top)
		for folder, _dirs, files in os.walk(base):
			for name in files:
				if not name.endswith(extensions):
					continue
				path = os.path.join(folder, name)
				relative = os.path.relpath(path, root).replace(os.sep, "/")
				if any(part in relative for part in PLUMBING):
					continue
				with open(path, encoding="utf-8", errors="ignore") as file:
					found[relative] = _without_functions(file.read(), PLUMBING_FUNCTIONS.get(relative, ()))
	return found if any(path.startswith("POS/") for path in found) else {}


def _without_functions(text, names):
	"""The Python source without the module-level functions named (their decorators included)."""
	if not names:
		return text
	lines = text.splitlines(keepends=True)
	functions = [
		node for node in ast.parse(text).body if isinstance(node, ast.FunctionDef) and node.name in names
	]
	for node in sorted(functions, key=lambda node: node.lineno, reverse=True):
		start = min([node.lineno, *(decorator.lineno for decorator in node.decorator_list)]) - 1
		del lines[start : node.end_lineno]
	return "".join(lines)


class TillSettingsCase(FrappeTestCase):
	"""Two tills of the test's own (a restaurant till and a shop till), a restaurant with a room, a second warehouse,
	and the users the rules are about, made once for the class; each test is rolled back to its savepoint."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.addClassCleanup(frappe.set_user, "Administrator")
		commit = patch.object(frappe.db, "commit")
		commit.start()
		cls.addClassCleanup(commit.stop)
		# Tip provisioning (an item and an account) is the restaurant doctype's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			cls.addClassCleanup(patcher.stop)
		ensure_restaurant_roles()
		cls.changed_rules = grant_restaurant_permissions()
		cls.addClassCleanup(lambda: [frappe.clear_cache(doctype=doctype) for doctype in cls.changed_rules])
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		_user(TILL_MANAGER, ["Nexus POS Manager"], "System User")
		_user(RESTAURANT_MANAGER, ["Restaurant Manager"], "System User")
		_user(PORTAL, ["Customer"], "Website User")
		# What Frappe keeps of these users in Redis (their User Permissions above all) is their rows' of this run only
		for user in (TILL, OTHER_TILL, TILL_MANAGER, RESTAURANT_MANAGER, PORTAL):
			frappe.clear_cache(user=user)
		cls.fx = _till_fixture()
		cls.restaurant = (
			frappe.get_doc(
				{"doctype": "Restaurant", "restaurant_name": RESTAURANT_NAME, "company": cls.fx.company}
			)
			.insert(ignore_permissions=True)
			.name
		)
		cls.area = (
			frappe.get_doc({"doctype": "Restaurant Area", "area_name": AREA, "restaurant": cls.restaurant})
			.insert(ignore_permissions=True)
			.name
		)
		parent = frappe.db.get_value("Warehouse", {"company": cls.fx.company, "is_group": 1}, "name")
		cls.second_warehouse = (
			frappe.get_doc(
				{
					"doctype": "Warehouse",
					"warehouse_name": WAREHOUSE,
					"company": cls.fx.company,
					"parent_warehouse": parent,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		# The restaurant till is the fixture's profile, the shop till the other one
		cls.restaurant_till = cls.fx.profile
		cls.shop_till = cls.fx.other_profile
		cls._settings_row(cls.restaurant_till, enable_restaurant_mode=1, restaurant=cls.restaurant)
		cls._settings_row(cls.shop_till)

	@classmethod
	def _settings_row(cls, pos_profile, **values):
		for name in frappe.get_all("POS Settings", filters={"pos_profile": pos_profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc({"doctype": "POS Settings", "pos_profile": pos_profile, "enabled": 1, **values})
		doc.flags.ignore_links = True
		return doc.insert(ignore_permissions=True).name

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		frappe.db.savepoint(SAVEPOINT)
		self.addCleanup(frappe.db.rollback, save_point=SAVEPOINT)
		self.addCleanup(frappe.set_user, "Administrator")
		neorestau = patch.dict(frappe.conf, {"neorestau_active": 1})
		neorestau.start()
		self.addCleanup(neorestau.stop)

	def as_user(self, user):
		frappe.set_user(user)

	def stored_settings(self, pos_profile, *fields):
		return frappe.db.get_value("POS Settings", {"pos_profile": pos_profile}, list(fields), as_dict=True)


class TestWhoOpensTheSettings(TillSettingsCase):
	def test_a_shop_till_shows_the_seven_tabs_of_the_till(self):
		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.shop_till)

		self.assertEqual(till_tabs(answer), SHOP_TABS)
		self.assertEqual(answer["can"], {"till": True, "restaurant": False})
		self.assertFalse(answer["restaurant_till"])
		settings = by_key(answer)
		self.assertIn("allow_sales_order", settings)
		self.assertNotIn("station_printers", settings)
		self.assertFalse([key for key, setting in settings.items() if setting["till"] == "restaurant"])

	def test_a_restaurant_till_shows_the_restaurant_tabs_first(self):
		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.restaurant_till)

		self.assertEqual(till_tabs(answer), RESTAURANT_TABS + SHOP_TABS)
		self.assertTrue(answer["restaurant_till"])
		self.assertEqual(answer["restaurant"], self.restaurant)
		settings = by_key(answer)
		self.assertIn("station_printers", settings)
		# Sales orders are a shop till's
		self.assertNotIn("allow_sales_order", settings)

	def test_a_restaurant_till_where_neorestau_is_off_is_a_shop_till(self):
		self.as_user(TILL_MANAGER)
		with patch.dict(frappe.conf, {"neorestau_active": 0}):
			answer = get_till_settings(self.restaurant_till)

		self.assertEqual(till_tabs(answer), SHOP_TABS)

	def test_nothing_set_at_the_office_reaches_the_till(self):
		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.restaurant_till)

		settings = by_key(answer)
		for key in ("company", "payments", "enable_restaurant_mode", "restaurant", "allow_negative_stock"):
			with self.subTest(key=key):
				self.assertNotIn(key, settings)
				self.assertNotIn(key, answer["values"])
		# Nor any setting the till does not act on
		for key in registry.NOT_LISTED[registry.POS_SETTINGS]:
			self.assertNotIn(key, settings)

	def test_every_setting_comes_with_its_help(self):
		self.as_user(TILL_MANAGER)
		answer = get_till_settings(self.restaurant_till)

		for setting in answer["settings"]:
			if setting["kind"] == registry.SETTING:
				with self.subTest(setting=setting["key"]):
					self.assertTrue(setting["help"].strip())
					self.assertTrue(setting["label"].strip())

	def test_a_cashier_of_the_till_is_refused(self):
		self.as_user(TILL)
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.restaurant_till)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.restaurant_till, {"allow_credit_sale": 1})
		frappe.set_user("Administrator")
		self.assertEqual(self.stored_settings(self.restaurant_till, "allow_credit_sale").allow_credit_sale, 0)

	def test_a_portal_account_is_refused(self):
		self.as_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.shop_till)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.shop_till, {"allow_credit_sale": 1})

	def test_a_restaurant_manager_opens_the_restaurant_tabs_only(self):
		self.as_user(RESTAURANT_MANAGER)
		answer = get_till_settings(self.restaurant_till)

		self.assertEqual(till_tabs(answer), RESTAURANT_TABS)
		self.assertEqual(answer["can"], {"till": False, "restaurant": True})
		settings = by_key(answer)
		self.assertTrue(settings["enable_runner"]["editable"])
		# The settings of the till that sit in his tabs are his too (ruling 63): every setting he is shown he may change
		for key in ("default_restaurant_area", "enable_takeaway", "takeaway_card"):
			with self.subTest(key=key):
				self.assertTrue(settings[key]["editable"])
		self.assertEqual([key for key, setting in settings.items() if not setting["editable"]], [])

	def test_a_restaurant_manager_has_nothing_to_open_at_a_shop_till(self):
		self.as_user(RESTAURANT_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.shop_till)


class TestOneSave(TillSettingsCase):
	def test_a_till_manager_without_any_right_on_pos_profile_saves_the_warehouse(self):
		self.as_user(TILL_MANAGER)
		self.assertFalse(frappe.has_permission("POS Profile", "write"))

		save_till_settings(self.shop_till, {"warehouse": self.second_warehouse})

		self.assertEqual(
			frappe.db.get_value("POS Profile", self.shop_till, "warehouse"), self.second_warehouse
		)

	def test_the_save_writes_pos_settings_and_pos_profile_together(self):
		self.as_user(TILL_MANAGER)
		answer = save_till_settings(
			self.shop_till, {"warehouse": self.second_warehouse, "allow_credit_sale": 1, "tiles_per_row": "6"}
		)

		self.assertEqual(
			frappe.db.get_value("POS Profile", self.shop_till, "warehouse"), self.second_warehouse
		)
		stored = self.stored_settings(self.shop_till, "allow_credit_sale", "tiles_per_row")
		self.assertEqual((stored.allow_credit_sale, stored.tiles_per_row), (1, "6"))
		self.assertEqual(answer["values"]["warehouse"], self.second_warehouse)
		self.assertEqual(answer["values"]["tiles_per_row"], "6")

	def test_when_pos_settings_refuse_the_pos_profile_keeps_its_value(self):
		self.as_user(TILL_MANAGER)
		before = frappe.db.get_value("POS Profile", self.shop_till, "warehouse")
		with self.assertRaises(frappe.ValidationError):
			# POS Settings refuses the exact amount together with credit sales, after the POS Profile was written
			save_till_settings(
				self.shop_till,
				{"warehouse": self.second_warehouse, "allow_credit_sale": 1, "use_exact_amount": 1},
			)

		self.assertEqual(frappe.db.get_value("POS Profile", self.shop_till, "warehouse"), before)
		stored = self.stored_settings(self.shop_till, "allow_credit_sale", "use_exact_amount")
		self.assertEqual((stored.allow_credit_sale, stored.use_exact_amount), (0, 0))

	def test_when_the_restaurant_refuses_neither_till_document_keeps_its_value(self):
		self.as_user(TILL_MANAGER)
		before = frappe.db.get_value("POS Profile", self.restaurant_till, "warehouse")
		with patch.object(Restaurant, "validate", side_effect=frappe.ValidationError("refused")):
			with self.assertRaises(frappe.ValidationError):
				save_till_settings(
					self.restaurant_till,
					{"warehouse": self.second_warehouse, "allow_credit_sale": 1, "enable_runner": 0},
				)

		self.assertEqual(frappe.db.get_value("POS Profile", self.restaurant_till, "warehouse"), before)
		self.assertEqual(self.stored_settings(self.restaurant_till, "allow_credit_sale").allow_credit_sale, 0)
		self.assertEqual(frappe.db.get_value("Restaurant", self.restaurant, "enable_runner"), 1)

	def test_the_till_reads_back_what_it_saved(self):
		self.as_user(TILL_MANAGER)
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
		card = (
			frappe.get_doc(
				{
					"doctype": "Restaurant Card",
					"card_name": "_Test Till Settings Card",
					"restaurant": self.restaurant,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		saved = {
			"warehouse": self.second_warehouse,
			"customer": self.fx.customer,
			"item_groups": [group],
			"hide_unavailable_items": 1,
			"tiles_per_row": "7",
			"enable_session_lock": 1,
			"session_lock_timeout": 7,
			"max_discount_allowed": 12.5,
			"barcode_rules": [{"barcode_rule": "21IIIIIWWWWWC", "disable": 0}],
			"eod_email_recipients": "till-settings-boss@yopmail.com",
			"default_restaurant_area": self.area,
			"enable_takeaway": 1,
			"takeaway_card": card,
			"enable_runner": 0,
			"enable_qr_ordering": 1,
			"guest_menu": card,
			"qr_order_validation": "Server Approval",
			"token_expiry_mode": "Timed",
			"token_expiry_days": 3,
			"enable_reservations": 1,
			"default_reservation_duration": 5400,
			"no_show_delay": 45,
			"opening_hours": [
				{
					"day_of_week": "Tuesday",
					"from_time": "11:30",
					"to_time": "14:00",
					"label": "Lunch",
					"restaurant_card": card,
				}
			],
		}
		save_till_settings(self.restaurant_till, saved)

		values = get_till_settings(self.restaurant_till)["values"]
		for key, value in saved.items():
			with self.subTest(key=key):
				self.assertEqual(values[key], value)

	def test_a_restaurant_manager_saves_his_restaurant_tabs_and_nothing_else_of_the_till(self):
		card = _card(self.restaurant, "_Test Till Settings Takeaway Card")
		self.as_user(RESTAURANT_MANAGER)
		save_till_settings(
			self.restaurant_till,
			{
				"enable_runner": 0,
				"no_show_delay": 30,
				# The till's own settings of the restaurant's tabs (ruling 63)
				"default_restaurant_area": self.area,
				"enable_takeaway": 1,
				"takeaway_card": card,
			},
		)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Restaurant", self.restaurant, "enable_runner"), 0)
		self.assertEqual(frappe.db.get_value("Restaurant", self.restaurant, "no_show_delay"), 30)
		stored = self.stored_settings(
			self.restaurant_till, "default_restaurant_area", "enable_takeaway", "takeaway_card"
		)
		self.assertEqual(
			(stored.default_restaurant_area, stored.enable_takeaway, stored.takeaway_card),
			(self.area, 1, card),
		)

		self.as_user(RESTAURANT_MANAGER)
		for values in (
			{"allow_credit_sale": 1},
			{"warehouse": self.second_warehouse},
			{"tiles_per_row": "5"},
			# One key of another tab refuses the whole save, his own keys with it
			{"enable_takeaway": 0, "allow_credit_sale": 1},
		):
			with self.subTest(values=values), self.assertRaises(frappe.PermissionError):
				save_till_settings(self.restaurant_till, values)
		frappe.set_user("Administrator")
		self.assertEqual(self.stored_settings(self.restaurant_till, "enable_takeaway").enable_takeaway, 1)

	def test_what_the_till_does_not_show_is_refused(self):
		self.as_user(TILL_MANAGER)
		for pos_profile, values in (
			# Unknown, set aside, set at the office, kept on the device
			(self.shop_till, {"no_such_setting": 1}),
			(self.shop_till, {"allow_return": 1}),
			(self.shop_till, {"company": self.fx.company}),
			(self.shop_till, {"enable_restaurant_mode": 1}),
			(self.shop_till, {"allow_negative_stock": 1}),
			(self.shop_till, {"stock_sync_enabled": 1}),
			# A restaurant till's setting at a shop till, a shop till's at a restaurant till
			(self.shop_till, {"default_restaurant_area": self.area}),
			(self.shop_till, {"enable_runner": 0}),
			(self.restaurant_till, {"allow_sales_order": 1}),
		):
			with self.subTest(values=values), self.assertRaises(frappe.ValidationError):
				save_till_settings(pos_profile, values)

	def test_values_out_of_what_the_screen_offers_are_refused(self):
		fields = (
			"max_discount_allowed",
			"session_lock_timeout",
			"gift_card_validity_months",
			"tiles_per_row",
		)
		before = self.stored_settings(self.shop_till, *fields)
		self.as_user(TILL_MANAGER)
		for values in (
			{"tiles_per_row": "2"},
			{"tiles_per_row": "9"},
			{"tiles_per_row": "Auto"},
			{"session_lock_timeout": 0},
			{"max_discount_allowed": 101},
			{"gift_card_validity_months": -1},
			{"warehouse": "_Test Till Settings Nowhere"},
			{"allow_credit_sale": "yes"},
			{"item_groups": ["_Test Till Settings No Group"]},
			# Not a number, however Python reads it
			{"max_discount_allowed": "NaN"},
			{"max_discount_allowed": "Infinity"},
			{"max_discount_allowed": math.inf},
			{"session_lock_timeout": "nan"},
			{"gift_card_validity_months": "-inf"},
		):
			with self.subTest(values=values), self.assertRaises(frappe.ValidationError):
				save_till_settings(self.shop_till, values)
		frappe.set_user("Administrator")
		# Nothing of it was stored
		self.assertEqual(self.stored_settings(self.shop_till, *fields), before)

	def test_the_opening_hours_take_a_card_offered_or_the_one_a_line_already_has(self):
		offered = _card(self.restaurant, "_Test Till Settings Lunch Card")
		kept = _card(self.restaurant, "_Test Till Settings Old Card")
		never_set = _card(self.restaurant, "_Test Till Settings Retired Card")
		permanent = _card(self.restaurant, "_Test Till Settings Always Card", is_permanent=1)
		# A line set before its card was deactivated
		restaurant = frappe.get_doc("Restaurant", self.restaurant)
		restaurant.set("opening_hours", [_hours("Monday", kept)])
		restaurant.save(ignore_permissions=True)
		for card in (kept, never_set):
			frappe.db.set_value("Restaurant Card", card, "is_active", 0)

		self.as_user(TILL_MANAGER)
		save_till_settings(
			self.restaurant_till, {"opening_hours": [_hours("Monday", kept), _hours("Tuesday", offered)]}
		)
		self.assertEqual(
			[
				row["restaurant_card"]
				for row in get_till_settings(self.restaurant_till)["values"]["opening_hours"]
			],
			[kept, offered],
		)
		# A card the screen does not offer, that no line had: refused, the permanent one as a deactivated one
		for card in (never_set, permanent):
			with self.subTest(card=card), self.assertRaises(frappe.ValidationError):
				save_till_settings(self.restaurant_till, {"opening_hours": [_hours("Wednesday", card)]})

	def test_a_save_forgets_what_the_server_kept_of_the_tills_groups_and_brands(self):
		# The item endpoints keep the till's groups and brands five minutes (api.items): a till that asks for its items
		# right after its own save must not be answered from them
		keys = [key.format(self.shop_till) for key in till_settings_api.TILL_CACHE_KEYS]
		for key in keys:
			frappe.cache().set_value(key, ["stale"], expires_in_sec=300)
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name")
		self.as_user(TILL_MANAGER)
		save_till_settings(self.shop_till, {"item_groups": [group]})
		for key in keys:
			with self.subTest(key=key):
				self.assertIsNone(frappe.cache().get_value(key))


class TestTilesPerRow(TillSettingsCase):
	def test_a_till_starts_with_the_automatic_grid(self):
		self.assertEqual(self.stored_settings(self.shop_till, "tiles_per_row").tiles_per_row, "Automatic")
		self.as_user(TILL_MANAGER)
		self.assertEqual(get_till_settings(self.shop_till)["values"]["tiles_per_row"], "Automatic")

	def test_the_screen_offers_automatic_and_three_to_eight(self):
		self.as_user(TILL_MANAGER)
		options = by_key(get_till_settings(self.shop_till))["tiles_per_row"]["options"]

		self.assertEqual([option["value"] for option in options], ["Automatic", "3", "4", "5", "6", "7", "8"])

	def test_the_document_keeps_it_between_three_and_eight(self):
		doc = frappe.get_doc(
			"POS Settings", frappe.db.get_value("POS Settings", {"pos_profile": self.shop_till})
		)
		for refused in ("2", "9", "0"):
			doc.tiles_per_row = refused
			with self.subTest(value=refused), self.assertRaises(frappe.ValidationError):
				doc.save(ignore_permissions=True)
		doc.reload()
		for kept in ("3", "8", "Automatic"):
			doc.tiles_per_row = kept
			doc.save(ignore_permissions=True)
			self.assertEqual(self.stored_settings(self.shop_till, "tiles_per_row").tiles_per_row, kept)

	def test_the_bootstrap_hands_it_to_the_till(self):
		from pos_next.api.bootstrap import _get_pos_settings

		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "tiles_per_row", "8")
		profile = frappe.get_doc("POS Profile", self.shop_till)
		self.assertEqual(_get_pos_settings(profile)["tiles_per_row"], "8")


def _card(restaurant, name, **values):
	return (
		frappe.get_doc({"doctype": "Restaurant Card", "card_name": name, "restaurant": restaurant, **values})
		.insert(ignore_permissions=True)
		.name
	)


def _hours(day, card):
	return {
		"day_of_week": day,
		"from_time": "11:30",
		"to_time": "14:00",
		"label": "Lunch",
		"restaurant_card": card,
	}


def _confine(case, user, doctype, value):
	"""A User Permission: the user reads and writes only that record of the doctype (and what links to it). The test's
	savepoint takes the row back; the user's permissions Frappe keeps in Redis are forgotten before it, so that no other
	test reads them."""
	frappe.get_doc(
		{
			"doctype": "User Permission",
			"user": user,
			"allow": doctype,
			"for_value": value,
			"apply_to_all_doctypes": 1,
		}
	).insert(ignore_permissions=True)
	frappe.clear_cache(user=user)
	case.addCleanup(frappe.clear_cache, user=user)


class TestEachTillItsOwnManagers(TillSettingsCase):
	"""Both doors ask one question before anything of the till is read or made (`api._open`): does the user manage THIS
	till, or ITS restaurant? A right on some restaurant, on some till, is not enough."""

	def a_second_restaurant_till(self):
		"""The shop till made the till of another restaurant, for this test only."""
		other = (
			frappe.get_doc(
				{
					"doctype": "Restaurant",
					"restaurant_name": OTHER_RESTAURANT_NAME,
					"company": self.fx.company,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)
		self._settings_row(self.shop_till, enable_restaurant_mode=1, restaurant=other)
		return other

	def test_a_save_that_names_nothing_is_refused_to_whoever_manages_neither_the_till_nor_its_restaurant(
		self,
	):
		# A right on the Restaurant doctype opened the door to any till: an empty save went through and answered the
		# till's restaurant, its tip item and its account
		self.as_user(RESTAURANT_MANAGER)
		for values in ({}, "{}"):
			with self.subTest(values=values), self.assertRaises(frappe.PermissionError):
				save_till_settings(self.shop_till, values)

	def test_nothing_is_made_for_a_user_who_is_refused(self):
		frappe.db.delete("POS Settings", {"pos_profile": self.shop_till})
		self.as_user(RESTAURANT_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.shop_till)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.shop_till, {})
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("POS Settings", {"pos_profile": self.shop_till}))
		# The till's own manager is given the till's default row, as the till gets it at its first opening
		self.as_user(TILL_MANAGER)
		get_till_settings(self.shop_till)
		self.assertTrue(frappe.db.exists("POS Settings", {"pos_profile": self.shop_till}))

	def test_a_restaurant_manager_kept_to_his_restaurant_is_refused_at_another_restaurants_till(self):
		other = self.a_second_restaurant_till()
		_confine(self, RESTAURANT_MANAGER, "Restaurant", self.restaurant)
		self.as_user(RESTAURANT_MANAGER)
		# His own restaurant's till: his tabs
		self.assertEqual(till_tabs(get_till_settings(self.restaurant_till)), RESTAURANT_TABS)
		save_till_settings(self.restaurant_till, {"enable_runner": 0})
		# The other restaurant's till: nothing, not even its till's keys of the restaurant's tabs
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.shop_till)
		for values in ({}, {"enable_runner": 0}, {"enable_takeaway": 1}, {"no_show_delay": 30}):
			with self.subTest(values=values), self.assertRaises(frappe.PermissionError):
				save_till_settings(self.shop_till, values)
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("Restaurant", other, "enable_runner"), 1)
		self.assertEqual(self.stored_settings(self.shop_till, "enable_takeaway").enable_takeaway, 0)

	def test_a_till_manager_saves_only_the_tills_his_user_permissions_leave_him(self):
		_confine(self, TILL_MANAGER, "POS Profile", self.restaurant_till)
		self.as_user(TILL_MANAGER)
		save_till_settings(self.restaurant_till, {"allow_credit_sale": 1})
		with self.assertRaises(frappe.PermissionError):
			get_till_settings(self.shop_till)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.shop_till, {"allow_credit_sale": 1})
		frappe.set_user("Administrator")
		self.assertEqual(self.stored_settings(self.restaurant_till, "allow_credit_sale").allow_credit_sale, 1)
		self.assertEqual(self.stored_settings(self.shop_till, "allow_credit_sale").allow_credit_sale, 0)

	def test_a_till_manager_kept_to_another_company_has_no_till_of_this_one(self):
		other_company = frappe.db.get_value("Company", {"name": ["!=", self.fx.company]}, "name")
		if not other_company:
			raise unittest.SkipTest("the site has one company")
		_confine(self, TILL_MANAGER, "Company", other_company)
		self.as_user(TILL_MANAGER)
		with self.assertRaises(frappe.PermissionError):
			save_till_settings(self.shop_till, {"allow_credit_sale": 1})

	def test_a_failing_till_part_keeps_the_other_rights(self):
		# The seam's runner logs a hook that raises and goes on: restaurant_can, written last, was lost whole
		from pos_next.till_settings import api as api_module

		frappe.set_user(RESTAURANT_MANAGER)
		restaurant_bootstrap._LOGGED.clear()
		with (
			patch.object(api_module, "rights_at", side_effect=RuntimeError("broken")),
			patch.object(frappe, "log_error") as logged,
		):
			told = []
			for _attempt in range(2):
				settings = {}
				restaurant_bootstrap.extend_bootstrap_settings(settings, self.restaurant_till)
				told.append(settings["restaurant_can"])
		frappe.set_user("Administrator")
		for can in told:
			self.assertTrue(can["manage_floor"])
			self.assertTrue(can["manage_cards"])
			self.assertFalse(can["manage_till_settings"])
			self.assertFalse(can["manage_restaurant_settings"])
		# Once, not at every bootstrap of every till
		self.assertEqual(logged.call_count, 1)

	def test_the_rights_of_a_till_are_read_from_cached_documents(self):
		# Every bootstrap and every read of a till's settings asks them, for every user
		for doctype, name in (
			("POS Profile", self.restaurant_till),
			("Restaurant", self.restaurant),
			("User", TILL_MANAGER),
		):
			frappe.get_cached_doc(doctype, name)
		frappe.set_user(TILL_MANAGER)
		with patch.object(frappe, "get_doc", side_effect=AssertionError("a document read again")):
			rights = till_settings_api.rights_at(self.restaurant_till)
		frappe.set_user("Administrator")
		self.assertEqual(rights, {"till": True, "restaurant": True})

	def test_the_till_is_told_who_opens_its_settings_there(self):
		# The rail's Settings entry follows the same rights as the server (bootstrap's restaurant_can)
		self.a_second_restaurant_till()
		_confine(self, RESTAURANT_MANAGER, "Restaurant", self.restaurant)
		_confine(self, TILL_MANAGER, "POS Profile", self.restaurant_till)

		def told(user, pos_profile):
			frappe.set_user(user)
			settings = {}
			restaurant_bootstrap.extend_bootstrap_settings(settings, pos_profile)
			can = settings["restaurant_can"]
			return can["manage_till_settings"], can["manage_restaurant_settings"]

		self.assertEqual(told(RESTAURANT_MANAGER, self.restaurant_till), (False, True))
		self.assertEqual(told(RESTAURANT_MANAGER, self.shop_till), (False, False))
		# The till manager (who writes every restaurant, Nexus POS Manager) kept to the first till: its own settings
		# there only; the other restaurant's till shows him its restaurant's tabs, as its manager
		self.assertEqual(told(TILL_MANAGER, self.restaurant_till), (True, True))
		self.assertEqual(told(TILL_MANAGER, self.shop_till), (False, True))
		self.assertEqual(told(TILL, self.restaurant_till), (False, False))
		# No till named: what his roles allow
		self.assertEqual(told(RESTAURANT_MANAGER, None), (False, True))
		self.assertEqual(told(TILL, None), (False, False))


class TestBlockingASaleBeyondTheStock(TillSettingsCase):
	"""« Block a sale beyond the stock » (POS Profile.posa_block_sale_beyond_available_qty) means what it says (ruling
	82): where the site allows negative stock, the box decides, at the till as at the server's check before a sale is
	booked; where the site refuses it, the till refuses a sale beyond the stock whatever the box says (ERPNext would
	refuse to book it), and the screen shows the box greyed. Upstream let any sale go where the site allowed negative
	stock, before reading the box, and read the box `or 1` (an unticked box still blocked)."""

	BOX = "posa_block_sale_beyond_available_qty"

	def setUp(self):
		super().setUp()
		self.site_allows_negative_stock(False)

	def site_allows_negative_stock(self, allowed):
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", int(allowed))
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.shop_till}, "allow_negative_stock", int(allowed)
		)

	def ticked(self, value):
		self.as_user(TILL_MANAGER)
		save_till_settings(self.shop_till, {self.BOX: value})
		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.get_value("POS Profile", self.shop_till, self.BOX), value)

	def shown(self):
		self.as_user(TILL_MANAGER)
		setting = by_key(get_till_settings(self.shop_till))[self.BOX]
		frappe.set_user("Administrator")
		return setting

	def test_the_till_shows_it_in_its_stock_tab_with_what_it_does(self):
		setting = self.shown()
		self.assertEqual((setting["tab"], setting["editable"]), ("stock", True))
		self.assertEqual(setting["help"], str(registry.get(self.BOX).help))
		# The bulb says both cases
		self.assertIn("allows negative stock", registry.get(self.BOX).help.msg)
		self.assertIn("whatever this box says", registry.get(self.BOX).help.msg)

	def test_where_the_site_allows_negative_stock_the_box_decides(self):
		self.site_allows_negative_stock(True)
		self.assertFalse(self.shown().get("greyed"))
		self.ticked(1)
		self.assertTrue(invoices._should_block(self.shop_till))
		self.ticked(0)
		self.assertFalse(invoices._should_block(self.shop_till))

	def test_where_the_site_refuses_negative_stock_the_till_blocks_whatever_the_box(self):
		self.assertTrue(self.shown()["greyed"])
		for value in (0, 1):
			with self.subTest(box=value):
				self.ticked(value)
				self.assertTrue(invoices._should_block(self.shop_till))

	def test_the_till_is_told_the_box_with_its_other_settings(self):
		from pos_next.api.bootstrap import _get_pos_settings

		for value in (0, 1):
			with self.subTest(box=value):
				frappe.db.set_value("POS Profile", self.shop_till, self.BOX, value)
				profile = frappe.get_doc("POS Profile", self.shop_till)
				self.assertEqual(_get_pos_settings(profile)[self.BOX], value)
				frappe.clear_document_cache("POS Profile", self.shop_till)
				self.assertEqual(pos_settings_doctype.get_pos_settings(self.shop_till)[self.BOX], value)

	def test_a_till_that_says_nothing_blocks(self):
		for allowed in (False, True):
			with self.subTest(site_allows=allowed):
				self.site_allows_negative_stock(allowed)
				self.assertTrue(invoices._should_block("_Test Till Settings No Such Till"))
		# No till named where the site allows negative stock: the site decides, as upstream
		self.assertFalse(invoices._should_block(None))
		self.site_allows_negative_stock(False)
		self.assertTrue(invoices._should_block(None))


class TestTheOldDoorsAreClosed(FrappeTestCase):
	"""The settings dialog the screen replaced saved through two endpoints of its own, which wrote any field of POS
	Settings (the office's included) and the warehouse with none of the list's checks. Nothing calls them any more: they
	are no web endpoints."""

	def test_they_are_not_whitelisted(self):
		for fn in (pos_settings_doctype.update_pos_settings, pos_profile_api.update_warehouse):
			with self.subTest(fn=fn.__name__):
				self.assertNotIn(fn, frappe.whitelisted)
				with self.assertRaises(frappe.PermissionError):
					frappe.is_whitelisted(fn)


COMMITTED_TILL = "_Test Till Settings Committed Till"


class TestASaveThatReallyCommits(FrappeTestCase):
	"""One save as a request makes it: `frappe.db.commit` is not patched here (the other classes patch it), so a commit
	hidden in the save would show. What the test makes is deleted, and that is committed, at the end."""

	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(self.remove)
		self.remove()
		company = _company()
		self.warehouses = frappe.get_all(
			"Warehouse", filters={"company": company, "is_group": 0, "disabled": 0}, pluck="name", limit=2
		)
		if len(self.warehouses) < 2:
			raise unittest.SkipTest("the company has fewer than two warehouses")
		currency = frappe.get_cached_value("Company", company, "default_currency")
		cost_center = frappe.get_cached_value("Company", company, "cost_center") or frappe.db.get_value(
			"Cost Center", {"company": company, "is_group": 0}, "name"
		)
		frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": COMMITTED_TILL,
				"company": company,
				"currency": currency,
				"warehouse": self.warehouses[0],
				"selling_price_list": frappe.db.get_value(
					"Price List", {"selling": 1, "enabled": 1, "currency": currency}, "name"
				),
				"cost_center": cost_center,
				"write_off_account": frappe.get_cached_value("Company", company, "write_off_account")
				or frappe.db.get_value(
					"Account", {"company": company, "is_group": 0, "root_type": "Expense"}, "name"
				),
				"write_off_cost_center": cost_center,
				"payments": [{"mode_of_payment": _cash_mode(company), "default": 1}],
			}
		).insert(ignore_permissions=True)
		frappe.get_doc({"doctype": "POS Settings", "pos_profile": COMMITTED_TILL, "enabled": 1}).insert(
			ignore_permissions=True
		)
		frappe.db.commit()

	def remove(self):
		frappe.set_user("Administrator")
		for name in frappe.get_all("POS Settings", filters={"pos_profile": COMMITTED_TILL}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		if frappe.db.exists("POS Profile", COMMITTED_TILL):
			frappe.delete_doc("POS Profile", COMMITTED_TILL, force=True, ignore_permissions=True)
		frappe.db.commit()

	def stored(self):
		frappe.db.rollback()  # nothing pending: what is read is what the database kept
		return (
			frappe.db.get_value("POS Profile", COMMITTED_TILL, "warehouse"),
			frappe.db.get_value("POS Settings", {"pos_profile": COMMITTED_TILL}, "allow_credit_sale"),
		)

	def test_a_save_is_kept_whole_or_not_at_all(self):
		first, second = self.warehouses
		# POS Settings refuse the exact amount with credit sales, after the POS Profile was written: nothing is kept
		with self.assertRaises(frappe.ValidationError):
			save_till_settings(
				COMMITTED_TILL, {"warehouse": second, "allow_credit_sale": 1, "use_exact_amount": 1}
			)
		frappe.db.commit()
		self.assertEqual(self.stored(), (first, 0))

		save_till_settings(COMMITTED_TILL, {"warehouse": second, "allow_credit_sale": 1})
		frappe.db.commit()
		self.assertEqual(self.stored(), (second, 1))
