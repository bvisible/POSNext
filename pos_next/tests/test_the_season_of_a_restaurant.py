# //// Neoffice — added file (no upstream equivalent).
"""What is in season (NeoResto, « Nora au restaurant », lot R4). The suite pins:

- the calendar is data that must be the file its manifest names, with sensible months; without one the module says so and judges nothing;
- a product is in season, stored (« de garde ») or out of season, and one the calendar does not list is UNKNOWN, never out of season;
- the longest name wins (« pommes de terre » is the potato, not the apple), plurals are forgiven, and a tinned or dried product is not judged;
- a recipe is judged by the products of its ingredients that the calendar knows, and a recipe out of season is never refused;
- who may ask, and that where the site does not run NeoResto nothing answers.

The test calendar below is made for the suite: it is not the calendar a restaurant gets.
"""

import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.tests.roles import as_role
from frappe.tests.utils import FrappeTestCase

from pos_next.api import recipes as api
from pos_next.restaurant import recipe_library, recipes, season
from pos_next.restaurant.settings import default_restaurant
from pos_next.tests.test_the_supplies_of_a_restaurant_are_written_in_the_erp_fiches import PORTAL, _user

FLAGS = {"neoresto_active": 1, "neoresto_card_with_nora_active": 1}
WINTER_SOUP = "_Test SE Soupe de garde"
SUMMER_SALAD = "_Test SE Salade d'asperges"
PLAIN = "_Test SE Bouillon clair"


def entry(key, name, family, season_months, storage=(), aliases=()):
	return {
		"id": key,
		"name": name,
		"family": family,
		"season": list(season_months),
		"storage": list(storage),
		"aliases": list(aliases),
	}


ENTRIES = [
	entry("carrot", "Carottes", "vegetable", range(6, 11), [1, 2, 3, 4, 5, 11, 12], ["carotte"]),
	entry(
		"potato", "Pommes de terre", "vegetable", range(6, 11), [1, 2, 3, 4, 5, 11, 12], ["pomme de terre"]
	),
	entry("apple", "Pommes", "fruit", range(7, 11), [1, 2, 3, 4, 5, 6, 11, 12], ["pomme"]),
	entry("squash", "Courge", "vegetable", [1, 2, 8, 9, 10, 11, 12], [], ["potimarron", "butternut"]),
	entry("asparagus", "Asperges", "vegetable", [5, 6], [], ["asperge"]),
	entry("strawberry", "Fraises", "fruit", range(5, 10), [], ["fraise"]),
	entry("parsley", "Persil", "herb", range(5, 12), [], []),
	entry("broccoli", "Brocolis", "vegetable", range(6, 11), [], ["brocoli", "broccoli"]),
]


def a_calendar_folder(entries=ENTRIES, reviewed_by=None, tamper=False, **manifest):
	folder = Path(tempfile.mkdtemp(prefix="season-"))
	raw = json.dumps({"entries": entries}, ensure_ascii=False).encode()
	(folder / "switzerland.json").write_bytes(raw)
	doc = {
		"file": "switzerland.json",
		"file_sha256": hashlib.sha256(raw + (b" " if tamper else b"")).hexdigest(),
		"source": {
			"publisher": "A test publisher",
			"title": "A test calendar",
			"year": 2025,
			"url": "https://example.test/calendar",
		},
		"reviewed": {"by": reviewed_by, "on": "2026-11-05" if reviewed_by else None},
	}
	doc.update(manifest)
	(folder / "manifest.json").write_text(json.dumps(doc), encoding="utf-8")
	return folder


