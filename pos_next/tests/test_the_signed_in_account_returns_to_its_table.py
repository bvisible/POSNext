# //// Neoffice — added file (no upstream equivalent).
"""The link of the sign-in mail brings a guest back to the table they started from (NeoResto lot 1, Daniel, 03.11.2026: the guest starts from the
table's QR code, so the page knows the table; the link of the mail signs them in and brings them back to that page, which links their account to the
table). The link signs a customer in on the phone (the engine's login, `frappe.passwordless.sign_in_with_link`); the page asks without any session for
everything else, so two calls of its own carry the session: one asks whose it is, one links it. The suite pins:

- what the page may learn of the session: the name of a customer's account (a Website User) and nothing of a guest, a member of the staff or a
  disabled account, whatever the table;
- linking: the customer of the account becomes the customer of the table and of its draft order, one customer per table (another account never
  takes it over), only a customer's session can do it, and only on a table of a restaurant that proposes accounts;
- the caller's session comes back whole after what is written as the system (its id and its data, not only its user).
"""

import frappe

from pos_next.api import guest_ordering
from pos_next.tests.test_guest_account import GuestAccountCase, an_address


class TheSignedInAccountReturnsToItsTableCase(GuestAccountCase):
	def test_a_guest_session_is_signed_in_as_nobody(self):
		self.assertEqual(
			self.as_guest(guest_ordering.signed_in_account, self.token.token), {"account": None}
		)

	def test_a_customers_session_is_offered_its_own_name(self):
		address = an_address()
		self.an_account(address, "Marie Dupont")

		answer = self.as_user(address, guest_ordering.signed_in_account, self.token.token)

		self.assertEqual(answer, {"account": {"user": address, "full_name": "Marie Dupont"}})

	def test_a_member_of_the_staff_is_offered_nothing(self):
		answer = self.as_user("Administrator", guest_ordering.signed_in_account, self.token.token)

		self.assertEqual(answer, {"account": None})

	def test_a_disabled_account_is_offered_nothing(self):
		address = an_address()
		self.an_account(address)
		frappe.db.set_value("User", address, "enabled", 0)

		self.assertEqual(
			self.as_user(address, guest_ordering.signed_in_account, self.token.token), {"account": None}
		)

	def test_nothing_is_offered_where_accounts_are_not_proposed(self):
		address = an_address()
		self.an_account(address)
		self.set_mode("Not Proposed")

		with self.assertRaises(frappe.PermissionError):
			self.as_user(address, guest_ordering.signed_in_account, self.token.token)

	def test_linking_makes_the_customer_of_the_account_the_customer_of_the_table(self):
		address = an_address()
		customer = self.an_account(address, "Marie Dupont")
		order = self.save([self.line(self.cola)])
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), self.fx.customer)

		answer = self.as_user(address, guest_ordering.claim_signed_in_account, self.token.token)

		self.assertEqual(answer["status"], "signed_in")
		self.assertEqual(answer["account"]["customer_name"], "Marie Dupont")
		self.assertEqual(frappe.db.get_value("Guest Order Token", self.token.name, "customer"), customer)
		self.assertEqual(frappe.db.get_value("Sales Invoice", order, "customer"), customer)

	def test_the_next_order_of_the_table_is_the_linked_customers(self):
		address = an_address()
		customer = self.an_account(address)
		self.as_user(address, guest_ordering.claim_signed_in_account, self.token.token)

		answer = self.order((self.cola, 1))

		self.assertEqual(frappe.db.get_value("Sales Invoice", answer["invoice"], "customer"), customer)

	def test_a_table_taken_by_another_customer_is_never_taken_over(self):
		first, second = an_address(), an_address()
		self.an_account(first, "Marie Dupont")
		self.an_account(second, "Paul Martin")
		self.sign_in(first)

		with self.assertRaises(frappe.ValidationError):
			self.as_user(second, guest_ordering.claim_signed_in_account, self.token.token)

		self.assertEqual(
			guest_ordering.guest_account.customer_of(
				frappe.get_doc("Guest Order Token", self.token.name)
			)[0],
			self.customer_of_address(first),
		)

	def test_a_guest_cannot_link_an_account(self):
		with self.assertRaises(frappe.PermissionError):
			self.as_guest(guest_ordering.claim_signed_in_account, self.token.token)

	def test_a_member_of_the_staff_cannot_link_an_account(self):
		with self.assertRaises(frappe.PermissionError):
			self.as_user("Administrator", guest_ordering.claim_signed_in_account, self.token.token)

		self.assertFalse(frappe.db.get_value("Guest Order Token", self.token.name, "customer"))

	def test_an_unknown_table_is_refused(self):
		address = an_address()
		self.an_account(address)

		with self.assertRaises(frappe.AuthenticationError):
			self.as_user(address, guest_ordering.claim_signed_in_account, "no-such-table")

	def test_the_session_of_the_caller_comes_back_whole_after_a_write_as_the_system(self):
		address = an_address()
		self.an_account(address)
		frappe.set_user(address)
		frappe.local.session.sid = "a-real-session-id"
		frappe.local.session.data = frappe._dict(csrf_token="a-token")
		try:
			with guest_ordering._as_the_system():
				self.assertEqual(frappe.session.user, "Administrator")

			self.assertEqual(frappe.session.user, address)
			self.assertEqual(frappe.session.sid, "a-real-session-id")
			self.assertEqual(frappe.session.data.csrf_token, "a-token")
		finally:
			frappe.set_user("Administrator")

	def test_the_session_of_the_caller_comes_back_whole_after_linking(self):
		address = an_address()
		self.an_account(address)
		frappe.set_user(address)
		frappe.local.session.sid = "a-real-session-id"
		frappe.local.session.data = frappe._dict(csrf_token="a-token")
		try:
			guest_ordering.claim_signed_in_account(self.token.token)

			self.assertEqual(frappe.session.user, address)
			self.assertEqual(frappe.session.sid, "a-real-session-id")
			self.assertEqual(frappe.session.data.csrf_token, "a-token")
		finally:
			frappe.set_user("Administrator")

	def customer_of_address(self, address):
		return guest_ordering.guest_account.customer_by_email(address)
