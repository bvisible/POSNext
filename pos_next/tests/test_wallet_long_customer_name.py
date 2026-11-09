# //// Neoffice — added file (no upstream equivalent).
"""A customer with a long name can be created while wallets are made automatically (neoffice-maintenance#1072).

A wallet is named "<customer>-WALLET" and a customer's name is up to 140 characters, so the name of its wallet could pass the 140 of the
`name` column; the error was then logged with the long text as the TITLE of the Error Log row (the arguments of `frappe.log_error` were
swapped), which raised CharacterLengthExceededError from inside the handler, and that second exception escaped the `after_insert` hook of
the customer and failed the creation of the customer itself.

The first two tests read nothing from the database. The last one inserts a customer on the database of the test site and rolls back.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import wallet as wallet_api
from pos_next.pos_next.doctype.wallet.wallet import MAX_NAME_LENGTH, Wallet

LONG_NAME = "X" * 140


def name_of(customer):
	"""The name the wallet of a customer is given (the method reads the customer only)."""
	wallet = SimpleNamespace(customer=customer, name=None)
	Wallet.autoname(wallet)
	return wallet.name


class TestTheNameOfAWallet(unittest.TestCase):
	def test_a_name_that_fits_is_exactly_what_the_format_gives(self):
		self.assertEqual(name_of("Marie Dupont"), "Marie Dupont-WALLET")
		# The longest customer name whose wallet still fits
		longest = "Y" * (MAX_NAME_LENGTH - len("-WALLET"))
		self.assertEqual(name_of(longest), f"{longest}-WALLET")

	def test_a_name_that_does_not_fit_is_cut_to_the_column_and_still_ends_with_wallet(self):
		name = name_of(LONG_NAME)

		self.assertLessEqual(len(name), MAX_NAME_LENGTH)
		self.assertTrue(name.endswith("-WALLET"))
		self.assertTrue(name.startswith("X" * 100))

	def test_two_long_names_that_share_their_start_get_two_wallet_names(self):
		self.assertNotEqual(name_of("X" * 139 + "A"), name_of("X" * 139 + "B"))

	def test_the_same_customer_always_gets_the_same_wallet_name(self):
		self.assertEqual(name_of(LONG_NAME), name_of(LONG_NAME))


class TestTheHookNeverFailsTheCustomer(unittest.TestCase):
	def test_an_error_of_the_wallet_is_logged_with_a_short_title_and_does_not_escape(self):
		customer = SimpleNamespace(name=LONG_NAME)
		settings = {"auto_create_wallet": 1}
		db = MagicMock()
		db.get_value.return_value = "POS-1"
		with (
			patch.object(frappe, "db", db),
			patch.object(frappe, "get_cached_value", return_value="Company-1"),
			patch.object(wallet_api, "is_external_loyalty_mode", return_value=False),
			patch.object(wallet_api, "get_pos_settings", return_value=settings),
			patch.object(wallet_api, "get_or_create_wallet", side_effect=RuntimeError("boom")),
			patch.object(frappe, "get_traceback", return_value="TRACEBACK"),
			patch.object(frappe, "log_error") as log_error,
		):
			wallet_api.create_wallet_on_customer_insert(customer)

		log_error.assert_called_once()
		title, message = log_error.call_args.args
		# The title first, short and fixed; the customer and the traceback in the message
		self.assertEqual(title, "Wallet auto-create failed")
		self.assertIn(LONG_NAME, message)
		self.assertIn("TRACEBACK", message)

	def test_an_error_of_the_creation_is_logged_with_a_short_title_too(self):
		db = MagicMock()
		db.get_value.side_effect = [None, None]
		pos_settings = {"auto_create_wallet": 1, "wallet_account": None}
		insert_error = RuntimeError("Data too long for column 'name'")
		doc = MagicMock()
		doc.insert.side_effect = insert_error
		with (
			patch.object(frappe, "db", db),
			patch.object(frappe, "get_doc", return_value=doc),
			patch.object(frappe, "get_cached_value", return_value="Receivable - C"),
			patch.object(frappe, "log_error") as log_error,
		):
			result = wallet_api.get_or_create_wallet(LONG_NAME, "Company-1", pos_settings=pos_settings)

		self.assertIsNone(result)
		title, message = log_error.call_args.args
		self.assertLessEqual(len(title), 140)
		self.assertNotIn(LONG_NAME, title)
		self.assertIn(LONG_NAME, message)


class TestACustomerWithALongName(FrappeTestCase):
	def test_the_customer_is_created_and_has_its_wallet(self):
		from pos_next.tests.test_till_writes_need_the_till import _till_fixture

		frappe.set_user("Administrator")
		no_commit = patch.object(frappe.local.db, "commit")
		no_commit.start()
		self.addCleanup(no_commit.stop)
		self.addCleanup(frappe.db.rollback)
		fx = _till_fixture()
		receivable = frappe.db.get_value(
			"Account", {"company": fx.company, "account_type": "Receivable", "is_group": 0}, "name"
		)
		# A customer is named by his name (otherwise the name is a number and there is nothing to be too long)
		frappe.db.set_single_value("Selling Settings", "cust_master_name", "Customer Name")
		frappe.db.set_single_value("Global Defaults", "default_company", fx.company)

		with (
			patch.object(wallet_api, "is_external_loyalty_mode", return_value=False),
			patch.object(
				wallet_api,
				"get_pos_settings",
				return_value={"auto_create_wallet": 1, "wallet_account": receivable},
			),
		):
			customer = frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": LONG_NAME,
					"customer_type": "Individual",
					"customer_group": frappe.db.get_value("Customer Group", {"is_group": 0}, "name"),
					"territory": frappe.db.get_value("Territory", {"is_group": 0}, "name"),
				}
			).insert(ignore_permissions=True)

		self.assertEqual(customer.name, LONG_NAME)
		wallets = frappe.get_all("Wallet", filters={"customer": customer.name}, pluck="name")
		self.assertEqual(len(wallets), 1)
		self.assertLessEqual(len(wallets[0]), MAX_NAME_LENGTH)
		self.assertEqual(
			frappe.db.count("Error Log", {"method": ["like", "Wallet%"]}),
			0,
			"no error was logged for the wallet",
		)
