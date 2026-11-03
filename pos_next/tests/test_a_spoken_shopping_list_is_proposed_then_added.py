# //// Neoffice — added file (no upstream equivalent).
"""A shopping list made from words, the way Nora makes it (NeoResto, purchases, lot G).

The owner dictates « I need carrots, two crates of beer and some tea towels »; Nora turns it into articles with quantities
and calls the server. The server PROPOSES first, writing nothing: for each thing said, the article of the catalogue it
understood (accents, plurals, a typo or two), the packaging a unit names (« crates » is the crate), or the several articles it
could be, or nothing known - which will go on the list as a free line, written as said. Only what the owner confirmed is added,
to the list in progress (made if there is none).
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from pos_next.api import shopping as api
from pos_next.restaurant import shopping, spoken_list, supplies, supply_catalogue
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

MARKET = "_PNXT spoken market"
CELLAR = "_PNXT spoken cellar"
CRATE = "_PNXT spoken Crate of 24"
BOX = "_PNXT spoken Box of 6"
BAG = "_PNXT spoken Bag of 5 kg"
# The owner's rights on the ERP (items, suppliers, prices) without the restaurant's: it reads the catalogue, it does not
# manage the shopping list
READER = "spoken-reader@yopmail.com"
READER_ROLES = tuple(role for role in OWNER_ROLES if role != "Restaurant Manager")


def _by_text(proposal):
	return {line["text"]: line for line in proposal["lines"]}


class TestASpokenShoppingListIsProposedThenAdded(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_user(OWNER, OWNER_ROLES)
		_user(PORTAL, (), user_type="Website User")
		_user(READER, READER_ROLES)
		for name in (MARKET, CELLAR):
			_supplier(name)
		_bottle_uom()
		cls.company = _company()
		cls.group = frappe.db.get_value("Item Group", {"is_group": 0}, "name", order_by="lft")
		frappe.set_user(OWNER)
		# distinctive words, so that nothing the site already holds is taken for them
		cls.parsnip = supplies.create_supply_item("Panais", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.parsnip, MARKET, BAG, 5, 9.5, None, 1, cls.company)
		cls.beer = supplies.create_supply_item("Bière brune de Zurich", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.beer, CELLAR, BOX, 6, 14.0, None, 1, cls.company)
		supplies.add_supply_pack(cls.beer, CELLAR, CRATE, 24, 52.0)
		cls.pasta = supplies.create_supply_item("Pâtes à lasagnes de Zurich", cls.group, BOTTLE_UOM)
		supplies.add_supply_pack(cls.pasta, MARKET, BAG, 5, 18.6, None, 1, cls.company)
		cls.swede = supplies.create_supply_item("Rutabaga", cls.group, BOTTLE_UOM)
		# a family, whose name says what its articles are when their own names do not (« wine » for a Chasselas)
		root = frappe.db.sql(
			"select name from `tabItem Group` where ifnull(parent_item_group, '') = '' limit 1"
		)[0][0]
		cls.family = "_PNXT Legumes anciens"
		if not frappe.db.exists("Item Group", cls.family):
			frappe.get_doc(
				{
					"doctype": "Item Group",
					"item_group_name": cls.family,
					"parent_item_group": root,
					"is_group": 0,
				}
			).insert(ignore_permissions=True)
		cls.chervil = supplies.create_supply_item("Cerfeuil tubéreux", cls.family, BOTTLE_UOM)
		cls.crosne = supplies.create_supply_item("Crosne", cls.family, BOTTLE_UOM)
		# two articles that a short word names alike
		cls.red = supplies.create_supply_item("Topinambour rouge", cls.group, BOTTLE_UOM)
		cls.white = supplies.create_supply_item("Topinambour blanc", cls.group, BOTTLE_UOM)
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def _propose(self, *things):
		frappe.set_user(OWNER)
		return spoken_list.propose(list(things))

	# -- understanding what was said --------------------------------------------------------------------------------

	def test_an_article_is_understood_whatever_the_case_the_accents_and_the_plural(self):
		proposal = self._propose(
			{"text": "PANAIS", "qty": 3}, {"text": "pates a lasagne de zurich", "qty": 2}, {"text": "panais"}
		)
		lines = proposal["lines"]
		self.assertEqual([line["item"] for line in lines], [self.parsnip, self.pasta, self.parsnip])
		self.assertEqual([line["status"] for line in lines], ["matched"] * 3)
		self.assertEqual([line["qty"] for line in lines], [3, 2, 1], "no quantity said: one")

	def test_a_typo_or_two_is_forgiven(self):
		(line,) = self._propose({"text": "panai"})["lines"]
		self.assertEqual((line["status"], line["item"]), ("matched", self.parsnip))

	def test_a_real_typo_is_forgiven_and_a_different_word_is_not(self):
		(typo,) = self._propose({"text": "rutabagua"})["lines"]
		self.assertEqual((typo["status"], typo["item"]), ("matched", self.swede))
		(other,) = self._propose({"text": "panacher"})["lines"]
		self.assertEqual(other["status"], "unknown", "a word that merely starts alike is not the article")

	def test_the_name_of_a_family_names_what_is_in_it_when_the_articles_do_not(self):
		(line,) = self._propose({"text": "legumes anciens"})["lines"]
		self.assertEqual(line["status"], "ambiguous")
		self.assertEqual({c["item"] for c in line["candidates"]}, {self.chervil, self.crosne})
		(named,) = self._propose({"text": "crosne"})["lines"]
		self.assertEqual(
			(named["status"], named["item"]), ("matched", self.crosne), "the article's own name first"
		)

	def test_a_short_word_names_the_article_that_holds_it(self):
		(line,) = self._propose({"text": "biere brune"})["lines"]
		self.assertEqual((line["status"], line["item"]), ("matched", self.beer))

	def test_the_usual_packaging_and_supplier_come_with_the_article(self):
		(line,) = self._propose({"text": "panais", "qty": 2})["lines"]
		self.assertEqual(
			line["line"],
			{"item": self.parsnip, "qty": 2, "supplier": MARKET, "uom": BAG},
			"what add will write",
		)
		self.assertEqual(line["pack"]["price"], 9.5)

	def test_a_unit_that_names_a_packaging_chooses_it(self):
		# The packagings are « Crate of 24 » and « Box of 6 » in the catalogue: a unit said as a word of one finds it
		(crate,) = self._propose({"text": "biere brune", "qty": 2, "unit": "crates"})["lines"]
		self.assertEqual(crate["line"]["uom"], CRATE)
		(box,) = self._propose({"text": "biere brune", "qty": 1, "unit": "box"})["lines"]
		self.assertEqual(box["line"]["uom"], BOX)

	def test_a_unit_that_names_none_of_the_packagings_leaves_the_usual_one(self):
		(line,) = self._propose({"text": "biere brune", "qty": 1, "unit": "sacs"})["lines"]
		self.assertEqual(line["line"]["uom"], BOX)

	def test_an_article_two_could_be_is_left_to_the_owner(self):
		(line,) = self._propose({"text": "topinambour", "qty": 2})["lines"]
		self.assertEqual(line["status"], "ambiguous")
		self.assertIsNone(line["line"])
		self.assertEqual({c["item"] for c in line["candidates"]}, {self.red, self.white})

	def test_what_is_not_in_the_catalogue_goes_on_as_a_free_line_as_said(self):
		(line,) = self._propose({"text": "torchons de cuisine", "qty": 4, "unit": "paquets"})["lines"]
		self.assertEqual(line["status"], "unknown")
		self.assertEqual(
			line["line"], {"free": True, "text": "torchons de cuisine", "qty": 4, "unit_text": "paquets"}
		)

	def test_the_proposal_counts_what_it_understood(self):
		proposal = self._propose(
			{"text": "panais"},
			{"text": "topinambour"},
			{"text": "torchons"},
			{"text": "pates a lasagne de zurich"},
		)
		self.assertEqual(proposal["counts"], {"matched": 2, "ambiguous": 1, "unknown": 1})

	def test_a_proposal_writes_nothing(self):
		before = frappe.db.count("Restaurant Shopping List")
		self._propose({"text": "panais"}, {"text": "torchons"})
		self.assertEqual(frappe.db.count("Restaurant Shopping List"), before)

	# -- adding what was confirmed ----------------------------------------------------------------------------------

	def test_what_is_confirmed_goes_on_a_list_that_is_made_when_there_is_none(self):
		frappe.set_user(OWNER)
		# no list in progress for this test: the others of the site are put aside inside the test's own transaction
		frappe.db.sql("update `tabRestaurant Shopping List` set status = 'Done'")
		proposal = spoken_list.propose([{"text": "panais", "qty": 2}, {"text": "torchons", "qty": 4}])
		report = spoken_list.add([line["line"] for line in proposal["lines"]])
		doc = frappe.get_doc("Restaurant Shopping List", report["list"])
		self.assertEqual((report["articles"], report["free"]), (1, 1))
		self.assertEqual({(r.item, r.qty) for r in doc.lines if r.item}, {(self.parsnip, 2)})
		self.assertEqual([(r.free_text, r.qty) for r in doc.lines if not r.item], [("torchons", 4)])

	def test_what_is_confirmed_joins_the_list_in_progress(self):
		frappe.set_user(OWNER)
		frappe.db.sql("update `tabRestaurant Shopping List` set status = 'Done'")
		mine = shopping.new_list(self.company)
		report = spoken_list.add([{"item": self.parsnip, "qty": 1}])
		self.assertEqual(report["list"], mine)
		self.assertEqual(spoken_list.add([{"item": self.parsnip, "qty": 2}])["list"], mine)
		self.assertEqual(
			frappe.get_doc("Restaurant Shopping List", mine).lines[0].qty, 3, "the same article adds up"
		)

	def test_an_owner_who_chose_among_the_candidates_adds_the_one_he_chose(self):
		frappe.set_user(OWNER)
		mine = shopping.new_list(self.company)
		spoken_list.add([{"item": self.white, "qty": 2}], mine)
		self.assertEqual(
			[r.item for r in frappe.get_doc("Restaurant Shopping List", mine).lines], [self.white]
		)

	# -- who may, and where -----------------------------------------------------------------------------------------

	def test_an_account_that_may_not_write_the_list_gets_no_proposal(self):
		# The proposal is read back to whoever will confirm it, and `add` would refuse that account: it is refused first,
		# not after a yes (the catalogue alone is readable by many accounts, the list is the restaurant managers')
		frappe.set_user(READER)
		with self.assertRaises(frappe.PermissionError):
			spoken_list.propose([{"text": "panais"}])
		with self.assertRaises(frappe.PermissionError):
			spoken_list.add([{"item": self.parsnip, "qty": 1}])

	def test_a_portal_account_can_neither_propose_nor_add(self):
		frappe.set_user(PORTAL)
		with self.assertRaises(frappe.PermissionError):
			spoken_list.propose([{"text": "panais"}])
		with self.assertRaises(frappe.PermissionError):
			spoken_list.add([{"item": self.parsnip, "qty": 1}])

	def test_the_calls_refuse_where_the_site_does_not_show_the_purchases(self):
		frappe.set_user(OWNER)
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 0}),
			patch("pos_next.restaurant.supply_catalogue.neoresto_active", return_value=True),
		):
			with self.assertRaises(frappe.PermissionError):
				api.propose_list_from_words([{"text": "panais"}])
			with self.assertRaises(frappe.PermissionError):
				api.add_proposed_lines([{"item": self.parsnip, "qty": 1}])

	def test_the_calls_take_what_the_agent_sends_as_json_too(self):
		frappe.set_user(OWNER)
		with (
			patch.dict(frappe.local.conf, {supply_catalogue.SITE_FLAG: 1}),
			patch("pos_next.restaurant.supply_catalogue.neoresto_active", return_value=True),
		):
			proposal = api.propose_list_from_words('[{"text": "panais", "qty": 2}]')
		self.assertEqual(proposal["lines"][0]["item"], self.parsnip)
