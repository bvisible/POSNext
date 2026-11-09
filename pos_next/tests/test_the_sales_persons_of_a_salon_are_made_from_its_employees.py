# //// Neoffice — added file (no upstream equivalent).
"""The sales persons of a salon are its employees who have an account of the till (NeoSalon, step 1, lot G1.2; product owner, 09.11.2026).

ERPNext ties a Sales Person to at most one Employee and nothing makes the first from the second, so a salon that turns on the till's
« who did the work » would make a Sales Person by hand for each hairdresser. `pos_next.sales_staff` makes them, but only on a site where a
till asks for a sales person, and only for the employees whose account holds a role of the till (« POSNext Cashier » or « POSNext
Manager »): every desk user is an employee, and the reception and the accountant are not people who do the work (« comptes de caisse
seuls », product owner, 09.11.2026).

The suite pins:

- that nothing is made while no till asks for a sales person;
- that an Active employee with an account of the till, saved while a till asks, gets one, under the root of the sales team, in the
  employee's company, which the till then lists; a name another sales person has taken gets the employee's id;
- that an employee with no account, or whose account holds no role of the till, gets none, and that one who is given the role later, or
  linked to such an account later, gets it then;
- that an account that loses its role of the till has the Sales Person of its employee disabled and never deleted, and enabled again when
  the role comes back, while one that only changes from one role of the till to the other keeps it;
- that an employee who leaves has the Sales Person disabled and never deleted, and that one who comes back has it enabled again;
- that a Sales Person an administrator disabled or deleted stays so while the employee's status does not change;
- that turning the setting on makes the missing ones for the employees who have an account of the till, and does nothing the second time;
- that the migration of a site where a till already asks makes them too, and does nothing where none does.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next import sales_staff
from pos_next.patches.neosalon import make_the_sales_persons_of_the_employees as the_patch
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

PREFIX = "TestSS"
MANAGER_ROLE = "POSNext Manager"


def _email(first_name):
	return f"testss-{first_name.lower()}@yopmail.com"


def _forget_the_staff_of_the_suite():
	for name in frappe.get_all("Employee", filters={"first_name": ["like", f"{PREFIX}%"]}, pluck="name"):
		for person in frappe.get_all("Sales Person", filters={"employee": name}, pluck="name"):
			frappe.delete_doc("Sales Person", person, ignore_permissions=True, force=True)
		frappe.delete_doc("Employee", name, ignore_permissions=True, force=True)
	for person in frappe.get_all(
		"Sales Person", filters={"sales_person_name": ["like", f"{PREFIX}%"]}, pluck="name"
	):
		frappe.delete_doc("Sales Person", person, ignore_permissions=True, force=True)
	for user in frappe.get_all("User", filters={"name": ["like", "testss-%"]}, pluck="name"):
		frappe.delete_doc("User", user, ignore_permissions=True, force=True)


class TestTheSalesPersonsOfASalonAreMadeFromItsEmployees(FrappeTestCase):
	def setUp(self):
		super().setUp()
		_forget_the_staff_of_the_suite()
		self.addCleanup(_forget_the_staff_of_the_suite)
		_user(TILL, [CASHIER_ROLE, "Sales User"], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")  # the fixture's second till names it
		self.fx = _till_fixture()
		# No other till of the site asks for a sales person while the suite runs (the transaction is rolled back at the end of the class)
		frappe.db.sql("update `tabPOS Settings` set enable_sales_persons = 'Disabled'")
		self.addCleanup(frappe.set_user, "Administrator")

	def a_till_asks(self, value="Single"):
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", value)

	def an_account(self, first_name, roles=(CASHIER_ROLE,)):
		"""The account of an employee: a cashier's by default."""
		_user(_email(first_name), list(roles), "System User")
		return _email(first_name)

	def an_employee(self, first_name="TestSSAnna", account="cashier", **changes):
		"""An Employee; `account`: "cashier" (an account with a role of the till), "none", "no till role", "manager", or the name of a User."""
		if account == "cashier":
			user = self.an_account(first_name)
		elif account == "manager":
			user = self.an_account(first_name, (MANAGER_ROLE,))
		elif account == "no till role":
			user = self.an_account(first_name, ("Sales User",))
		elif account == "none":
			user = None
		else:
			user = account
		values = {
			"doctype": "Employee",
			"first_name": first_name,
			"gender": frappe.get_all("Gender", pluck="name", limit=1)[0],
			"date_of_birth": "1990-01-01",
			"date_of_joining": "2024-01-01",
			"company": self.fx.company,
			"status": "Active",
			"user_id": user,
			**changes,
		}
		return frappe.get_doc(values).insert(ignore_permissions=True)

	def its_sales_person(self, employee):
		fields = ["name", "enabled", "parent_sales_person", "is_group"]
		# A site carries the company of a Sales Person only when something added the column (the till filters on it then)
		if frappe.db.has_column("Sales Person", "company"):
			fields.append("company")
		return frappe.db.get_value("Sales Person", {"employee": employee}, fields, as_dict=True)

	def turn_the_setting_on(self):
		settings = frappe.get_doc("POS Settings", {"pos_profile": self.fx.profile})
		settings.enable_sales_persons = "Single"
		settings.save(ignore_permissions=True)

	# Where no till asks, nothing is made

	def test_no_sales_person_is_made_while_no_till_asks_for_one(self):
		employee = self.an_employee()

		self.assertIsNone(self.its_sales_person(employee.name))
		self.assertFalse(sales_staff.option_is_on())

	def test_a_till_that_is_switched_off_does_not_count(self):
		self.a_till_asks()
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enabled", 0)

		self.assertFalse(sales_staff.option_is_on())
		self.assertIsNone(self.its_sales_person(self.an_employee().name))

	# An employee with an account of the till, saved while a till asks

	def test_an_active_employee_with_a_cashier_account_gets_a_sales_person_under_the_root_in_the_employees_company(
		self,
	):
		self.a_till_asks()

		employee = self.an_employee()
		person = self.its_sales_person(employee.name)

		self.assertTrue(person)
		self.assertEqual(person.name, employee.employee_name)
		self.assertEqual((person.enabled, person.is_group), (1, 0))
		self.assertEqual(person.parent_sales_person, sales_staff._root_of_the_team())
		if frappe.db.has_column("Sales Person", "company"):
			self.assertEqual(person.company, self.fx.company)

	def test_the_account_of_a_till_manager_counts_too(self):
		self.a_till_asks()

		self.assertTrue(self.its_sales_person(self.an_employee(account="manager").name))

	def test_the_till_lists_the_sales_person_made_and_marks_it_as_the_cashiers_own(self):
		from pos_next.api import pos_profile

		self.a_till_asks()
		employee = self.an_employee(account=TILL)
		frappe.set_user(TILL)

		offered = {row["name"]: row for row in pos_profile.get_sales_persons(self.fx.profile)}

		self.assertEqual(offered[self.its_sales_person(employee.name).name]["is_mine"], 1)

	def test_a_name_another_sales_person_has_taken_is_told_apart_by_the_employees_id(self):
		self.a_till_asks()
		root = sales_staff._root_of_the_team()
		frappe.get_doc(
			{
				"doctype": "Sales Person",
				"sales_person_name": "TestSSBea",
				"parent_sales_person": root,
				"is_group": 0,
			}
		).insert(ignore_permissions=True)

		employee = self.an_employee("TestSSBea")
		person = self.its_sales_person(employee.name)

		self.assertNotEqual(person.name, "TestSSBea")
		self.assertIn(employee.name, person.name)
		self.assertEqual(frappe.db.get_value("Sales Person", "TestSSBea", "employee"), None)

	def test_saving_the_employee_again_makes_no_second_one(self):
		self.a_till_asks()
		employee = self.an_employee()

		employee.reload()
		employee.designation = employee.designation
		employee.save(ignore_permissions=True)

		self.assertEqual(frappe.db.count("Sales Person", {"employee": employee.name}), 1)

	# Only the accounts of the till

	def test_an_employee_with_no_account_gets_none(self):
		self.a_till_asks()

		self.assertIsNone(self.its_sales_person(self.an_employee(account="none").name))

	def test_an_employee_whose_account_holds_no_role_of_the_till_gets_none(self):
		self.a_till_asks()

		self.assertIsNone(self.its_sales_person(self.an_employee(account="no till role").name))

	def test_an_account_given_the_role_of_the_till_later_makes_the_sales_person_of_its_employee(self):
		self.a_till_asks()
		employee = self.an_employee(account="no till role")
		self.assertIsNone(self.its_sales_person(employee.name))

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.append("roles", {"role": CASHIER_ROLE})
		user.save(ignore_permissions=True)

		self.assertTrue(self.its_sales_person(employee.name))

	def test_an_employee_linked_to_an_account_of_the_till_later_gets_a_sales_person_then(self):
		self.a_till_asks()
		employee = self.an_employee(account="none")
		self.assertIsNone(self.its_sales_person(employee.name))
		self.an_account("TestSSAnna")

		employee.reload()
		employee.user_id = _email("TestSSAnna")
		employee.save(ignore_permissions=True)

		self.assertTrue(self.its_sales_person(employee.name))

	def test_a_sales_person_an_administrator_deleted_is_not_remade_when_the_account_already_had_the_role(
		self,
	):
		self.a_till_asks()
		employee = self.an_employee()
		frappe.delete_doc(
			"Sales Person", self.its_sales_person(employee.name).name, ignore_permissions=True, force=True
		)

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.append("roles", {"role": "Blogger"})
		user.save(ignore_permissions=True)

		self.assertIsNone(self.its_sales_person(employee.name))

	# The role of the till changes after the fact

	def test_an_account_that_loses_every_role_of_the_till_has_its_sales_person_disabled_and_not_deleted(self):
		self.a_till_asks()
		employee = self.an_employee()
		self.assertEqual(self.its_sales_person(employee.name).enabled, 1)

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.remove_roles(CASHIER_ROLE)

		person = self.its_sales_person(employee.name)
		self.assertTrue(person)
		self.assertEqual(person.enabled, 0)

	def test_an_account_that_gets_the_role_back_has_its_sales_person_enabled_again_and_makes_no_second(self):
		self.a_till_asks()
		employee = self.an_employee()
		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.remove_roles(CASHIER_ROLE)
		self.assertEqual(self.its_sales_person(employee.name).enabled, 0)

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.add_roles(CASHIER_ROLE)

		self.assertEqual(frappe.db.count("Sales Person", {"employee": employee.name}), 1)
		self.assertEqual(self.its_sales_person(employee.name).enabled, 1)

	def test_an_account_that_changes_from_one_role_of_the_till_to_the_other_keeps_its_sales_person(self):
		self.a_till_asks()
		employee = self.an_employee()

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.add_roles(MANAGER_ROLE)
		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.remove_roles(CASHIER_ROLE)

		self.assertEqual(self.its_sales_person(employee.name).enabled, 1)

	def test_an_account_that_loses_the_role_changes_nothing_while_no_till_asks(self):
		employee = self.an_employee()
		self.a_till_asks()
		frappe.db.set_value(
			"POS Settings", {"pos_profile": self.fx.profile}, "enable_sales_persons", "Disabled"
		)

		user = frappe.get_doc("User", _email("TestSSAnna"))
		user.remove_roles(CASHIER_ROLE)

		self.assertIsNone(self.its_sales_person(employee.name))

	# An employee who leaves, and who comes back

	def test_an_employee_who_leaves_has_the_sales_person_disabled_and_not_deleted(self):
		self.a_till_asks()
		employee = self.an_employee()

		employee.reload()
		employee.status = "Left"
		employee.relieving_date = "2026-01-31"
		employee.save(ignore_permissions=True)

		person = self.its_sales_person(employee.name)
		self.assertTrue(person)
		self.assertEqual(person.enabled, 0)

	def test_an_employee_who_comes_back_has_it_enabled_again_and_makes_no_second(self):
		self.a_till_asks()
		employee = self.an_employee()
		employee.reload()
		employee.status = "Inactive"
		employee.save(ignore_permissions=True)

		employee.reload()
		employee.status = "Active"
		employee.save(ignore_permissions=True)

		self.assertEqual(frappe.db.count("Sales Person", {"employee": employee.name}), 1)
		self.assertEqual(self.its_sales_person(employee.name).enabled, 1)

	def test_a_sales_person_an_administrator_disabled_stays_disabled_while_the_status_is_the_same(self):
		self.a_till_asks()
		employee = self.an_employee()
		frappe.db.set_value("Sales Person", self.its_sales_person(employee.name).name, "enabled", 0)

		employee.reload()
		employee.department = employee.department
		employee.save(ignore_permissions=True)

		self.assertEqual(self.its_sales_person(employee.name).enabled, 0)

	def test_a_sales_person_an_administrator_deleted_is_not_made_again_while_the_status_is_the_same(self):
		self.a_till_asks()
		employee = self.an_employee()
		frappe.delete_doc(
			"Sales Person", self.its_sales_person(employee.name).name, ignore_permissions=True, force=True
		)

		employee.reload()
		employee.save(ignore_permissions=True)

		self.assertIsNone(self.its_sales_person(employee.name))

	# The employees who exist when the setting is turned on

	def test_turning_the_setting_on_makes_the_missing_ones_for_the_accounts_of_the_till_only(self):
		with_account = self.an_employee("TestSSAnna")
		without_account = self.an_employee("TestSSCleo", account="none")
		reception = self.an_employee("TestSSDora", account="no till role")
		for employee in (with_account, without_account, reception):
			self.assertIsNone(self.its_sales_person(employee.name))

		self.turn_the_setting_on()

		self.assertTrue(self.its_sales_person(with_account.name))
		self.assertIsNone(self.its_sales_person(without_account.name))
		self.assertIsNone(self.its_sales_person(reception.name))

	def test_saving_a_till_that_already_asks_makes_none_more(self):
		self.a_till_asks()
		employee = self.an_employee()
		frappe.delete_doc(
			"Sales Person", self.its_sales_person(employee.name).name, ignore_permissions=True, force=True
		)

		settings = frappe.get_doc("POS Settings", {"pos_profile": self.fx.profile})
		settings.enable_sales_persons = "Multiple"
		settings.save(ignore_permissions=True)

		self.assertIsNone(self.its_sales_person(employee.name))

	def test_an_employee_who_is_not_active_is_given_none_when_the_setting_is_turned_on(self):
		employee = self.an_employee(status="Inactive")

		self.turn_the_setting_on()

		self.assertIsNone(self.its_sales_person(employee.name))

	# The migration

	def test_the_migration_of_a_site_where_a_till_asks_makes_the_missing_ones_of_the_accounts_of_the_till(
		self,
	):
		employee = self.an_employee()
		other = self.an_employee("TestSSCleo", account="none")
		self.a_till_asks()

		the_patch.execute()

		self.assertTrue(self.its_sales_person(employee.name))
		self.assertIsNone(self.its_sales_person(other.name))

	def test_the_migration_of_a_site_where_no_till_asks_makes_none(self):
		employee = self.an_employee()

		the_patch.execute()

		self.assertIsNone(self.its_sales_person(employee.name))
