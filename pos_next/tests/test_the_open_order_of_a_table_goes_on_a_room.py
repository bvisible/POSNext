# //// Neoffice — added file (no upstream equivalent).
"""The open order of a table put on a hotel room, by what someone says (« mets la table T1 sur la chambre 101 »).

`pos_next.restaurant.room_settlement` looks first (`preview`, which writes nothing) and then does it (`put_on_room`), by the till's own `submit_invoice` with `room_charge`,
in the till and the shift of whoever asks. The till knows nothing of hotels: a provider module stands in for the hotel app here, as in the suite that pins what the payment
window asks of it.

What is pinned:

- the preview names the open order of the table and the one stay the room number says exactly, and writes nothing: the order stays an open draft and the hotel's `post` is
  never called;
- whatever is not clear is an answer, never a guess: no open order, several (a table with two notes), no stay, a room that starts like another one, a room that takes no charge,
  money already posted, a refusal of the hotel before the sale, no shift, no hotel at all;
- the sale goes through `submit_invoice`: the order is submitted in the name of the stay's customer, the hotel puts it on the bill once, and a refusal of the hotel takes
  everything back (the order is still an open draft);
- an order changed since it was shown is refused; a visitor, a portal account and a desk account with no till ask nothing, whoever they say they are. The act is played by the
  waiter (the cashier of the till), never by Administrator, who only prepares the scenery (neoffice-maintenance#2125).
"""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role

from pos_next import room_charge
from pos_next.restaurant import room_settlement, settlement
from pos_next.tests.test_settling_the_open_orders_of_a_closing_service import SettleCase

STAYS = [
	{
		"reservation": "RES-101",
		"room": "R-101",
		"room_number": "101",
		"guest_name": "Test Guest One",
		"check_out_date": "2099-01-02",
		"takes_charges": 1,
	},
	{
		"reservation": "RES-1010",
		"room": "R-1010",
		"room_number": "1010",
		"guest_name": "Test Guest Two",
		"check_out_date": "2099-01-03",
		"takes_charges": 1,
	},
	{
		"reservation": "RES-102",
		"room": "R-102",
		"room_number": "102",
		"guest_name": "Test Guest Three",
		"check_out_date": "2099-01-04",
		"takes_charges": 0,
	},
]


class AHotel:
	"""What the hotel app answers the till, and what it was asked to do."""

	def __init__(self, customer, stays=STAYS, available=True, refuse_before=None, refuse_at_post=None):
		self.customer, self.stays = customer, stays
		self.posted, self.prepared = [], []
		self.refuse_before, self.refuse_at_post = refuse_before, refuse_at_post
		self.available = available

	def status(self):
		return {
			"offered": True,
			"available": self.available,
			"reason": None if self.available else "The hotel's accounts are off.",
		}

	def search_stays(self, text):
		text = (text or "").strip().lower()
		return [s for s in self.stays if s["room_number"].startswith(text) or text in s["guest_name"].lower()]

	def prepare(self, invoice, reservation):
		self.prepared.append(reservation)
		if self.refuse_before:
			frappe.throw(self.refuse_before)
		invoice.customer = self.customer
		return self.customer

	def post(self, invoice, reservation):
		if self.refuse_at_post:
			frappe.throw(self.refuse_at_post)
		self.posted.append((invoice.name, reservation))
		return {
			"folio": "FOLIO-1",
			"ticket_id": invoice.name,
			"amount": invoice.grand_total,
			"duplicate": False,
		}

	def room_of(self, sale):
		return {"room_number": "101", "released": False} if (sale, "RES-101") in self.posted else None

	def module(self):
		return SimpleNamespace(
			status=self.status,
			search_stays=self.search_stays,
			prepare=self.prepare,
			post=self.post,
			room_of=self.room_of,
		)


class RoomCase(SettleCase):
	def setUp(self):
		super().setUp()
		# the till is the one of restaurant A: a till whose settings name no restaurant is no restaurant till and has no table to put on a room
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "restaurant", self.a)
		self.customer = self.a_customer()
		self.hotel = AHotel(self.customer)

	def as_the_waiter(self):
		"""The cashier of the till, whoever opens a table and takes its order: the act is played by this account, never by Administrator."""
		return self.waiter()

	def with_hotel(self, hotel=None):
		return patch.object(room_charge, "provider", return_value=(hotel or self.hotel).module())

	def look(self, **asked):
		with self.as_the_waiter():
			return room_settlement.preview(**asked)

	def put(self, order, reservation="RES-101", **more):
		with self.as_the_waiter():
			return room_settlement.put_on_room(order, reservation, **more)

	def a_table_order(self):
		return self.clean_order()


