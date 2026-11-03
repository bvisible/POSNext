# //// Neoffice — added file (no upstream equivalent).
"""The customer behind a guest's phone on the QR page (NeoResto lot 1, Daniel, 02.11: se connecter à son compte, ou être déjà connecté
quand la caisse a mis le client sur la table), signed in with the code of the frappe fork's engine (`frappe.passwordless`, 03.11,
neoffice-maintenance#2192). A guest proves an e-mail address with a code that goes to it (no password to keep), and the customer of that
address is the customer of the table: an account that does not exist yet is opened after the proof, a Website User with its customer and
its contact, as the till makes a customer. When the till already put a customer on the table's order, the page takes that identity with no
sign-in. The suite pins:

- the code: mailed by the engine to the address in the name of the restaurant, never answered differently for a known address and an unknown
  one, refused when wrong, lost after five wrong tries, used once, and the engine's own ceilings reach the page;
- signing in: the customer of the account is bound to the session and to the table's draft; one customer per table, never taken over;
- opening an account: only from the PROOF of an address (the browser never names it), a name asked for once, a Website User that has the
  Customer role and nothing else, tied to its customer by a contact;
- no session on the phone: the page asks without one, so the engine's login is never asked to open one that nobody could find again;
- the till's customer: a table whose order has a customer other than the till's default is already identified;
- the restaurant's choice (Customer account: not offered, optional, required): a required account is asked for before an order is taken,
  and nothing is offered, nor required, where no code can be mailed;
- what the page reads of the customer: the name and the loyalty points, nothing else;

The suite builds everything it needs and rolls back; the engine is pinned on, its connection and its login are in memory.
"""

import uuid
from unittest.mock import MagicMock, patch

import frappe
from frappe import passwordless
from frappe.utils import add_days, nowdate

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
		self.on_the_guest_menu(self.a, self.cola, self.soup, self.salad, self.penne, self.steak, self.tart)
		self.token = self.a_token()
		self.mails = []
		# The engine counts per connection and per address in Redis, which outlives a run: every test is a connection of its own
		self.peer = f"203.0.113.{uuid.uuid4().int % 250 + 1}-{uuid.uuid4().hex[:6]}"
		for patched in (
			patch.object(passwordless, "is_enabled", return_value=True),
			patch.object(passwordless, "signup_is_open", return_value=True),
			patch.object(passwordless, "_peer_ip", side_effect=lambda: self.peer),
			patch("frappe.sendmail", side_effect=lambda **mail: self.mails.append(mail)),
		):
			patched.start()
			self.addCleanup(patched.stop)
		# The login is the engine's: here it is a recorder, so that what is asked of it can be read
		self.manager = MagicMock()
		frappe.local.login_manager = self.manager
		self.addCleanup(lambda: delattr(frappe.local, "login_manager"))
		frappe.local.response = frappe._dict()

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

	def as_user(self, user, method, *args, **kwargs):
		"""A call of a page whose session is already open for `user`."""
		frappe.set_user(user)
		try:
			return method(*args, **kwargs)
		finally:
			frappe.set_user("Administrator")

	def ask_for_a_code(self, address, token=None):
		return self.as_guest(guest_ordering.request_guest_code, (token or self.token).token, address)

	def the_last_code(self):
		return self.mails[-1]["args"]["code"]

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

	def an_account(self, address, name="Marie Dupont"):
		"""A customer with an account: a Website User at `address`, tied to its customer by a contact. The customer's name."""
		customer = self.a_customer(address, name)
		frappe.get_doc(
			{
				"doctype": "User",
				"email": address,
				"first_name": name,
				"enabled": 1,
				"user_type": "Website User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": name,
				"user": address,
				"email_ids": [{"email_id": address, "is_primary": 1}],
				"links": [{"link_doctype": "Customer", "link_name": customer}],
			}
		).insert(ignore_permissions=True)
		return customer

	def sign_in(self, address, token=None):
		self.ask_for_a_code(address, token)
		return self.as_guest(
			guest_ordering.confirm_guest_code, (token or self.token).token, address, self.the_last_code()
		)

	def register(self, address, name="Jean Martin", mobile_no=None):
		"""The whole way of a new address: the code, then the account opened from its proof."""
		proof = self.sign_in(address)["proof"]
		return self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, name, mobile_no)

	def set_mode(self, mode):
		frappe.db.set_value("Restaurant", self.a, "guest_account_mode", mode)
		frappe.clear_document_cache("Restaurant")

	def order(self, *lines):
		items = [{"item_code": code, "qty": qty, "rate": 5} for code, qty in lines]
		return self.as_guest(guest_ordering.submit_guest_order, self.token.token, frappe.as_json(items))


