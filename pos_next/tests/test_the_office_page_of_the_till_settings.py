# //// Neoffice — added file (no upstream equivalent).
"""The office's page of a till's settings (NeoResto lot 1, task 13b; product owner, 30.10.2026).

One page that reads the SAME list as the till's own screen (`pos_next.till_settings.registry`), with what the till never
shows: the office's own settings and their three tabs (payments, loyalty, accounting) and the till's identity, users and
restaurant tick. It opens for the same people as the till's screen; the office's own settings are changed only by whoever
the ERP lets write the document they live on (a till manager's role is not enough for the accounts and the payment
methods, nor for the site's negative stock), and the till's identity is read, never set. A field hidden on purpose
(`kitchen_popup_seconds`, `validate_stock_on_save`: the till does not act on them) is never listed, so never served.
The suite rolls everything back.
"""

import frappe
from frappe.model import display_fieldtypes

from pos_next.tests.test_till_settings import (
	PORTAL,
	RESTAURANT_MANAGER,
	TILL_MANAGER,
	TillSettingsCase,
	by_key,
	till_tabs,
)
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _user
from pos_next.till_settings import registry
from pos_next.till_settings.api import (
	get_desk_settings,
	get_till_settings,
	give_the_cashier_role,
	save_desk_settings,
	save_till_settings,
)

# What an office clerk holds: the till manager's role, the accountant's (POS Profile) and the stock manager's (Stock Settings)
OFFICE = "till-settings-office@yopmail.com"
DISABLED = "till-settings-disabled@yopmail.com"
# The site's administrator is Administrator alone: no account of a customer holds System Manager, which is what the site's
# negative stock asks (Stock Settings writes Property Setters)
SYSTEM = "Administrator"
SETUP_TAB = ["setup"]
OFFICE_TABS = ["payments", "loyalty", "accounting"]
SHOP_TABS = ["general", "sale_screen", "prices", "sales", "stock", "printing", "closing", "shop_scan"]
RESTAURANT_TABS = ["restaurant", "hours", "online", "reservations"]


def office_keys():
	"""The office's own settings that live on a document (none is a state or a button)."""
	return {
		setting.key
		for setting in registry.SETTINGS
		if setting.desk_only and setting.store == registry.DOCUMENT and setting.kind == registry.SETTING
	}


