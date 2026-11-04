# //// Neoffice — added file (no upstream equivalent).
"""The web takeaway order goes to the end (neoffice-maintenance#2132, with the sign-in of #2192).

The page used to ask for a name that it kept nowhere, to keep the cart in the browser until the payment, and to ask for a payment of an order
that did not exist (`create_guest_payment`: "No active order found"); the function that made the order "after the payment" was called by nobody and
wanted a payment on an order that it had not made. The suite pins the way that works:

- the session has a till (an order needs a POS Profile) and the card the restaurant gives its takeaway;
- an account is always required, whatever the restaurant says of its tables, and the order is the customer's from its first line;
- "Pay & Order" makes the order BEFORE the payment: a draft flagged as takeaway, numbered, whose lines are held (the kitchen has not started them);
- the page's word is not a payment: the order is paid, and goes to the kitchen, only when the payment provider settled its whole total, whatever
  amount the page says; the page cannot choose to pay less nor add a tip, the server says what the order owes;
- a settled payment (which the `payments` app puts on the invoice by itself) has the invoice submitted, sends its lines to the kitchen once, and
  gives the customer the number to show at pickup.
- a payment the provider settled is settled by the SERVER, whether or not the customer's page comes back: the intent's update queues the settlement, a job
  every five minutes catches what that missed, and the page and the job together settle once (played for real on osiris, 04.11: the money was on the
  invoice, the order a draft with its lines held, because the page had come back in another browser).

The suite builds everything it needs and rolls back; the engine is pinned on, its connection and its login are in memory.
"""

from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.restaurant import guest_account
from pos_next.restaurant import settings as restaurant_settings
from pos_next.tests.test_guest_account import GuestAccountCase, an_address


class TakeawayCase(GuestAccountCase):
	def setUp(self):
		super().setUp()
		frappe.db.set_value("Restaurant", self.a, {"enable_web_takeaway": 1})
		frappe.clear_document_cache("Restaurant")
		# A session with no till belongs to the default restaurant, which on a real site is not the test's
		default = patch.object(restaurant_settings, "default_restaurant", return_value=self.a)
		default.start()
		self.addCleanup(default.stop)
		self.token = self.a_takeaway_token()
		sent = patch("pos_next.api.kitchen_events.kitchen_send")
		self.kitchen = sent.start()
		self.addCleanup(sent.stop)

	def a_takeaway_token(self):
		made = self.as_guest(guest_ordering.create_takeaway_token)
		return frappe.get_doc("Guest Order Token", made["name"])

	def an_order(self, address=None):
		"""A signed-in customer's order of a cola and a soup; the order's name."""
		self.register(address or an_address())
		return self.order((self.cola, 1), (self.soup, 2))["invoice"]

	def the_provider_confirms(self, invoice, minor=None, status="succeeded"):
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		return frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": status,
				"amount": minor if minor is not None else int(round(total * 100)),
				"currency": frappe.db.get_value("Sales Invoice", invoice, "currency"),
				"reference_doctype": "Sales Invoice",
				"reference_name": invoice,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

	def confirm(self, amount, tip=0):
		return self.as_guest(guest_ordering.confirm_guest_payment, self.token.token, amount, tip)

	def lines(self, invoice):
		return frappe.get_all(
			"Sales Invoice Item", filters={"parent": invoice}, fields=["item_code", "kds_status", "kds_batch"], order_by="idx asc"
		)


