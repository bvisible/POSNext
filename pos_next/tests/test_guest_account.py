# //// Neoffice — added file (no upstream equivalent).
"""The customer behind a guest's phone on the QR page (NeoResto lot 1, Daniel, 02.11: se connecter à son compte, ou être déjà connecté
quand la caisse a mis le client sur la table).

A guest proves an e-mail address with a code that goes to it (no password to keep), and the customer of that address is the customer of
the table: a customer that does not exist yet is made after the proof, as the till makes one. When the till already put a customer on the
table's order, the page takes that identity with no sign-in. The suite pins:

- the code: mailed to the address, valid for one session and a few tries, never answered differently for a known address and an unknown one;
- signing in: the customer of the address is bound to the session and to the table's draft; one customer per table, never taken over;
- registering: only after the proof, and a customer made like the till makes one;
- the till's customer: a table whose order has a customer other than the till's default is already identified;
- the restaurant's choice (Customer account: not offered, optional, required): a required account is asked for before an order is taken;
- what the page reads of the customer: the name and the loyalty points, nothing else.

The suite builds everything it needs and rolls back.
"""

import re
from unittest.mock import patch

import frappe

from pos_next.api import guest_ordering
from pos_next.restaurant import guest_account
from pos_next.tests.test_service_families import ServiceCase


def an_address():
	return f"guest-{frappe.generate_hash(length=8)}@yopmail.com"


class GuestAccountCase(ServiceCase):
	def setUp(self):
		super().setUp()
		# Nothing of the suite is committed, nor published to the tills
		original = frappe.publish_realtime
		self.addCleanup(setattr, frappe, "publish_realtime", original)
		frappe.publish_realtime = lambda event, message=None, **kwargs: None
		frappe.db.set_value(
			"Restaurant",
			self.a,
			{"enable_qr_ordering": 1, "qr_order_validation": "Direct to Kitchen", "guest_account_mode": "Optional"},
		)
		frappe.clear_document_cache("Restaurant")
		self.token = self.a_token()
		self.mails = []
		sender = patch("frappe.sendmail", side_effect=lambda **mail: self.mails.append(mail))
		sender.start()
		self.addCleanup(sender.stop)

	def a_token(self):
		return frappe.get_doc(
			{"doctype": "Guest Order Token", "mode": "restaurant", "table": self.table_a, "pos_profile": self.fx.profile}
		).insert(ignore_permissions=True)

	def as_guest(self, method, *args, **kwargs):
		"""A public call of the guest page: no session, no right, as the page makes it."""
		frappe.set_user("Guest")
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def ask_for_a_code(self, address, token=None):
		self.as_guest(guest_ordering.request_guest_code, (token or self.token).token, address)

	def the_last_code(self):
		return re.search(r"\b(\d{6})\b", self.mails[-1]["message"]).group(1)

	def a_customer(self, address, name="Marie Dupont"):
		customer = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
			}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Customer", customer.name, "email_id", address)
		return customer.name

	def sign_in(self, address, token=None):
		self.ask_for_a_code(address, token)
		return self.as_guest(
			guest_ordering.confirm_guest_code, (token or self.token).token, address, self.the_last_code()
		)

	def set_mode(self, mode):
		frappe.db.set_value("Restaurant", self.a, "guest_account_mode", mode)
		frappe.clear_document_cache("Restaurant")

	def order(self, *lines):
		items = [{"item_code": code, "qty": qty, "rate": 5} for code, qty in lines]
		return self.as_guest(guest_ordering.submit_guest_order, self.token.token, frappe.as_json(items))


class TestTheCode(GuestAccountCase):
	def test_a_code_is_mailed_to_the_address(self):
		address = an_address()

		answer = self.as_guest(guest_ordering.request_guest_code, self.token.token, address)

		self.assertEqual(answer, {"sent": True})
		self.assertEqual(len(self.mails), 1)
		self.assertEqual(self.mails[0]["recipients"], [address])
		self.assertRegex(self.mails[0]["message"], r"\b\d{6}\b")

	def test_the_answer_is_the_same_for_a_known_address_and_an_unknown_one(self):
		known, unknown = an_address(), an_address()
		self.a_customer(known)

		self.assertEqual(
			self.as_guest(guest_ordering.request_guest_code, self.token.token, known),
			self.as_guest(guest_ordering.request_guest_code, self.token.token, unknown),
		)

	def test_an_address_that_is_not_one_is_refused_and_nothing_is_sent(self):
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.request_guest_code, self.token.token, "not an address")

		self.assertEqual(self.mails, [])

	def test_a_wrong_code_is_refused(self):
		address = an_address()
		self.a_customer(address)
		self.ask_for_a_code(address)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, "000000" if self.the_last_code() != "000000" else "111111")

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))

	def test_after_five_wrong_codes_even_the_right_one_is_refused(self):
		address = an_address()
		self.a_customer(address)
		self.ask_for_a_code(address)
		right = self.the_last_code()
		wrong = "000000" if right != "000000" else "111111"
		for _try in range(guest_account.MAX_TRIES):
			with self.assertRaises(frappe.ValidationError):
				self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, wrong)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, right)

	def test_a_code_works_once(self):
		address = an_address()
		self.a_customer(address)
		self.sign_in(address)
		code = self.the_last_code()

		other = self.a_token()
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, other.token, address, code)
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, code)

	def test_a_code_is_for_the_session_that_asked_for_it(self):
		address = an_address()
		self.a_customer(address)
		self.ask_for_a_code(address)

		other = self.a_token()
		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, other.token, address, self.the_last_code())

	def test_asking_for_codes_without_end_is_refused(self):
		address = an_address()
		for _ask in range(guest_account.MAX_SENDS):
			self.ask_for_a_code(address)

		with self.assertRaises(frappe.RateLimitExceededError):
			self.ask_for_a_code(address)

		self.assertEqual(len(self.mails), guest_account.MAX_SENDS)


