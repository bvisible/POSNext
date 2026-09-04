# Copyright (c) 2025, BrainWise and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import Mock, patch, MagicMock

#//// Neoffice — added (764047c "tests: fixtures must pick rows the test can actually use"): needed by TestGetCustomersSearch below, which runs against the real database
import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api.customers import (
    _get_customer_assignment_context,
    create_customer,
    get_customers,
    get_default_loyalty_program_from_settings,
)


class TestCustomersAPI(unittest.TestCase):
    # frappe.db is a werkzeug LocalProxy that inspect.isawaitable() reports as awaitable, so a
    # bare patch("...frappe.db") builds an AsyncMock and every frappe.db.x() returns a coroutine
    # ("object of type 'coroutine' has no len()", CI 2026-09-03). new_callable=MagicMock keeps it sync.
    #//// Neoffice — removed test_get_customers_applies_search_term_filters (764047c "tests: fixtures must pick rows the test can actually use"): asserted a frappe.get_all or_filters call that get_customers no longer makes; the search moved to frappe.qb, covered by TestGetCustomersSearch below
    #
    # test_get_customers_applies_search_term_filters used to live here and asserted
    # that a search called frappe.get_all with an or_filters list. get_customers no
    # longer takes that path: a single or_filters group is ONE or, so it could not
    # express "every word must match some field" and "Moret Daniel" never found
    # "Daniel Moret". The search moved to the query builder (AND across words, OR
    # across fields), which left the mock asserting a call that is never made
    # ("Expected 'get_all' to have been called once. Called 0 times.", CI
    # 2026-09-03). Mocking the query builder instead would only prove the mock, so
    # the behaviour is asserted against real rows in TestGetCustomersSearch below.
    @patch("pos_next.api.customers.frappe.db", new_callable=MagicMock)
    def test_get_default_loyalty_program_from_settings_uses_explicit_pos_profile(self, mock_db):
        mock_db.get_value.return_value = "LOYALTY-A"

        result = get_default_loyalty_program_from_settings(pos_profile="POS-A")

        self.assertEqual(result, "LOYALTY-A")
        mock_db.get_value.assert_called_once_with(
            "POS Settings",
            {"enabled": 1, "pos_profile": "POS-A"},
            "default_loyalty_program",
        )

    @patch("pos_next.api.customers.frappe.get_cached_value")
    @patch("pos_next.api.customers.frappe.get_all")
    def test_get_default_loyalty_program_from_settings_skips_ambiguous_company_context(
        self,
        mock_get_all,
        mock_get_cached_value,
    ):
        mock_get_all.return_value = [
            Mock(pos_profile="POS-1", default_loyalty_program="LOYALTY-A"),
            Mock(pos_profile="POS-2", default_loyalty_program="LOYALTY-B"),
        ]
        mock_get_cached_value.side_effect = ["Company A", "Company A"]

        result = get_default_loyalty_program_from_settings(company="Company A")

        self.assertIsNone(result)

    @patch("pos_next.api.customers.frappe.local", new=Mock(form_dict={"company": "Company A", "pos_profile": "POS-A"}))
    @patch("pos_next.api.customers.frappe.flags", new=Mock(pos_next_customer_company=None, pos_next_customer_pos_profile=None))
    def test_get_customer_assignment_context_uses_request_context(self):
        company, pos_profile = _get_customer_assignment_context()

        self.assertEqual(company, "Company A")
        self.assertEqual(pos_profile, "POS-A")

    @patch("pos_next.api.customers.frappe.flags", new=Mock(pos_next_customer_company=None, pos_next_customer_pos_profile=None))
    @patch("pos_next.api.customers.frappe.get_doc")
    @patch("pos_next.api.customers.get_default_loyalty_program_from_settings")
    @patch("pos_next.api.customers.frappe.has_permission")
    def test_create_customer_uses_pos_profile_for_loyalty_assignment(
        self,
        mock_has_permission,
        mock_get_loyalty,
        mock_get_doc,
    ):
        mock_has_permission.return_value = True
        mock_get_loyalty.return_value = "LOYALTY-A"

        customer_doc = Mock()
        customer_doc.as_dict.return_value = {"name": "CUST-0001", "loyalty_program": "LOYALTY-A"}
        mock_get_doc.return_value = customer_doc

        result = create_customer(
            customer_name="John Doe",
            customer_group="Individual",
            territory="All Territories",
            pos_profile="POS-A",
        )

        mock_get_loyalty.assert_called_once_with(company=None, pos_profile="POS-A")
        customer_doc.insert.assert_called_once_with()
        self.assertEqual(result["loyalty_program"], "LOYALTY-A")


#//// Neoffice ▼▼▼ — added TestGetCustomersSearch (764047c "tests: fixtures must pick rows the test can actually use"): asserts the get_customers search contract (word order, per-word AND, mobile/email match, disabled exclusion) against real rows, replacing the mock-based test above that pinned a call path the code no longer takes
class TestGetCustomersSearch(FrappeTestCase):
    """get_customers search path, against the database.

    The search runs through frappe.qb (AND across words, OR across fields) so it
    cannot be observed on frappe.get_all, and asserting the generated SQL would
    pin the query builder rather than the promise. These tests assert the promise:
    word order does not matter, every word has to match something, and disabled
    customers stay out. FrappeTestCase rolls the class back, so nothing is left
    behind on the site.
    """

    MARKER = "ZzsearchfixtureQq"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        group = frappe.get_all("Customer Group", filters={"is_group": 0}, limit=1)[0].name
        territory = frappe.get_all("Territory", filters={"is_group": 0}, limit=1)[0].name

        def make(customer_name, **kwargs):
            doc = frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": customer_name,
                    "customer_group": group,
                    "territory": territory,
                    "customer_type": "Individual",
                    **kwargs,
                }
            )
            doc.insert(ignore_permissions=True)
            return doc.name

        cls.moret = make(f"Daniel Moret {cls.MARKER}")
        cls.zufferey = make(
            f"Sophie Zufferey {cls.MARKER}",
            mobile_no="0791234567",
            email_id="sophie.zufferey@yopmail.com",
        )
        cls.retired = make(f"Retired Person {cls.MARKER}", disabled=1)

    def names(self, search_term):
        return [row["name"] for row in get_customers(search_term=search_term, limit=50)]

    def test_search_ignores_word_order(self):
        """A search for "Moret Daniel" finds a customer stored as "Daniel Moret"."""
        # This is the case one or_filters group cannot express, and the reason the
        # search left frappe.get_all for the query builder.
        self.assertIn(self.moret, self.names(f"Moret Daniel {self.MARKER}"))

    def test_every_word_must_match(self):
        """Words taken from two different customers match neither."""
        found = self.names(f"Daniel Zufferey {self.MARKER}")
        self.assertNotIn(self.moret, found)
        self.assertNotIn(self.zufferey, found)

    def test_search_matches_a_partial_word(self):
        self.assertIn(self.moret, self.names(f"Dani {self.MARKER}"))

    def test_search_matches_mobile_and_email(self):
        self.assertIn(self.zufferey, self.names("0791234"))
        self.assertIn(self.zufferey, self.names("sophie.zufferey@yopmail.com"))

    def test_search_excludes_disabled_customers(self):
        self.assertNotIn(self.retired, self.names(f"Retired {self.MARKER}"))

    def test_listing_without_a_search_term_excludes_disabled_customers(self):
        """The no-search-term branch still goes through frappe.get_all."""
        found = [row["name"] for row in get_customers(limit=0)]
        self.assertIn(self.moret, found)
        self.assertNotIn(self.retired, found)
#//// Neoffice ▲▲▲