class TestTheCode(GuestAccountCase):
	def test_a_code_is_mailed_to_the_address_by_the_engine(self):
		address = an_address()

		answer = self.ask_for_a_code(address)

		self.assertTrue(answer["ok"])
		self.assertEqual((answer["resend_in"], answer["expires_in"]), (passwordless.RESEND_AFTER, 600))
		self.assertEqual(len(self.mails), 1)
		self.assertEqual(self.mails[0]["recipients"], [address])
		self.assertRegex(self.the_last_code(), r"^\d{6}$")
		self.assertIn("/login-link?token=", self.mails[0]["args"]["link"])

	def test_the_mail_speaks_for_the_restaurant_of_the_page_and_only_for_that_call(self):
		seen = []

		def engine_call(address, redirect_to=None):
			seen.append((guest_account.brand(), redirect_to))
			return {"ok": True, "resend_in": 30, "expires_in": 600}

		with patch.object(passwordless, "request_code", side_effect=engine_call):
			self.ask_for_a_code(an_address())

		name = frappe.db.get_value("Restaurant", self.a, "restaurant_name")
		self.assertEqual(seen, [(name, f"/pos/guest/{self.token.token}")])
		self.assertEqual(guest_account.brand(), "")

	def test_the_answer_is_the_same_for_a_known_address_and_an_unknown_one(self):
		known, unknown = an_address(), an_address()
		self.an_account(known)

		self.assertEqual(self.ask_for_a_code(known), self.ask_for_a_code(unknown))

	def test_an_address_that_is_not_one_is_refused_and_nothing_is_sent(self):
		with self.assertRaises(frappe.ValidationError):
			self.ask_for_a_code("not an address")

		self.assertEqual(self.mails, [])

	def test_a_wrong_code_is_refused(self):
		address = an_address()
		self.an_account(address)
		self.ask_for_a_code(address)
		wrong = "000000" if self.the_last_code() != "000000" else "111111"

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, wrong)

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))

	def test_after_five_wrong_codes_even_the_right_one_is_refused(self):
		address = an_address()
		self.an_account(address)
		self.ask_for_a_code(address)
		right = self.the_last_code()
		wrong = "000000" if right != "000000" else "111111"
		for _try in range(passwordless.MAX_ATTEMPTS):
			with self.assertRaises(frappe.ValidationError):
				self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, wrong)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, right)

		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))

	def test_a_code_works_once(self):
		address = an_address()
		self.an_account(address)
		self.sign_in(address)
		code = self.the_last_code()

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, address, code)

	def test_the_ceilings_of_the_engine_reach_the_page(self):
		address = an_address()
		for _ask in range(passwordless.SENDS_PER_HOUR):
			passwordless._forget_counter("cooldown", passwordless._mac("address", address))
			self.ask_for_a_code(address)
		passwordless._forget_counter("cooldown", passwordless._mac("address", address))

		with self.assertRaises(frappe.TooManyRequestsError):
			self.ask_for_a_code(address)

		self.assertEqual(len(self.mails), passwordless.SENDS_PER_HOUR)

	def test_a_dead_token_gets_no_code(self):
		with self.assertRaises(frappe.AuthenticationError):
			self.as_guest(guest_ordering.request_guest_code, "no-such-token", an_address())

		self.assertEqual(self.mails, [])


