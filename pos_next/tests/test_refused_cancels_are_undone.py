# //// Neoffice — added file (no upstream equivalent). The places of the till that catch a cancel Frappe
# //// refused and carry on (#951). No site needed: Frappe is replaced by stand-ins.
"""A cancel Frappe refuses is put back as it was, at the places of the till that carry on after it.

Frappe cancels a document by writing docstatus 2 to its row, running on_cancel (the reversal entries, the
wallet balance) and only then checking that no submitted document still links to it. When that check raises
LinkExistsError the row and what on_cancel wrote are already there. Three places catch the error and carry
on, and the request then commits: the credit redemption entries of a cancelled invoice, the broken wallet
transaction of a return that is recreated, and the wallet transactions a return reverses. Each kept the
half-done cancellation.

The tests call the real functions with a database that has the savepoint semantics over a few rows and
documents whose cancel writes before it raises.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest import mock

import frappe

from pos_next import utils
from pos_next.api import credit_sales
from pos_next.pos_next.doctype.wallet_transaction import wallet_transaction


class FakeDatabase:
	"""Rows and the transaction calls the till makes, with real savepoint semantics."""

	def __init__(self, documents):
		self.rows = {(kind, name): 1 for kind, name in documents}
		self.events = []
		self._savepoints = {}
		self.committed = None

	def savepoint(self, name):
		self.events.append(("savepoint", name))
		self._savepoints[name] = dict(self.rows)

	def rollback(self, save_point=None):
		assert save_point, "a whole rollback would also undo the documents that were cancelled"
		self.events.append(("rollback", save_point))
		self.rows = dict(self._savepoints[save_point])

	def release_savepoint(self, name):
		self.events.append(("release", name))
		self._savepoints.pop(name)

	def commit(self):
		self.committed = dict(self.rows)

	def kinds(self):
		return [kind for kind, _name in self.events]

	# what the functions read
	def get_value(self, doctype, filters, fieldname=None, as_dict=False):
		if doctype == "Sales Invoice":
			return frappe._dict(
				customer="CUST-1", company="Co", grand_total=-40, is_return=1, return_against="SINV-0"
			)
		if doctype == "Wallet Transaction":
			return "WT-1"  # the idempotency guard finds the transaction of a previous attempt
		return None

	def exists(self, doctype, filters=None):
		return None  # no GL entry, no debit transaction of the return yet


class FakeDocument:
	"""A submitted document. cancel() writes what Frappe writes, in Frappe's order, then may refuse."""

	def __init__(self, database, kind, name, refuses=False, **fields):
		self.database, self.kind, self.name, self.refuses = database, kind, name, refuses
		self.docstatus = 1
		self.flags = frappe._dict()
		self.__dict__.update(fields)

	def cancel(self):
		self.database.rows[(self.kind, self.name)] = 2  # docstatus 2, written first
		self.database.rows[("On cancel", self.name)] = "written by on_cancel"
		if self.refuses:  # the link check comes last
			raise frappe.LinkExistsError(f"Cannot cancel {self.name}: linked to a submitted document")


class RecordingLog:
	"""frappe.log_error: every call is also a write, which must survive the rollback."""

	def __init__(self, database):
		self.database, self.calls = database, []

	def __call__(self, title=None, message=None, **_ignored):
		self.calls.append((title, message))
		self.database.rows[("Error Log", len(self.calls))] = title


class TestTheHelper(unittest.TestCase):
	def test_a_refused_cancel_is_undone_and_the_error_goes_on(self):
		database = FakeDatabase([("Journal Entry", "JE-1")])
		refused = FakeDocument(database, "Journal Entry", "JE-1", refuses=True)
		with mock.patch.object(frappe, "db", database):
			with self.assertRaises(frappe.LinkExistsError):
				utils.cancel_or_undo(refused)
		self.assertEqual(database.rows[("Journal Entry", "JE-1")], 1)
		self.assertNotIn(("On cancel", "JE-1"), database.rows)
		self.assertEqual(database.kinds(), ["savepoint", "rollback"])

	def test_a_cancel_that_works_is_kept_and_its_savepoint_released(self):
		database = FakeDatabase([("Journal Entry", "JE-1")])
		with mock.patch.object(frappe, "db", database):
			utils.cancel_or_undo(FakeDocument(database, "Journal Entry", "JE-1"))
		self.assertEqual(database.rows[("Journal Entry", "JE-1")], 2)
		self.assertEqual(database.kinds(), ["savepoint", "release"])
		self.assertEqual(database._savepoints, {})


class TestCreditRedemptionEntriesOfACancelledInvoice(unittest.TestCase):
	def _run(self, refusing=()):
		names = ["JE-1", "JE-2"]
		database = FakeDatabase([("Journal Entry", name) for name in names])
		entries = {
			name: FakeDocument(
				database,
				"Journal Entry",
				name,
				name in refusing,
				accounts=[frappe._dict(reference_type="Sales Invoice", reference_name="SINV-1")],
			)
			for name in names
		}
		log = RecordingLog(database)
		with (
			mock.patch.object(frappe, "db", database),
			mock.patch.object(frappe, "get_all", return_value=names),
			mock.patch.object(frappe, "get_doc", side_effect=lambda doctype, name: entries[name]),
			mock.patch.object(frappe, "log_error", side_effect=log),
			mock.patch.object(frappe, "msgprint"),
			mock.patch.object(credit_sales, "_", lambda text: text),
		):
			count = credit_sales._cancel_credit_journal_entries("SINV-1")
		database.commit()
		return count, database, log

	def test_an_entry_frappe_refuses_to_cancel_is_put_back_as_it_was(self):
		_, database, _ = self._run(refusing={"JE-1"})
		self.assertEqual(database.committed[("Journal Entry", "JE-1")], 1)
		self.assertNotIn(("On cancel", "JE-1"), database.committed)

	def test_the_other_entries_are_still_cancelled(self):
		count, database, _ = self._run(refusing={"JE-1"})
		self.assertEqual(count, 1)
		self.assertEqual(database.committed[("Journal Entry", "JE-2")], 2)

	def test_the_refusal_is_logged_after_the_rollback_so_that_the_log_survives(self):
		_, database, log = self._run(refusing={"JE-1"})
		self.assertEqual(len(log.calls), 1)
		title, message = log.calls[0]
		self.assertEqual(title, "Credit Sale JE Cancellation")
		self.assertIn("JE-1", message)
		self.assertIn("LinkExistsError", message)
		self.assertIn(("Error Log", 1), database.committed)

	def test_when_every_cancel_works_nothing_is_rolled_back(self):
		count, database, log = self._run()
		self.assertEqual(count, 2)
		self.assertNotIn("rollback", database.kinds())
		self.assertEqual(log.calls, [])


