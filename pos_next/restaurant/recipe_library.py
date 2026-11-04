# //// Neoffice — added file (no upstream equivalent). The free recipe library of NeoResto (lot R3): 24 French drafts made from public-domain
# //// recipes, shipped with the app in `recipe_data/` and turned into a recipe of the restaurant only when its owner chooses one.
"""The free library: recipes the restaurant may add to its own, never added on their own.

The files in `recipe_data/` come from the catalogue of the project « Encore à table »: French drafts of public-domain recipes
(Based Cooking, Unlicense), each with its source, its author, its licence, the revision it was read at and the fingerprint of the original.
`recipe_data/manifest.json` carries the fingerprint of every draft and of every original. Nothing enters the restaurant unless all of this
holds: the file is the one the manifest names (SHA-256), it points at the revision and the host the manifest names, it carries an author
and a licence, it is a draft not yet read by anyone, and every figure of its ingredients is a number above zero.

An added recipe is a recipe of the restaurant like any other, « To review », with its provenance kept. A site where NeoResto is off sees
none of it, and the library is never copied into a site by a migrate: it stays in the app until someone picks a fiche.
"""

import hashlib
import json
import math
import re
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import cint

from pos_next.restaurant import cuisine_knowledge, permissions, recipes

DATA = Path(__file__).parent / "recipe_data"
ID = re.compile(r"^based-[a-z0-9-]+$")
SOURCE_HOST = "https://github.com/LukeSmithxyz/based.cooking/blob/"
MOST_AT_ONCE = 30
# What the family of a library recipe is told from the FIRST word of its title (« Soupe de courge »); a recipe that fits none has no family
# (« Croque-monsieur à la béchamel » is not a sauce)
FAMILIES = (
	("soupe", "Soupes"),
	("salade", "Salades"),
	("taboul", "Salades"),
	("bechamel", "Sauces"),
	("tzatziki", "Sauces"),
	("pates", "Pâtes"),
	("macaroni", "Pâtes"),
	("spaghetti", "Pâtes"),
)


def _broken(why: str) -> None:
	frappe.throw(_("The free recipe library is not intact: {0}.").format(why))


def _manifest() -> dict:
	try:
		return json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
	except (OSError, ValueError):
		_broken(_("its manifest cannot be read"))


def _entry(manifest: dict, recipe_id) -> dict:
	for entry in manifest["entries"]:
		if entry["id"] == recipe_id:
			return entry
	frappe.throw(_("There is no recipe «{0}» in the free library.").format(recipe_id))


def family_of(title: str) -> str | None:
	words = cuisine_knowledge.fold(title).split()
	first = words[0] if words else ""
	for word, family in FAMILIES:
		if first.startswith(word):
			return family
	return None


def _read(manifest: dict, entry: dict) -> dict:
	"""A fiche of the library, once it is proven to be the one the manifest names; frappe.ValidationError otherwise."""
	if not ID.match(entry["id"]):
		_broken(_("a recipe has an unexpected name"))
	raw = (DATA / f"{entry['id']}.json").read_bytes() if (DATA / f"{entry['id']}.json").is_file() else None
	if raw is None:
		_broken(_("the file of «{0}» is missing").format(entry["id"]))
	if hashlib.sha256(raw).hexdigest() != entry["file_sha256"]:
		_broken(_("«{0}» was changed since it was checked").format(entry["id"]))
	data = json.loads(raw)
	sources = (data.get("provenance") or {}).get("sources") or []
	source = sources[0] if len(sources) == 1 else {}
	revision = manifest["revision"]
	problems = []
	if data.get("id") != entry["id"] or data.get("version") != entry["version"]:
		problems.append("identity")
	if source.get("id") != entry["source_id"] or source.get("contentHash") != entry["source_sha256"]:
		problems.append("source fingerprint")
	if source.get("revision") != revision or not str(source.get("url") or "").startswith(
		f"{SOURCE_HOST}{revision}/"
	):
		problems.append("source revision")
	if not (source.get("author") and source.get("license") and source.get("title")):
		problems.append("author or licence")
	provenance = data.get("provenance") or {}
	if provenance.get("kind") != "catalog" or provenance.get("editorialStatus") != "draft":
		problems.append("status")
	rows = data.get("ingredients") or []
	if not rows or not data.get("steps"):
		problems.append("ingredients or steps")
	for row in rows:
		qty = row.get("quantity")
		if (
			isinstance(qty, bool)
			or not isinstance(qty, int | float)
			or not math.isfinite(qty)
			or qty <= 0
			or not str(row.get("name") or "").strip()
		):
			problems.append("an ingredient has no usable figure")
			break
	if problems:
		_broken(_("«{0}» does not match its manifest ({1})").format(entry["id"], ", ".join(problems)))
	return data