class TestTheOrderOfATableIsLookedAtFirst(RoomCase):
	def test_the_order_and_the_stay_are_named_and_nothing_is_written(self):
		order = self.a_table_order()
		before = frappe.db.get_value("Sales Invoice", order, ["modified", "docstatus", "customer"])

		with self.with_hotel():
			seen = self.look(table="T1", room="101")

		self.assertTrue(seen["ok"], seen)
		self.assertEqual((seen["order"]["invoice"], seen["order"]["table"]), (order, "T1"))
		self.assertGreater(seen["order"]["total"], 0)
		self.assertTrue(seen["order"]["lines"])
		self.assertEqual(
			seen["stay"]["reservation"], "RES-101", "the room said EXACTLY: 1010 is another room"
		)
		self.assertEqual(seen["stay"]["guest_name"], "Test Guest One")
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", order, ["modified", "docstatus", "customer"]), before
		)
		self.assertEqual(self.hotel.posted, [], "nothing is put on a bill by looking")

	def test_the_table_is_said_in_any_case(self):
		order = self.a_table_order()
		with self.with_hotel():
			self.assertEqual(self.look(table="t1", room="101")["order"]["invoice"], order)

	def test_the_provider_is_asked_its_refusals_on_a_copy_that_is_never_saved(self):
		order = self.a_table_order()
		with self.with_hotel():
			self.look(table="T1", room="101")
		self.assertEqual(self.hotel.prepared, ["RES-101"])
		self.assertNotEqual(
			frappe.db.get_value("Sales Invoice", order, "customer"),
			self.customer,
			"the saved order did not take the guest's customer",
		)

	def test_a_table_that_matches_nothing_hands_back_the_tables_that_have_an_order(self):
		order = self.a_table_order()
		with self.with_hotel():
			seen = self.look(table="5", room="101")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "no_open_order"))
		self.assertIn(order, [row["invoice"] for row in seen["open_orders"]])

	def test_a_table_with_two_notes_hands_back_both_and_an_invoice_named_picks_one(self):
		first, second = self.two_notes()
		for order in (first, second):
			frappe.db.delete("Sales Invoice Payment", {"parent": order})
			frappe.db.set_value(
				"Sales Invoice", order, {"paid_amount": 0, "base_paid_amount": 0}, update_modified=False
			)
		with self.with_hotel():
			seen = self.look(table="T1", room="101")
			self.assertEqual((seen["ok"], seen["problem"]), (False, "several_orders"))
			self.assertCountEqual([row["invoice"] for row in seen["open_orders"]], [first, second])
			chosen = self.look(invoice=second, room="101")
		self.assertTrue(chosen["ok"], chosen)
		self.assertEqual(chosen["order"]["invoice"], second)

	def test_a_room_that_starts_like_others_names_none_and_hands_back_the_stays(self):
		self.a_table_order()
		with self.with_hotel():
			seen = self.look(table="T1", room="10")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "no_stay"))
		self.assertCountEqual([s["room_number"] for s in seen["stays"]], ["101", "1010", "102"])

	def test_a_stay_named_by_its_reservation_must_be_one_the_room_words_found(self):
		self.a_table_order()
		with self.with_hotel():
			chosen = self.look(table="T1", room="10", reservation="RES-1010")
			stranger = self.look(table="T1", room="10", reservation="RES-OTHER")
		self.assertEqual(chosen["stay"]["reservation"], "RES-1010")
		self.assertEqual((stranger["ok"], stranger["problem"]), (False, "no_stay"))

	def test_a_room_that_takes_no_charge_is_told_before_anything_else(self):
		self.a_table_order()
		with self.with_hotel():
			seen = self.look(table="T1", room="102")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "takes_no_charge"))

	def test_money_already_posted_on_the_order_stops_it(self):
		order = self.a_table_order()
		frappe.db.set_value("Sales Invoice", order, "paid_amount", 5, update_modified=False)
		with self.with_hotel():
			seen = self.look(table="T1", room="101")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "holds_money"))

	def test_a_refusal_of_the_hotel_before_the_sale_is_said_in_its_words(self):
		self.a_table_order()
		with self.with_hotel(AHotel(self.customer, refuse_before="The bill of this stay is already closed.")):
			seen = self.look(table="T1", room="101")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "refused"))
		self.assertIn("already closed", seen["reason"])

	def test_a_hotel_whose_books_are_off_says_why(self):
		self.a_table_order()
		with self.with_hotel(AHotel(self.customer, available=False)):
			seen = self.look(table="T1", room="101")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "not_available"))
		self.assertIn("accounts are off", seen["reason"])

	def test_no_shift_no_sale(self):
		self.a_table_order()
		with self.with_hotel(), patch.object(settlement, "open_shift_of_caller", return_value=None):
			seen = self.look(table="T1", room="101")
		self.assertEqual((seen["ok"], seen["problem"]), (False, "no_shift"))

	def test_no_hotel_app_refuses_everything(self):
		self.a_table_order()
		with patch.object(room_charge, "provider", return_value=None), self.as_the_waiter():
			with self.assertRaises(frappe.PermissionError):
				room_settlement.preview(table="T1", room="101")

	def test_a_room_or_a_table_that_is_no_text_asks_for_nothing(self):
		self.a_table_order()
		with self.with_hotel():
			for words in ({"room": ["101"]}, {"room": None}, {"room": "101", "table": {"a": 1}}):
				seen = self.look(**{"table": "T1", **words})
				self.assertFalse(seen["ok"], words)


