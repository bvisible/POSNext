# //// Neoffice — added file (no upstream equivalent).
"""The decor of a cart paid on the phone (scan in the shop, lot 4): a finished cart, the provider that settles it.

The test administrator lays the till and stands for the payment provider: a Payment Intent of the cart's draft that the
`payments` app marks settled on the provider's word, as the restaurant's payment tests do. The confirmation and the check
commit on purpose (a refund made is never rolled back): their commits are no-ops here, and the suite rolls back.
"""

from unittest.mock import patch

import frappe

from pos_next.api import shop_scan
from pos_next.tests.shop_scan_case import ShopCase

WEB_MODE = "_Test Shop Web Payment"


def _web_mode(company):
	"""The mode of payment the payment page's money is booked under: not the till's cash, with an account of the company."""
	account = frappe.get_cached_value("Company", company, "default_cash_account") or frappe.db.get_value(
		"Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name"
	)
	if not frappe.db.exists("Mode of Payment", WEB_MODE):
		frappe.get_doc(
			{"doctype": "Mode of Payment", "mode_of_payment": WEB_MODE, "type": "Bank", "enabled": 1}
		).insert(ignore_permissions=True)
	mode = frappe.get_doc("Mode of Payment", WEB_MODE)
	mode.enabled = 1
	if not [row for row in mode.accounts if row.company == company]:
		mode.append("accounts", {"company": company, "default_account": account})
	mode.save(ignore_permissions=True)
	# The desk theme disables a mode saved with no default bank account (neoffice_theme.events.handle_mode_of_payment):
	# the payment page's mode is enabled again behind it, and its cached record dropped
	frappe.db.set_value("Mode of Payment", WEB_MODE, "enabled", 1)
	frappe.clear_document_cache("Mode of Payment", WEB_MODE)
	return WEB_MODE


class PaidCase(ShopCase):
	def setUp(self):
		super().setUp()
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		self.addCleanup(
			setattr, frappe.flags, "ignore_account_permission", frappe.flags.ignore_account_permission
		)
		# A payment page exists on the site, as the restaurant's: the shop's payment does not depend on one being set up
		provider = patch("pos_next.shop_scan.payment._provider", return_value="_test_wallee")
		provider.start()
		self.addCleanup(provider.stop)
		self.web_mode = _web_mode(self.fx.company)

	def a_cart(self, qty=2):
		token = self.a_session()
		self.as_guest(shop_scan.scan_item, token, "PNXT-SHOP-A", qty)
		return token, self.as_guest(shop_scan.get_shop_cart, token)

	def the_provider(self, token, amount=None, status="succeeded"):
		"""A payment of the cart as the provider reports it: `amount` charged (the cart's amount by default), its state."""
		draft = self.the_draft(token)
		return frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": status,
				"amount": round((draft.grand_total if amount is None else amount) * 100),
				"currency": draft.currency,
				"reference_doctype": "Sales Invoice",
				"reference_name": draft.name,
				"metadata_json": frappe.as_json({"shop_cart": 1, "mode_of_payment": self.web_mode}),
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

	def a_paid_cart(self, qty=2):
		token, _phone = self.a_cart(qty)
		self.the_provider(token)
		answer = self.as_guest(shop_scan.confirm_shop_payment, token)
		self.assertEqual(answer["status"], "paid")
		return token, answer["cart"]

	def session_of(self, token):
		return frappe.db.get_value(
			"Guest Order Token",
			{"token": token},
			["name", "cart_status", "status", "paid_lines", "expires_at", "invoice"],
			as_dict=True,
		)
