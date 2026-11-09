# //// Neoffice — added file (no upstream equivalent).
"""The tips of a restaurant by server (NeoResto lot 1, product owner, 04.11.2026).

The report a restaurant needs at the end of a day or a week to hand the tips out: one line per server and per way of paying
(cash, TWINT, card), what is still to distribute and what was already handed out, a total row. A cancelled tip is nobody's.
It is read by the shop manager's role, the one the reports of the point of sale are given to.
"""

import json
from unittest.mock import patch

import frappe
from frappe import _
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from pos_next.pos_next.doctype.restaurant.restaurant import Restaurant
from pos_next.pos_next.report.tips_by_server import tips_by_server

REPORT = "Tips by Server"
# Two users every site has: the report only needs somebody to attribute a tip to
FIRST, SECOND = "Administrator", "Guest"


class TestTheTipsReportAddsUpByServer(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.set_user, "Administrator")
		self.addCleanup(frappe.db.rollback)
		company = frappe.get_all("Company", limit=1, pluck="name")
		if not company:
			self.skipTest("The site has no company")
		# The tip account and the tip item are the restaurant's own test: switched off here
		for method in ("_ensure_tip_account", "_ensure_tip_item"):
			patcher = patch.object(Restaurant, method)
			patcher.start()
			self.addCleanup(patcher.stop)
		self.bistro = self.restaurant("_Test Tips Bistro", company[0])
		self.brasserie = self.restaurant("_Test Tips Brasserie", company[0])

	def restaurant(self, name, company):
		return (
			frappe.get_doc({"doctype": "Restaurant", "restaurant_name": name, "company": company})
			.insert(ignore_permissions=True)
			.name
		)

	def tip(self, amount, server=FIRST, way="Cash", status="Collected", restaurant=None, day=None):
		return (
			frappe.get_doc(
				{
					"doctype": "Restaurant Tip",
					"restaurant": restaurant or self.bistro,
					"tip_date": day or nowdate(),
					"amount": amount,
					"server": server,
					"payment_method": way,
					"status": status,
				}
			)
			.insert(ignore_permissions=True)
			.name
		)

	def lines(self, **filters):
		"""The lines of the report as the till's manager reads them: {(server, way): line}, and the filters it was asked with."""
		filters = {
			"from_date": add_days(nowdate(), -1),
			"to_date": nowdate(),
			"restaurant": self.bistro,
			**filters,
		}
		with as_role("till_manager"):
			columns, data = tips_by_server.execute(filters)
		return columns, {(row["server"], row["payment_method"]): row for row in data}

	def test_it_is_a_standard_report_of_the_restaurant_with_the_roles_that_read_the_tips(self):
		# The file the report is made from at a migrate: what a site holds is what this says
		with open(
			frappe.get_app_path("pos_next", "pos_next", "report", "tips_by_server", "tips_by_server.json")
		) as report:
			declared = json.load(report)

		self.assertEqual((declared["name"], declared["ref_doctype"]), (REPORT, "Restaurant Tip"))
		self.assertEqual((declared["report_type"], declared["is_standard"]), ("Script Report", "Yes"))
		roles = {row["role"] for row in declared["roles"]}
		self.assertTrue({"Restaurant Manager", "POSNext Manager"} <= roles, roles)

	def test_a_server_has_one_line_per_way_of_paying_with_what_is_to_distribute_and_what_was_handed_out(self):
		self.tip(5, way="Cash")
		self.tip(7.5, way="Cash")
		self.tip(10, way="TWINT")
		self.tip(4, way="Cash", status="Distributed")

		_columns, lines = self.lines()

		cash, twint = lines[(FIRST, "Cash")], lines[(FIRST, "TWINT")]
		self.assertEqual(
			(cash["tips"], cash["collected"], cash["distributed"], cash["total"]), (3, 12.5, 4, 16.5)
		)
		self.assertEqual(
			(twint["tips"], twint["collected"], twint["distributed"], twint["total"]), (1, 10, 0, 10)
		)

	def test_each_server_has_his_own_lines_with_the_name_the_desk_knows_him_by(self):
		self.tip(5, server=FIRST)
		self.tip(3, server=SECOND)

		_columns, lines = self.lines()

		self.assertEqual(lines[(FIRST, "Cash")]["total"], 5)
		self.assertEqual(lines[(SECOND, "Cash")]["total"], 3)
		self.assertEqual(
			lines[(SECOND, "Cash")]["server_name"], frappe.db.get_value("User", SECOND, "full_name")
		)

	def test_a_tip_nobody_took_is_on_a_line_that_says_so(self):
		self.tip(6, server=None)

		_columns, lines = self.lines()

		self.assertEqual(lines[(None, "Cash")]["total"], 6)
		self.assertEqual(lines[(None, "Cash")]["server_name"], _("No server"))

	def test_a_cancelled_tip_is_nobodys(self):
		self.tip(5)
		self.tip(50, status="Cancelled")

		_columns, lines = self.lines()

		self.assertEqual(lines[(FIRST, "Cash")]["total"], 5)

	def test_only_the_days_asked_for_are_counted(self):
		self.tip(5)
		self.tip(80, day=add_days(nowdate(), -10))

		_columns, lines = self.lines()

		self.assertEqual(lines[(FIRST, "Cash")]["total"], 5)

	def test_a_restaurant_is_read_apart_from_another(self):
		self.tip(5, restaurant=self.bistro)
		self.tip(90, restaurant=self.brasserie)

		_columns, lines = self.lines(restaurant=self.bistro)

		self.assertEqual(lines[(FIRST, "Cash")]["total"], 5)

	def test_the_status_filter_keeps_what_is_still_to_distribute(self):
		self.tip(5)
		self.tip(4, status="Distributed")

		_columns, lines = self.lines(status="Collected")

		self.assertEqual((lines[(FIRST, "Cash")]["collected"], lines[(FIRST, "Cash")]["distributed"]), (5, 0))

	def test_every_column_the_lines_carry_is_declared(self):
		self.tip(5)

		columns, lines = self.lines()

		declared = {column["fieldname"] for column in columns}
		for line in lines.values():
			self.assertTrue(set(line) <= declared, set(line) - declared)