def listing(month=None) -> dict:
	"""What the library offers and what the restaurant already holds of it, and, when a season calendar is installed, whether each fiche is in
	season for `month` (this month when not given). Read only."""
	recipes.require_neoresto()
	permissions.require(recipes.DOCTYPE, "read")
	manifest = _manifest()
	held = {
		row.source_ref: row.name
		for row in frappe.get_all(
			recipes.DOCTYPE, filters={"source_ref": ["is", "set"]}, fields=["name", "source_ref"]
		)
	}
	taken = {cuisine_knowledge.fold(n) for n in frappe.get_all(recipes.DOCTYPE, pluck="recipe_name")}
	out = []
	for entry in manifest["entries"]:
		data = _read(manifest, entry)
		source = data["provenance"]["sources"][0]
		present = entry["id"] in held
		out.append(
			{
				"id": entry["id"],
				"title": data["title"],
				"subtitle": data.get("subtitle"),
				"family": family_of(data["title"]),
				"minutes": data.get("time"),
				"portions": data.get("basePortions"),
				"vegetarian": bool(data.get("vegetarian")),
				"ingredients": len(data["ingredients"]) + len(data.get("unquantifiedIngredients") or []),
				"author": source["author"],
				"license": source["license"],
				"state": "present"
				if present
				else "name_taken"
				if cuisine_knowledge.fold(data["title"]) in taken
				else "new",
				"recipe": held.get(entry["id"]),
				"_ingredients": [r["name"] for r in data["ingredients"]]
				+ list(data.get("unquantifiedIngredients") or []),
			}
		)
	# //// Neoffice — the season of each fiche, when a calendar is installed (lot R4)
	from pos_next.restaurant import season

	number = season.month_of(month)
	seasonal = season.annotate(out, lambda row: row["_ingredients"], number)
	for row in out:
		row.pop("_ingredients", None)
	return {
		"season_available": seasonal,
		"month": number,
		"count": len(out),
		"provider": manifest["provider"],
		"revision": manifest["revision"],
		"note": _(
			"Drafts written from public-domain recipes: nobody has read them or cooked them. Check the quantities before relying on them."
		),
		"recipes": out,
	}


def find(text, known: dict | None = None) -> list[dict]:
	"""The fiches of the library that fit what the owner said: an id (`based-frittata`), or words (every word asked is in the title, the family
	or the description, plurals forgiven), the nearest first. Nothing fits by guessing."""
	known = known or listing()
	said = " ".join(str(text or "").split())
	rows = known["recipes"]
	exact = [r for r in rows if r["id"] == said]
	if exact:
		return exact
	wanted = recipes._stems(said)
	if not wanted:
		return []
	fits = []
	for row in rows:
		title = recipes._stems(row["title"])
		hay = title + recipes._stems(f"{row.get('family') or ''} {row.get('subtitle') or ''}")
		if all(w in hay for w in wanted):
			fits.append((-sum(1 for w in wanted if w in title), row["title"].lower(), row))
	return [row for _score, _title, row in sorted(fits, key=lambda t: t[:2])]


def _document(manifest: dict, data: dict) -> dict:
	source = data["provenance"]["sources"][0]
	rows = [
		{
			"ingredient_name": r["name"],
			"qty": r["quantity"],
			"unit": r["unit"],
			"shelf": r.get("category"),
		}
		for r in data["ingredients"]
	] + [{"ingredient_name": text, "to_taste": 1} for text in data.get("unquantifiedIngredients") or []]
	changes = list(data["provenance"].get("changes") or [])
	for key in ("portionNote", "durationNote"):
		if data["provenance"].get(key):
			changes.append(data["provenance"][key])
	return {
		"doctype": recipes.DOCTYPE,
		"recipe_name": data["title"],
		"family": family_of(data["title"]),
		"subtitle": data.get("subtitle"),
		"vegetarian": 1 if data.get("vegetarian") else 0,
		"status": "To review",
		"culinary_status": "Not tested",
		"base_portions": data["basePortions"],
		"total_minutes": data.get("time") or 0,
		"steps": "\n".join(data["steps"]),
		"tip": data.get("tip"),
		"allergens": data.get("allergens"),
		"source_kind": "Library",
		"source_title": source["title"],
		"source_author": source["author"],
		"source_url": source["url"],
		"source_license": source["license"],
		"source_license_url": source.get("licenseUrl"),
		"source_revision": source["revision"],
		"source_hash": source["contentHash"],
		"source_ref": data["id"],
		"source_changes": "\n".join(changes),
		"ingredients": rows,
	}


def add_to_restaurant(ids) -> dict:
	"""Make a recipe of the restaurant out of each fiche chosen, « To review ». All of them or none; one already added (or one whose name the
	restaurant already uses) is left as it is and said so."""
	recipes.require_neoresto()
	permissions.require(recipes.DOCTYPE, "create")
	if isinstance(ids, str):
		ids = [ids]
	if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
		frappe.throw(_("Say which recipes to add."))
	ids = list(dict.fromkeys(ids))
	if len(ids) > MOST_AT_ONCE:
		frappe.throw(_("At most {0} recipes at a time.").format(MOST_AT_ONCE))
	manifest = _manifest()
	fiches = [_read(manifest, _entry(manifest, recipe_id)) for recipe_id in ids]
	held = set(frappe.get_all(recipes.DOCTYPE, filters={"source_ref": ["is", "set"]}, pluck="source_ref"))
	taken = {cuisine_knowledge.fold(n) for n in frappe.get_all(recipes.DOCTYPE, pluck="recipe_name")}
	added, skipped = [], []
	for data in fiches:
		if data["id"] in held:
			skipped.append({"id": data["id"], "title": data["title"], "why": "already added"})
		elif cuisine_knowledge.fold(data["title"]) in taken:
			skipped.append({"id": data["id"], "title": data["title"], "why": "name already used"})
		else:
			doc = frappe.get_doc(_document(manifest, data))
			doc.insert()
			added.append({"id": data["id"], "recipe": doc.name, "title": data["title"]})
			taken.add(cuisine_knowledge.fold(data["title"]))
	return {"added": added, "skipped": skipped, "count": cint(len(added))}
