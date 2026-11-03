# //// Neoffice — added file (no upstream equivalent).
"""The restaurant's overview follows the service (neoffice-maintenance#2163).

The theme keeps the figures of a space's overview for each reader for two minutes: « l'encaissé ne monte pas juste après un paiement ». What the service does
(a sale of a till, a table filled or freed, a session, a booking) now tells the theme, once the work is committed, that its copies are out of date
(`neoffice_theme.workspace_tabs.overview_changed`). The suite fakes the theme's word, and runs the real hooks and the real after-commit callbacks.
"""

import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import restaurant
from pos_next.restaurant import figures


class Invoice(SimpleNamespace):
	def get(self, key, default=None):
		return getattr(self, key, default)


def an_order(**values):
	return Invoice(**{"name": "SINV-TEST", "docstatus": 0, "restaurant_table": None, "is_pos": 0, **values})


class TestTheOverviewIsToldWhenTheServiceChanges(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.db.after_commit.run()  # whatever an earlier test left to run
		# The theme of the site may be older than its word: the suite brings its own, as the theme's cache is not what it tests
		theme = ModuleType("neoffice_theme.workspace_tabs")
		theme.overview_changed = Mock()
		self.told = theme.overview_changed
		patcher = patch.dict(sys.modules, {"neoffice_theme.workspace_tabs": theme})
		patcher.start()
		self.addCleanup(patcher.stop)

	def after_the_commit(self):
		frappe.db.after_commit.run()

	def test_it_is_told_after_the_commit_not_before(self):
		figures.figures_changed()

		self.told.assert_not_called()
		self.after_the_commit()
		self.told.assert_called_once_with("Resto")

	def test_a_sale_of_a_till_tells_it(self):
		with patch.object(frappe.db, "set_value"):
			restaurant.on_invoice_update(an_order(is_pos=1), "on_submit")

		self.after_the_commit()

		self.told.assert_called_once_with("Resto")

	def test_an_order_at_a_table_tells_it(self):
		with patch.object(frappe.db, "set_value"):
			restaurant.on_invoice_update(an_order(restaurant_table="a-table"), "on_update")

		self.after_the_commit()

		self.told.assert_called_once_with("Resto")

	def test_an_invoice_of_the_desk_tells_nothing(self):
		restaurant.on_invoice_update(an_order(), "on_update")

		self.after_the_commit()

		self.told.assert_not_called()

	def test_a_theme_that_cannot_be_told_stops_nothing(self):
		bare = ModuleType("neoffice_theme.workspace_tabs")  # a theme of before the word existed
		with patch.dict(sys.modules, {"neoffice_theme.workspace_tabs": bare}):
			figures.figures_changed()
			self.after_the_commit()

		self.told.assert_not_called()

	def test_a_theme_that_fails_stops_no_sale(self):
		self.told.side_effect = RuntimeError("the cache is down")

		with patch("frappe.log_error") as log:
			figures.figures_changed()
			self.after_the_commit()

		log.assert_called_once()
		title, _message = log.call_args.args
		self.assertLessEqual(len(title), 140)


class TestTheDocumentsThatMoveTheFigures(FrappeTestCase):
	def hooked(self, doctype, event):
		events = frappe.get_hooks("doc_events").get(doctype, {})
		hooks = events.get(event, [])
		return [hooks] if isinstance(hooks, str) else list(hooks)

	def test_the_sessions_and_the_bookings_tell_it(self):
		told = "pos_next.restaurant.figures.figures_changed"

		self.assertIn(told, self.hooked("POS Opening Shift", "on_submit"))
		self.assertIn(told, self.hooked("POS Opening Shift", "on_cancel"))
		self.assertIn(told, self.hooked("POS Closing Shift", "on_submit"))
		self.assertIn(told, self.hooked("Restaurant Reservation", "on_update"))
		self.assertIn(told, self.hooked("Restaurant Reservation", "on_trash"))

	def test_closing_a_session_still_makes_its_end_of_day_report(self):
		self.assertIn("pos_next.api.eod_report.enqueue_after_close", self.hooked("POS Closing Shift", "on_submit"))
