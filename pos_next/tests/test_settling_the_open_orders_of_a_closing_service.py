# //// Neoffice — added file (no upstream equivalent).
"""Settling an open order when the service closes (product owner, 08.11.2026).

« Si on clôture un restaurant, il ne doit pas y avoir de table ouverte […] on ne va pas laisser pour demain des tables qui ne sont pas clôturées. Donc il faut
pouvoir les traiter » — soit les considérer comme payées, les mettre sur ardoise, les offrir, les passer en perte client, ou les annuler (on supprime le brouillon).

The suite pins what `settle_open_order` does with each of the five issues:

- cashed late: a submitted invoice paid in cash, in the shift of whoever settles (the money goes into his till, as when a colleague cashes a table the waiter left);
- on a customer's tab: a submitted invoice with nothing paid, on the customer, where the till lets credit sales through;
- offered: a submitted invoice whose every line is offered, where the till lets its cashiers change a discount;
- a customer's loss: a submitted invoice paid by the restaurant's loss mode of payment, with the manager's approval where a rule of the gate asks for it;
- cancelled: the draft is deleted, the table is freed and the journal keeps what it held; refused once a dish was served, which is a sale, never deleted.

Every issue writes a row of the journal (`Restaurant Settlement`); a reason is required to offer, write off or cancel; an order that holds money is not settled here;
a stranger without a till is refused. The suite builds its own restaurants, tills, menu and orders (those of the notes suite) and rolls everything back. The people it
acts as are the waiter (the cashier of the till), a manager given by a rule of the gate, and an account with no till: never Administrator, who only prepares the scenery
(neoffice-maintenance#2125).
"""

import json

import frappe
from frappe.tests.roles import as_role
from frappe.utils import flt

from pos_next import offered
from pos_next.api import authorization, shifts
from pos_next.api import restaurant as restaurant_api
from pos_next.authorization import pin as pin_store
from pos_next.authorization.actions.write_off_order import ACTION_WRITE_OFF_ORDER
from pos_next.restaurant import settlement
from pos_next.tests.test_open_orders_and_the_cash_in_reminder import OpenOrdersCase
from pos_next.tests.test_till_writes_need_the_till import TILL, _user

LOSS_MODE = "_Test Customer Loss"
MANAGER = "settle-manager@yopmail.com"
APPROVER_ROLE = "_Test Settlement Approver"
PIN = "4826"
CUSTOMER = "_Test Settlement Customer"


