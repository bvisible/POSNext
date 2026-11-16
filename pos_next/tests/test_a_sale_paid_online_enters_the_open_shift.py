# //// Neoffice — added file (no upstream equivalent).
"""A table paid from its QR code enters the shift open at its till, and that shift's closing counts it on a line « Paid
online » the cashier does not count (maintenance#2485).

The closing reads only the sales of its shift, and `confirm_guest_payment` submitted the guest's order with the shift it
was saved at: none for an order a guest made. The sale was in no closing and no end-of-day report. Now it takes its till's
open shift (else one open at another till of its restaurant; else none, and a comment on the sale says so), and the
closing shows its payment apart from the amounts the cashier counts: a guest's money never went into the drawer.

The guest pays as `Guest`; the cashier opens his shift and reads its closing at the till; the test administrator stands
for the provider (a Payment Intent it settled, carrying the session's token as `create_guest_payment` writes it). The
suite rolls back.
"""

import json

import frappe
from frappe.utils import flt, now_datetime, nowdate

from pos_next.api import shifts
from pos_next.tests.test_a_guest_payment_is_booked_by_the_provider import PaymentCase
from pos_next.tests.test_till_writes_need_the_till import TILL


class SalePaidOnlineCase(PaymentCase):
	def a_settled_payment(self, amount):
		"""The guest's payment of the order as the provider settled it, with the session's token."""
		return frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": "succeeded",
				"amount": round(amount * 100),
				"currency": frappe.db.get_value("Sales Invoice", self.invoice, "currency"),
				"reference_doctype": "Sales Invoice",
				"reference_name": self.invoice,
				"metadata_json": frappe.as_json(
					{"tip": 0, "token": self.token.token, "mode_of_payment": self.fx.mode}
				),
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

	def the_cashier_opens_his_shift(self):
		frappe.set_user(TILL)
		try:
			opened = shifts.create_opening_shift(
				self.fx.profile,
				self.fx.company,
				json.dumps([{"mode_of_payment": self.fx.mode, "opening_amount": 0}]),
			)
		finally:
			frappe.set_user("Administrator")
		return opened["pos_opening_shift"]["name"]

	def a_shift_at(self, pos_profile, user="Administrator"):
		"""A shift open at another till, as the closing reads it."""
		name = f"_Test-PAID-ONLINE-{frappe.generate_hash(length=8)}"
		frappe.get_doc(
			{
				"doctype": "POS Opening Shift",
				"name": name,
				"docstatus": 1,
				"status": "Open",
				"user": user,
				"pos_profile": pos_profile,
				"company": self.fx.company,
				"period_start_date": now_datetime(),
				"posting_date": nowdate(),
				"idx": 0,
			}
		).db_insert()
		return name

	def the_guest_pays_the_whole_bill(self):
		self.dishes("Delivered")
		self.a_settled_payment(10)
		answer = self.confirm(10)
		self.assertTrue(answer["submitted"])
		return frappe.db.get_value(
			"Sales Invoice", self.invoice, ["docstatus", "posa_pos_opening_shift"], as_dict=True
		)

	def the_closing_of(self, shift):
		frappe.set_user(TILL)
		try:
			return shifts.get_closing_shift_data(shift)
		finally:
			frappe.set_user("Administrator")


class TestASalePaidOnlineEntersTheOpenShift(SalePaidOnlineCase):
	def test_a_table_paid_from_its_qr_code_enters_the_shift_open_at_its_till(self):
		shift = self.the_cashier_opens_his_shift()

		order = self.the_guest_pays_the_whole_bill()

		self.assertEqual((order.docstatus, order.posa_pos_opening_shift), (1, shift))

	def test_its_closing_counts_the_sale_and_shows_the_payment_apart_from_what_the_cashier_counts(self):
		shift = self.the_cashier_opens_his_shift()
		self.the_guest_pays_the_whole_bill()

		closing = self.the_closing_of(shift)

		sales = [row.get("sales_invoice") for row in closing["pos_transactions"]]
		self.assertIn(self.invoice, sales)
		self.assertEqual(flt(closing["paid_online_total"]), 10)
		self.assertEqual(closing["paid_online_count"], 1)
		# The guest's money never went into the drawer: the cash the cashier counts is only the opening's
		cash = next(
			row for row in closing["payment_reconciliation"] if row["mode_of_payment"] == self.fx.mode
		)
		self.assertEqual(flt(cash["expected_amount"]), 0)

	def test_with_no_shift_at_its_till_it_takes_one_open_at_another_till_of_its_restaurant(self):
		self.make_till(self.fx.other_profile, self.a)
		other = self.a_shift_at(self.fx.other_profile)

		order = self.the_guest_pays_the_whole_bill()

		self.assertEqual(order.posa_pos_opening_shift, other)

	def test_a_shift_at_a_till_of_another_restaurant_is_not_taken(self):
		self.make_till(self.fx.other_profile, self.b)
		self.a_shift_at(self.fx.other_profile)

		order = self.the_guest_pays_the_whole_bill()

		self.assertFalse(order.posa_pos_opening_shift)

	def test_with_no_till_of_its_restaurant_open_it_is_submitted_and_the_sale_says_it_is_in_no_closing(self):
		order = self.the_guest_pays_the_whole_bill()

		self.assertEqual(order.docstatus, 1)
		self.assertFalse(order.posa_pos_opening_shift)
		comments = frappe.get_all(
			"Comment",
			filters={
				"reference_doctype": "Sales Invoice",
				"reference_name": self.invoice,
				"comment_type": "Comment",
			},
			pluck="content",
		)
		self.assertTrue(any("in no closing" in (content or "") for content in comments), comments)


class TestWhatIsPaidOnline(SalePaidOnlineCase):
	def test_only_a_payment_a_guests_session_made_is_paid_online(self):
		guest = self.a_settled_payment(4)
		till = frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": "succeeded",
				"amount": 600,
				"currency": frappe.db.get_value("Sales Invoice", self.invoice, "currency"),
				"reference_doctype": "Sales Invoice",
				"reference_name": self.invoice,
				"metadata_json": frappe.as_json({"mode_of_payment": self.fx.mode}),
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

		from pos_next import paid_online

		references = paid_online.guest_settled_references([self.invoice])

		self.assertEqual(references, {self.invoice: {guest.provider_intent_id or guest.name}})
		self.assertNotIn(till.name, references[self.invoice])
