# //// Neoffice — added file (no upstream equivalent). The service families of a restaurant order (NeoRestau lot 1, the first
# //// slice of Daniel's « famille de service »): which course a line belongs to, and what a send puts on the pass and what it
# //// holds back. The rule lives HERE and nowhere else on the server; the till's copy (POS/src/utils/serviceFamilies.js) only
# //// serves the kitchen dialog's pre-ticked boxes, and both are tested against one table of examples
# //// (pos_next/tests/service_family_cases.json).
"""The service families of a restaurant order.

- A restaurant says, on the Item Group of its menu, which group is a drink, a starter, a main or a dessert (Custom Field
  `service_family`). A sub-group with no family of its own takes its parent's, the nearest one up the tree. A group with no
  family anywhere up its tree has none, and the article of such a group is NEVER held: a site that sets no family keeps
  sending every line at once.
- Each line of an order carries its family (Custom Field `service_family` of the Sales Invoice Item). It comes from the
  article's group when the line is added, and the waiter may give one line another (« une entrée prise en plat »).
- A table's order is sent in the rhythm of a meal (`plan_send`): the drinks and the FIRST food family present go, the other
  food is held back (`Waiting`, the status the kitchen already shows in grey); the waiter then orders the next course
  (`next_release`) or everything held (`held_lines`). Nothing is held outside a table's service (takeaway, counter, pager).
- A held line is released only by the waiter's own gesture; a plain send never releases one. A line added later whose family
  has already left goes out at once: it is never held behind a family that already left.
- A line that left carrying no family (a guest's QR line, a line from before the families) takes no part in the rhythm: the
  server gives a family only to the lines the till did not decide, so a guest never decides the pace of the table.

A line is a mapping with `service_family` and `kds_status` (empty: not sent yet, `Waiting`: held, anything else: left).
"""

import frappe
from frappe.utils import cint

FIELD = "service_family"
DRINK = "Drink"
# The food families, in the order a meal serves them
COURSES = ("Starter", "Main", "Dessert")
FAMILIES = (DRINK, *COURSES)
HELD = "Waiting"

SEND = "send"
HOLD = "hold"
LEFT = "left"


def _family(line) -> str:
	"""The family of a line, `""` for a line with none or one nobody knows."""
	value = (line.get(FIELD) or "").strip() if line else ""
	return value if value in FAMILIES else ""


def _rank(family) -> int:
	"""The place of a food family in the meal (1, 2, 3); 0 for a drink or no family: they follow no course."""
	return COURSES.index(family) + 1 if family in COURSES else 0


def _has_left(line) -> bool:
	status = (line.get("kds_status") or "") if line else ""
	return bool(status) and status != HELD


def _is_held(line) -> bool:
	return (line.get("kds_status") or "") == HELD if line else False


def _is_new(line) -> bool:
	return not (line.get("kds_status") or "") if line else False


# ------------------------------------------------------------------------------------------------------ the rule


def plan_send(lines, table_service, sent_families=()) -> list[str]:
	"""What a send does with each line: `send`, `hold` (the line is, or goes, on hold) or `left` (it already left).

	- Outside a table's service every new line is sent.
	- At a table, a new drink or a new line of no family is sent. A new food line is sent when its family has already left
	  (it is never held behind a family that left) or, while no food has left yet, when it belongs to the first food family
	  present among the new lines, unless a line of that family or an earlier one is held back already. Any other new food
	  line is held: the meal has begun, and only the waiter's gesture orders the next course.
	- A held line stays held: a plain send never releases one.

	`sent_families` are the families the stored order already sent (the lines of the till's cart may not tell it all).
	"""
	lines = list(lines or [])
	left_rank = max(
		[_rank(family) for family in sent_families]
		+ [_rank(_family(line)) for line in lines if _has_left(line)],
		default=0,
	)
	new_ranks = [_rank(_family(line)) for line in lines if _is_new(line) and _rank(_family(line))]
	held_ranks = [_rank(_family(line)) for line in lines if _is_held(line) and _rank(_family(line))]
	lead = min(new_ranks, default=0)
	lead_is_free = not any(rank <= lead for rank in held_ranks)

	plan = []
	for line in lines:
		if _has_left(line):
			plan.append(LEFT)
		elif _is_held(line):
			plan.append(HOLD)
		elif not table_service:
			plan.append(SEND)
		else:
			rank = _rank(_family(line))
			if not rank:
				plan.append(SEND)
			elif left_rank:
				plan.append(SEND if rank <= left_rank else HOLD)
			else:
				plan.append(SEND if rank == lead and lead_is_free else HOLD)
	return plan


