# //// Neoffice — added file (no upstream equivalent). Pins the till's own address book for a
# //// cashier who holds only POSNext Cashier (#790 follow-up, 26.09): see the address book block
# //// in pos_next/api/customers.py.
"""A cashier holding only POSNext Cashier keeps a customer's address book at the till.

The role writes Customer but not Contact nor Address, and the fleet's sites run a
frozen custom rule set on those two, without the standard "All, if creator" rule.
The tests freeze them the same way, then pin:

  * the cashier creates a customer with a phone and an e-mail, and gets its
    primary Contact, although they may not create a Contact themselves;
  * the cashier adds an address and a contact to THAT customer, and edits them;
  * the cashier cannot write the address of a customer they may not write, nor
    pull another party's address into a customer they may write;
  * an e-mail another Contact already carries is refused with a clear message:
    ERPNext would otherwise reuse that other party's Contact.
"""

from unittest.mock import patch

import frappe
from frappe.permissions import setup_custom_perms
from frappe.tests.utils import FrappeTestCase

from pos_next.api.customers import create_customer, save_customer_address, save_customer_contact

CASHIER = "till-address-book-cashier@yopmail.com"
ROLE = "POSNext Cashier"


def _freeze_without_all_rule(doctype):
	"""The fleet's shape: a custom rule set on the doctype, without the "All" rule."""
	setup_custom_perms(doctype)
	frappe.db.delete("Custom DocPerm", {"parent": doctype, "role": "All"})
	frappe.clear_cache(doctype=doctype)


def _linked(doctype, customer):
	return frappe.get_all(
		"Dynamic Link",
		filters={"parenttype": doctype, "link_doctype": "Customer", "link_name": customer},
		pluck="parent",
	)


class TestCashierAddressBook(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("Role", ROLE):
			self.skipTest("POSNext Cashier is not installed")
		# neoffice_theme's contact save commits; keep everything inside this test's transaction.
		self._commit = patch.object(frappe.db, "commit")
		self._commit.start()
		for doctype in ("Contact", "Address"):
			_freeze_without_all_rule(doctype)
		if not frappe.db.exists("User", CASHIER):
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": CASHIER,
					"first_name": "Till",
					"user_type": "System User",
					"send_welcome_email": 0,
				}
			)
			user.flags.skip_drive_setup = True
			user.insert(ignore_permissions=True)
		user = frappe.get_doc("User", CASHIER)
		user.flags.skip_drive_setup = True
		user.set("roles", [{"role": ROLE}])
		user.save(ignore_permissions=True)
		frappe.clear_cache(user=CASHIER)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		self._commit.stop()
		for doctype in ("Contact", "Address"):
			frappe.clear_cache(doctype=doctype)
		frappe.clear_cache(user=CASHIER)

	def _new_customer(self, label):
		frappe.set_user(CASHIER)
		customer = create_customer(
			customer_name=f"Till {label} {frappe.generate_hash(length=6)}",
			mobile_no="+41791234567",
			email_id=f"till-{label}-{frappe.generate_hash(length=8)}@yopmail.com",
		)
		return customer["name"], customer["email_id"]

	def _needs_theme(self):
		if "neoffice_theme" not in frappe.get_installed_apps():
			self.skipTest("the address book save lives in neoffice_theme")

	def test_the_fleet_shape_is_reproduced(self):
		frappe.set_user(CASHIER)
		self.assertTrue(frappe.has_permission("Customer", "create"))
		self.assertFalse(frappe.has_permission("Contact", "create"))
		self.assertFalse(frappe.has_permission("Address", "create"))

	def test_cashier_creates_a_customer_with_phone_and_email(self):
		name, email = self._new_customer("create")

		frappe.set_user("Administrator")
		contacts = _linked("Contact", name)
		self.assertEqual(len(contacts), 1)
		self.assertEqual(frappe.db.get_value("Contact", contacts[0], "email_id"), email)
		self.assertEqual(frappe.db.get_value("Customer", name, "customer_primary_contact"), contacts[0])

	def test_cashier_adds_and_edits_that_customers_address_and_contact(self):
		self._needs_theme()
		name, _email = self._new_customer("book")

		address = save_customer_address(
			name,
			{
				"address_line1": "Rue du Marché",
				"city": "Lausanne",
				"pincode": "1003",
				"country": "Switzerland",
			},
		)["name"]
		self.assertIn(address, _linked("Address", name))
		save_customer_address(name, {"city": "Renens", "country": "Switzerland"}, address)
		frappe.set_user("Administrator")
		address = _linked("Address", name)[0]
		self.assertEqual(frappe.db.get_value("Address", address, "city"), "Renens")

		frappe.set_user(CASHIER)
		contact = save_customer_contact(
			name,
			{
				"first_name": "Anna",
				"last_name": "Till",
				"email": f"anna-{frappe.generate_hash(length=8)}@yopmail.com",
			},
		)["name"]
		frappe.set_user("Administrator")
		self.assertIn(contact, _linked("Contact", name))

	def test_cashier_cannot_touch_another_partys_address(self):
		self._needs_theme()
		mine, _email = self._new_customer("mine")

		frappe.set_user("Administrator")
		other = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": f"Till Other {frappe.generate_hash(length=6)}",
				"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
				"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
				"email_id": f"till-other-{frappe.generate_hash(length=8)}@yopmail.com",
			}
		).insert(ignore_permissions=True)
		theirs = frappe.get_doc(
			{
				"doctype": "Address",
				"address_title": other.customer_name,
				"address_type": "Billing",
				"address_line1": "Chemin d'autrui",
				"city": "Genève",
				"country": "Switzerland",
				"links": [{"link_doctype": "Customer", "link_name": other.name}],
			}
		).insert(ignore_permissions=True)
		# The cashier may write their own customer only.
		frappe.get_doc(
			{"doctype": "User Permission", "user": CASHIER, "allow": "Customer", "for_value": mine}
		).insert(ignore_permissions=True)
		frappe.clear_cache(user=CASHIER)

		frappe.set_user(CASHIER)
		self.assertFalse(frappe.has_permission("Customer", "write", doc=other.name))
		with self.assertRaises(frappe.PermissionError):
			save_customer_address(other.name, {"city": "Nyon"}, theirs.name)
		# Pulling it into a customer they may write is refused too.
		with self.assertRaises(frappe.PermissionError):
			save_customer_address(mine, {"city": "Nyon"}, theirs.name)

		frappe.set_user("Administrator")
		theirs.reload()
		self.assertEqual(theirs.city, "Genève")
		self.assertEqual([(l.link_doctype, l.link_name) for l in theirs.links], [("Customer", other.name)])

	def test_an_email_another_contact_carries_is_refused_clearly(self):
		frappe.set_user("Administrator")
		taken = f"till-taken-{frappe.generate_hash(length=8)}@yopmail.com"
		frappe.get_doc(
			{"doctype": "Contact", "first_name": "Taken", "email_ids": [{"email_id": taken, "is_primary": 1}]}
		).insert(ignore_permissions=True)
		before = frappe.db.count("Contact")

		frappe.set_user(CASHIER)
		with self.assertRaises(frappe.PermissionError) as refused:
			create_customer(customer_name="Till Taken", mobile_no="+41791234567", email_id=taken)
		self.assertIn(taken, str(refused.exception))

		frappe.set_user("Administrator")
		self.assertEqual(frappe.db.count("Contact"), before)