class TestTheSession(TakeawayCase):
	def test_the_session_has_the_till_of_its_restaurant(self):
		self.assertEqual(self.token.mode, "takeaway")
		self.assertEqual(self.token.pos_profile, self.fx.profile)

	def test_the_takeaway_page_is_served_the_takeaway_card_of_the_restaurant(self):
		card = self.make_card(self.a, "_Test Takeaway Card", items=[{"item_type": "Item", "item": self.soup, "price": 7}])
		frappe.db.set_value("Restaurant", self.a, "takeaway_menu", card)
		frappe.clear_document_cache("Restaurant")

		menu = self.as_guest(guest_ordering.get_guest_menu, self.token.token)

		codes = {dish["item_code"] for category in menu["categories"] for dish in category.get("menu_items", [])}
		self.assertEqual(codes, {self.soup})

	def test_without_a_takeaway_card_the_guest_menu_is_served(self):
		menu = self.as_guest(guest_ordering.get_guest_menu, self.token.token)

		codes = {dish["item_code"] for category in menu["categories"] for dish in category.get("menu_items", [])}
		self.assertIn(self.cola, codes)

	def test_a_table_is_still_served_the_guest_menu_whatever_the_takeaway_card_is(self):
		card = self.make_card(self.a, "_Test Takeaway Card", items=[{"item_type": "Item", "item": self.soup, "price": 7}])
		frappe.db.set_value("Restaurant", self.a, "takeaway_menu", card)
		frappe.clear_document_cache("Restaurant")

		menu = self.as_guest(guest_ordering.get_guest_menu, self.a_token().token)

		codes = {dish["item_code"] for category in menu["categories"] for dish in category.get("menu_items", [])}
		self.assertIn(self.cola, codes)


class TestAnAccountIsAlwaysRequired(TakeawayCase):
	def test_whatever_the_restaurant_says_of_its_tables(self):
		for mode in ("Not Proposed", "Optional", "Mandatory"):
			self.set_mode(mode)

			self.assertEqual(self.as_guest(guest_ordering.validate_token, self.token.token)["guest_account_mode"], "Mandatory")

	def test_no_order_is_taken_from_nobody(self):
		self.set_mode("Not Proposed")

		with self.assertRaises(frappe.ValidationError):
			self.order((self.cola, 1))

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"))

	def test_where_no_code_can_be_mailed_the_order_is_taken_all_the_same(self):
		with patch.object(guest_account, "is_available", return_value=False):
			answer = self.order((self.cola, 1))

		self.assertEqual(answer["status"], "awaiting_payment")

	def test_a_takeaway_session_signs_in_whatever_the_restaurant_proposes_for_its_tables(self):
		self.set_mode("Not Proposed")

		answer = self.sign_in(an_address())

		self.assertEqual(answer["status"], "needs_registration")


class TestTheOrderBeforeThePayment(TakeawayCase):
	def test_the_order_is_the_customers_from_its_first_line(self):
		address = an_address()
		invoice = self.an_order(address)

		customer = frappe.db.get_value("Sales Invoice", invoice, "customer")
		self.assertEqual(customer, guest_account.customer_by_email(address))
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)

	def test_it_is_a_takeaway_draft_of_the_till_with_a_ticket_number(self):
		invoice = self.an_order()

		order = frappe.db.get_value(
			"Sales Invoice", invoice, ["docstatus", "is_takeaway", "pos_profile", "restaurant_table", "posa_ticket_no"], as_dict=True
		)
		self.assertEqual((order.docstatus, order.is_takeaway, order.pos_profile), (0, 1, self.fx.profile))
		self.assertFalse(order.restaurant_table)
		self.assertTrue(order.posa_ticket_no)

	def test_its_lines_are_held_and_the_kitchen_hears_nothing(self):
		invoice = self.an_order()

		self.assertEqual([line.kds_status for line in self.lines(invoice)], ["Waiting", "Waiting"])
		self.kitchen.assert_not_called()

	def test_the_answer_says_the_order_waits_for_its_payment(self):
		self.register(an_address())

		self.assertEqual(self.order((self.cola, 1))["status"], "awaiting_payment")

	def test_a_second_send_adds_to_the_same_order(self):
		invoice = self.an_order()

		again = self.order((self.cola, 1))["invoice"]

		self.assertEqual(again, invoice)
		self.assertEqual(len(self.lines(invoice)), 3)
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Waiting"})

	def test_a_table_order_is_not_held_and_is_not_a_takeaway(self):
		# The tables keep what they did: lines at the kitchen at once, no takeaway flag
		self.token = self.a_token()
		invoice = self.order((self.cola, 1))["invoice"]

		self.assertEqual(self.lines(invoice)[0].kds_status, "Pending")
		self.assertFalse(frappe.db.get_value("Sales Invoice", invoice, "is_takeaway"))
		self.kitchen.assert_called_once()


