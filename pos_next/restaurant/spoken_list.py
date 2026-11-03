# //// Neoffice — added file (no upstream equivalent). A shopping list made from words, the way Nora makes it by voice (NeoResto,
# //// purchases, lot G). Study: Obsidian `Neoffice/NeoResto/18-…`. The rule of the list itself is pos_next/restaurant/shopping.py.
"""A shopping list made from what the owner says.

The owner dictates « I need carrots, two crates of beer and some tea towels »; Nora turns it into things with quantities and
calls the server, in two steps and never one:

- `propose` WRITES NOTHING. For each thing said it answers what it understood: the article of the catalogue (the case, the
  accents, the plural and a typo or two are forgiven), the packaging a unit names (« crates » is the crate), or the several
  articles it could be (the owner chooses), or nothing known - which goes on the list as a free line, written as said. Nora
  reads the proposal back to the owner (« 9 articles, 2 to specify: shall I add them? »).
- `add` writes what the owner confirmed, to the list in progress (a list is made when there is none): the articles as the
  list's picker adds them, the free lines as the free-line button adds them.

The speech recognition is wrong now and then, a list costs little to mend and a silent addition would surprise: hence the
proposal. Nothing here reads the sentence itself: the agent that listens turns it into `{text, qty, unit}` things.
"""

import difflib
import re
import unicodedata

import frappe
from frappe.utils import flt

from pos_next.restaurant import permissions, shopping, supply_catalogue

MATCHED, AMBIGUOUS, UNKNOWN = "matched", "ambiguous", "unknown"
# A spoken word is taken for one of an article's words when at least this close (a typo or two)
FUZZY_FLOOR = 0.8
# An article at least this close to what was said is the one understood; below, it is left as said (a free line)
CONFIDENT = 0.85
# What the family of an article says it is (« wine » for the articles of « Wines ») counts as this, when its name says nothing
FAMILY = 0.86
# Other articles this close to the best leave the choice to the owner
TIE = 0.04
CANDIDATES = 4
# The words that carry no meaning in a name or in a unit (French and English, as they come from the voice)
STOP_WORDS = {
	"de",
	"du",
	"des",
	"d",
	"la",
	"le",
	"les",
	"l",
	"un",
	"une",
	"et",
	"a",
	"au",
	"aux",
	"en",
	"of",
	"the",
}


def _fold(text) -> str:
	"""Lower case, no accents, nothing but letters and digits: « Pâtes à Lasagnes ! » is « pates a lasagnes »."""
	plain = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()
	return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def _stem(word: str) -> str:
	"""The singular of a word, near enough to compare with: a final s or x is dropped from a word of four letters or more."""
	return word[:-1] if len(word) > 3 and word.endswith(("s", "x")) else word


def _words(text) -> list[str]:
	return [_stem(w) for w in _fold(text).split() if w not in STOP_WORDS]


def _score(wanted: list[str], name: list[str], family: list[str]) -> float:
	"""How close what was said is to an article's name, from 0 to 1.

	The same words, in any order: 1. Every word said is a word of the name: 0.9 and up, the nearer the name is to nothing
	more, the higher (« beer » is nearer « Brown beer » than « Brown beer of the cellar »). Otherwise each word said must be
	close to one of the name's (a typo or two), and the score is their mean, below 0.92. When the name says nothing of it, the
	words of the article's family may: « wine » for a Chasselas in « Wines »."""
	if not wanted or not name:
		return 0.0
	if set(wanted) == set(name):
		return 1.0
	if all(word in name for word in wanted):
		return 0.9 + 0.1 * len(wanted) / len(name)
	closest = [max(difflib.SequenceMatcher(None, word, other).ratio() for other in name) for word in wanted]
	by_name = 0.0 if min(closest) < FUZZY_FLOOR else min(sum(closest) / len(closest), 0.92)
	if by_name < CONFIDENT and all(word in family for word in wanted):
		return FAMILY
	return by_name


