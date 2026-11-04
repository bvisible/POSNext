# //// Neoffice — added file (no upstream equivalent). What is in season, month by month (NeoResto, « Nora au restaurant », lot R4). Study:
# //// Obsidian `Neoffice/NeoResto/22-…`, section R4.
"""The season of a product, and of a recipe, in Switzerland.

The calendar is DATA, never written from memory: `season_data/manifest.json` names the published calendar it was read from (publisher, year,
address), the fingerprint of `season_data/switzerland.json` and whether someone of the restaurant's side has read it. Nothing answers unless the
file is the one the manifest names (SHA-256) and every row holds sensible months; without a calendar installed, the module says so and
guesses nothing.

A product is, for a month:
- `season`: harvested in Switzerland that month;
- `storage`: not harvested that month, but stored Swiss produce is on the shelves (potatoes, carrots, apples in winter): « de garde »;
- `out`: neither: out of season in Switzerland;
- and a product the calendar does not list is simply UNKNOWN: no verdict, never « out of season ».

A recipe is judged by the products of its ingredients that the calendar knows: it is `out` if one of them is out, `storage` if none is out but
one is stored, `season` if all are in season, and `unknown` when the calendar knows none of its ingredients. It is a help to choose, never a
refusal: a dish out of season stays a dish the owner may cook.

Where the site does not run NeoResto nothing of this answers (`require_neoresto`).
"""

import hashlib
import json
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from pos_next.restaurant import cuisine_knowledge, permissions, recipes
from pos_next.restaurant.mode import require_neoresto

DATA = Path(__file__).parent / "season_data"
FAMILIES = ("vegetable", "fruit", "herb")
STATES = ("season", "storage", "out")
# The names of the months a person says, in the languages of the site's customers, folded (no accent, lower case)
MONTH_NAMES = {
	"janvier": 1,
	"fevrier": 2,
	"mars": 3,
	"avril": 4,
	"mai": 5,
	"juin": 6,
	"juillet": 7,
	"aout": 8,
	"septembre": 9,
	"octobre": 10,
	"novembre": 11,
	"decembre": 12,
	"january": 1,
	"february": 2,
	"march": 3,
	"april": 4,
	"may": 5,
	"june": 6,
	"july": 7,
	"august": 8,
	"september": 9,
	"october": 10,
	"november": 11,
	"december": 12,
	"januar": 1,
	"februar": 2,
	"marz": 3,
	"juni": 6,
	"juli": 7,
	"oktober": 10,
	"dezember": 12,
}
# What says an ingredient is no longer the fresh product the calendar speaks of (tinned, dried, frozen, a compote, a juice, a concentrate...):
# it is not judged, never called « out of season ». Stems, as `recipes._stems` gives them: a feminine or a plural is forgiven by the prefix.
PRESERVED_PREFIXES = (
	"surgel",
	"conserv",
	"compot",
	"concentr",
	"confit",
	"sech",
	"poudr",
	"bouillon",
	"pure",
	"coulis",
	"sauce",
	"vinaigr",
	"sirop",
)
PRESERVED_WORDS = frozenset({"sec", "jus"})


def _preserved(stems) -> bool:
	return any(stem in PRESERVED_WORDS or stem.startswith(PRESERVED_PREFIXES) for stem in stems)


ENGLISH_MONTHS = (
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
)


def _broken(why: str) -> None:
	frappe.throw(_("The season calendar is not usable: {0}.").format(why), frappe.ValidationError)


def _months(value, what: str) -> list[int]:
	if not isinstance(value, list) or any(
		isinstance(m, bool) or not isinstance(m, int) or not 1 <= m <= 12 for m in value
	):
		_broken(_("the months of «{0}» are not numbers from 1 to 12").format(what))
	return sorted(set(value))