class TestTheBrokenWalletTransactionOfAReturn(unittest.TestCase):
	def _run(self, refuses):
		database = FakeDatabase([("Wallet Transaction", "WT-1")])
		broken = FakeDocument(database, "Wallet Transaction", "WT-1", refuses=refuses)
		log = RecordingLog(database)

		def get_doc(doctype, name=None):
			assert isinstance(doctype, str), "a new transaction was created after the cancel was refused"
			return broken

		with (
			mock.patch.object(frappe, "db", database),
			mock.patch.object(frappe, "get_doc", side_effect=get_doc),
			mock.patch.object(frappe, "get_cached_value", return_value="1100 - Debtors"),
			mock.patch.object(frappe, "log_error", side_effect=log),
			mock.patch.object(wallet_transaction, "get_or_create_wallet", return_value={"name": "W-1"}),
		):
			result = wallet_transaction.credit_return_to_wallet("SINV-RET-1")
		database.commit()
		return result, database, log

	def test_a_refused_cancel_is_put_back_as_it_was_and_the_return_gets_none(self):
		result, database, _ = self._run(refuses=True)
		self.assertIsNone(result)
		self.assertEqual(database.committed[("Wallet Transaction", "WT-1")], 1)
		self.assertNotIn(("On cancel", "WT-1"), database.committed)

	def test_the_refusal_is_logged_after_the_rollback_so_that_the_log_survives(self):
		_, database, log = self._run(refuses=True)
		self.assertEqual(len(log.calls), 1)
		self.assertEqual(log.calls[0][0], "Wallet Transaction Recovery Error")
		self.assertIn("WT-1", log.calls[0][1])
		self.assertIn(("Error Log", 1), database.committed)


class TestWalletTransactionsAReturnReverses(unittest.TestCase):
	def _run(self, refusing=()):
		names = ["WT-1", "WT-2"]
		database = FakeDatabase([("Wallet Transaction", name) for name in names])
		transactions = {
			name: FakeDocument(database, "Wallet Transaction", name, name in refusing) for name in names
		}
		invoices = {
			"SINV-0": SimpleNamespace(is_return=0, return_against=None, grand_total=40, customer="CUST-1"),
			"SINV-RET-1": SimpleNamespace(
				is_return=1, return_against="SINV-0", grand_total=-40, customer="CUST-1"
			),
		}
		rows = [
			frappe._dict(
				name=name,
				wallet="W-1",
				amount=20,
				transaction_type="Credit",
				source_type="Refund",
				source_account="1100",
				company="Co",
				customer="CUST-1",
			)
			for name in names
		]

		def get_doc(doctype, name):
			return invoices[name] if doctype == "Sales Invoice" else transactions[name]

		log = RecordingLog(database)
		function = getattr(
			wallet_transaction.reverse_wallet_transactions_for_return,
			"__wrapped__",
			wallet_transaction.reverse_wallet_transactions_for_return,
		)
		with (
			mock.patch.object(frappe, "db", database),
			mock.patch.object(frappe, "get_doc", side_effect=get_doc),
			mock.patch.object(frappe, "get_all", return_value=rows),
			mock.patch.object(frappe, "log_error", side_effect=log),
			mock.patch.object(frappe, "msgprint"),
			mock.patch.object(wallet_transaction, "_", lambda text: text),
		):
			function("SINV-0", "SINV-RET-1")
		database.commit()
		return database, log

	def test_a_transaction_frappe_refuses_to_cancel_is_put_back_as_it_was(self):
		database, _ = self._run(refusing={"WT-1"})
		self.assertEqual(database.committed[("Wallet Transaction", "WT-1")], 1)
		self.assertNotIn(("On cancel", "WT-1"), database.committed)

	def test_the_other_transaction_is_still_cancelled(self):
		database, _ = self._run(refusing={"WT-1"})
		self.assertEqual(database.committed[("Wallet Transaction", "WT-2")], 2)

	def test_the_refusal_is_logged_after_the_rollback_so_that_the_log_survives(self):
		database, log = self._run(refusing={"WT-1"})
		self.assertEqual(len(log.calls), 1)
		self.assertEqual(log.calls[0][0], "Wallet Transaction Cancel on Return Error")
		self.assertIn("WT: WT-1", log.calls[0][1])
		self.assertIn(("Error Log", 1), database.committed)

	def test_each_cancel_runs_under_its_own_savepoint_and_none_is_left_open(self):
		database, _ = self._run(refusing={"WT-1"})
		self.assertEqual(database.kinds(), ["savepoint", "rollback", "savepoint", "release"])
		self.assertEqual(database._savepoints, {})


if __name__ == "__main__":
	unittest.main()