def _pack_of(packs: list[dict], unit: str | None) -> dict | None:
	"""The packaging a unit names (« crates » for « Crate of 24 »), else the usual one, else the first."""
	words = set(_words(unit))
	named = [p for p in packs if words & set(_words(p.get("uom")))] if words else []
	if named:
		return named[0]
	return next((p for p in packs if p.get("usual")), packs[0] if packs else None)


def propose(things: list[dict]) -> dict:
	"""What was understood of what was said, and nothing written.

	`things` is [{text, qty, unit}] (the quantity and the unit are optional: one, and none). Answers {lines, counts}: for each
	thing, in order, `status` (matched, ambiguous or unknown), the `item` and its `pack` when matched, the `candidates` when
	ambiguous, and `line`, which `add` writes as it stands (None while the owner has still to choose).

	Whoever may not write the list is refused here, as `add` would refuse them: the proposal is read back to the one who will
	confirm it, and the catalogue it reads is open to many accounts that have no business with the restaurant's list."""
	permissions.require(shopping.DOCTYPE, "write")
	rows = supply_catalogue.catalogue(limit=1000)["rows"]
	known = [(row, _words(row["item_name"]), _words(row.get("item_group"))) for row in rows]
	lines = []
	for thing in things or []:
		text = (thing.get("text") or "").strip()
		if not text:
			continue
		qty = flt(thing.get("qty")) or 1
		unit = (thing.get("unit") or "").strip() or None
		wanted = _words(text)
		ranked = sorted(
			((_score(wanted, words, family), row) for row, words, family in known), key=lambda pair: -pair[0]
		)
		best = ranked[0][0] if ranked else 0
		line = {
			"text": text,
			"qty": qty,
			"unit": unit,
			"status": UNKNOWN,
			"item": None,
			"item_name": None,
			"pack": None,
			"candidates": [],
			"line": {"free": True, "text": text, "qty": qty, "unit_text": unit},
		}
		if best >= CONFIDENT:
			close = [row for score, row in ranked if score >= best - TIE][:CANDIDATES]
			if len(close) > 1:
				line.update(
					status=AMBIGUOUS,
					candidates=[{"item": r["item"], "item_name": r["item_name"]} for r in close],
					line=None,
				)
			else:
				row = close[0]
				pack = _pack_of(row["packs"], unit)
				line.update(
					status=MATCHED,
					item=row["item"],
					item_name=row["item_name"],
					pack={"supplier": pack["supplier"], "uom": pack["uom"], "price": pack["price"]}
					if pack
					else None,
					line={
						"item": row["item"],
						"qty": qty,
						"supplier": pack["supplier"] if pack else None,
						"uom": pack["uom"] if pack else None,
					},
				)
		lines.append(line)
	counts = {
		status: sum(1 for line in lines if line["status"] == status)
		for status in (MATCHED, AMBIGUOUS, UNKNOWN)
	}
	return {"lines": lines, "counts": counts}


def current_list() -> str | None:
	"""The list in progress: the latest one that is not done, as the shopping page opens it; None when there is none."""
	found = frappe.get_list(
		shopping.DOCTYPE,
		filters={"status": ["!=", "Done"]},
		order_by="list_date desc, creation desc",
		limit_page_length=1,
		pluck="name",
	)
	return found[0] if found else None


def add(lines: list[dict], list_name: str | None = None) -> dict:
	"""Write what the owner confirmed, to `list_name` or to the list in progress (made when there is none).

	Each line is a `line` of the proposal: {item, qty, supplier, uom} for an article, {free, text, qty, unit_text} for a free
	line. Every article is looked for before the first is written (shopping.add_article_lines). Answers {list, articles, free}."""
	lines = [line for line in lines or [] if line]
	articles = [line for line in lines if not line.get("free")]
	free = [line for line in lines if line.get("free")]
	name = list_name or current_list()
	if not name and lines:
		name = shopping.new_list()
	if articles:
		shopping.add_article_lines(name, articles)
	for line in free:
		shopping.add_free_line(name, line.get("text"), line.get("qty") or 1, line.get("unit_text"))
	return {"list": name, "articles": len(articles), "free": len(free)}