def load(folder: Path | None = None) -> dict | None:
	"""The calendar, once it is proven to be the one the manifest names; None where no calendar is installed; frappe.ValidationError where
	one is installed and does not hold."""
	folder = folder or DATA
	manifest_file = folder / "manifest.json"
	if not manifest_file.is_file():
		return None
	manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
	source = manifest.get("source") or {}
	if not (source.get("publisher") and source.get("year") and source.get("url") and manifest.get("file")):
		_broken(_("the manifest does not say where the calendar comes from"))
	path = folder / manifest["file"]
	if not path.is_file():
		_broken(_("the calendar file is missing"))
	raw = path.read_bytes()
	if hashlib.sha256(raw).hexdigest() != manifest.get("file_sha256"):
		_broken(_("the calendar was changed since it was checked"))
	entries = []
	seen = set()
	for row in json.loads(raw).get("entries") or []:
		name = " ".join(str(row.get("name") or "").split())
		key = row.get("id")
		if not name or not key or key in seen or row.get("family") not in FAMILIES:
			_broken(_("a row of the calendar is incomplete or repeated"))
		seen.add(key)
		season = _months(row.get("season"), name)
		storage = _months(row.get("storage") or [], name)
		if not season and not storage:
			_broken(_("«{0}» has no month").format(name))
		if set(season) & set(storage):
			_broken(_("«{0}» is both in season and stored the same month").format(name))
		words = {name, *(row.get("aliases") or [])}
		entries.append(
			{
				"id": key,
				"name": name,
				"family": row["family"],
				"season": season,
				"storage": storage,
				"keys": sorted(
					{tuple(recipes._stems(w)) for w in words if recipes._stems(w)}, key=lambda k: -len(k)
				),
			}
		)
	if not entries:
		_broken(_("the calendar is empty"))
	reviewed = manifest.get("reviewed") or {}
	return {
		"entries": entries,
		"publisher": source["publisher"],
		"title": source.get("title"),
		"year": source["year"],
		"url": source["url"],
		"reviewed": bool(reviewed.get("by")),
		"reviewed_by": reviewed.get("by"),
		"reviewed_on": reviewed.get("on"),
	}


def month_of(value=None) -> int:
	"""The month asked: a number (1 to 12), a name (« novembre », « November », « Dezember ») or nothing, which is the month of today on the site."""
	if value in (None, ""):
		return getdate(nowdate()).month
	text = cuisine_knowledge.fold(str(value))
	if text.isdigit() and 1 <= int(text) <= 12:
		return int(text)
	if text in MONTH_NAMES:
		return MONTH_NAMES[text]
	short = [name for name in MONTH_NAMES if len(text) >= 3 and name.startswith(text)]
	if len({MONTH_NAMES[n] for n in short}) == 1:
		return MONTH_NAMES[short[0]]
	frappe.throw(_("«{0}» is not a month.").format(value), frappe.ValidationError)


def state_of(entry: dict, month: int) -> str:
	return "season" if month in entry["season"] else "storage" if month in entry["storage"] else "out"


def lookup(cal: dict, name) -> dict | None:
	"""The entry of the calendar a name says: the one whose every word is in the name, the longest first (« pommes de terre » is the potato, not
	the apple). Plurals forgiven. None when the calendar does not know the product, or the ingredient is a preserved one (tinned, dried, a juice...)."""
	stems = recipes._stems(name)
	if not stems or _preserved(stems):
		return None
	have = set(stems)
	best = None
	for entry in cal["entries"]:
		for key in entry["keys"]:
			if all(word in have for word in key) and (best is None or len(key) > best[0]):
				best = (len(key), entry)
	return best[1] if best else None


def judge(cal: dict, names, month: int) -> dict:
	"""The season of a list of ingredient names for a month: the verdict, and the products that make it."""
	by_state = {state: [] for state in STATES}
	unknown = []
	seen = set()
	for name in names:
		entry = lookup(cal, name)
		if entry is None:
			unknown.append(name)
		elif entry["id"] not in seen:
			seen.add(entry["id"])
			by_state[state_of(entry, month)].append(entry["name"])
	verdict = (
		"out"
		if by_state["out"]
		else "storage"
		if by_state["storage"]
		else "season"
		if by_state["season"]
		else "unknown"
	)
	return {"state": verdict, **by_state, "unknown": unknown, "judged": len(seen), "of": len(names)}