class SettleCase(OpenOrdersCase):
	def setUp(self):
		super().setUp()
		# The waiter works at a real shift: the sales he settles are counted in it
		with self.waiter():
			opened = shifts.create_opening_shift(
				self.fx.profile,
				self.fx.company,
				json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
			)
		self.shift = opened["pos_opening_shift"]["name"]
		self.till_allows(credit=1, offers=1)

	def till_allows(self, credit, offers):
		"""The till's POS Settings (one row): credit sales and changing a discount, as the till reads them."""
		for name in frappe.get_all("POS Settings", filters={"pos_profile": self.fx.profile}, pluck="name"):
			frappe.delete_doc("POS Settings", name, force=True, ignore_permissions=True)
		doc = frappe.get_doc(
			{
				"doctype": "POS Settings",
				"pos_profile": self.fx.profile,
				"enabled": 1,
				"allow_credit_sale": credit,
				"allow_user_to_edit_item_discount": offers,
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)

	def loss_mode(self):
		"""A mode of payment the restaurant writes a customer's loss off with: the till's own account stands in for the accountant's holding account."""
		if not frappe.db.exists("Mode of Payment", LOSS_MODE):
			cash = frappe.get_doc("Mode of Payment", self.fx.mode)
			frappe.get_doc(
				{
					"doctype": "Mode of Payment",
					"mode_of_payment": LOSS_MODE,
					"type": "General",
					"enabled": 1,
					"accounts": [
						{"company": row.company, "default_account": row.default_account}
						for row in cash.accounts
					],
				}
			).insert(ignore_permissions=True)
		# ERPNext reads the mode's `enabled` through the document cache: a copy left by an earlier test must not stand in for this one
		frappe.db.set_value("Mode of Payment", LOSS_MODE, "enabled", 1)
		frappe.clear_document_cache("Mode of Payment", LOSS_MODE)
		frappe.db.set_value("Restaurant", self.a, settlement.LOSS_FIELD, LOSS_MODE)
		frappe.clear_document_cache("Restaurant", self.a)
		return LOSS_MODE

	def a_customer(self):
		if not frappe.db.exists("Customer", CUSTOMER):
			frappe.get_doc(
				{"doctype": "Customer", "customer_name": CUSTOMER, "customer_type": "Individual"}
			).insert(ignore_permissions=True)
		return CUSTOMER

	def clean_order(self, served=False, **changes):
		"""An open order of table T1 with no money posted on it (the notes suite saves its drafts with a payment row), served or not."""
		order = self.save(**changes)
		frappe.db.delete("Sales Invoice Payment", {"parent": order})
		frappe.db.set_value(
			"Sales Invoice", order, {"paid_amount": 0, "base_paid_amount": 0}, update_modified=False
		)
		if served:
			self.deliver_every_line(order)
		return order

	def settle(self, order, issue, **more):
		with self.waiter():
			return restaurant_api.settle_open_order(order, issue, **more)

	def journal_of(self, order):
		rows = frappe.get_all(settlement.JOURNAL, filters={"order": order}, fields=["*"])
		return rows[0] if rows else None

	def exists(self, order):
		return bool(frappe.db.exists("Sales Invoice", order))

	def docstatus(self, invoice):
		return frappe.db.get_value("Sales Invoice", invoice, "docstatus")


class TestWhatCanBeDoneWithAnOrder(SettleCase):
	def issues(self, order):
		with self.waiter():
			row = next(
				r for r in restaurant_api.get_open_orders(restaurant=self.a)["orders"] if r["name"] == order
			)
		return {issue: way["available"] for issue, way in row["issues"].items()}

	def test_an_order_that_nothing_served_may_be_cashed_put_on_a_tab_offered_or_cancelled_and_not_lost_without_a_loss_mode(
		self,
	):
		order = self.clean_order()

		self.assertEqual(
			self.issues(order),
			{"cashed": True, "tab": True, "offered": True, "loss": False, "cancelled": True},
		)

	def test_a_loss_mode_on_the_restaurant_makes_the_loss_available(self):
		order = self.clean_order()
		self.loss_mode()

		self.assertTrue(self.issues(order)["loss"])

	def test_an_order_with_a_dish_served_is_never_cancelled(self):
		order = self.clean_order(served=True)

		available = self.issues(order)
		self.assertFalse(available["cancelled"])
		self.assertTrue(available["cashed"])

	def test_the_tab_needs_the_till_to_allow_credit_sales_and_the_offer_its_cashiers_to_change_a_discount(
		self,
	):
		order = self.clean_order()
		self.till_allows(credit=0, offers=0)

		available = self.issues(order)

		self.assertFalse(available["tab"])
		self.assertFalse(available["offered"])
		self.assertTrue(available["cashed"])

	def test_an_order_that_holds_money_is_settled_by_none_of_them(self):
		order = self.clean_order()
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 12, update_modified=False)

		self.assertEqual(set(self.issues(order).values()), {False})

	def test_the_value_of_offering_the_order_is_told_at_list_price(self):
		order = self.clean_order()

		with self.waiter():
			row = next(
				r for r in restaurant_api.get_open_orders(restaurant=self.a)["orders"] if r["name"] == order
			)

		expected = frappe.db.sql(
			"select sum(qty * price_list_rate) from `tabSales Invoice Item` where parent = %s", order
		)[0][0]
		self.assertGreater(row["offer_value"], 0)
		self.assertEqual(row["offer_value"], flt(expected, 2))

	def test_the_caller_is_told_which_orders_are_his(self):
		order = self.clean_order()

		with self.waiter():
			rows = restaurant_api.get_open_orders(restaurant=self.a)["orders"]

		self.assertTrue(next(r for r in rows if r["name"] == order)["mine"])
		frappe.db.set_value("Sales Invoice", order, "owner", "Administrator", update_modified=False)
		with self.waiter():
			rows = restaurant_api.get_open_orders(restaurant=self.a)["orders"]
		self.assertFalse(next(r for r in rows if r["name"] == order)["mine"])


