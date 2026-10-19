# //// Neoffice — added file (no upstream equivalent).
"""A payment step that changes state answers POST only (maintenance#1721).

Frappe rolls a GET request's transaction back: a refund made by opening its address returned the
money at the PSP and left the Payment Intent `succeeded`, refundable a second time.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import payments

CHANGES_STATE = (
	payments.pos_start_payment,
	payments.pos_attach_device,
	payments.pos_cancel_payment,
	payments.pos_refund_payment,
	payments.pos_simulate_terminal_outcome,
)
READS = (
	payments.pos_get_mapping,
	payments.pos_get_intent_status,
	payments.pos_get_active_devices,
)


class TestPaymentStepsTakePostOnly(FrappeTestCase):
	def test_a_step_that_changes_state_refuses_a_get(self):
		for function in CHANGES_STATE:
			with self.subTest(function=function.__name__):
				self.assertEqual(tuple(frappe.allowed_http_methods_for_whitelisted_func[function]), ("POST",))

	def test_reading_stays_open_to_a_get(self):
		for function in READS:
			with self.subTest(function=function.__name__):
				self.assertIn("GET", tuple(frappe.allowed_http_methods_for_whitelisted_func[function]))

	def test_submitting_an_invoice_refuses_a_get(self):
		# A return refunds its PSP payment while the invoice is submitted: a GET would refund and roll back.
		from pos_next.api import invoices

		self.assertEqual(
			tuple(frappe.allowed_http_methods_for_whitelisted_func[invoices.submit_invoice]), ("POST",)
		)

	def test_every_whitelisted_function_of_the_module_is_classified(self):
		# A new endpoint must be put on one side or the other, not left open to GET by default.
		whitelisted = {
			name
			for name, value in vars(payments).items()
			if callable(value) and value in frappe.allowed_http_methods_for_whitelisted_func
		}
		classified = {function.__name__ for function in CHANGES_STATE + READS}
		self.assertEqual(whitelisted, classified)
