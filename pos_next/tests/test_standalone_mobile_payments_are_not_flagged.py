# //// Neoffice — added file (no upstream equivalent). The hourly check of payments that never became a sale,
# //// and the Collect tool of the mobile app (maintenance#1188). No site needed: Frappe is replaced by stand-ins.
"""A payment taken with the phone's Collect tool is not a payment the till failed to turn into a sale.

The Collect tool takes an amount and a label, with no document behind it (`payments.api.mobile_payments.
mobile_start_payment` marks the intent {"origin": "mobile", "kind": "standalone"}). Nothing would ever turn
such a payment into a sale, and the hourly check raised « the customer paid, the till recorded nothing » to the
accounts managers for each of them. It still has to raise it for a till payment, and for anything it cannot
read as that exact mark.
"""

from __future__ import annotations

import datetime
import json
import unittest
from unittest import mock

import frappe

from pos_next.tasks import detect_uncollected_payments as task

NOW = datetime.datetime(2026, 10, 28, 12, 0, 0)
STANDALONE = {"origin": "mobile", "kind": "standalone"}


def _intent(name, metadata=None, amount=4250, minutes_ago=30):
	"""A settled intent with no document, as the check reads it."""
	settled = NOW - datetime.timedelta(minutes=minutes_ago)
	if metadata is None or isinstance(metadata, str):
		metadata_json = (
			metadata  # None: an intent with no metadata; a string: stored as it is, readable or not
		)
	else:
		metadata_json = json.dumps(metadata)
	return frappe._dict(
		name=name,
		amount=amount,
		currency="CHF",
		provider="stripe",
		channel="tap_to_pay",
		creation=settled,
		completed_at=settled,
		metadata_json=metadata_json,
	)


class Run:
	"""One run of the check over the given intents, with what it would write and send kept."""

	def __init__(self, intents):
		self.intents = intents
		self.notified = []
		self.flagged = []
		self.logged = []
		self.queried = None

	def __enter__(self):
		def get_all(doctype, **kwargs):
			self.queried = kwargs
			return list(self.intents)

		patches = [
			mock.patch.object(task.frappe, "db", mock.Mock(table_exists=mock.Mock(return_value=True))),
			mock.patch.object(task.frappe, "get_all", get_all),
			mock.patch.object(task.frappe.utils, "add_days", lambda *a, **k: "7 days ago"),
			mock.patch.object(task.frappe.utils, "format_datetime", str),
			mock.patch.object(task.frappe, "log_error", lambda *a, **k: self.logged.append(a)),
			mock.patch.object(task, "now_datetime", lambda: NOW),
			mock.patch.object(task, "get_url_to_form", lambda doctype, name: f"/app/{name}"),
			mock.patch.object(task, "_", lambda text: text),
			mock.patch.object(task, "_already_flagged", lambda name: False),
			mock.patch.object(task, "_try_relink", lambda intent: False),
			mock.patch.object(task, "_flag", lambda name: self.flagged.append(name)),
			mock.patch.object(task, "_notify_pos_managers", lambda *a: self.notified.append(a)),
		]
		self._patches = patches
		for patch in patches:
			patch.start()
		task.detect_uncollected_payments()
		return self

	def __exit__(self, *exc):
		for patch in reversed(self._patches):
			patch.stop()


def _run(*intents):
	runner = Run(list(intents))
	with runner:
		pass
	return runner


class TestStandaloneMobilePaymentsAreNotFlagged(unittest.TestCase):
	def test_a_payment_of_the_collect_tool_is_left_alone(self):
		runner = _run(_intent("PI-COLLECT", STANDALONE))
		self.assertEqual(runner.notified, [])
		self.assertEqual(runner.flagged, [])
		self.assertEqual(runner.logged, [])

	def test_the_label_of_the_payment_does_not_change_that(self):
		runner = _run(_intent("PI-LABEL", {**STANDALONE, "label": "Deposit, kitchen"}))
		self.assertEqual(runner.notified, [])
		self.assertEqual(runner.flagged, [])

	def test_a_till_payment_with_no_sale_is_still_reported(self):
		runner = _run(_intent("PI-TILL"))
		self.assertEqual(runner.flagged, ["PI-TILL"])
		self.assertEqual(len(runner.notified), 1)
		count, total, currency, message = runner.notified[0]
		self.assertEqual((count, total, currency), (1, 42.5, "CHF"))
		self.assertIn("PI-TILL", message)

	def test_only_the_till_payment_is_reported_when_both_are_there(self):
		runner = _run(
			_intent("PI-COLLECT", STANDALONE, amount=10000),
			_intent("PI-TILL", amount=4250),
			_intent("PI-COLLECT-2", STANDALONE, amount=500),
		)
		self.assertEqual(runner.flagged, ["PI-TILL"])
		count, total, _currency, message = runner.notified[0]
		self.assertEqual((count, total), (1, 42.5))
		self.assertIn("PI-TILL", message)
		self.assertNotIn("PI-COLLECT", message)

	def test_anything_but_the_exact_mark_stays_reported(self):
		cases = {
			"mobile, no kind": {"origin": "mobile"},
			"mobile, another kind": {"origin": "mobile", "kind": "document"},
			"a kind without the origin": {"kind": "standalone"},
			"another origin": {"origin": "pos", "kind": "standalone"},
			"not JSON": "{not json",
			"JSON that is not an object": "[1, 2]",
			"JSON null": "null",
		}
		for label, metadata in cases.items():
			with self.subTest(label):
				runner = _run(_intent("PI-X", metadata))
				self.assertEqual(runner.flagged, ["PI-X"])
				self.assertEqual(len(runner.notified), 1)

	def test_the_check_asks_for_the_metadata_it_reads(self):
		runner = _run(_intent("PI-COLLECT", STANDALONE))
		self.assertIn("metadata_json", runner.queried["fields"])
		self.assertEqual(runner.queried["filters"]["status"], "succeeded")
		self.assertEqual(runner.queried["filters"]["reference_name"], ["is", "not set"])

	def test_a_payment_still_inside_the_grace_period_is_not_reported_either_way(self):
		runner = _run(_intent("PI-RECENT", minutes_ago=5))
		self.assertEqual(runner.notified, [])
		self.assertEqual(runner.flagged, [])
