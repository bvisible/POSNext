# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt

import unittest
from unittest.mock import MagicMock, patch

from pos_next.patches.v2_4_0 import rename_locations_doctypes as patch_mod

MOD = "pos_next.patches.v2_4_0.rename_locations_doctypes.frappe"
NEW_TABLES = {"POS Governorate": {"governorate"}, "POS District": {"district", "governorate"}}
OLD_TABLES = {"Governorate": {"governorate"}, "District": {"district", "governorate"}}
COUNTS = {"Governorate": 2, "District": 2, "POS Governorate": 2, "POS District": 2}


def _db(columns, doctypes=("Governorate", "District"), counts=None, linked=False):
	"""Fake frappe.db: `columns` maps table -> set of columns."""
	db = MagicMock()
	db.exists.side_effect = lambda dt, name=None: name in doctypes
	db.count.side_effect = lambda t: (counts or {}).get(t, 0)
	calls = []

	def sql(query, *args, **kwargs):
		params = args[0] if args else None
		if "information_schema.tables" in query:
			return [[1]] if params[3:] in columns else []
		if "information_schema.columns" in query:
			return [[1]] if params[1] in columns.get(params[0][3:], set()) else []
		calls.append(query)
		if "select count(*)" in query:
			return [[2]]
		if "from `tabDocField`" in query or "from `tabCustom Field`" in query:
			return [["Other"]] if linked else []
		return []

	db.sql.side_effect = sql
	db.sql_calls = calls
	# //// Neoffice — the patch now asks frappe.db.table_exists / has_column / get_value / get_all
	# //// instead of the raw information_schema and DocField queries above, and a bare MagicMock
	# //// answers every one of them with something truthy: 4 of these 6 tests failed on upstream's
	# //// own code. Answer them from the same fake schema; the Customer custom fields still point
	# //// at an old doctype whenever its table is there.
	db.table_exists.side_effect = lambda doctype, *args, **kwargs: doctype in columns
	db.has_column.side_effect = lambda doctype, column: column in columns.get(doctype, set())
	db.get_all.side_effect = lambda doctype, *args, **kwargs: ["Other"] if linked else []
	db.get_value.side_effect = lambda doctype, filters=None, *args, **kwargs: (
		f"{filters['dt']}-{filters['fieldname']}" if filters.get("options") in columns else None
	)
	return db


def _run(db):
	fake = MagicMock()
	fake.db = db
	with patch(MOD, fake):
		patch_mod.execute()
	return fake


class TestRenameLocationDoctypes(unittest.TestCase):
	def test_pos_next_only_site_copies_then_drops_old_doctypes(self):
		db = _db({**OLD_TABLES, **NEW_TABLES}, counts=COUNTS)
		fake = _run(db)
		inserts = [q for q in db.sql_calls if q.startswith("insert ignore")]
		self.assertEqual(len(inserts), 2)
		self.assertIn("`tabPOS Governorate`", inserts[0])
		self.assertIn("`tabPOS District`", inserts[1])
		# //// Neoffice — the patch repoints the Customer custom fields with frappe.db.set_value now,
		# //// not a raw `update tabCustom Field`.
		self.assertEqual(
			[c.args for c in db.set_value.call_args_list],
			[
				("Custom Field", "Customer-custom_governorate", "options", "POS Governorate"),
				("Custom Field", "Customer-custom_district", "options", "POS District"),
			],
		)
		# District first: it links to Governorate
		self.assertEqual([c.args[1] for c in fake.delete_doc.call_args_list], ["District", "Governorate"])
		self.assertEqual(
			[c.args[0] for c in db.sql_ddl.call_args_list],
			["drop table if exists `tabDistrict`", "drop table if exists `tabGovernorate`"],
		)

	def test_leftover_tables_are_dropped_when_doctype_rows_are_already_gone(self):
		db = _db({**OLD_TABLES, **NEW_TABLES}, doctypes=(), counts=COUNTS)
		fake = _run(db)
		self.assertFalse(fake.delete_doc.called)
		self.assertEqual(db.sql_ddl.call_count, 2)

	def test_shared_tables_keep_other_apps_rows_and_doctypes(self):
		shared = {
			"Governorate": {"governorate", "governorate_en"},
			"District": {"district", "governorate", "district_en"},
		}
		db = _db({**shared, **NEW_TABLES})
		fake = _run(db)
		fake.delete_doc.assert_not_called()
		db.sql_ddl.assert_not_called()
		copies = [q for q in db.sql_calls if q.startswith("insert ignore")]
		self.assertEqual(len(copies), 2)
		for q in copies:
			self.assertIn("= ''", q)  # only rows the other app left empty
		deletes = [q for q in db.sql_calls if q.startswith("delete from")]
		self.assertEqual(len(deletes), 2)
		for q in deletes:
			# //// Neoffice — the patch wraps the subquery in a derived table (MySQL error 1093): the
			# //// delete still keeps to the rows the POS doctype holds.
			self.assertIn("name in (select name from (select name from `tabPOS", q)

	def test_old_doctype_kept_when_row_count_exceeds_copies(self):
		db = _db({**OLD_TABLES, **NEW_TABLES}, counts={**COUNTS, "Governorate": 5, "District": 5})
		self.assertFalse(_run(db).delete_doc.called)
		self.assertFalse(db.sql_ddl.called)

	def test_old_doctype_kept_when_another_doctype_links_to_it(self):
		db = _db({**OLD_TABLES, **NEW_TABLES}, counts=COUNTS, linked=True)
		self.assertFalse(_run(db).delete_doc.called)

	def test_fresh_site_does_nothing(self):
		db = _db(NEW_TABLES, doctypes=())
		fake = _run(db)
		self.assertFalse([q for q in db.sql_calls if q.startswith(("insert", "delete"))])
		self.assertFalse(fake.delete_doc.called)
