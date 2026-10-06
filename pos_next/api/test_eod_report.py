# //// Neoffice — added file (no upstream equivalent): tests for pos_next/api/eod_report.py
# //// (neoffice-maintenance#1235).
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import frappe

from pos_next.api import eod_report


class TestEodReport(unittest.TestCase):
	def test_recipients_accept_commas_semicolons_and_newlines(self):
		result = eod_report._parse_recipients("a@example.com; b@example.com\nc@example.com")
		self.assertEqual(result, ["a@example.com", "b@example.com", "c@example.com"])

	def test_a_malformed_address_is_refused(self):
		with self.assertRaises(frappe.exceptions.ValidationError):
			eod_report._parse_recipients("not-an-address")

	@patch("pos_next.api.eod_report.frappe.db.get_value")
	def test_configured_recipients_follow_the_automatic_flag(self, get_value):
		get_value.return_value = SimpleNamespace(eod_email_recipients="a@example.com", eod_email_auto=1)
		self.assertEqual(eod_report._configured_recipients("Till"), (["a@example.com"], True))
		get_value.return_value = None
		self.assertEqual(eod_report._configured_recipients("Till"), ([], False))

	@patch("pos_next.api.eod_report._send")
	@patch("pos_next.api.eod_report.attach_pdf")
	@patch("pos_next.api.eod_report._configured_recipients")
	@patch("pos_next.api.eod_report.frappe.db.get_value", return_value="Till")
	def test_after_close_sends_only_when_the_profile_asks(self, _gv, configured, attach, send):
		configured.return_value = (["a@example.com"], False)
		eod_report.after_close("CLOSE-1")
		attach.assert_called_once_with("CLOSE-1")
		send.assert_not_called()
		configured.return_value = (["a@example.com"], True)
		eod_report.after_close("CLOSE-1")
		send.assert_called_once_with("CLOSE-1", ["a@example.com"])

	@patch("pos_next.api.eod_report._send", side_effect=RuntimeError("smtp down"))
	@patch("pos_next.api.eod_report.attach_pdf")
	@patch("pos_next.api.eod_report._configured_recipients", return_value=(["a@example.com"], True))
	@patch("pos_next.api.eod_report.frappe.log_error")
	@patch("pos_next.api.eod_report.frappe.db.get_value", return_value="Till")
	def test_a_mail_failure_never_reaches_the_cashier(self, _gv, log_error, _cfg, _attach, _send):
		eod_report.after_close("CLOSE-1")
		log_error.assert_called_once()