class TestTheOrderIsPutOnTheRoom(RoomCase):
	def test_the_order_is_submitted_in_the_name_of_the_stay_and_posted_on_the_bill_once(self):
		order = self.a_table_order()
		with self.with_hotel():
			seen = self.look(table="T1", room="101")
			done = self.put(order, "RES-101", expected_modified=seen["modified"])

		self.assertEqual(done["invoice"], order)
		self.assertEqual(done["room"], {"room_number": "101", "released": False})
		self.assertEqual(self.hotel.posted, [(order, "RES-101")], "posted once, by the till's own submit")
		self.assertEqual(self.docstatus(order), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), self.customer)
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", order, "outstanding_amount"), seen["order"]["total"]
		)

	def test_the_same_order_again_is_refused_because_it_is_no_open_order_any_more(self):
		order = self.a_table_order()
		with self.with_hotel():
			self.put(order)
			with self.assertRaises(frappe.ValidationError):
				self.put(order)
		self.assertEqual(len(self.hotel.posted), 1)

	def test_a_refusal_of_the_hotel_at_the_post_leaves_the_order_an_open_draft(self):
		order = self.a_table_order()
		with self.with_hotel(AHotel(self.customer, refuse_at_post="Over the limit of one charge.")):
			with self.assertRaises(frappe.ValidationError) as refused:
				self.put(order)
		self.assertIn("Over the limit", str(refused.exception))
		self.assertEqual(self.docstatus(order), 0, "the sale was not submitted")

	def test_an_order_changed_since_it_was_shown_is_refused(self):
		order = self.a_table_order()
		with self.with_hotel():
			seen = self.look(table="T1", room="101")
			frappe.db.set_value(
				"Sales Invoice", order, "modified", "2000-01-01 00:00:00", update_modified=False
			)
			with self.assertRaises(frappe.ValidationError):
				self.put(order, expected_modified=seen["modified"])
		self.assertEqual(self.docstatus(order), 0)
		self.assertEqual(self.hotel.posted, [])

	def test_money_posted_since_it_was_shown_is_refused(self):
		order = self.a_table_order()
		with self.with_hotel():
			frappe.db.set_value("Sales Invoice", order, "paid_amount", 5, update_modified=False)
			with self.assertRaises(frappe.ValidationError):
				self.put(order)
		self.assertEqual(self.hotel.posted, [])

	def test_a_stay_is_named(self):
		order = self.a_table_order()
		with self.with_hotel(), self.assertRaises(frappe.ValidationError):
			self.put(order, "")
		self.assertEqual(self.docstatus(order), 0)


class TestWhoMayAsk(RoomCase):
	def test_a_visitor_a_portal_account_and_a_desk_account_with_no_till_ask_nothing(self):
		order = self.a_table_order()
		with self.with_hotel():
			for who in ("Guest", "portal_customer"):
				with as_role(who):
					with self.assertRaises(frappe.PermissionError):
						room_settlement.preview(table="T1", room="101")
					with self.assertRaises(frappe.PermissionError):
						room_settlement.put_on_room(order, "RES-101")
		self.assertEqual(self.docstatus(order), 0)
		self.assertEqual(self.hotel.posted, [])

	def test_a_cashier_with_no_shift_on_this_till_may_not_put_the_order_of_this_one(self):
		order = self.a_table_order()
		other = "room-other-till@yopmail.com"
		from pos_next.tests.test_till_writes_need_the_till import _user

		_user(other, ["POSNext Cashier"], "System User")
		with self.with_hotel(), as_role("cashier", email=other):
			with self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
				room_settlement.put_on_room(order, "RES-101")
		self.assertEqual(self.docstatus(order), 0)