class SeasonCase(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.addCleanup(frappe.db.rollback)
		patcher = patch.dict(frappe.conf, FLAGS)
		patcher.start()
		self.addCleanup(patcher.stop)
		self.company = frappe.db.get_value("Company", {}, "name")
		if not self.company:
			self.skipTest("The site has no company")
		self.restaurant = default_restaurant()

	def installed(self, **kwargs):
		folder = a_calendar_folder(**kwargs)
		self.addCleanup(shutil.rmtree, folder, True)
		patcher = patch.object(season, "DATA", folder)
		patcher.start()
		self.addCleanup(patcher.stop)
		return folder

	def a_recipe(self, name, *ingredients, **more):
		fields = {
			"doctype": "Restaurant Recipe",
			"recipe_name": name,
			"base_portions": 4,
			"status": "Draft",
			"steps": "Cook.",
			"ingredients": [{"ingredient_name": n, "qty": 100, "unit": "g"} for n in ingredients],
			**more,
		}
		with as_role("client_admin"):
			return frappe.get_doc(fields).insert()


class TestTheCalendarIsTheFileItsManifestNames(SeasonCase):
	def test_without_a_calendar_nothing_is_judged_and_it_is_said(self):
		with patch.object(season, "DATA", Path(tempfile.mkdtemp(prefix="season-empty-"))):
			self.assertIsNone(season.load())
			with as_role("client_admin"):
				self.assertEqual(season.status(), {"available": False})
				self.assertFalse(season.what_is_in_season("novembre")["available"])
			rows = [{"ingredients": ["Carottes"]}]
			self.assertFalse(season.annotate(rows, lambda row: row["ingredients"]))
			self.assertNotIn("season", rows[0])

	def test_a_file_changed_after_it_was_checked_is_refused(self):
		self.installed(tamper=True)
		with self.assertRaisesRegex(frappe.ValidationError, "changed since it was checked"):
			season.load()

	def test_a_manifest_that_does_not_say_where_it_comes_from_is_refused(self):
		self.installed(source={"publisher": "", "year": 2025, "url": "https://example.test"})
		with self.assertRaisesRegex(frappe.ValidationError, "where the calendar comes from"):
			season.load()

	def test_a_row_with_a_month_that_does_not_exist_is_refused(self):
		for months in ([0, 5], [13], ["may"], [True]):
			self.installed(entries=[entry("x", "Courge", "vegetable", months)])
			with self.assertRaisesRegex(frappe.ValidationError, "not numbers from 1 to 12"):
				season.load()

	def test_a_product_in_season_and_stored_the_same_month_is_refused(self):
		self.installed(entries=[entry("x", "Courge", "vegetable", [1, 2], [2, 3])])
		with self.assertRaisesRegex(frappe.ValidationError, "both in season and stored"):
			season.load()

	def test_a_row_with_an_unknown_family_or_no_name_is_refused(self):
		for bad in (entry("x", "Courge", "mineral", [1]), entry("y", "", "vegetable", [1])):
			self.installed(entries=[bad])
			with self.assertRaisesRegex(frappe.ValidationError, "incomplete or repeated"):
				season.load()

	def test_it_says_where_it_comes_from_and_whether_anyone_read_it(self):
		self.installed()
		with as_role("client_admin"):
			said = season.status()
		self.assertTrue(said["available"])
		self.assertFalse(said["reviewed"])
		self.assertEqual(
			(said["publisher"], said["year"], said["products"]), ("A test publisher", 2025, len(ENTRIES))
		)
		self.installed(reviewed_by="the owner")
		with as_role("client_admin"):
			self.assertTrue(season.status()["reviewed"])


class TestACalendarThatDoesNotHoldNeverBreaksTheRecipes(SeasonCase):
	def test_the_recipes_go_on_without_a_season_and_the_error_is_logged(self):
		self.installed(tamper=True)
		self.a_recipe(SUMMER_SALAD, "Asperges", "Fraises")
		with patch.object(frappe, "log_error") as logged, as_role("client_admin"):
			found = recipes.search("asperges", in_season=True)
			library = recipe_library.listing()
		self.assertFalse(found["season_available"])
		self.assertEqual([r["recipe"] for r in found["recipes"]], [SUMMER_SALAD])
		self.assertFalse(library["season_available"])
		self.assertTrue(logged.called)
		self.assertEqual(logged.call_args.args[0], "Season calendar unusable")

	def test_the_tool_that_asks_for_the_season_says_it(self):
		self.installed(tamper=True)
		with (
			as_role("client_admin"),
			self.assertRaisesRegex(frappe.ValidationError, "changed since it was checked"),
		):
			season.what_is_in_season("mars")


class TestAProductIsInSeasonStoredOrOut(SeasonCase):
	def test_a_month_is_said_by_number_or_by_name(self):
		for said, number in (
			("novembre", 11),
			("Novembre", 11),
			("August", 8),
			("août", 8),
			("Dezember", 12),
			("nov", 11),
			(3, 3),
			("12", 12),
		):
			self.assertEqual(season.month_of(said), number, said)
		with patch.object(season, "nowdate", return_value="2026-11-05"):
			self.assertEqual(season.month_of(None), 11)
		for bad in ("mon", "13", 0, "marsupilami"):
			with self.assertRaises(frappe.ValidationError):
				season.month_of(bad)

	def test_a_product_has_a_state_for_each_month(self):
		self.installed()
		carrot = season.lookup(season.load(), "carottes")
		self.assertEqual(
			[season.state_of(carrot, m) for m in (1, 6, 10, 11)], ["storage", "season", "season", "storage"]
		)
		asparagus = season.lookup(season.load(), "Asperges vertes")
		self.assertEqual(
			[season.state_of(asparagus, m) for m in (4, 5, 6, 7)], ["out", "season", "season", "out"]
		)

	def test_the_longest_name_wins_and_plurals_are_forgiven(self):
		self.installed()
		cal = season.load()
		self.assertEqual(season.lookup(cal, "Pommes de terre fermes")["id"], "potato")
		self.assertEqual(season.lookup(cal, "pomme de terre")["id"], "potato")
		self.assertEqual(season.lookup(cal, "Pommes")["id"], "apple")
		self.assertEqual(season.lookup(cal, "Courge moyenne")["id"], "squash")
		self.assertEqual(season.lookup(cal, "un butternut")["id"], "squash")
		self.assertEqual(season.lookup(cal, "Brocoli")["id"], "broccoli")

	def test_what_the_calendar_does_not_list_is_unknown_not_out_of_season(self):
		self.installed()
		cal = season.load()
		for name in ("Œufs", "Huile d'olive", "Poivre de Cayenne", "Poivrons"):
			self.assertIsNone(season.lookup(cal, name), name)

	def test_a_tinned_dried_or_juiced_product_is_not_judged(self):
		self.installed()
		cal = season.load()
		for name in (
			"Haricots en conserve",
			"Persil séché",
			"Compote de pommes",
			"Jus de pomme",
			"Concentré de carotte",
			"Carottes surgelées",
		):
			self.assertIsNone(season.lookup(cal, name), name)

	def test_the_calendar_of_a_month_lists_what_is_in_season_and_what_is_stored(self):
		self.installed()
		with as_role("client_admin"):
			november = season.what_is_in_season("novembre")
			august = season.what_is_in_season("août", family="fruits")
			asked = season.what_is_in_season("mars", query="carottes, asperges, ananas")
		self.assertEqual(november["month"], 11)
		self.assertIn("Courge", november["season"])
		self.assertIn("Carottes", november["storage"])
		self.assertNotIn("Asperges", november["season"] + november["storage"])
		self.assertEqual(august["season"], ["Fraises", "Pommes"])
		self.assertEqual([p["state"] for p in asked["products"] if p["known"]], ["storage", "out"])
		self.assertEqual(asked["products"][2], {"asked": "ananas", "known": False})

	def test_a_family_that_does_not_exist_is_refused(self):
		self.installed()
		with as_role("client_admin"), self.assertRaisesRegex(frappe.ValidationError, "families"):
			season.what_is_in_season("mars", family="minerals")


class TestARecipeIsJudgedByWhatTheCalendarKnows(SeasonCase):
	def test_one_ingredient_out_of_season_makes_the_recipe_out_of_season(self):
		self.installed()
		cal = season.load()
		self.assertEqual(season.judge(cal, ["Asperges", "Fraises"], 3)["state"], "out")
		self.assertEqual(season.judge(cal, ["Asperges", "Fraises"], 3)["out"], ["Asperges", "Fraises"])
		self.assertEqual(season.judge(cal, ["Asperges", "Fraises"], 7)["out"], ["Asperges"])

	def test_stored_without_anything_out_is_stored_and_all_in_season_is_in_season(self):
		self.installed()
		cal = season.load()
		self.assertEqual(season.judge(cal, ["Carottes", "Courge", "Sel"], 12)["state"], "storage")
		self.assertEqual(season.judge(cal, ["Carottes", "Courge", "Sel"], 9)["state"], "season")
		self.assertEqual(season.judge(cal, ["Carottes", "Courge", "Sel"], 9)["unknown"], ["Sel"])

	def test_a_verdict_says_how_many_of_the_ingredients_the_calendar_knows(self):
		self.installed()
		cal = season.load()
		said = season.judge(cal, ["Persil", "Crème", "Concentré de tomate", "Œufs", "Persil frais"], 6)
		self.assertEqual((said["state"], said["judged"], said["of"]), ("season", 1, 5))
		rows = [{"names": ["Carottes", "Courge", "Sel"]}]
		self.assertTrue(season.annotate(rows, lambda row: row["names"], 12))
		self.assertEqual(rows[0]["season"]["judged"], 2)
		self.assertEqual(rows[0]["season"]["of"], 3)

	def test_a_recipe_the_calendar_knows_nothing_of_has_no_verdict(self):
		self.installed()
		self.assertEqual(season.judge(season.load(), ["Œufs", "Sel"], 11)["state"], "unknown")

	def test_the_search_says_the_season_of_each_recipe_and_can_keep_the_ones_in_season(self):
		self.installed()
		self.a_recipe(WINTER_SOUP, "Courge", "Carottes", "Sel")
		self.a_recipe(SUMMER_SALAD, "Asperges", "Fraises")
		self.a_recipe(PLAIN, "Eau", "Sel")
		with as_role("client_admin"):
			everything = recipes.search("_Test SE", month="novembre")
			kept = recipes.search("_Test SE", month="novembre", in_season=True)
			summer = recipes.search("_Test SE", month="mai", in_season=True)
		states = {r["recipe"]: r["season"]["state"] for r in everything["recipes"]}
		self.assertEqual(states, {WINTER_SOUP: "storage", SUMMER_SALAD: "out", PLAIN: "unknown"})
		self.assertTrue(everything["season_available"])
		self.assertEqual([r["recipe"] for r in kept["recipes"]], [WINTER_SOUP])
		self.assertEqual(kept["count"], 1)
		self.assertEqual([r["recipe"] for r in summer["recipes"]], [SUMMER_SALAD])

	def test_a_recipe_out_of_season_is_still_found_when_the_season_is_not_asked(self):
		self.installed()
		self.a_recipe(SUMMER_SALAD, "Asperges", "Fraises")
		with as_role("client_admin"):
			found = recipes.search("asperges", month=1)
		self.assertEqual([r["recipe"] for r in found["recipes"]], [SUMMER_SALAD])
		self.assertEqual(found["recipes"][0]["season"]["state"], "out")

	def test_without_a_calendar_the_search_says_so_and_never_filters(self):
		self.a_recipe(SUMMER_SALAD, "Asperges", "Fraises")
		with (
			patch.object(season, "DATA", Path(tempfile.mkdtemp(prefix="season-empty-"))),
			as_role("client_admin"),
		):
			found = recipes.search("asperges", in_season=True)
		self.assertFalse(found["season_available"])
		self.assertEqual([r["recipe"] for r in found["recipes"]], [SUMMER_SALAD])
		self.assertNotIn("season", found["recipes"][0])

	def test_every_fiche_of_the_library_says_its_season(self):
		self.installed()
		with as_role("client_admin"):
			library = recipe_library.listing("novembre")
		self.assertTrue(library["season_available"])
		self.assertEqual(library["month"], 11)
		by_id = {r["id"]: r for r in library["recipes"]}
		self.assertTrue(all("season" in r and "_ingredients" not in r for r in library["recipes"]))
		# potatoes, carrots, squash and an apple compote: the compote is not judged, the rest is in season or stored in November
		self.assertIn(by_id["based-autumn-soup"]["season"]["state"], ("season", "storage"))
		# a ratatouille needs summer vegetables the test calendar does not know, except the aubergine-free ones it lists
		self.assertEqual(by_id["based-stracciatella-soup"]["season"]["state"], "unknown")

	def test_without_a_calendar_the_library_says_nothing_of_the_season(self):
		with (
			patch.object(season, "DATA", Path(tempfile.mkdtemp(prefix="season-empty-"))),
			as_role("client_admin"),
		):
			library = recipe_library.listing()
		self.assertFalse(library["season_available"])
		self.assertTrue(all("season" not in r for r in library["recipes"]))


class TestWhoMayAsk(SeasonCase):
	def test_nothing_answers_where_the_site_does_not_run_neoresto(self):
		self.installed()
		with patch.dict(frappe.conf, {"neoresto_active": 0}), as_role("client_admin"):
			self.assertFalse(season.annotate([{"i": []}], lambda row: row["i"]))
			for call in (
				lambda: season.status(),
				lambda: season.what_is_in_season("mars"),
				lambda: recipes.search("soupe", in_season=True),
			):
				with self.assertRaisesRegex(frappe.ValidationError, "not available"):
					call()
			found = frappe.get_all("Restaurant Recipe")
			self.assertIsNotNone(found)

	def test_a_visitor_and_a_portal_account_reach_nothing(self):
		self.installed()
		_user(PORTAL, (), user_type="Website User")
		for user in ("Guest", PORTAL):
			frappe.set_user(user)
			self.addCleanup(frappe.set_user, "Administrator")
			for call in (
				lambda: api.get_season("mars"),
				lambda: api.search_recipes("soupe", in_season=1),
				lambda: api.get_library("mars"),
			):
				with self.assertRaises((frappe.PermissionError, frappe.ValidationError)):
					call()
		frappe.set_user("Administrator")