class TestCashedLate(SettleCase):
	def test_the_order_becomes_an_invoice_paid_in_cash_in_the_shift_that_settles_it(self):
		order = self.clean_order(served=True)

		answer = self.settle(order, "cashed")

		self.assertEqual(answer["issue"], "cashed")
		invoice = answer["invoice"]
		self.assertEqual(self.docstatus(invoice), 1)
		paid = frappe.get_all(
			"Sales Invoice Payment", filters={"parent": invoice}, fields=["mode_of_payment", "amount"]
		)
		self.assertEqual([row.mode_of_payment for row in paid], [self.fx.mode])
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.assertEqual(flt(paid[0].amount), flt(total))
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "posa_pos_opening_shift"), self.shift)

	def test_the_table_does_not_stay_occupied_by_an_order_that_is_settled(self):
		order = self.clean_order(served=True)

		self.settle(order, "cashed")

		self.assertNotEqual(self.status_of_table(), "Occupied")

	def test_the_journal_says_what_happened_and_who_did_it(self):
		order = self.clean_order(served=True)

		answer = self.settle(order, "cashed")

		entry = self.journal_of(order)
		self.assertEqual(entry.issue, "Cashed late")
		self.assertEqual(entry.invoice, answer["invoice"])
		self.assertEqual((entry.table_label, entry.consumed), ("T1", 1))
		self.assertEqual(entry.restaurant, self.a)
		self.assertEqual(entry.settled_by, TILL)
		self.assertEqual(entry.waiter, TILL)
		self.assertEqual(entry.service_day, frappe.utils.getdate())

	def test_a_colleague_settles_the_order_the_waiter_left_and_the_money_is_his(self):
		order = self.clean_order(served=True)
		frappe.db.set_value("Sales Invoice", order, "owner", "Administrator", update_modified=False)

		answer = self.settle(order, "cashed")

		self.assertEqual(
			frappe.db.get_value("Sales Invoice", answer["invoice"], "posa_pos_opening_shift"), self.shift
		)
		self.assertEqual(self.journal_of(order).waiter, "Administrator")


class TestOnACustomersTab(SettleCase):
	def test_the_order_becomes_an_invoice_on_the_customers_account(self):
		order = self.clean_order(served=True)
		customer = self.a_customer()

		answer = self.settle(order, "tab", customer=customer)

		invoice = answer["invoice"]
		self.assertEqual(self.docstatus(invoice), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "customer"), customer)
		self.assertGreater(flt(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount")), 0)
		self.assertEqual(self.journal_of(order).customer, customer)

	def test_a_customer_is_required(self):
		order = self.clean_order(served=True)

		for customer in (None, "", "no such customer"):
			with self.subTest(customer=customer), self.assertRaises(frappe.ValidationError):
				self.settle(order, "tab", customer=customer)

		self.assertTrue(self.exists(order))

	def test_a_till_that_allows_no_credit_refuses_it(self):
		order = self.clean_order(served=True)
		self.till_allows(credit=0, offers=1)

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "tab", customer=self.a_customer())

		self.assertTrue(self.exists(order))


class TestOffered(SettleCase):
	def test_every_line_is_offered_and_the_invoice_is_submitted_for_nothing(self):
		order = self.clean_order(served=True)

		answer = self.settle(order, "offered", reason="The kitchen was late")

		invoice = answer["invoice"]
		self.assertEqual(self.docstatus(invoice), 1)
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", invoice, "grand_total")), 0)
		rows = frappe.get_all(
			"Sales Invoice Item", filters={"parent": invoice}, fields=[offered.FIELD, "discount_percentage"]
		)
		self.assertTrue(rows)
		self.assertEqual({(row[offered.FIELD], flt(row.discount_percentage)) for row in rows}, {(1, 100.0)})
		entry = self.journal_of(order)
		self.assertEqual((entry.issue, entry.reason), ("Offered", "The kitchen was late"))

	def test_a_reason_is_required(self):
		order = self.clean_order(served=True)

		for reason in (None, "", "   "):
			with self.subTest(reason=reason), self.assertRaises(frappe.ValidationError):
				self.settle(order, "offered", reason=reason)

		self.assertTrue(self.exists(order))

	def test_a_till_that_lets_no_cashier_change_a_discount_refuses_it(self):
		order = self.clean_order(served=True)
		self.till_allows(credit=1, offers=0)

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "offered", reason="A gesture")

		self.assertTrue(self.exists(order))