def held_lines(lines) -> list[int]:
	"""The indexes of every line on hold: what « order everything » sends."""
	return [index for index, line in enumerate(lines or []) if _is_held(line)]


def next_release(lines) -> dict:
	"""The next course among the held lines: the family and the indexes of its held lines (« order the next course »).

	Only the food families are courses: a held drink, or a held line of no family, is released by « order everything », by the
	kitchen dialog or by the quick send of its own line. No course held: no family and no index.
	"""
	lines = list(lines or [])
	held = [(index, _rank(_family(line))) for index, line in enumerate(lines) if _is_held(line)]
	courses = [(index, rank) for index, rank in held if rank]
	if not courses:
		return {"family": "", "indexes": []}
	first = min(rank for _index, rank in courses)
	return {"family": COURSES[first - 1], "indexes": [index for index, rank in courses if rank == first]}


# ------------------------------------------------------------------------------------------------------ the groups


def has_family_fields() -> bool:
	"""Whether the site has the Custom Fields of the families (the code can be updated before the site is migrated)."""
	return bool(
		frappe.db.has_column("Item Group", FIELD) and frappe.db.has_column("Sales Invoice Item", FIELD)
	)


def group_families() -> dict[str, str]:
	"""The family of every Item Group that has one, its own or the nearest one up its tree: what the till loads once, so
	that it never walks the tree itself. A group with no family anywhere up its tree is not in the map."""
	if not frappe.db.has_column("Item Group", FIELD):
		return {}
	rows = frappe.get_all("Item Group", fields=["name", "parent_item_group", FIELD])
	by_name = {row.name: row for row in rows}
	resolved: dict[str, str] = {}

	def resolve(name):
		seen = set()
		path = []
		family = ""
		while name and name in by_name and name not in seen:
			if name in resolved:
				family = resolved[name]
				break
			seen.add(name)
			path.append(name)
			own = _family(by_name[name])
			if own:
				family = own
				break
			name = by_name[name].parent_item_group
		for step in path:
			resolved[step] = family
		return family

	return {row.name: family for row in rows if (family := resolve(row.name))}


def family_of_group(group) -> str:
	"""The family of an Item Group (its own, else the nearest up the tree), `""` for none."""
	if not group:
		return ""
	return group_families().get(group, "")


def families_of_items(item_codes) -> dict[str, str]:
	"""The family of each item given, by the group it sits in (an item with no family is left out)."""
	item_codes = [code for code in set(item_codes or []) if code]
	if not item_codes or not frappe.db.has_column("Item Group", FIELD):
		return {}
	groups = {
		row.name: row.item_group
		for row in frappe.get_all("Item", filters={"name": ["in", item_codes]}, fields=["name", "item_group"])
	}
	families = group_families()
	return {code: families[group] for code, group in groups.items() if group in families}


def family_of_item(item_code) -> str:
	"""The family of an item: that of its Item Group."""
	return families_of_items([item_code]).get(item_code, "")


# ---------------------------------------------------------------------------------------------------- the send path


def is_table_service(data) -> bool:
	"""Whether an order is a table's: it names a table and is no takeaway. The rest (counter, pager, takeaway) goes at once."""
	return bool(data.get("restaurant_table")) and not cint(data.get("is_takeaway"))


