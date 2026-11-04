# //// Neoffice — added file (no upstream equivalent).
"""A guest's QR order under an offer of the till (maintenance#2077).

The till's offers (Pricing Rules) never showed on the QR page: the till's calculation (`apply_offers`) refused the guest, and every menu wrote
two rows to the Error Log. And the guest's draft was saved without `ignore_pricing_rule`: ERPNext priced its lines again by its own rules, on the
price list's price, while the till reloads a table taking each line's `rate` as its catalogue price and applies its offers on top of it.

Now the page shows the offer (menu and order), the draft keeps the card's price whatever the rules, the till's save keeps it too, and the order
the guest pays on the phone is charged and submitted at the price the page showed.

The guest acts as `Guest`; the test administrator lays the table and the offer. The suite rolls back.
"""

from unittest.mock import patch

import frappe
from frappe.utils import flt, nowdate

from pos_next.api import guest_ordering
from pos_next.tests.test_guest_account import GuestAccountCase

CARD_PRICE = 5  # what GuestAccountCase's card asks for every dish
OFFER = 10


class OfferCase(GuestAccountCase):
	def setUp(self):
		super().setUp()
		# The offer is the till's: on the company of the till the table's code belongs to
		company = frappe.db.get_value("POS Profile", self.fx.profile, "company")
		self.rule = frappe.get_doc(
			{
				"doctype": "Pricing Rule",
				"title": "_Test Guest Offer",
				"apply_on": "Item Code",
				"items": [{"item_code": self.cola}],
				"price_or_product_discount": "Price",
				"rate_or_discount": "Discount Percentage",
				"discount_percentage": OFFER,
				"selling": 1,
				"company": company,
				"currency": frappe.get_cached_value("Company", company, "default_currency"),
				"valid_from": nowdate(),
			}
		).insert(ignore_permissions=True)
		self.discounted = flt(CARD_PRICE * (1 - OFFER / 100), 2)

	def menu(self):
		menu = self.as_guest(guest_ordering.get_guest_menu, self.token.token)
		return {dish["item_code"]: dish for category in menu["categories"] for dish in category["menu_items"]}

	def rows(self, invoice):
		return {
			row.item_code: row
			for row in frappe.get_all(
				"Sales Invoice Item",
				filters={"parent": invoice},
				fields=["item_code", "rate", "price_list_rate", "discount_percentage", "pricing_rules"],
			)
		}

	def errors_logged(self):
		return frappe.db.count(
			"Error Log", {"method": ["in", ["Guest offers failed", "Guest menu pricing rules failed", "Apply Offers Error"]]}
		)


class TestTheOfferShows(OfferCase):
	def test_the_menu_shows_the_offer_on_the_dish_it_is_for(self):
		dishes = self.menu()

		self.assertEqual(dishes[self.cola]["discounted_price"], self.discounted)
		self.assertEqual(flt(dishes[self.cola]["discount_percentage"], 2), OFFER)
		self.assertNotIn("discounted_price", dishes[self.soup])

	def test_the_menu_writes_nothing_to_the_error_log(self):
		before = self.errors_logged()

		self.menu()

		self.assertEqual(self.errors_logged(), before)

	def test_the_order_shows_its_lines_and_its_total_after_the_offer(self):
		invoice = self.order((self.cola, 2), (self.soup, 1))["invoice"]

		status = self.as_guest(guest_ordering.get_order_status, self.token.token)

		lines = {line["item_code"]: line for line in status["items"]}
		self.assertEqual(lines[self.cola]["rate"], self.discounted)
		self.assertEqual(lines[self.cola]["price_list_rate"], CARD_PRICE)
		self.assertEqual(lines[self.soup]["rate"], CARD_PRICE)
		self.assertEqual(status["grand_total"], flt(2 * self.discounted + CARD_PRICE, 2))
		self.assertTrue(invoice)

	def test_a_site_without_offers_does_not_price_its_menu_again(self):
		# No offer a till could apply, the site's own ones too (the suite rolls back)
		frappe.db.sql("UPDATE `tabPricing Rule` SET disable = 1 WHERE selling = 1")

		with patch("pos_next.api.invoices.apply_offers") as apply_offers:
			self.menu()

		apply_offers.assert_not_called()


class TestTheDraftKeepsTheCardPrice(OfferCase):
	def test_the_guests_line_is_written_at_the_card_price_not_the_offer(self):
		invoice = self.order((self.cola, 1))["invoice"]

		row = self.rows(invoice)[self.cola]
		self.assertEqual(row.rate, CARD_PRICE)
		self.assertFalse(flt(row.discount_percentage))
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "ignore_pricing_rule"), 1)

	def test_a_second_round_does_not_price_the_first_again(self):
		invoice = self.order((self.cola, 1))["invoice"]

		self.order((self.soup, 1))

		self.assertEqual(self.rows(invoice)[self.cola].rate, CARD_PRICE)
		self.assertEqual(frappe.db.get_value("Sales Invoice", invoice, "grand_total"), 2 * CARD_PRICE)


class TestTheOrderPaidOnThePhone(OfferCase):
	def the_provider_settles(self, invoice, amount):
		return frappe.get_doc(
			{
				"doctype": "Payment Intent",
				"status": "succeeded",
				"amount": round(amount * 100),
				"currency": frappe.db.get_value("Sales Invoice", invoice, "currency"),
				"reference_doctype": "Sales Invoice",
				"reference_name": invoice,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)

	def test_the_whole_order_paid_at_the_price_shown_is_submitted_at_that_price(self):
		invoice = self.order((self.cola, 2), (self.soup, 1))["invoice"]
		shown = self.as_guest(guest_ordering.get_order_status, self.token.token)["grand_total"]
		self.the_provider_settles(invoice, shown)

		answer = self.as_guest(guest_ordering.confirm_guest_payment, self.token.token, shown)

		self.assertTrue(answer["submitted"])
		self.assertEqual(
			frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "grand_total", "paid_amount"]), (1, shown, shown)
		)
		row = self.rows(invoice)[self.cola]
		self.assertEqual((row.price_list_rate, row.rate), (CARD_PRICE, self.discounted))
		self.assertEqual(flt(row.discount_percentage, 2), OFFER)
