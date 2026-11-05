# //// Neoffice — added file (no upstream equivalent). Which dishes of the card sell and which ones earn (NeoResto, « Nora au restaurant »).
# //// The cost of a portion is recipe_shopping's: nothing of it is redone here.
"""« Quels plats me rapportent ? »: the card read on what it sells and on what it earns.

A dish is placed on two axes, within its family (a starter is not compared with a dessert), the way the trade reads a card (Kasavana and
Smith, 1982). It SELLS when its share of the family's portions reaches 70 % of an even share. It EARNS when what a portion leaves (its
selling price, net of tax, minus its cost) reaches the family's mean, weighted by the portions sold. That gives four places: `star` (sells
and earns), `workhorse` (sells, earns little), `puzzle` (earns, sells little) and `dog` (neither).

A dish whose cost is unknown or partial is not placed: a partial cost is too low, and it would read as a margin nobody has. It is listed
as `not_costed` with what is missing. A family with one dish has nothing to be compared with: `alone`. Nothing here writes, and nothing
here recommends: the owner decides what to do with his card.
"""

import frappe
from frappe import _
from frappe.utils import add_months, cint, flt, getdate, today

from pos_next.restaurant import dishes, permissions, recipe_shopping, recipes
from pos_next.restaurant.mode import require_neoresto

# A dish sells at 70 % of an even share of its family's portions (Kasavana and Smith)
POPULAR_SHARE = 0.7
DEFAULT_MONTHS = 3
MOST_MONTHS = 24
STAR, WORKHORSE, PUZZLE, DOG = "star", "workhorse", "puzzle", "dog"


def _sold(company: str, since, until) -> list[dict]:
	"""What the tills sold in the period, by article: quantity and amount net of tax, credit notes netted out."""
	return frappe.db.sql(
		"""
		select line.item_code as item, item.item_name, item.item_group as family,
			sum(line.qty) as qty, sum(line.base_net_amount) as amount
		from `tabSales Invoice Item` line
		join `tabSales Invoice` invoice on invoice.name = line.parent
		join `tabItem` item on item.name = line.item_code
		where invoice.docstatus = 1 and invoice.is_pos = 1 and invoice.company = %(company)s
			and invoice.posting_date between %(since)s and %(until)s
		group by line.item_code
		having sum(line.qty) > 0
		""",
		{"company": company, "since": since, "until": until},
		as_dict=True,
	)


def _portion_cost(row: dict) -> dict:
	"""What a portion of a dish sold costs: {per_portion} when it is whole, else {missing} with why (no recipe, an ingredient unpriced...)."""
	recipe = frappe.db.get_value("Item", row["item"], recipes.ITEM_FIELD) if frappe.get_meta("Item").has_field(recipes.ITEM_FIELD) else None
	if recipe:
		title = frappe.db.get_value(recipes.DOCTYPE, recipe, "recipe_name")
		cand = {"kind": "recipe", "recipe": recipe, "title": title, "dish": row["item_name"]}
		portions = cint(frappe.db.get_value(recipes.DOCTYPE, recipe, "base_portions")) or 4
	elif dishes.dish_ingredients(row["item"]):
		cand = {"kind": "dish", "dish": row["item"], "title": row["item_name"]}
		portions = 1
	else:
		return {"missing": ["no recipe"]}
	cost = recipe_shopping.cost_of(cand, portions)
	if cost["partial"] or not cost["per_portion"]:
		return {"missing": [entry["ingredient"] for entry in cost["missing"]] or ["no price"]}
	return {"per_portion": cost["per_portion"]}


def place(family: list[dict]) -> list[dict]:
	"""Each dish of a family, {qty, price, cost}, with its `margin`, its `share` and its `place`, the best first. Pure: no database."""
	total = sum(flt(dish["qty"]) for dish in family)
	weighted = sum(flt(dish["qty"]) * (flt(dish["price"]) - flt(dish["cost"])) for dish in family)
	mean_margin = weighted / total if total else 0
	popular = POPULAR_SHARE / len(family) if family else 0
	placed = []
	for dish in family:
		margin = flt(dish["price"]) - flt(dish["cost"])
		share = flt(dish["qty"]) / total if total else 0
		sells, earns = share >= popular, margin >= mean_margin
		where = STAR if sells and earns else WORKHORSE if sells else PUZZLE if earns else DOG
		if len(family) == 1:
			where = "alone"
		placed.append({**dish, "margin": round(margin, 2), "share": round(share * 100, 1), "place": where})
	return sorted(placed, key=lambda dish: -flt(dish["qty"]) * dish["margin"])


def card(months=None, from_date=None, to_date=None) -> dict:
	"""The dishes sold over the period, placed family by family: {company, from, to, currency, families, not_costed, sold}.

	The last `months` by default (3); `from_date` and `to_date` when the owner says a period. Writes nothing."""
	require_neoresto()
	permissions.require(recipes.DOCTYPE, "read")
	frappe.has_permission("Sales Invoice", "read", throw=True)
	months = cint(months) or DEFAULT_MONTHS
	if not 0 < months <= MOST_MONTHS:
		frappe.throw(_("The period is between 1 and {0} months.").format(MOST_MONTHS))
	until = getdate(to_date or today())
	since = getdate(from_date) if from_date else getdate(add_months(until, -months))
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_default("Company")
	families: dict[str, list[dict]] = {}
	not_costed = []
	sold = _sold(company, since, until)
	for row in sold:
		portion = _portion_cost(row)
		price = round(flt(row["amount"]) / flt(row["qty"]), 2)
		if "per_portion" not in portion:
			not_costed.append({"dish": row["item_name"], "qty": flt(row["qty"]), "missing": portion["missing"]})
			continue
		families.setdefault(row["family"], []).append(
			{"dish": row["item_name"], "qty": flt(row["qty"]), "price": price, "cost": portion["per_portion"]}
		)
	return {
		"company": company,
		"from": str(since),
		"to": str(until),
		"currency": frappe.db.get_value("Company", company, "default_currency"),
		"families": [{"family": name, "dishes": place(rows)} for name, rows in sorted(families.items())],
		"not_costed": sorted(not_costed, key=lambda dish: -dish["qty"]),
		"sold": len(sold),
	}