class TestSigningIn(GuestAccountCase):
	def test_a_customer_signs_in_with_the_code_of_their_address(self):
		address = an_address()
		customer = self.an_account(address)

		answer = self.sign_in(address)

		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(answer["account"]["customer"], customer)
		self.assertEqual(answer["account"]["customer_name"], "Marie Dupont")
		self.assertEqual(answer["account"]["source"], "account")
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)
		self.manager.login_as.assert_not_called()

	def test_an_account_with_no_customer_yet_gets_one(self):
		# A shop account that never ordered: the customer is made from its own name, and tied to it
		address = an_address()
		frappe.get_doc(
			{
				"doctype": "User",
				"email": address,
				"first_name": "Paul",
				"last_name": "Durand",
				"enabled": 1,
				"user_type": "Website User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)

		customer = self.sign_in(address)["account"]["customer"]

		self.assertEqual(frappe.db.get_value("Customer", customer, "customer_name"), "Paul Durand")
		self.assertEqual(guest_account.customer_of_user(address), customer)

	def test_the_address_of_a_contact_finds_the_customer_too(self):
		address = an_address()
		customer = self.a_customer(an_address())
		frappe.get_doc(
			{
				"doctype": "User",
				"email": address,
				"first_name": "Marie",
				"enabled": 1,
				"user_type": "Website User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Marie",
				"email_ids": [{"email_id": address, "is_primary": 1}],
				"links": [{"link_doctype": "Customer", "link_name": customer}],
			}
		).insert(ignore_permissions=True)

		self.assertEqual(self.sign_in(address)["account"]["customer"], customer)

	def test_the_draft_order_of_the_table_goes_to_the_customer(self):
		address = an_address()
		customer = self.an_account(address)
		order = self.save([self.line(self.cola)])
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), self.fx.customer)

		self.sign_in(address)

		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), customer)

	def test_the_next_order_of_the_table_is_the_customers(self):
		address = an_address()
		customer = self.an_account(address)
		self.sign_in(address)

		answer = self.order((self.cola, 1))

		self.assertEqual(frappe.db.get_value("Sales Invoice", answer["invoice"], "customer"), customer)

	def test_a_table_linked_to_a_customer_is_not_taken_over(self):
		first, second = an_address(), an_address()
		customer = self.an_account(first)
		self.an_account(second, name="Paul Durand")
		self.sign_in(first)

		with self.assertRaises(frappe.ValidationError):
			self.sign_in(second)

		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)

	def test_the_same_customer_signing_in_again_is_not_refused(self):
		address = an_address()
		customer = self.an_account(address)
		self.sign_in(address)

		passwordless._forget_counter("cooldown", passwordless._mac("address", address))
		self.assertEqual(self.sign_in(address)["account"]["customer"], customer)


