# //// Neoffice — added file (no upstream equivalent).
"""The reads of the offers and of the wallet payments are the till's (neoffice-maintenance#1971).

`validate_coupon`, `apply_offers` and `get_wallet_payment_flags` answered any signed-in account. They now ask `require_till_user` first (the
sweep of the endpoints, test_till_endpoints_sweep, plays them against a portal account, a visitor and a desk account with no till). This file
pins, without a database, what the sweep cannot: that the check of `apply_offers` stands OUTSIDE the `try` whose handler turns every exception
into "Error applying offers" (inside, the refusal would be swallowed into a message and the call would still end in an error nobody reads as a
refusal), and which till it names.
"""

import inspect
import json
import unittest
from unittest.mock import patch

import frappe

from pos_next.api import invoices, offers, pos_profile

GUARD = "pos_next.api.cash_entry.require_till_user"


class TestApplyOffersAsksItsCaller(unittest.TestCase):
	def apply(self, payload):
		return inspect.unwrap(invoices.apply_offers)(payload)

	def test_a_refusal_reaches_the_caller_as_a_refusal(self):
		with patch(GUARD, side_effect=frappe.PermissionError("Not permitted")):
			with self.assertRaises(frappe.PermissionError):
				self.apply(json.dumps({"pos_profile": "Till 1", "items": [{"item_code": "A"}]}))

	def test_the_till_named_by_the_payload_is_the_one_asked_for(self):
		for payload in (
			json.dumps({"pos_profile": "Till 1", "items": []}),
			{"pos_profile": "Till 1", "items": []},
		):
			with patch(GUARD) as guard:
				self.apply(payload)
			guard.assert_called_once_with("Till 1")

	def test_a_payload_that_names_no_till_asks_for_a_user_of_some_till(self):
		# A till is named by a text: a list, a dict, a number or nothing is no till (a dict would be read as a filter further down)
		for payload in (
			json.dumps({"items": []}),
			{"pos_profile": ["Till 1"], "items": []},
			{"pos_profile": {"name": "Till 1"}, "items": []},
			"",
			None,
		):
			with self.subTest(payload=payload), patch(GUARD) as guard:
				self.apply(payload)
			guard.assert_called_once_with(None)


class TestTheOtherTwoAskTheirCaller(unittest.TestCase):
	def test_a_coupon_is_read_by_the_till_only(self):
		with patch(GUARD, side_effect=frappe.PermissionError("Not permitted")) as guard:
			with self.assertRaises(frappe.PermissionError):
				inspect.unwrap(offers.validate_coupon)("ANY")
		guard.assert_called_once_with()

	def test_the_wallet_payment_flags_are_read_by_the_till_only(self):
		with patch(GUARD, side_effect=frappe.PermissionError("Not permitted")) as guard:
			with self.assertRaises(frappe.PermissionError):
				inspect.unwrap(pos_profile.get_wallet_payment_flags)(json.dumps(["Cash"]))
		guard.assert_called_once_with()
