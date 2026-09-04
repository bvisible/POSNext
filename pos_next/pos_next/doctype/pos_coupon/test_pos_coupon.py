# Copyright (c) 2021, Youssef Restom and Contributors
# See license.txt

import unittest
#//// Neoffice — MagicMock imported and passed as new_callable on both @patch("...frappe.db")
#//// decorators below. Upstream patches frappe.db bare; frappe.db is a werkzeug LocalProxy that
#//// inspect.isawaitable() reports as awaitable, so mock.patch builds an AsyncMock and every
#//// frappe.db.x() in the code under test returns a coroutine ("object of type 'coroutine' has no
#//// len()"). new_callable=MagicMock keeps the double synchronous (dc55c203, 2026-09-03 "patch
#//// frappe.db with a MagicMock, not the AsyncMock mock.patch picks by itself").
from unittest.mock import Mock, patch, MagicMock

from pos_next.pos_next.doctype.pos_coupon.pos_coupon import (
    _get_customer_coupon_usage_count,
)


class TestPOSCoupon(unittest.TestCase):
    # frappe.db is a werkzeug LocalProxy that inspect.isawaitable() reports as awaitable, so a
    # bare patch("...frappe.db") builds an AsyncMock and every frappe.db.x() returns a coroutine
    # ("object of type 'coroutine' has no len()", CI 2026-09-03). new_callable=MagicMock keeps it sync.
    @patch("pos_next.pos_next.doctype.pos_coupon.pos_coupon.frappe.get_meta")
    @patch("pos_next.pos_next.doctype.pos_coupon.pos_coupon.frappe.db", new_callable=MagicMock)
    def test_one_use_coupon_counts_sales_invoice_and_pos_invoice(self, mock_db, mock_get_meta):
        def table_exists(doctype):
            return doctype in {"Sales Invoice", "POS Invoice"}

        def count(doctype, filters=None):
            counts = {"Sales Invoice": 1, "POS Invoice": 2}
            return counts[doctype]

        mock_db.table_exists.side_effect = table_exists
        mock_db.count.side_effect = count
        mock_get_meta.return_value = Mock(has_field=Mock(return_value=True))

        used_count = _get_customer_coupon_usage_count("Customer A", "SAVE10")

        self.assertEqual(used_count, 3)
        mock_db.count.assert_any_call(
            "Sales Invoice",
            filters={"customer": "Customer A", "coupon_code": "SAVE10", "docstatus": 1},
        )
        mock_db.count.assert_any_call(
            "POS Invoice",
            filters={"customer": "Customer A", "coupon_code": "SAVE10", "docstatus": 1},
        )

    @patch("pos_next.pos_next.doctype.pos_coupon.pos_coupon.frappe.get_meta")
    @patch("pos_next.pos_next.doctype.pos_coupon.pos_coupon.frappe.db", new_callable=MagicMock)
    def test_one_use_coupon_skips_doctypes_without_coupon_field(self, mock_db, mock_get_meta):
        mock_db.table_exists.return_value = True
        mock_db.count.return_value = 4
        mock_get_meta.side_effect = [
            Mock(has_field=Mock(return_value=True)),
            Mock(has_field=Mock(return_value=False)),
        ]

        used_count = _get_customer_coupon_usage_count("Customer A", "SAVE10")

        self.assertEqual(used_count, 4)
        mock_db.count.assert_called_once_with(
            "Sales Invoice",
            filters={"customer": "Customer A", "coupon_code": "SAVE10", "docstatus": 1},
        )