class TestSigningIn(GuestAccountCase):
	def test_a_customer_signs_in_with_the_code_of_their_address(self):
		address = an_address()
		customer = self.a_customer(address)

		answer = self.sign_in(address)

		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(answer["account"]["customer"], customer)
		self.assertEqual(answer["account"]["customer_name"], "Marie Dupont")
		self.assertEqual(answer["account"]["source"], "account")
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)

	def test_the_address_of_a_contact_finds_the_customer_too(self):
		address = an_address()
		customer = self.a_customer(an_address())
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Marie",
				"email_ids": [{"email_id": address, "is_primary": 1}],
				"links": [{"link_doctype": "Customer", "link_name": customer}],
			}
		).insert(ignore_permissions=True)
		self.assertTrue(contact.name)

		self.assertEqual(self.sign_in(address)["account"]["customer"], customer)

	def test_the_draft_order_of_the_table_goes_to_the_customer(self):
		address = an_address()
		customer = self.a_customer(address)
		order = self.save([self.line(self.cola)])
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), self.fx.customer)

		self.sign_in(address)

		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), customer)

	def test_the_next_order_of_the_table_is_the_customers(self):
		address = an_address()
		customer = self.a_customer(address)
		self.sign_in(address)

		answer = self.order((self.cola, 1))

		self.assertEqual(frappe.db.get_value("Sales Invoice", answer["invoice"], "customer"), customer)

	def test_an_unknown_address_is_to_register_after_the_code(self):
		address = an_address()

		answer = self.sign_in(address)

		self.assertEqual(answer, {"status": "needs_registration"})
		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))

	def test_registering_makes_the_customer_and_signs_them_in(self):
		address = an_address()
		self.sign_in(address)

		answer = self.as_guest(
			guest_ordering.register_guest_account, self.token.token, address, "Jean Martin", "+41 79 000 00 00"
		)

		customer = answer["account"]["customer"]
		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(frappe.db.get_value("Customer", customer, "customer_name"), "Jean Martin")
		self.assertEqual(frappe.db.get_value("Customer", customer, "email_id"), address)
		self.assertEqual(frappe.db.get_value("Customer", customer, "mobile_no"), "+41 79 000 00 00")
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)

	def test_registering_without_the_proof_of_the_address_is_refused(self):
		before = frappe.db.count("Customer")

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, an_address(), "Jean Martin")

		self.assertEqual(frappe.db.count("Customer"), before)

	def test_the_proof_of_an_address_registers_that_address_only(self):
		address = an_address()
		self.sign_in(address)
		before = frappe.db.count("Customer")

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, an_address(), "Jean Martin")

		self.assertEqual(frappe.db.count("Customer"), before)

	def test_registering_needs_a_name(self):
		address = an_address()
		self.sign_in(address)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, address, "   ")

	def test_the_proof_is_used_once(self):
		address = an_address()
		self.sign_in(address)
		self.as_guest(guest_ordering.register_guest_account, self.token.token, address, "Jean Martin")

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, address, "Jean Martin")

	def test_a_table_linked_to_a_customer_is_not_taken_over(self):
		first, second = an_address(), an_address()
		customer = self.a_customer(first)
		self.a_customer(second, name="Paul Durand")
		self.sign_in(first)

		with self.assertRaises(frappe.ValidationError):
			self.sign_in(second)

		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)

	def test_the_same_customer_signing_in_again_is_not_refused(self):
		address = an_address()
		customer = self.a_customer(address)
		self.sign_in(address)

		self.assertEqual(self.sign_in(address)["account"]["customer"], customer)


