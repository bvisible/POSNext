# //// Neoffice — added file (no upstream equivalent).
"""The page that comes back from the payment page asks the provider where the payment stands (product owner, 06.11.2026).

A Wallee payment page intent moved to `succeeded` only by the scheduler's minute job: the provider's webhook is refused on the site (no secret in
Wallee Settings), and `confirm_guest_payment` read the intent from the database. The guest, back on the page, waited for the next tick, up to a
minute after Wallee had settled (23 s, 64 s and 68 s measured on real card payments). `confirm_guest_payment` now refreshes the order's payments that
are still in flight from the provider, once per call (the page asks again every three seconds), as the webshop's return page does.

The guest acts as `Guest`; the test administrator lays the table and stands for the provider: `payments.www.wallee.success._refresh_status`, which
asks Wallee, is replaced by what Wallee would answer. The suite rolls back.
"""

from unittest.mock import patch

import frappe

from pos_next.tests.test_a_guest_payment_is_booked_by_the_provider import PaymentCase

REFRESH = "payments.www.wallee.success._refresh_status"


class TestTheProviderIsAskedAtTheReturn(PaymentCase):
	def in_flight(self, channel="wallee_web", status="processing"):
		"""A payment of the order the provider has not settled in the database yet: a Wallee payment page transaction."""
		intent = self.the_provider(10, status=status)
		frappe.db.set_value(
			"Payment Intent",
			intent.name,
			{"channel": channel, "provider": "wallee_test", "provider_intent_id": "4242"},
		)
		return intent

	@staticmethod
	def wallee_has_settled(intent_doc, max_retries=9, retry_delay=3):
		"""What the provider's answer does to the intent: the redirect's transition, as the webshop's return page makes it."""
		intent_doc.transition_to("succeeded", event_source="redirect", ignore_invalid=True)

	def test_a_payment_the_provider_settled_is_booked_at_this_very_call_not_at_the_next_tick(self):
		intent = self.in_flight()

		with patch(REFRESH, side_effect=self.wallee_has_settled) as asked:
			answer = self.confirm(10)

		asked.assert_called_once()
		self.assertEqual(asked.call_args.args[0].name, intent.name)
		# One try, no waiting: the page asks again by itself
		self.assertEqual(asked.call_args.kwargs, {"max_retries": 1})
		self.assertEqual(answer["status"], "success")
		self.assertTrue(answer["submitted"])
		self.assertEqual((self.the_order().docstatus, self.the_order().paid_amount), (1, 10))

	def test_a_payment_still_in_flight_is_told_so_and_the_provider_is_asked_again_on_the_next_call(self):
		self.in_flight()

		with patch(REFRESH) as asked:
			first = self.confirm(10)
			second = self.confirm(10)

		self.assertEqual((first["status"], second["status"]), ("awaiting_payment", "awaiting_payment"))
		self.assertEqual(asked.call_count, 2)
		self.assertEqual(self.the_order().paid_amount, 0)

	def test_only_a_wallee_payment_page_payment_is_asked_of_wallee(self):
		self.in_flight(channel="terminal")

		with patch(REFRESH) as asked:
			answer = self.confirm(10)

		asked.assert_not_called()
		self.assertEqual(answer["status"], "awaiting_payment")

	def test_a_payment_already_settled_is_not_asked_again(self):
		self.the_provider(10)

		with patch(REFRESH) as asked:
			answer = self.confirm(10)

		asked.assert_not_called()
		self.assertEqual(answer["status"], "success")

	def test_a_payment_of_another_order_is_not_asked_here(self):
		other = self.the_provider(10, status="processing", invoice="_Test another order")
		frappe.db.set_value("Payment Intent", other.name, {"channel": "wallee_web", "provider_intent_id": "4243"})

		with patch(REFRESH) as asked:
			self.confirm(10)

		asked.assert_not_called()

	def test_a_provider_that_cannot_be_reached_leaves_the_payment_as_it_was_and_says_so_in_the_log(self):
		self.in_flight()
		before = frappe.db.count("Error Log", {"method": "Guest payment: asking the provider failed"})

		with patch(REFRESH, side_effect=ConnectionError("the provider does not answer")):
			answer = self.confirm(10)

		self.assertEqual(answer["status"], "awaiting_payment")
		self.assertEqual(self.the_order().paid_amount, 0)
		self.assertEqual(frappe.db.count("Error Log", {"method": "Guest payment: asking the provider failed"}), before + 1)