def _calendar_or_none() -> dict | None:
	"""The calendar where this site runs NeoResto and has one installed; None otherwise (no verdict, no refusal: the caller only goes without).

	A calendar that does not hold (a file changed after it was checked, a month that does not exist) is left out of the recipes' screens
	rather than breaking them, and the error is logged; the tool that asks for the season itself says it."""
	from pos_next.restaurant.mode import neoresto_active

	if not neoresto_active():
		return None
	try:
		return load()
	except frappe.ValidationError as exc:
		frappe.clear_messages()
		frappe.log_error("Season calendar unusable", str(exc))
		return None


def season_of(verdict: dict) -> dict:
	"""What a row of a list says of its season: the verdict, the products that make it, and how many of its ingredients the calendar knows
	(a recipe rated on one product out of six is rated weakly: it is said)."""
	return {
		"state": verdict["state"],
		"out": verdict["out"],
		"storage": verdict["storage"],
		"judged": verdict["judged"],
		"of": verdict["of"],
	}


def annotate(rows: list[dict], names_of, month: int | None = None) -> bool:
	"""Put a `season` verdict on each row of a list (recipes, fiches of the library): `names_of(row)` gives the ingredient names of a row.
	Returns whether a calendar was there to judge by; without one the rows are left as they are."""
	cal = _calendar_or_none()
	if cal is None:
		return False
	month = month or month_of()
	for row in rows:
		verdict = judge(cal, names_of(row), month)
		row["season"] = season_of(verdict)
	return True


def status() -> dict:
	"""Whether there is a calendar to answer by, and where it comes from. Read only."""
	require_neoresto()
	permissions.require(recipes.DOCTYPE, "read")
	cal = load()
	if cal is None:
		return {"available": False}
	return {
		"available": True,
		"publisher": cal["publisher"],
		"title": cal["title"],
		"year": cal["year"],
		"reviewed": cal["reviewed"],
		"reviewed_by": cal["reviewed_by"],
		"reviewed_on": cal["reviewed_on"],
		"products": len(cal["entries"]),
	}


def what_is_in_season(month=None, family=None, query=None) -> dict:
	"""What the calendar says for a month: the products in season, the stored ones, and, if a product (or several) is asked, what it says of each.
	Read only; nothing is guessed (a product the calendar does not list is said so)."""
	require_neoresto()
	permissions.require(recipes.DOCTYPE, "read")
	cal = load()
	if cal is None:
		return {
			"available": False,
			"message": _("No season calendar is installed on this site."),
		}
	number = month_of(month)
	wanted = cuisine_knowledge.fold(family) if family else None
	if wanted and wanted not in FAMILIES:
		wanted = {
			"legume": "vegetable",
			"legumes": "vegetable",
			"fruits": "fruit",
			"herbe": "herb",
			"herbes": "herb",
			"aromates": "herb",
		}.get(wanted, wanted)
		if wanted not in FAMILIES:
			frappe.throw(_("The families are vegetable, fruit and herb."), frappe.ValidationError)
	out = {
		"available": True,
		"month": number,
		"month_name": ENGLISH_MONTHS[number - 1],
		"calendar": {
			"publisher": cal["publisher"],
			"year": cal["year"],
			"reviewed": cal["reviewed"],
		},
	}
	if query:
		asked = [part for part in str(query).replace(";", ",").split(",") if part.strip()]
		answers = []
		for part in asked:
			entry = lookup(cal, part)
			if entry is None:
				answers.append({"asked": part.strip(), "known": False})
			else:
				answers.append(
					{
						"asked": part.strip(),
						"known": True,
						"product": entry["name"],
						"family": entry["family"],
						"state": state_of(entry, number),
						"season": entry["season"],
						"storage": entry["storage"],
					}
				)
		out["products"] = answers
		return out
	for state in ("season", "storage"):
		listed = [
			e["name"]
			for e in cal["entries"]
			if state_of(e, number) == state and (not wanted or e["family"] == wanted)
		]
		out[state] = sorted(listed, key=cuisine_knowledge.fold)
	return out