class TestOpeningAnAccount(GuestAccountCase):
	def test_an_unknown_address_is_to_register_after_the_code(self):
		address = an_address()
		before = (frappe.db.count("Customer"), frappe.db.count("User"))

		answer = self.sign_in(address)

		self.assertEqual(answer["status"], "needs_registration")
		self.assertTrue(answer["proof"])
		self.assertNotIn(address, answer["proof"])
		self.assertIsNone(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))
		self.assertEqual((frappe.db.count("Customer"), frappe.db.count("User")), before)

	def test_registering_opens_the_account_and_signs_them_in(self):
		address = an_address()

		answer = self.register(address, "Jean Martin", "+41 79 000 00 00")

		customer = answer["account"]["customer"]
		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(frappe.db.get_value("Customer", customer, "customer_name"), "Jean Martin")
		self.assertEqual(frappe.db.get_value("Customer", customer, "email_id"), address)
		self.assertEqual(frappe.db.get_value("Customer", customer, "mobile_no"), "+41 79 000 00 00")
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)
		self.manager.login_as.assert_not_called()

	def test_the_account_is_a_website_user_with_the_customer_role_and_nothing_else(self):
		address = an_address()

		self.register(address, "Jean Martin")

		user = frappe.db.get_value("User", address, ["user_type", "enabled", "first_name", "last_name"], as_dict=True)
		self.assertEqual((user.user_type, user.enabled, user.first_name, user.last_name), ("Website User", 1, "Jean", "Martin"))
		self.assertIn("Customer", frappe.get_roles(address))
		self.assertFalse({"System Manager", "Sales User", "Accounts User", "Stock User"} & set(frappe.get_roles(address)))

	def test_the_account_is_tied_to_its_customer_by_a_contact(self):
		address = an_address()

		customer = self.register(address, "Jean Martin")["account"]["customer"]

		self.assertEqual(guest_account._customer_of_contact(address), customer)
		self.assertTrue(guest_account._contact_of(customer, address))

	def test_a_customer_the_till_knows_by_the_address_gets_their_account_with_nothing_to_ask(self):
		address = an_address()
		customer = self.a_customer(address, name="Marie Dupont")
		before = frappe.db.count("Customer")

		answer = self.sign_in(address)

		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(answer["account"]["customer"], customer)
		self.assertEqual(frappe.db.count("Customer"), before)
		self.assertEqual(frappe.db.get_value("User", address, "user_type"), "Website User")
		self.assertEqual(frappe.db.get_value("User", address, "first_name"), "Marie")
		self.manager.login_as.assert_not_called()

	def test_registering_without_a_proof_is_refused_and_nothing_is_made(self):
		before = (frappe.db.count("Customer"), frappe.db.count("User"))

		for proof in ("", "a-made-up-proof", None, {"address": "x@y.ch"}):
			with self.assertRaises(frappe.PermissionError):
				self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")

		self.assertEqual((frappe.db.count("Customer"), frappe.db.count("User")), before)

	def test_the_proof_opens_the_address_it_was_made_for_and_no_other(self):
		address, other = an_address(), an_address()
		proof = self.sign_in(address)["proof"]

		self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")

		self.assertTrue(frappe.db.exists("User", address))
		self.assertFalse(frappe.db.exists("User", other))

	def test_the_proof_of_a_session_is_not_a_code(self):
		# The six digits that were mailed are not a proof: only what `verify_code` handed back is
		address = an_address()
		self.sign_in(address)

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, self.the_last_code(), "Jean Martin")

		self.assertFalse(frappe.db.exists("User", address))

	def test_a_missing_name_is_asked_for_and_the_proof_is_still_good(self):
		address = an_address()
		proof = self.sign_in(address)["proof"]

		for name in ("   ", None):
			with self.assertRaises(frappe.ValidationError):
				self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, name)

		answer = self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")
		self.assertEqual(answer["status"], "signed_in")

	def test_the_proof_is_used_once(self):
		address = an_address()
		proof = self.sign_in(address)["proof"]
		self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")

	def test_an_account_opened_on_a_table_that_has_a_customer_is_refused_the_table_not_the_account(self):
		first = an_address()
		self.an_account(first)
		self.sign_in(first)
		second = an_address()

		with self.assertRaises(frappe.ValidationError):
			self.register(second, "Paul Durand")

		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), guest_account.customer_of_user(first))
		self.assertEqual(frappe.db.get_value("User", second, "user_type"), "Website User")


class TestNoSessionOnThePhone(GuestAccountCase):
	def test_the_engine_is_never_asked_to_open_a_session(self):
		address = an_address()
		self.an_account(address)

		self.sign_in(address)

		self.manager.login_as.assert_not_called()
		self.assertEqual(frappe.session.user, "Administrator")

	def test_the_login_manager_is_given_back_whatever_the_engine_says(self):
		address = an_address()
		self.ask_for_a_code(address)

		with self.assertRaises(frappe.ValidationError):
			self.as_guest(guest_account.check_code, address, "000000" if self.the_last_code() != "000000" else "111111")

		self.assertIs(frappe.local.login_manager, self.manager)

	def test_a_staff_account_is_not_one_that_orders(self):
		self.assertIsNone(guest_account.website_user("Administrator"))
		self.assertIsNone(guest_account.website_user("Guest"))
		address = an_address()
		self.an_account(address)
		self.assertEqual(guest_account.website_user(address)["user"], address)
		frappe.db.set_value("User", address, "enabled", 0)
		self.assertIsNone(guest_account.website_user(address))