class TestTheOfficePage(TillSettingsCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OFFICE, ["Nexus POS Manager", "Accounts Manager", "Stock Manager"], "System User")
		_user(DISABLED, [CASHIER_ROLE], "System User")
		frappe.db.set_value("User", DISABLED, "enabled", 0)
		for user in (OFFICE, DISABLED):
			frappe.clear_cache(user=user)

	# ------------------------------------------------------------------------------------------------ what it shows
	def test_it_shows_the_office_tabs_after_the_till_s_own_and_every_office_setting(self):
		self.as_user(OFFICE)

		answer = get_desk_settings(self.shop_till)

		self.assertEqual(till_tabs(answer), SETUP_TAB + SHOP_TABS + OFFICE_TABS)
		settings = by_key(answer)
		self.assertTrue(office_keys() <= set(settings), sorted(office_keys() - set(settings)))
		for key in ("company", "payments", "enable_restaurant_mode", "restaurant", "allow_negative_stock"):
			with self.subTest(key=key):
				self.assertIn(key, answer["values"])

	def test_a_restaurant_till_shows_its_restaurant_tabs_first_and_the_opening_hours_as_a_table(self):
		self.as_user(OFFICE)

		answer = get_desk_settings(self.restaurant_till)

		self.assertEqual(till_tabs(answer), SETUP_TAB + RESTAURANT_TABS + SHOP_TABS[:-1] + OFFICE_TABS)
		hours = by_key(answer)["opening_hours"]
		self.assertEqual(hours["widget"], "special")
		self.assertEqual(
			{column["fieldname"] for column in hours["columns"]},
			{"day_of_week", "from_time", "to_time", "label", "restaurant_card"},
		)
		by_name = {column["fieldname"]: column for column in hours["columns"]}
		self.assertEqual(by_name["restaurant_card"]["options"], "Restaurant Card")

	def test_it_draws_only_what_lives_on_a_document_never_this_computer_nor_a_button(self):
		self.as_user(OFFICE)

		for till in (self.shop_till, self.restaurant_till):
			with self.subTest(till=till):
				for setting in get_desk_settings(till)["settings"]:
					self.assertEqual(setting["store"], registry.DOCUMENT, setting["key"])
					self.assertEqual(setting["kind"], registry.SETTING, setting["key"])

	def test_the_tills_own_screen_is_unchanged_and_still_holds_none_of_the_office(self):
		self.as_user(OFFICE)

		answer = get_till_settings(self.shop_till)

		self.assertEqual(till_tabs(answer), SHOP_TABS)
		self.assertFalse(office_keys() & set(by_key(answer)))
		self.assertNotIn("left_out", answer)

	def test_a_link_with_no_short_list_says_which_doctype_it_points_at(self):
		self.as_user(OFFICE)

		settings = by_key(get_desk_settings(self.shop_till))

		self.assertEqual(settings["company"]["link_doctype"], "Company")
		self.assertEqual(settings["write_off_account"]["link_doctype"], "Account")
		self.assertEqual(settings["taxes_and_charges"]["link_doctype"], "Sales Taxes and Charges Template")
		# A link the till offers as a short list keeps its list, and a link searched keeps its search
		self.assertNotIn("link_doctype", settings["selling_price_list"])
		self.assertEqual(settings["customer"]["search"], "Customer")
		self.assertNotIn("link_doctype", settings["customer"])

	def test_an_office_select_offers_the_values_of_its_doctype(self):
		self.as_user(OFFICE)

		options = by_key(get_desk_settings(self.shop_till))["apply_discount_on"]["options"]

		self.assertEqual([option["value"] for option in options], ["Grand Total", "Net Total"])

	def test_the_tables_of_the_office_describe_their_columns_for_the_desk_controls(self):
		self.as_user(OFFICE)

		columns = {
			column["fieldname"]: column
			for column in by_key(get_desk_settings(self.shop_till))["payments"]["columns"]
		}

		self.assertEqual(columns["mode_of_payment"]["fieldtype"], "Link")
		self.assertEqual(columns["mode_of_payment"]["options"], "Mode of Payment")
		self.assertEqual(columns["default"]["fieldtype"], "Check")
		# The till's own screen does not carry what only the desk's controls need
		rules = by_key(get_till_settings(self.shop_till))["barcode_rules"]["columns"]
		self.assertTrue(rules)
		for column in rules:
			self.assertNotIn("options", column)
			self.assertNotIn("reqd", column)

	def test_a_shop_till_says_how_many_restaurant_settings_it_leaves_out_and_the_reverse(self):
		self.as_user(OFFICE)

		shop = get_desk_settings(self.shop_till)["left_out"]
		restaurant = get_desk_settings(self.restaurant_till)["left_out"]

		self.assertGreater(shop["restaurant"], 0)
		self.assertEqual(shop["shop"], 0)
		self.assertEqual(restaurant["restaurant"], 0)
		self.assertGreater(restaurant["shop"], 0)

	# ------------------------------------------------------------------------------------------------ hidden fields
	def test_a_field_hidden_on_purpose_is_never_listed_nor_served(self):
		"""Daniel, 30.10: « on ne fait jamais revenir un champ caché exprès ». A field a doctype hides (the banner's
		seconds, the POS Profile's stock check the till does not act on) is set aside with its reason, never listed."""
		self.as_user(OFFICE)
		served = {
			(setting["doctype"], setting["key"])
			for till in (self.shop_till, self.restaurant_till)
			for setting in get_desk_settings(till)["settings"]
		}
		for doctype in registry.DOCTYPES:
			with self.subTest(doctype=doctype):
				hidden = {
					df.fieldname
					for df in frappe.get_meta(doctype).fields
					if df.hidden and df.fieldtype not in display_fieldtypes
				}
				listed = {setting.key for setting in registry.document_settings(doctype)}
				self.assertFalse(
					hidden & listed, f"{doctype} hides a field the list shows: {hidden & listed}"
				)
				self.assertLessEqual(
					hidden,
					set(registry.NOT_LISTED[doctype]),
					f"{doctype} hides a field the list neither shows nor sets aside",
				)
				self.assertFalse({key for kind, key in served if kind == doctype} & hidden)

	def test_what_the_list_sets_aside_never_reaches_the_office_page(self):
		self.as_user(OFFICE)
		# A fieldname is the same on two doctypes (`enabled`, `company`): what is set aside is a field OF a doctype
		served = {
			(setting["doctype"], setting["key"])
			for till in (self.shop_till, self.restaurant_till)
			for setting in get_desk_settings(till)["settings"]
		}

		for doctype, aside in registry.NOT_LISTED.items():
			for key in aside:
				with self.subTest(doctype=doctype, key=key):
					self.assertNotIn((doctype, key), served)

	def test_a_setting_that_depends_on_another_is_served_and_left_to_the_page_to_grey(self):
		"""Daniel, 30.10: a setting that depends on a box stays visible, greyed, so that one sees what the box governs."""
		self.as_user(OFFICE)
		settings = by_key(get_desk_settings(self.restaurant_till))

		dependents = [key for key, setting in settings.items() if setting["depends_on"]]

		self.assertGreater(len(dependents), 20)
		for key in dependents:
			for when in settings[key]["depends_on"]:
				with self.subTest(setting=key, depends_on=when["key"]):
					self.assertIn(when["key"], settings)

	# ------------------------------------------------------------------------------------------------ who changes what
	def test_a_till_manager_reads_the_office_tabs_but_changes_only_what_the_erp_lets_him(self):
		self.as_user(TILL_MANAGER)

		settings = by_key(get_desk_settings(self.shop_till))

		self.assertTrue(office_keys() <= set(settings))
		# POS Settings: his role writes it
		for key in ("enable_loyalty_program", "enable_restaurant_mode"):
			with self.subTest(key=key):
				self.assertTrue(settings[key]["editable"])
		# POS Profile: the accountant's. The site's negative stock: the stock manager's
		for key in ("company", "payments", "write_off_account", "income_account", "tc_name", "disabled"):
			with self.subTest(key=key):
				self.assertFalse(settings[key]["editable"])
		self.assertFalse(settings["allow_negative_stock"]["editable"])

	def test_a_till_manager_who_is_also_the_accountant_changes_all_but_the_identity_and_the_site_s_stock(
		self,
	):
		self.as_user(OFFICE)

		settings = by_key(get_desk_settings(self.shop_till))

		for key in office_keys() - {"pos_profile", "allow_negative_stock"}:
			with self.subTest(key=key):
				self.assertTrue(settings[key]["editable"])
		self.assertFalse(settings["pos_profile"]["editable"])
		# Stock Settings writes Property Setters, which a stock manager may not create: the page shows it read-only to him
		self.assertFalse(settings["allow_negative_stock"]["editable"])

	def test_the_site_administrator_may_set_the_site_s_negative_stock(
		self,
	):  # role-check: ok site administrator
		self.as_user(SYSTEM)

		settings = by_key(get_desk_settings(self.shop_till))

		self.assertTrue(settings["allow_negative_stock"]["editable"])
		self.assertFalse(settings["pos_profile"]["editable"])

	def test_the_till_manager_s_save_of_an_accounting_setting_is_refused_and_writes_nothing(self):
		self.as_user(TILL_MANAGER)
		before = frappe.db.get_value("POS Profile", self.shop_till, "write_off_limit")

		with self.assertRaises(frappe.PermissionError):
			save_desk_settings(self.shop_till, {"write_off_limit": 7})
		with self.assertRaises(frappe.PermissionError):
			save_desk_settings(self.shop_till, {"allow_negative_stock": 1})

		self.assertEqual(frappe.db.get_value("POS Profile", self.shop_till, "write_off_limit"), before)

	def test_a_till_manager_changes_what_his_role_writes_at_the_office_too(self):
		self.as_user(TILL_MANAGER)

		answer = save_desk_settings(self.shop_till, {"allow_sales_order": 1})

		self.assertEqual(answer["values"]["allow_sales_order"], 1)
		self.assertEqual(self.stored_settings(self.shop_till, "allow_sales_order").allow_sales_order, 1)

	def test_the_accountant_changes_the_office_settings_and_the_page_reads_them_back(self):
		self.as_user(OFFICE)

		answer = save_desk_settings(
			self.shop_till,
			{"apply_discount_on": "Net Total", "write_off_limit": 5, "disable_rounded_total": 1},
		)

		self.assertEqual(answer["values"]["apply_discount_on"], "Net Total")
		self.assertEqual(answer["values"]["write_off_limit"], 5)
		self.assertEqual(answer["values"]["disable_rounded_total"], 1)
		stored = frappe.db.get_value(
			"POS Profile",
			self.shop_till,
			["apply_discount_on", "write_off_limit", "disable_rounded_total"],
			as_dict=True,
		)
		self.assertEqual(
			(stored.apply_discount_on, stored.write_off_limit, stored.disable_rounded_total),
			("Net Total", 5, 1),
		)

	def test_a_value_the_doctype_does_not_offer_is_refused(self):
		self.as_user(OFFICE)

		with self.assertRaises(frappe.ValidationError):
			save_desk_settings(self.shop_till, {"apply_discount_on": "Whatever"})

		self.assertNotEqual(
			frappe.db.get_value("POS Profile", self.shop_till, "apply_discount_on"), "Whatever"
		)

	def test_the_payment_methods_are_saved_as_lines_and_read_back(self):
		self.as_user(OFFICE)
		rows = get_desk_settings(self.shop_till)["values"]["payments"]
		self.assertTrue(rows)
		rows[0]["allow_in_returns"] = 0 if rows[0].get("allow_in_returns") else 1

		answer = save_desk_settings(self.shop_till, {"payments": rows})

		self.assertEqual(answer["values"]["payments"][0]["allow_in_returns"], rows[0]["allow_in_returns"])
		self.assertEqual(len(answer["values"]["payments"]), len(rows))

	def test_the_site_administrator_turns_the_site_s_negative_stock_off(
		self,
	):  # role-check: ok site administrator
		# Switched off here, whatever the site's stock reservations say about switching it on (the theme refuses that while
		# some are open): the site allows it, the till says so, and the page turns it off
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "allow_negative_stock", 1)
		self.as_user(SYSTEM)

		answer = save_desk_settings(self.shop_till, {"allow_negative_stock": 0})

		self.assertEqual(answer["values"]["allow_negative_stock"], 0)
		self.assertEqual(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"), 0)

	def test_a_stock_manager_who_is_no_site_administrator_is_refused_before_anything_is_written(self):
		frappe.db.set_single_value("Stock Settings", "allow_negative_stock", 1)
		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "allow_negative_stock", 1)
		self.as_user(OFFICE)

		with self.assertRaises(frappe.PermissionError):
			save_desk_settings(self.shop_till, {"allow_negative_stock": 0})

		self.assertEqual(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"), 1)

	def test_the_tills_identity_is_read_and_never_set(self):
		self.as_user(OFFICE)
		settings = by_key(get_desk_settings(self.shop_till))

		self.assertFalse(settings["pos_profile"]["editable"])
		with self.assertRaises(frappe.PermissionError):
			save_desk_settings(self.shop_till, {"pos_profile": self.restaurant_till})
		self.assertEqual(self.stored_settings(self.shop_till, "pos_profile").pos_profile, self.shop_till)

	def test_the_tills_screen_still_refuses_an_office_setting(self):
		self.as_user(OFFICE)

		with self.assertRaises(frappe.ValidationError):
			save_till_settings(self.shop_till, {"write_off_limit": 7})

	def test_something_the_page_does_not_draw_is_refused(self):
		self.as_user(OFFICE)

		for key in ("qz_printer", "stock_sync_status", "test_print", "nothing_of_the_list"):
			with self.subTest(key=key), self.assertRaises(frappe.ValidationError):
				save_desk_settings(self.shop_till, {key: "x"})

	def test_a_restaurant_setting_on_a_shop_till_is_refused(self):
		self.as_user(OFFICE)

		with self.assertRaises(frappe.ValidationError):
			save_desk_settings(self.shop_till, {"station_printers": []})

	def test_ticking_the_restaurant_till_makes_the_restaurant_tabs_appear(self):
		self.as_user(OFFICE)
		self.assertNotIn("restaurant", till_tabs(get_desk_settings(self.shop_till)))

		answer = save_desk_settings(
			self.shop_till, {"enable_restaurant_mode": 1, "restaurant": self.restaurant}
		)

		self.assertTrue(answer["restaurant_till"])
		self.assertEqual(answer["restaurant"], self.restaurant)
		self.assertEqual(till_tabs(answer)[1 : 1 + len(RESTAURANT_TABS)], RESTAURANT_TABS)

	# ------------------------------------------------------------------------------------------------ who opens it
	def test_a_restaurant_manager_opens_the_restaurant_tabs_only_and_changes_no_office_setting(self):
		self.as_user(RESTAURANT_MANAGER)

		answer = get_desk_settings(self.restaurant_till)

		self.assertEqual(till_tabs(answer), RESTAURANT_TABS)
		self.assertFalse(office_keys() & set(by_key(answer)))
		with self.assertRaises(frappe.PermissionError):
			save_desk_settings(self.restaurant_till, {"write_off_limit": 7})

	def test_a_cashier_a_portal_account_and_a_visitor_are_refused(self):
		for user in (TILL, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					get_desk_settings(self.shop_till)
				with self.assertRaises(frappe.PermissionError):
					save_desk_settings(self.shop_till, {"disabled": 1})

	def test_a_till_that_does_not_exist_is_not_found(self):
		self.as_user(OFFICE)

		with self.assertRaises(frappe.DoesNotExistError):
			get_desk_settings("A till that is not there")

	# ------------------------------------------------------------------------------------------------ getting started
	def test_the_first_tab_holds_the_identity_the_users_and_the_restaurant_tick(self):
		self.as_user(OFFICE)

		answer = get_desk_settings(self.shop_till)

		self.assertEqual(till_tabs(answer)[0], "setup")
		first = {key for key, setting in by_key(answer).items() if setting["tab"] == "setup"}
		self.assertEqual(
			first,
			{
				"pos_profile",
				"disabled",
				"company",
				"company_address",
				"applicable_for_users",
				"enable_restaurant_mode",
				"restaurant",
			},
		)
		# The till's own screen never has it
		self.assertNotIn("setup", till_tabs(get_till_settings(self.shop_till)))

	def test_the_people_of_a_till_say_who_can_open_it_and_why_not(self):
		# The restaurant till is the cashier's; the other two people are added to it
		profile = frappe.get_doc("POS Profile", self.restaurant_till)
		profile.append("applicable_for_users", {"user": OTHER_TILL})
		profile.append("applicable_for_users", {"user": DISABLED})
		profile.save(ignore_permissions=True)
		self.as_user(OFFICE)

		people = {person["user"]: person for person in get_desk_settings(self.restaurant_till)["people"]}

		self.assertEqual(people[TILL]["roles"], ["POSNext Cashier"])
		self.assertTrue(people[TILL]["can_open"])
		# A person listed on the till with no role of the till opens nothing
		self.assertEqual(people[OTHER_TILL]["roles"], [])
		self.assertFalse(people[OTHER_TILL]["can_open"])
		self.assertEqual((people[DISABLED]["enabled"], people[DISABLED]["can_open"]), (0, False))

	def test_the_page_says_what_a_till_still_needs_to_open(self):
		self.as_user(OFFICE)

		ready = {check["key"]: check for check in get_desk_settings(self.restaurant_till)["readiness"]}

		self.assertEqual(set(ready), {"users", "payments", "warehouse", "restaurant"})
		self.assertTrue(all(check["ok"] for check in ready.values()), ready)
		self.assertEqual(
			{key: check["tab"] for key, check in ready.items()},
			{"users": "setup", "payments": "payments", "warehouse": "stock", "restaurant": "setup"},
		)

	def test_a_till_nobody_can_open_and_with_two_default_payments_is_not_ready(self):
		profile = frappe.get_doc("POS Profile", self.shop_till)
		profile.set("applicable_for_users", [{"user": OTHER_TILL}])
		profile.append("payments", {"mode_of_payment": profile.payments[0].mode_of_payment, "default": 1})
		profile.flags.ignore_validate = True
		profile.save(ignore_permissions=True)
		self.as_user(OFFICE)

		ready = {check["key"]: check["ok"] for check in get_desk_settings(self.shop_till)["readiness"]}

		self.assertFalse(ready["users"])
		self.assertFalse(ready["payments"])
		self.assertTrue(ready["warehouse"])
		# A shop till has no restaurant to choose
		self.assertNotIn("restaurant", ready)

	# ------------------------------------------------------------------------------------------------ one switch for the till
	def test_the_till_has_one_switch_and_it_reads_the_right_way_round(self):
		"""Daniel, 06.11: « un switch activé et un switch désactivé, c'est un peu bizarre ». The profile's own `disabled`, asked as
		"Active till"; the record's `enabled` is the profile's follower and is not offered."""
		self.as_user(OFFICE)

		answer = get_desk_settings(self.shop_till)

		settings = by_key(answer)
		self.assertNotIn(
			"enabled", {key for key, setting in settings.items() if setting["doctype"] == "POS Settings"}
		)
		self.assertEqual(settings["disabled"]["label"], "Active till")
		self.assertEqual(answer["values"]["disabled"], 1)
		# A switched-off till reads as off
		frappe.db.set_value("POS Profile", self.shop_till, "disabled", 1)
		self.assertEqual(get_desk_settings(self.shop_till)["values"]["disabled"], 0)

	def test_switching_the_till_off_and_on_moves_the_profile_and_its_settings_together(self):
		self.as_user(OFFICE)

		answer = save_desk_settings(self.shop_till, {"disabled": 0})

		self.assertEqual(frappe.db.get_value("POS Profile", self.shop_till, "disabled"), 1)
		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 0)
		self.assertEqual(answer["values"]["disabled"], 0)
		answer = save_desk_settings(self.shop_till, {"disabled": 1})
		self.assertEqual(frappe.db.get_value("POS Profile", self.shop_till, "disabled"), 0)
		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 1)
		self.assertEqual(answer["values"]["disabled"], 1)

	def test_a_profile_switched_off_by_its_own_form_takes_its_settings_with_it_and_a_plain_save_leaves_them(
		self,
	):
		profile = frappe.get_doc("POS Profile", self.shop_till)
		profile.disabled = 1
		profile.save(ignore_permissions=True)
		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 0)
		profile.reload()
		profile.disabled = 0
		profile.save(ignore_permissions=True)
		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 1)
		# A save of the profile that does not move the switch never overwrites what was set on the record
		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "enabled", 0)
		profile.reload()
		profile.save(ignore_permissions=True)
		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 0)

	def test_a_record_ignored_on_its_own_reads_as_off_and_switching_the_till_on_repairs_it(self):
		frappe.db.set_value("POS Settings", {"pos_profile": self.shop_till}, "enabled", 0)
		self.as_user(OFFICE)

		self.assertEqual(get_desk_settings(self.shop_till)["values"]["disabled"], 0)
		answer = save_desk_settings(self.shop_till, {"disabled": 1})

		self.assertEqual(self.stored_settings(self.shop_till, "enabled").enabled, 1)
		self.assertEqual(answer["values"]["disabled"], 1)

	def test_an_inverted_switch_takes_an_on_or_an_off_and_nothing_else(self):
		self.as_user(OFFICE)

		with self.assertRaises(frappe.ValidationError):
			save_desk_settings(self.shop_till, {"disabled": "maybe"})

	# ------------------------------------------------------------------------------------------------ the bar of tills
	def test_the_page_lists_the_tills_the_user_may_switch_to_and_says_which_are_off(self):
		frappe.db.set_value("POS Profile", self.shop_till, "disabled", 1)
		self.as_user(OFFICE)

		tills = {till["name"]: till for till in get_desk_settings(self.restaurant_till)["tills"]}

		self.assertEqual(tills[self.shop_till]["disabled"], 1)
		self.assertEqual(tills[self.restaurant_till]["disabled"], 0)
		self.assertTrue(tills[self.restaurant_till]["restaurant"])
		self.assertFalse(tills[self.shop_till]["restaurant"])
		# The ones in use come first
		names = list(tills)
		self.assertLess(names.index(self.restaurant_till), names.index(self.shop_till))

	def test_a_restaurant_manager_is_offered_the_tills_of_his_restaurant_only(self):
		self.as_user(RESTAURANT_MANAGER)

		names = [till["name"] for till in get_desk_settings(self.restaurant_till)["tills"]]

		self.assertIn(self.restaurant_till, names)
		self.assertNotIn(self.shop_till, names)

	# ------------------------------------------------------------------------------------------------ the cashier role
	def _list_on_the_till(self, *users):
		profile = frappe.get_doc("POS Profile", self.restaurant_till)
		for user in users:
			profile.append("applicable_for_users", {"user": user})
		profile.save(ignore_permissions=True)

	def _holds_the_cashier_role(self, user):
		return bool(frappe.db.exists("Has Role", {"parent": user, "role": CASHIER_ROLE}))

	def test_a_listed_person_who_lacks_the_role_is_given_it_and_the_till_can_then_be_opened(
		self,
	):  # role-check: ok site administrator
		self._list_on_the_till(OTHER_TILL)
		self.as_user(SYSTEM)

		answer = give_the_cashier_role(self.restaurant_till, OTHER_TILL)

		self.assertTrue(self._holds_the_cashier_role(OTHER_TILL))
		person = {person["user"]: person for person in answer["people"]}[OTHER_TILL]
		self.assertTrue(person["can_open"])
		self.assertTrue(person["desk_account"])
		self.assertIn("users", {check["key"] for check in answer["readiness"]})

	def test_the_role_is_given_with_the_rights_of_whoever_clicks_so_a_clerk_who_cannot_write_users_is_refused(
		self,
	):
		self._list_on_the_till(OTHER_TILL)
		self.as_user(OFFICE)

		with self.assertRaises(frappe.PermissionError):
			give_the_cashier_role(self.restaurant_till, OTHER_TILL)

		self.assertFalse(self._holds_the_cashier_role(OTHER_TILL))

	def test_the_role_goes_only_to_a_person_the_till_lists_who_is_on_and_has_a_desk_account(
		self,
	):  # role-check: ok site administrator
		website = "till-settings-website@yopmail.com"
		_user(website, [], "Website User")
		self._list_on_the_till(DISABLED, website)
		self.as_user(SYSTEM)

		# Not listed on this till, switched off, a website account
		for user in (OFFICE, DISABLED, website):
			with self.subTest(user=user):
				with self.assertRaises(frappe.ValidationError):
					give_the_cashier_role(self.restaurant_till, user)
		self.assertFalse(self._holds_the_cashier_role(website))
		person = {p["user"]: p for p in get_desk_settings(self.restaurant_till)["people"]}[website]
		self.assertFalse(person["desk_account"])
		self.assertFalse(person["can_open"])

	def test_a_cashier_a_portal_account_and_a_visitor_cannot_give_the_role(self):
		self._list_on_the_till(OTHER_TILL)
		for user in (TILL, PORTAL, "Guest"):
			with self.subTest(user=user):
				self.as_user(user)
				with self.assertRaises(frappe.PermissionError):
					give_the_cashier_role(self.restaurant_till, OTHER_TILL)
		self.assertFalse(self._holds_the_cashier_role(OTHER_TILL))

	def test_a_restaurant_manager_cannot_give_the_role_it_is_the_till_manager_s(self):
		self._list_on_the_till(OTHER_TILL)
		self.as_user(RESTAURANT_MANAGER)

		with self.assertRaises(frappe.PermissionError):
			give_the_cashier_role(self.restaurant_till, OTHER_TILL)

	# ------------------------------------------------------------------------------------------------ getting started on one column
	def test_getting_started_stands_on_one_column_in_the_order_a_till_is_set_up(self):
		groups = [group for group in registry.GROUPS.values() if group.tab == "setup"]

		self.assertEqual([group.key for group in groups], ["till_identity", "till_users", "restaurant_till"])
		self.assertEqual({group.column for group in groups}, {1})