class TestACustomersLoss(SettleCase):
	def test_the_order_becomes_an_invoice_paid_by_the_loss_mode(self):
		self.loss_mode()
		order = self.clean_order(served=True)

		answer = self.settle(order, "loss", reason="Left without paying", complaint_filed=1)

		invoice = answer["invoice"]
		self.assertEqual(self.docstatus(invoice), 1)
		paid = frappe.get_all("Sales Invoice Payment", filters={"parent": invoice}, pluck="mode_of_payment")
		self.assertEqual(paid, [LOSS_MODE])
		entry = self.journal_of(order)
		self.assertEqual(
			(entry.issue, entry.reason, entry.complaint_filed), ("Customer loss", "Left without paying", 1)
		)
		self.assertEqual(entry.invoice, invoice)

	def test_the_loss_needs_a_mode_on_the_restaurant_and_a_reason(self):
		order = self.clean_order(served=True)

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "loss", reason="Left without paying")

		self.loss_mode()
		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "loss")
		self.assertTrue(self.exists(order))

	def test_the_complaint_is_only_kept_for_a_loss(self):
		order = self.clean_order(served=True)

		self.settle(order, "cashed", complaint_filed=1)

		self.assertEqual(self.journal_of(order).complaint_filed, 0)


class TestCancelled(SettleCase):
	def test_the_draft_is_deleted_the_table_is_freed_and_the_journal_keeps_what_it_held(self):
		order = self.clean_order()

		answer = self.settle(order, "cancelled", reason="Left before being served")

		self.assertIsNone(answer["invoice"])
		self.assertFalse(self.exists(order))
		self.assertEqual(self.status_of_table(), "Empty")
		entry = self.journal_of(order)
		self.assertEqual(
			(entry.issue, entry.reason, entry.consumed), ("Cancelled", "Left before being served", 0)
		)
		held = json.loads(entry.lines)
		self.assertTrue(held["lines"])
		self.assertGreater(held["grand_total"], 0)

	def test_a_reason_is_required(self):
		order = self.clean_order()

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "cancelled")

		self.assertTrue(self.exists(order))
		self.assertIsNone(self.journal_of(order))

	def test_an_order_with_a_dish_served_is_refused_and_stays_whole(self):
		order = self.clean_order(served=True)

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "cancelled", reason="Oops")

		self.assertTrue(self.exists(order))
		self.assertIsNone(self.journal_of(order))

	def test_another_note_of_the_table_keeps_it_occupied(self):
		first, second = self.two_notes()
		for note in (first, second):
			frappe.db.delete("Sales Invoice Payment", {"parent": note})
			frappe.db.set_value(
				"Sales Invoice", note, {"paid_amount": 0, "base_paid_amount": 0}, update_modified=False
			)

		self.settle(first, "cancelled", reason="Left before being served")

		self.assertTrue(self.exists(second))
		self.assertEqual(self.status_of_table(), "Occupied")


class TestWhatIsRefused(SettleCase):
	def test_an_order_that_holds_money_is_not_settled_here(self):
		order = self.clean_order(served=True)
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 12, update_modified=False)

		for issue in settlement.ISSUES:
			with self.subTest(issue=issue), self.assertRaises(frappe.ValidationError):
				self.settle(order, issue, reason="Nope", customer=self.a_customer())

		self.assertTrue(self.exists(order))

	def test_an_unknown_issue_is_refused(self):
		order = self.clean_order()

		for issue in ("forgiven", "", None, ["cashed"]):
			with self.subTest(issue=issue), self.assertRaises((frappe.ValidationError, TypeError)):
				self.settle(order, issue)

	def test_a_stranger_without_a_till_is_refused(self):
		order = self.clean_order(served=True)

		with as_role("portal_customer"), self.assertRaises(frappe.PermissionError):
			restaurant_api.settle_open_order(order, "cashed")

		self.assertTrue(self.exists(order))

	def test_an_invoice_that_is_no_open_order_is_refused(self):
		order = self.clean_order(served=True)
		answer = self.settle(order, "cashed")

		with self.assertRaises(frappe.ValidationError):
			self.settle(answer["invoice"], "cashed")

		with self.assertRaises(frappe.ValidationError):
			self.settle("no such invoice", "cashed")

	def test_nothing_is_settled_without_a_shift(self):
		order = self.clean_order(served=True)
		frappe.db.set_value("POS Opening Shift", self.shift, "status", "Closed")

		with self.assertRaises(frappe.ValidationError):
			self.settle(order, "cashed")

		self.assertTrue(self.exists(order))