class TestWhatTheRestaurantRequires(GuestAccountCase):
	def test_a_restaurant_that_proposes_no_account_mails_nothing_and_makes_nobody(self):
		self.set_mode("Not Proposed")
		before = (frappe.db.count("Customer"), frappe.db.count("User"))

		with self.assertRaises(frappe.PermissionError):
			self.ask_for_a_code(an_address())
		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.confirm_guest_code, self.token.token, an_address(), "123456")

		self.assertEqual((self.mails, frappe.db.count("Customer"), frappe.db.count("User")), ([], *before))

	def test_a_real_proof_opens_no_account_where_the_restaurant_proposes_none(self):
		# The proof is good (it was handed back while accounts were proposed); the restaurant has closed them since
		address = an_address()
		proof = self.sign_in(address)["proof"]
		self.set_mode("Not Proposed")

		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.register_guest_account, self.token.token, proof, "Jean Martin")

		self.assertFalse(frappe.db.exists("User", address))
		self.assertIsNone(guest_account.customer_by_email(address))

	def test_an_order_asks_for_an_account_when_the_restaurant_requires_it(self):
		self.set_mode("Mandatory")

		with self.assertRaises(frappe.ValidationError):
			self.order((self.cola, 1))

		self.assertEqual(frappe.db.count("Sales Invoice Item", {"item_code": self.cola}), 0)

	def test_an_order_is_taken_once_signed_in(self):
		self.set_mode("Mandatory")
		address = an_address()
		self.an_account(address)
		self.sign_in(address)

		self.assertTrue(self.order((self.cola, 1))["invoice"])

	def test_an_order_is_taken_once_an_account_is_opened(self):
		self.set_mode("Mandatory")
		self.register(an_address())

		self.assertTrue(self.order((self.cola, 1))["invoice"])

	def test_an_account_that_is_optional_or_not_proposed_is_never_asked_for(self):
		for mode in ("Optional", "Not Proposed"):
			self.set_mode(mode)

			self.assertTrue(self.order((self.cola, 1))["invoice"])

	def test_the_page_is_told_the_mode(self):
		self.set_mode("Mandatory")

		self.assertEqual(self.as_guest(guest_ordering.validate_token, self.token.token)["guest_account_mode"], "Mandatory")

	def test_where_no_code_can_be_mailed_nothing_is_offered_and_nothing_is_required(self):
		self.set_mode("Mandatory")

		with patch.object(passwordless, "is_enabled", return_value=False):
			told = self.as_guest(guest_ordering.validate_token, self.token.token)["guest_account_mode"]
			with self.assertRaises(frappe.PermissionError):
				self.ask_for_a_code(an_address())
			ordered = self.order((self.cola, 1))

		self.assertEqual(told, "Not Proposed")
		self.assertEqual(self.mails, [])
		self.assertTrue(ordered["invoice"])

	def test_a_frappe_with_no_engine_offers_no_account_either(self):
		self.set_mode("Mandatory")

		with patch.object(guest_account, "engine", return_value=None):
			told = self.as_guest(guest_ordering.validate_token, self.token.token)["guest_account_mode"]
			with self.assertRaises(frappe.PermissionError):
				self.ask_for_a_code(an_address())

		self.assertEqual(told, "Not Proposed")


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

	def test_the_points_are_counted_for_a_guest_who_has_no_right_on_the_customer(self):
		# The count is ERPNext's own, read as the page reads it: with no session, no right, and nothing patched
		customer = self.a_customer(an_address())
		program = frappe.get_doc(
			{
				"doctype": "Loyalty Program",
				"loyalty_program_name": "_Test Guest Program",
				"loyalty_program_type": "Single Tier Program",
				"conversion_factor": 0.5,
				"company": self.company,
				"collection_rules": [{"tier_name": "Base", "collection_factor": 100, "min_spent": 0}],
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)
		frappe.db.set_value("Customer", customer, "loyalty_program", program.name)
		frappe.get_doc(
			{
				"doctype": "Loyalty Point Entry",
				"customer": customer,
				"loyalty_program": program.name,
				"loyalty_points": 40,
				"purchase_amount": 400,
				"posting_date": nowdate(),
				"expiry_date": add_days(nowdate(), 365),
				"company": frappe.db.get_value("POS Profile", self.fx.profile, "company"),
				"invoice_type": "Sales Invoice",
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_loyalty_program", 1)
		self.save([self.line(self.cola)], customer=customer)

		account = self.as_guest(guest_ordering.validate_token, self.token.token)["account"]

		self.assertEqual(
			(account["loyalty_points"], account["loyalty_value"], account["loyalty_program"]), (40, 20.0, program.name)
		)

	def test_a_customer_with_no_programme_has_no_points(self):
		customer = self.a_customer(an_address())
		# A new customer is enrolled in the default programme by a hook of the till: this one is taken out of it
		frappe.db.set_value("Customer", customer, "loyalty_program", None)
		frappe.db.set_value("POS Settings", {"pos_profile": self.fx.profile}, "enable_loyalty_program", 1)
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