def stored_lines(invoice_name) -> list:
	"""The lines of the stored draft, in order, as they were before this save rewrites them: name, item, unit, status, batch and
	family (the columns a site not migrated yet does not have are left out)."""
	if not invoice_name:
		return []
	fields = ["name", "item_code", "uom"]
	fields += [column for column in ("kds_status", "kds_batch", FIELD) if frappe.db.has_column("Sales Invoice Item", column)]
	return frappe.get_all(
		"Sales Invoice Item",
		filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
		fields=fields,
		order_by="idx asc",
	)


def sent_families_of(lines) -> list[str]:
	"""The families of the lines that already left (a cart that lost them cannot tell)."""
	return [_family(line) for line in lines or [] if _has_left(line) and _family(line)]


def row_of_the_line(rows, position, line, taken):
	"""The row (of the saved document, or of the stored draft) a line of the till's payload stands for: the row at the line's own
	position when it is the same dish, else the first row not taken yet with the same dish and unit. The document keeps the
	payload's order; a line of the card carries no unit and its row has one, so only its position finds it. `taken` holds the
	names of the rows already given to a line, and the caller adds the one it takes."""
	code = line.get("item_code")
	if position < len(rows):
		row = rows[position]
		if row.name not in taken and row.item_code == code:
			return row
	for row in rows:
		if row.name not in taken and row.item_code == code and (row.uom or "") == (line.get("uom") or ""):
			return row
	return None


def decide_new_lines(data, stored=None) -> None:
	"""Decide, in the payload of a save of the till, the lines the till did not decide.

	A line the till sent with a status (the kitchen dialog's choice, a line it quick-sent, a line already at the kitchen) is
	kept as it is. A line it sent with none is new: it takes the family of its article's group when it carries none, and the
	rule (`plan_send`) says whether it goes (`Pending`) or is held (`Waiting`) in the order's rhythm. The payload is changed in
	place; everything after it treats the lines as decided by the till.

	Only a restaurant's order is touched (a table's, or a takeaway); a counter sale is left exactly as the till sent it. Each
	line's family is also cleaned: a value that is no family is dropped. `stored` are the lines of the stored draft
	(`stored_lines`), which tell what the order already sent.
	"""
	items = data.get("items") or []
	if not items or data.get("doctype", "Sales Invoice") != "Sales Invoice" or not has_family_fields():
		return
	# Only a restaurant's order: a table's, or a takeaway. A counter sale (a retail till's, a restaurant's) is left as the till sent it
	if not (data.get("restaurant_table") or cint(data.get("is_takeaway"))):
		return
	for line in items:
		if FIELD in line:
			line[FIELD] = _family(line)
	# A line the till sent with no status that the stored draft already holds with one (a cart that does not carry the kitchen's state: the
	# line was cooked in part, or is being prepared) is no new line: it keeps what the stored row says, and its family. The lines the till
	# decided claim their rows first, so that one row is never given to two lines.
	taken = set()
	for position, line in enumerate(items):
		if line.get("kds_status") or "":
			row = row_of_the_line(stored or [], position, line, taken)
			if row:
				taken.add(row.name)
	for position, line in enumerate(items):
		if line.get("kds_status") or "":
			continue
		row = row_of_the_line(stored or [], position, line, taken)
		if row and (row.get("kds_status") or ""):
			taken.add(row.name)
			line["kds_status"] = row.get("kds_status")
			if not _family(line):
				line[FIELD] = row.get(FIELD) or ""
	undecided = [line for line in items if not (line.get("kds_status") or "")]
	if not undecided:
		return
	undecided_ids = {id(line) for line in undecided}

	wanted = [line.get("item_code") for line in undecided if not _family(line)]
	from_group = families_of_items(wanted)
	for line in undecided:
		if not _family(line):
			line[FIELD] = from_group.get(line.get("item_code"), "")

	table_service = is_table_service(data)
	sent = sent_families_of(stored) if table_service else []
	plan = plan_send(items, table_service, sent_families=sent)
	for line, decision in zip(items, plan):
		if id(line) in undecided_ids:
			line["kds_status"] = "Pending" if decision == SEND else HELD
