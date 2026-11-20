# //// Neoffice — added file (no upstream equivalent).
"""A sale with no customer is priced in a customer group the site has (neoffice-maintenance#3187).

`apply_offers` priced a sale with no customer in the group named « All Customer Groups »: the name of the root on an English site. The pricing engine refuses a
group that does not exist (« Invalid <name> »), so a site whose root is named otherwise answered 417 « Erreur lors de l'application des offres : Invalide All
Customer Groups » as soon as the cashier cleared the customer. The default is the root of the site's own tree, and a group or a territory the payload names
that the site does not have is read as none. The suite asks as the cashier is, with the role of the persona `cashier`, and plays the real engine.
"""

import inspect
import json
from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role, make_persona
from frappe.tests.utils import FrappeTestCase

from pos_next.api import invoices
from pos_next.tests.test_till_writes_need_the_till import CASHIER_ROLE, OTHER_TILL, TILL, _till_fixture, _user

NO_SUCH_GROUP = "_Test No Such Customer Group 3187"
NO_SUCH_TERRITORY = "_Test No Such Territory 3187"


class TestASaleWithNoCustomerIsPricedInAGroupTheSiteHas(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		_user(TILL, [CASHIER_ROLE], "System User")
		_user(OTHER_TILL, ["Blogger"], "System User")
		self.fx = _till_fixture()
		self.cashier = make_persona("cashier")
		profile = frappe.get_doc("POS Profile", self.fx.profile)
		profile.append("applicable_for_users", {"user": self.cashier})
		profile.save(ignore_permissions=True)
		self.root = frappe.db.get_value(
			"Customer Group", {"is_group": 1, "parent_customer_group": ["is", "not set"]}, "name"
		)

	def payload(self, **changes):
		sale = {
			"doctype": "Sales Invoice",
			"pos_profile": self.fx.profile,
			"company": self.fx.company,
			"customer": None,
			"items": [{"item_code": self.fx.item, "qty": 1, "rate": 10}],
		}
		sale.update(changes)
		return json.dumps(sale)

	def apply(self, payload):
		"""What the till sends, as the cashier of the till is: the role of the till and nothing else."""
		with as_role("cashier"):
			return inspect.unwrap(invoices.apply_offers)(payload)

	def engine_sees(self, payload):
		"""The arguments the pricing engine is asked with (the engine itself is not run)."""
		seen = []

		def spy(args, doc=None):
			seen.append(args)
			return []

		with patch.object(invoices, "erpnext_apply_pricing_rule", side_effect=spy):
			self.apply(payload)
		self.assertEqual(len(seen), 1)
		return seen[0]

	def test_the_site_has_a_root_group_whatever_it_is_called(self):
		self.assertTrue(self.root)
		self.assertEqual(invoices._the_root_customer_group(), self.root)

	def test_a_sale_with_no_customer_is_priced_in_the_root_of_the_sites_tree(self):
		args = self.engine_sees(self.payload())

		self.assertEqual(args.customer_group, self.root)
		self.assertTrue(frappe.db.exists("Customer Group", args.customer_group))

	def test_a_group_the_payload_names_and_the_site_does_not_have_is_no_group(self):
		args = self.engine_sees(self.payload(customer_group=NO_SUCH_GROUP))

		self.assertNotEqual(args.customer_group, NO_SUCH_GROUP)
		self.assertEqual(args.customer_group, self.root)

	def test_a_territory_the_payload_names_and_the_site_does_not_have_is_no_territory(self):
		args = self.engine_sees(self.payload(territory=NO_SUCH_TERRITORY))

		self.assertIsNone(args.territory)

	def test_a_customer_is_priced_in_her_own_group(self):
		group = frappe.db.get_value("Customer", self.fx.customer, "customer_group")

		args = self.engine_sees(self.payload(customer=self.fx.customer))

		self.assertEqual(args.customer_group, group)

	def test_a_group_the_site_has_is_kept(self):
		args = self.engine_sees(self.payload(customer_group=self.root))

		self.assertEqual(args.customer_group, self.root)

	def test_the_real_engine_answers_a_sale_with_no_customer(self):
		"""The call the cashier's till makes when she clears the customer: no 417, the cart comes back."""
		answer = self.apply(self.payload())

		self.assertIn("items", answer)

	def test_the_real_engine_answers_a_group_and_a_territory_the_site_does_not_have(self):
		answer = self.apply(self.payload(customer_group=NO_SUCH_GROUP, territory=NO_SUCH_TERRITORY))

		self.assertIn("items", answer)
