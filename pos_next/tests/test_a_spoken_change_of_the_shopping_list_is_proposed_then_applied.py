# //// Neoffice — added file (no upstream equivalent).
"""The shopping list read and changed from words, the way Nora does it by voice (NeoResto, purchases, lot G).

The owner makes his list by talking and must be able to mend it the same way: hear what is on it, take a line off, change a
quantity, tick a line as bought, empty the list. The server READS first, then PROPOSES, writing nothing: for each change said, the
line of the list it understood, or the several lines it could be, or none. Only what the owner confirmed is carried out, all or none.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import shopping as api
from pos_next.restaurant import shopping, spoken_changes, spoken_list, supplies, supply_catalogue
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import (
	BOTTLE_UOM,
	OWNER,
	OWNER_ROLES,
	PORTAL,
	_bottle_uom,
	_supplier,
	_user,
)
from pos_next.tests.test_till_writes_need_the_till import _company

MARKET = "_PNXT change market"
CELLAR = "_PNXT change cellar"
CRATE = "_PNXT change Crate of 24"
BAG = "_PNXT change Bag of 5 kg"


class TestASpokenChangeOfTheShoppingListIsProposedThenApplied(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(PORTAL, (), user_type="Website User")
		for name in (MARKET, CELLAR):
			_supplier(name)
		_bottle_uom()
		cls.company = _company()
		cls.group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		frappe.set_user(OWNER)
		# distinctive words, so that nothing the site already holds is taken for them
		cls.parsnip = supplies.create_supply_item("Panais de Zurich", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.parsnip, MARKET, BAG, 5, 9.5, None, 1, cls.company)
		cls.beer = supplies.create_supply_item("Bière brune de Zurich", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.beer, CELLAR, CRATE, 24, 52.0, None, 1, cls.company)
		cls.red = supplies.create_supply_item("Topinambour rouge de Zurich", cls.group, BOTTLE_UOM)
		cls.white = supplies.create_supply_item("Topinambour blanc de Zurich", cls.group, BOTTLE_UOM)
		frappe.set_user("Administrator")

	def setUp(self):
		# the list in progress is the one made here: the others of the site are put aside inside the test's own transaction
		frappe.db.sql("update `tabRestaurant Shopping List` set status = 'Done'")
		frappe.set_user(OWNER)
		self.name = shopping.new_list(self.company)
		spoken_list.add(
			[
				{"item": self.parsnip, "qty": 3},
				{"item": self.beer, "qty": 2},
				{"item": self.red, "qty": 1},
				{"item": self.white, "qty": 1},
				{"free": True, "text": "torchons de cuisine", "qty": 4, "unit_text": "paquets"},
			],
			self.name,
		)

	def tearDown(self):
		frappe.set_user("Administrator")

	def _lines(self):
		return frappe.get_doc("Restaurant Shopping List", self.name).lines

	def _propose(self, *changes):
		return spoken_changes.propose(list(changes))

	def _edits(self, proposal):
		return [edit for line in proposal["lines"] for edit in line["edits"]]

	# -- reading the list -------------------------------------------------------------------------------------------

	def test_the_list_in_progress_is_read_line_by_line_in_its_order(self):
		report = spoken_changes.read()
		self.assertEqual(report["list"], self.name)
		self.assertEqual([line["n"] for line in report["lines"]], [1, 2, 3, 4, 5])
		self.assertEqual(
			[(line["label"], line["qty"]) for line in report["lines"]][:2],
			[("Panais de Zurich", 3), ("Bière brune de Zurich", 2)],
		)
		self.assertEqual(report["lines"][4]["label"], "torchons de cuisine")
		self.assertEqual(
			report["lines"][4]["unit"], "paquets", "a free line is read with the unit it was said in"
		)

	def test_no_list_in_progress_is_said_so(self):
		frappe.db.sql("update `tabRestaurant Shopping List` set status = 'Done'")
		self.assertEqual(spoken_changes.read()["list"], None)
		self.assertEqual(spoken_changes.read()["lines"], [])

	# -- understanding what was said --------------------------------------------------------------------------------

	def test_a_line_is_named_by_its_words_whatever_the_case_the_accents_and_the_plural(self):
		proposal = self._propose(
			{"action": "remove", "text": "PANAIS"},
			{"action": "remove", "text": "biere brune"},
			{"action": "remove", "text": "torchon"},
		)
		self.assertEqual([line["status"] for line in proposal["lines"]], ["matched"] * 3)
		rows = [line["targets"][0]["row"] for line in proposal["lines"]]
		self.assertEqual(rows, [self._lines()[0].name, self._lines()[1].name, self._lines()[4].name])

	def test_a_line_two_could_be_is_left_to_the_owner(self):
		(line,) = self._propose({"action": "remove", "text": "topinambour"})["lines"]
		self.assertEqual(line["status"], "ambiguous")
		self.assertEqual(line["edits"], [])
		self.assertEqual(
			{c["label"] for c in line["candidates"]},
			{"Topinambour rouge de Zurich", "Topinambour blanc de Zurich"},
		)
		self.assertEqual([c["n"] for c in line["candidates"]], [3, 4], "the places the owner can name")

	def test_every_asks_for_all_the_lines_the_words_fit(self):
		(line,) = self._propose({"action": "remove", "text": "topinambour", "every": True})["lines"]
		self.assertEqual(line["status"], "matched")
		self.assertEqual(len(line["edits"]), 2)

	def test_a_line_that_is_not_on_the_list_is_unknown(self):
		(line,) = self._propose({"action": "remove", "text": "caviar"})["lines"]
		self.assertEqual((line["status"], line["edits"]), ("unknown", []))

	def test_clear_names_every_line(self):
		(line,) = self._propose({"action": "clear"})["lines"]
		self.assertEqual((line["status"], len(line["edits"])), ("matched", 5))

	def test_the_proposal_counts_what_it_understood(self):
		proposal = self._propose(
			{"action": "remove", "text": "panais"},
			{"action": "remove", "text": "topinambour"},
			{"action": "remove", "text": "caviar"},
		)
		self.assertEqual(proposal["counts"], {"matched": 1, "ambiguous": 1, "unknown": 1})
		self.assertEqual(proposal["total"], 5)

	def test_a_quantity_and_a_state_come_with_the_edit(self):
		proposal = self._propose(
			{"action": "quantity", "text": "panais", "qty": "5,5"},
			{"action": "state", "text": "biere", "state": "bought"},
		)
		first, second = self._edits(proposal)
		self.assertEqual((first["action"], first["qty"]), ("quantity", 5.5))
		self.assertEqual((second["action"], second["state"]), ("state", "bought"))

	def test_a_change_that_makes_no_sense_is_refused(self):
		for bad in (
			{"action": "burn", "text": "panais"},
			{"action": "remove"},
			{"action": "quantity", "text": "panais"},
			{"action": "quantity", "text": "panais", "qty": 0},
			{"action": "quantity", "text": "panais", "qty": "beaucoup"},
			{"action": "state", "text": "panais", "state": "eaten"},
			"panais",
		):
			with self.subTest(change=bad), self.assertRaises(frappe.ValidationError):
				self._propose(bad)
		with self.assertRaises(frappe.ValidationError):
			spoken_changes.propose([])

	def test_a_proposal_writes_nothing(self):
		before = [(r.name, r.qty, r.line_state) for r in self._lines()]
		self._propose({"action": "clear"}, {"action": "quantity", "text": "panais", "qty": 9})
		self.assertEqual([(r.name, r.qty, r.line_state) for r in self._lines()], before)

	# -- carrying out what was confirmed ----------------------------------------------------------------------------

	def test_a_line_is_taken_off(self):
		proposal = self._propose({"action": "remove", "text": "panais"})
		report = spoken_changes.apply(self._edits(proposal))
		self.assertEqual((report["removed"], report["left"]), (1, 4))
		self.assertNotIn(self.parsnip, [r.item for r in self._lines()])

	def test_a_quantity_is_changed_and_a_line_is_ticked(self):
		proposal = self._propose(
			{"action": "quantity", "text": "panais", "qty": 7},
			{"action": "state", "text": "torchons", "state": "not_needed"},
			{"action": "state", "text": "biere", "state": "bought"},
		)
		report = spoken_changes.apply(self._edits(proposal))
		self.assertEqual((report["quantity"], report["state"], report["left"]), (1, 2, 5))
		lines = {r.item or r.free_text: r for r in self._lines()}
		self.assertEqual(lines[self.parsnip].qty, 7)
		self.assertEqual(lines["torchons de cuisine"].line_state, "Not needed")
		self.assertEqual(lines[self.beer].line_state, "Bought")

	def test_the_list_is_emptied_and_stays_the_list_in_progress(self):
		report = spoken_changes.apply(self._edits(self._propose({"action": "clear"})))
		self.assertEqual((report["removed"], report["left"]), (5, 0))
		self.assertEqual(spoken_changes.read()["list"], self.name)
		spoken_list.add([{"item": self.parsnip, "qty": 1}])
		self.assertEqual(len(self._lines()), 1, "what is said next goes on the same list")

	def test_a_line_that_went_in_the_meantime_leaves_the_list_as_it_was(self):
		# the yes comes minutes later: someone took the line off at the till's screen in between
		proposal = self._propose(
			{"action": "remove", "text": "panais"}, {"action": "quantity", "text": "biere", "qty": 4}
		)
		shopping.remove_line(self.name, self._lines()[1].name)
		before = [(r.name, r.qty) for r in self._lines()]
		with self.assertRaises(frappe.DoesNotExistError):
			spoken_changes.apply(self._edits(proposal))
		self.assertEqual(
			[(r.name, r.qty) for r in self._lines()], before, "the first change was not made either"
		)

	def test_a_line_is_changed_once_at_a_time(self):
		row = self._lines()[0].name
		with self.assertRaises(frappe.ValidationError):
			spoken_changes.apply(
				[{"row": row, "action": "remove"}, {"row": row, "action": "quantity", "qty": 2}]
			)
		self.assertEqual(len(self._lines()), 5)

	def test_an_edit_that_asks_for_nothing_valid_is_refused_before_anything_is_written(self):
		first = self._lines()[0].name
		for bad in (
			{"row": first, "action": "burn"},
			{"row": first, "action": "quantity", "qty": 0},
			{"row": first, "action": "state", "state": "eaten"},
		):
			with self.subTest(edit=bad), self.assertRaises(frappe.ValidationError):
				spoken_changes.apply([{"row": self._lines()[1].name, "action": "remove"}, bad])
			self.assertEqual(len(self._lines()), 5)
		with self.assertRaises(frappe.ValidationError):
			spoken_changes.apply([])

	def test_no_list_in_progress_is_an_error_not_a_new_list(self):
		frappe.db.sql("update `tabRestaurant Shopping List` set status = 'Done'")
		count = frappe.db.count("Restaurant Shopping List")
		with self.assertRaises(frappe.DoesNotExistError):
			spoken_changes.apply([{"row": "nope", "action": "remove"}])
		self.assertEqual(frappe.db.count("Restaurant Shopping List"), count)

	# -- who may, and where -----------------------------------------------------------------------------------------

	def test_a_portal_account_can_neither_read_nor_propose_nor_apply(self):
		row = self._lines()[0].name
		frappe.set_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			spoken_changes.read()
		with self.assertRaises(frappe.PermissionError):
			spoken_changes.propose([{"action": "clear"}])
		with self.assertRaises(frappe.PermissionError):
			spoken_changes.apply([{"row": row, "action": "remove"}], self.name)
		frappe.set_user("Administrator")
		self.assertEqual(len(self._lines()), 5)

	def test_the_calls_refuse_where_the_site_does_not_show_the_purchases(self):
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 0}),
			patch("pos_next.restaurant.supply_catalogue.neoresto_active", return_value=True),
		):
			with self.assertRaises(frappe.PermissionError):
				api.read_list_in_progress()
			with self.assertRaises(frappe.PermissionError):
				api.propose_changes_from_words([{"action": "clear"}])
			with self.assertRaises(frappe.PermissionError):
				api.apply_changes([{"row": self._lines()[0].name, "action": "remove"}])

	def test_the_calls_take_what_the_agent_sends_as_json_too(self):
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 1}),
			patch("pos_next.restaurant.supply_catalogue.neoresto_active", return_value=True),
		):
			proposal = api.propose_changes_from_words('[{"action": "remove", "text": "panais"}]')
			self.assertEqual(proposal["lines"][0]["status"], "matched")
			report = api.apply_changes(frappe.as_json(proposal["lines"][0]["edits"]))
			self.assertEqual(report["removed"], 1)
			self.assertEqual(api.read_list_in_progress()["list"], self.name)