class TestTheTillsCustomer(GuestAccountCase):
	def read(self):
		return self.as_guest(guest_ordering.validate_token, self.token.token)

	def test_a_table_with_the_default_customer_is_nobody(self):
		self.save([self.line(self.cola)])

		self.assertIsNone(self.read()["account"])

	def test_a_table_whose_order_the_till_gave_a_customer_is_already_identified(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)

		account = self.read()["account"]

		self.assertEqual(account["customer"], customer)
		self.assertEqual(account["source"], "till")

	def test_the_customer_of_the_till_wins_over_a_session_that_signed_in_before(self):
		address = an_address()
		self.a_customer(address)
		self.sign_in(address)
		other = self.a_customer(an_address(), name="Paul Durand")
		order = frappe.db.get_value("Guest Order Token", self.token.name, "invoice") or self.save([self.line(self.cola)])
		frappe.db.set_value("Sales Invoice", order, "customer", other)

		self.assertEqual(self.read()["account"]["customer"], other)
		self.assertEqual(self.read()["account"]["source"], "till")

	def test_the_order_status_carries_the_account_too(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)

		status = self.as_guest(guest_ordering.get_order_status, self.token.token)

		self.assertEqual(status["account"]["customer"], customer)

	def test_a_signed_in_guest_orders_with_no_further_step_on_a_table_the_till_opened(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)
		self.set_mode("Mandatory")

		self.assertTrue(self.order((self.soup, 1))["invoice"])

	def test_a_table_that_has_no_customer_yet_reads_no_account(self):
		self.assertIsNone(self.read()["account"])

	def test_the_page_reads_the_name_and_the_points_of_the_customer_and_nothing_else(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)

		self.assertEqual(
			set(self.read()["account"]),
			{"customer", "customer_name", "source", "loyalty_points", "loyalty_value", "loyalty_program"},
		)


class TestWhatTheRestaurantRequires(GuestAccountCase):
	def test_a_restaurant_that_proposes_no_account_mails_nothing_and_makes_nobody(self):
		self.set_mode("Not Proposed")
		before = frappe.db.count("Customer")

		with self.assertRaises(frappe.PermissionError):
			self.ask_for_a_code(an_address())
		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, an_address(), "Jean Martin")

		self.assertEqual((self.mails, frappe.db.count("Customer")), ([], before))

	def test_an_order_asks_for_an_account_when_the_restaurant_requires_it(self):
		self.set_mode("Mandatory")

		with self.assertRaises(frappe.ValidationError):
			self.order((self.cola, 1))

		self.assertEqual(frappe.db.count("Sales Invoice Item", {"item_code": self.cola}), 0)

	def test_an_order_is_taken_once_signed_in(self):
		self.set_mode("Mandatory")
		address = an_address()
		self.a_customer(address)
		self.sign_in(address)

		self.assertTrue(self.order((self.cola, 1))["invoice"])

	def test_an_account_that_is_optional_or_not_proposed_is_never_asked_for(self):
		for mode in ("Optional", "Not Proposed"):
			self.set_mode(mode)

			self.assertTrue(self.order((self.cola, 1))["invoice"])

	def test_the_page_is_told_the_mode(self):
		self.set_mode("Mandatory")

		self.assertEqual(self.as_guest(guest_ordering.validate_token, self.token.token)["guest_account_mode"], "Mandatory")


class TestWhatTheCustomerHas(GuestAccountCase):
	def test_the_loyalty_points_and_what_they_are_worth(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_loyalty_program", 1)
		answer = {"loyalty_points": 120, "conversion_factor": 0.1, "loyalty_program": "_Test Program"}

		with patch.object(guest_account, "_points_of", return_value=answer):
			account = self.as_guest(guest_ordering.validate_token, self.token.token)["account"]

		self.assertEqual((account["loyalty_points"], account["loyalty_value"]), (120, 12.0))
		self.assertEqual(account["loyalty_program"], "_Test Program")

	def test_a_customer_with_no_programme_has_no_points(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)

		account = self.as_guest(guest_ordering.validate_token, self.token.token)["account"]

		self.assertEqual((account["loyalty_points"], account["loyalty_value"], account["loyalty_program"]), (0, 0, None))

	def test_the_menu_is_priced_for_the_customer(self):
		customer = self.a_customer(an_address())
		self.save([self.line(self.cola)], customer=customer)
		frappe.get_doc(
			{"doctype": "Restaurant Card", "card_name": "_Test Account Card", "is_active": 1, "items": [{"item_type": "Item", "item": self.cola}]}
		).insert(ignore_permissions=True)
		frappe.db.set_value("Restaurant", self.a, "guest_menu", "_Test Account Card")
		frappe.clear_document_cache("Restaurant")

		with patch.object(guest_ordering, "_apply_pricing_rules_to_menu") as priced:
			self.as_guest(guest_ordering.get_guest_menu, self.token.token)

		self.assertEqual(priced.call_args.kwargs.get("customer"), customer)