class TestThePaymentIsTheProvidersWord(TakeawayCase):
	def test_the_page_saying_it_paid_is_not_a_payment(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")

		answer = self.confirm(total)

		self.assertEqual(answer, {"status": "awaiting_payment"})
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "paid_amount"]), (0, 0))
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Waiting"})
		self.kitchen.assert_not_called()

	def test_an_intent_that_did_not_succeed_is_not_a_payment_either(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		for status in ("requires_action", "processing", "failed", "canceled", "refunded"):
			self.the_provider_confirms(invoice, status=status)

		self.assertEqual(self.confirm(total), {"status": "awaiting_payment"})

	def test_less_than_the_total_of_the_order_is_not_enough(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.the_provider_confirms(invoice, minor=int(round(total * 100)) - 1)

		self.assertEqual(self.confirm(total), {"status": "awaiting_payment"})
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Waiting"})
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 0)

	def test_the_money_of_another_order_is_not_this_orders(self):
		invoice = self.an_order()
		other = self.save([self.line(self.cola)])
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.the_provider_confirms(other, minor=int(round(total * 100)))

		self.assertEqual(self.confirm(total), {"status": "awaiting_payment"})

	def test_the_provider_confirmed_helper_counts_the_intents_of_the_order_in_minor_units(self):
		invoice = self.an_order()
		doc = frappe.get_doc("Sales Invoice", invoice)
		self.assertEqual(doc.grand_total, 15)
		self.the_provider_confirms(invoice, minor=500)
		self.the_provider_confirms(invoice, minor=700)
		self.assertFalse(guest_ordering._provider_confirmed(doc))

		self.the_provider_confirms(invoice, minor=299)
		self.assertFalse(guest_ordering._provider_confirmed(doc))

		self.the_provider_confirms(invoice, minor=1)
		self.assertTrue(guest_ordering._provider_confirmed(doc))

	def test_an_order_of_nothing_is_not_paid_by_nothing(self):
		doc = frappe.get_doc("Sales Invoice", self.an_order())
		doc.grand_total = 0

		self.assertFalse(guest_ordering._provider_confirmed(doc))


class TestThePaymentIsAskedForWhatTheServerOwes(TakeawayCase):
	def ask(self, amount, tip):
		return self.as_guest(guest_ordering.create_guest_payment, self.token.token, amount, None, tip, "https://shop.example/ok", "https://shop.example/ko")

	def test_the_page_cannot_choose_to_pay_less_nor_to_tip(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		with patch("payments.api.intent.create_intent") as create_intent:
			create_intent.return_value = {
				"status": "requires_action",
				"next_action_payload": {"url": "https://pay.example/x"},
				"provider_intent_id": "x",
				"intent_name": "PI-x",
			}
			with patch.object(guest_ordering, "_resolve_wallee_provider", return_value="wallee_test"):
				answer = self.ask(1, 5)

		self.assertEqual(answer["payment_url"], "https://pay.example/x")
		self.assertEqual(create_intent.call_args.kwargs["amount"], int(round(total * 100)))
		self.assertEqual(create_intent.call_args.kwargs["reference_name"], invoice)
		self.assertEqual(create_intent.call_args.kwargs["metadata"]["tip"], 0)

	def test_there_is_nothing_to_pay_for_an_order_that_is_paid(self):
		invoice = self.an_order()
		self.the_provider_confirms(invoice)  # the payments app puts the money on the invoice by itself

		with patch("payments.api.intent.create_intent") as create_intent:
			with self.assertRaises(frappe.ValidationError):
				self.ask(15, 0)

		create_intent.assert_not_called()


class TestAConfirmedPayment(TakeawayCase):
	def test_it_pays_the_order_and_sends_the_lines_to_the_kitchen_once(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.the_provider_confirms(invoice)

		answer = self.confirm(total)

		self.assertEqual(answer["status"], "success")
		self.assertTrue(answer["submitted"])
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "paid_amount"), total)
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Pending"})
		self.kitchen.assert_called_once_with(invoice, 1)

	def test_the_amount_the_page_says_is_not_what_counts(self):
		invoice = self.an_order()
		self.the_provider_confirms(invoice)

		answer = self.confirm(0.01)

		self.assertEqual(answer["status"], "success")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)

	def test_a_payment_the_payments_app_has_not_put_on_the_invoice_yet_is_put_there(self):
		invoice = self.an_order()
		intent = self.the_provider_confirms(invoice)
		# The reconciliation has not run (its webhook is late): the payment is not on the invoice
		frappe.db.delete("Sales Invoice Payment", {"parent": invoice})
		frappe.db.set_value("Sales Invoice", invoice, "paid_amount", 0)
		metadata = frappe.parse_json(intent.metadata_json or "{}")
		metadata.pop("reconciled_at", None)
		frappe.db.set_value("Payment Intent", intent.name, "metadata_json", frappe.as_json(metadata))

		answer = self.confirm(15)

		self.assertEqual(answer["status"], "success")
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "paid_amount"]), (1, 15))

	def test_the_customer_is_given_the_number_to_show_at_pickup(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.the_provider_confirms(invoice)

		answer = self.confirm(total)

		self.assertTrue(answer["ticket"])
		self.assertEqual(answer["ticket"], frappe.db.get_value("Sales Invoice", invoice, "posa_ticket_no"))

	def test_releasing_twice_sends_nothing_twice(self):
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.the_provider_confirms(invoice)
		self.confirm(total)
		self.kitchen.reset_mock()

		guest_ordering._release_paid_takeaway(invoice)

		self.kitchen.assert_not_called()

	def test_a_line_already_sent_is_not_sent_again(self):
		invoice = self.an_order()
		first = frappe.get_all("Sales Invoice Item", filters={"parent": invoice}, pluck="name", order_by="idx asc")[0]
		frappe.db.set_value("Sales Invoice Item", first, "kds_status", "Preparing")

		guest_ordering._release_paid_takeaway(invoice)

		self.assertEqual([line.kds_status for line in self.lines(invoice)], ["Preparing", "Pending"])

	def test_a_table_payment_is_the_providers_word_too_and_hands_out_no_pickup_number(self):
		# A table's payment is booked by what the provider settled as well (maintenance#1973, test_a_guest_payment_is_booked_by_the_provider);
		# only a takeaway order is given a number to show at pickup
		self.token = self.a_token()
		invoice = self.order((self.cola, 1))["invoice"]
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		self.assertEqual(self.confirm(total)["status"], "awaiting_payment")
		self.the_provider_confirms(invoice)

		answer = self.confirm(total)

		self.assertEqual(answer["status"], "success")
		self.assertNotIn("ticket", answer)


class TestAPaidOrderIsSettledWithoutThePage(TakeawayCase):
	def queued(self, queue_mock):
		return [call for call in queue_mock.call_args_list if call.args and call.args[0].endswith("settle_paid_takeaway_order")]

	def test_the_provider_settling_the_payment_queues_the_settlement_of_the_order(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue") as enqueue:
			self.the_provider_confirms(invoice)

		queued = self.queued(enqueue)
		self.assertEqual(len(queued), 1)
		self.assertEqual(queued[0].kwargs["invoice"], invoice)
		self.assertTrue(queued[0].kwargs["enqueue_after_commit"])

	def test_an_intent_that_did_not_succeed_queues_nothing(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue") as enqueue:
			self.the_provider_confirms(invoice, status="requires_action")
			self.the_provider_confirms(invoice, status="failed")

		self.assertEqual(self.queued(enqueue), [])

	def test_an_order_already_settled_queues_nothing_more(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		self.the_provider_confirms(invoice)
		self.confirm(frappe.db.get_value("Sales Invoice", invoice, "grand_total"))

		with patch("frappe.enqueue") as enqueue:
			self.the_provider_confirms(invoice)

		self.assertEqual(self.queued(enqueue), [])

	def test_a_payment_for_something_that_is_not_a_web_takeaway_order_queues_nothing(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		# the same invoice, with no takeaway session behind it: the till's own sale, which nobody waits a page for
		frappe.db.set_value("Guest Order Token", self.token.name, "mode", "restaurant")
		with patch("frappe.enqueue") as enqueue:
			self.the_provider_confirms(invoice)

		self.assertEqual(self.queued(enqueue), [])

	def test_the_job_pays_the_order_and_sends_it_to_the_kitchen_with_no_page_in_sight(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 0)

		guest_ordering.settle_paid_takeaway_order(invoice)

		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Pending"})
		self.kitchen.assert_called_once_with(invoice, 1)

	def test_the_page_coming_back_afterwards_finds_it_done_and_sends_nothing_twice(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)
		guest_ordering.settle_paid_takeaway_order(invoice)

		answer = self.confirm(total)

		self.assertEqual(answer["status"], "success")
		self.assertIsNotNone(answer["ticket"])
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 1)
		self.kitchen.assert_called_once_with(invoice, 1)

	def test_the_session_keeps_its_settled_order_to_be_found_by_the_page_that_comes_back(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)
		guest_ordering.settle_paid_takeaway_order(invoice)

		# what any call of the page does first: look for the session's draft. The order is no longer a draft, and the link to it must stay
		self.assertIsNone(guest_ordering._get_or_create_invoice(frappe.get_doc("Guest Order Token", self.token.name)))
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"), invoice)

	def test_a_table_session_still_forgets_a_submitted_order(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		# the rule of the tables is unchanged: their link is cleared once their invoice is submitted
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)
		guest_ordering.settle_paid_takeaway_order(invoice)
		frappe.db.set_value("Guest Order Token", self.token.name, "mode", "restaurant")

		guest_ordering._get_or_create_invoice(frappe.get_doc("Guest Order Token", self.token.name))

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "invoice"))

	def test_asked_twice_by_the_page_the_settled_order_answers_the_same_number(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		total = frappe.db.get_value("Sales Invoice", invoice, "grand_total")
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)
		guest_ordering.settle_paid_takeaway_order(invoice)

		first = self.confirm(total)
		second = self.confirm(total)

		self.assertEqual(first["ticket"], second["ticket"])
		self.assertEqual(second["status"], "success")
		self.kitchen.assert_called_once_with(invoice, 1)

	def test_the_job_run_twice_does_nothing_the_second_time(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)

		guest_ordering.settle_paid_takeaway_order(invoice)
		guest_ordering.settle_paid_takeaway_order(invoice)

		self.assertEqual(self.kitchen.call_count, 1)

	def test_an_order_the_provider_has_not_settled_in_full_is_left_alone(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice, minor=100)

		guest_ordering.settle_paid_takeaway_order(invoice)

		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 0)
		self.assertEqual({line.kds_status for line in self.lines(invoice)}, {"Waiting"})
		self.kitchen.assert_not_called()

	def test_an_order_nobody_paid_is_left_alone(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()

		guest_ordering.settle_paid_takeaway_order(invoice)

		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "docstatus"), 0)
		self.kitchen.assert_not_called()

	def test_a_failure_is_logged_and_never_raised(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		invoice = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(invoice)

		with (
			patch.object(guest_ordering, "_settle_takeaway_order", side_effect=RuntimeError("boom")),
			patch("frappe.log_error") as log_error,
			patch("frappe.db.rollback"),
		):
			guest_ordering.settle_paid_takeaway_order(invoice)

		log_error.assert_called_once()
		self.assertEqual(log_error.call_args.args[0], "A paid takeaway order could not be settled")

	def test_the_job_every_five_minutes_settles_what_the_event_missed(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		paid = self.an_order()
		with patch("frappe.enqueue"):
			self.the_provider_confirms(paid)
		# a second customer, on a session of their own (a session keeps one customer)
		self.token = self.a_takeaway_token()
		unpaid = self.an_order()

		guest_ordering.settle_paid_takeaway_orders()

		self.assertEqual(frappe.db.get_value("Sales Invoice", paid, "docstatus"), 1)
		self.assertEqual(frappe.db.get_value("Sales Invoice", unpaid, "docstatus"), 0)

	def test_the_events_are_wired(self):  # role-check: ok the settlement is a background job, which runs as Administrator
		hooks = frappe.get_hooks()

		self.assertIn("pos_next.api.guest_ordering.settle_takeaway_on_payment", hooks["doc_events"]["Payment Intent"]["on_update"])
		cron = hooks["scheduler_events"]["cron"]["*/5 * * * *"]
		self.assertIn("pos_next.api.guest_ordering.settle_paid_takeaway_orders", cron)