class TestTheManagersApproval(SettleCase):
	def setUp(self):
		super().setUp()
		# A refusal of the authorization gate logs itself after the next full rollback, and commits: the test's own rollback must not write it to the site
		self.addCleanup(frappe.db.after_rollback.reset)
		if not frappe.db.exists("Role", APPROVER_ROLE):
			frappe.get_doc({"doctype": "Role", "role_name": APPROVER_ROLE, "desk_access": 1}).insert(
				ignore_permissions=True
			)
		_user(MANAGER, [APPROVER_ROLE], "System User")
		pin_store.set_pin(MANAGER, PIN)
		self.loss_mode()

	def a_rule(self):
		frappe.get_doc(
			{
				"doctype": "POS Authorization Rule",
				"action": ACTION_WRITE_OFF_ORDER,
				"enabled": 1,
				"pos_profile": self.fx.profile,
				"allow_self_approval": 0,
				"approvers": [{"approver_type": "Role", "role": APPROVER_ROLE}],
			}
		).insert(ignore_permissions=True)

	def grant_for(self, order):
		with self.waiter():
			answer = authorization.request_grant(
				ACTION_WRITE_OFF_ORDER, MANAGER, PIN, context=json.dumps({"invoice": order})
			)
		self.assertTrue(answer.get("authorized"), answer.get("message"))
		return answer["grant_token"]

	def test_no_rule_nobody_is_asked(self):
		order = self.clean_order(served=True)

		self.assertEqual(self.docstatus(self.settle(order, "loss", reason="Gone")["invoice"]), 1)

	def test_with_a_rule_a_loss_is_refused_without_the_managers_grant(self):
		self.a_rule()
		order = self.clean_order(served=True)

		with self.assertRaises(frappe.ValidationError) as refused:
			self.settle(order, "loss", reason="Gone")

		self.assertIn("requires authorization", str(refused.exception))
		self.assertTrue(self.exists(order))
		self.assertIsNone(self.journal_of(order))

	def test_with_the_grant_the_loss_goes_through_and_names_the_manager(self):
		self.a_rule()
		order = self.clean_order(served=True)
		token = self.grant_for(order)

		answer = self.settle(order, "loss", reason="Gone", authorization_token=token)

		self.assertEqual(self.docstatus(answer["invoice"]), 1)
		self.assertEqual(self.journal_of(order).approved_by, MANAGER)

	def test_a_grant_is_for_one_order(self):
		self.a_rule()
		first = self.clean_order(served=True)
		token = self.grant_for(first)
		second = self.clean_order(served=True, restaurant_table=self.table_a2)

		with self.assertRaises(frappe.ValidationError):
			self.settle(second, "loss", reason="Gone", authorization_token=token)

		self.assertTrue(self.exists(second))

	def test_the_grant_context_is_the_orders_never_the_clients(self):
		self.a_rule()
		order = self.clean_order(served=True)

		with self.waiter(), self.assertRaises(frappe.ValidationError):
			authorization.request_grant(
				ACTION_WRITE_OFF_ORDER,
				MANAGER,
				PIN,
				context=json.dumps({"invoice": order, "pos_profile": "another till"}),
			)

	def test_the_action_is_registered_and_offered_to_the_rules(self):
		from pos_next.authorization import registry

		self.assertIsNotNone(registry.get(ACTION_WRITE_OFF_ORDER))
		path = frappe.get_app_path(
			"pos_next",
			"pos_next_auth_gate",
			"doctype",
			"pos_authorization_rule",
			"pos_authorization_rule.json",
		)
		with open(path) as source:
			options = next(f["options"] for f in json.load(source)["fields"] if f["fieldname"] == "action")
		self.assertIn(ACTION_WRITE_OFF_ORDER, options.split("\n"))
