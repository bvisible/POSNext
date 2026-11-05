# //// Neoffice — added file (no upstream equivalent). The service families of a restaurant order (NeoResto lot 1, the first
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

The SERVICE RHYTHM of the restaurant (`Restaurant.service_rhythm`) changes what a send does with the lines it would hold back
(NeoResto lot 1, Daniel, 01.11: « Oui, les deux modes »):

- `Called by the room` (the default): the line is held (`Waiting`) until the waiter orders its course, as above;
- `Prepared ahead`: the line LEAVES with the rest, marked `kds_ahead`, so that the kitchen may start and finish it; the waiter's call
  (`kds_called_at`, stamped by `restaurant.call_next_course`) then only tells the kitchen to serve it now. A line that left ahead and is not called
  yet counts as nothing sent: it is not a course that left (a later line of its family joins it, ahead), it is the next course to call, and the
  kitchen counts no time from it. The time a line counts from is its call for a line sent ahead, its departure (`kds_sent_at`) for any other.

Beside its family, an Item Group may carry a COLOR (Custom Field `service_color`, optional): the kitchen's and the runner's
tickets tint the dishes of a category with a very pale shade of it. A sub-group with no color takes the nearest one up the tree,
like the family. The value is user data and ends up in a style on the screens, so only a strict `#RRGGBB` counts as a color:
anything else is no color at all, and the walk up the tree goes on to the parent's.
"""

import re

import frappe
from frappe.utils import cint

FIELD = "service_family"
# //// Neoffice — the category color of the tickets (NeoResto lot 1, Daniel's request of 01.11)
COLOR_FIELD = "service_color"
_COLOR = re.compile(r"#[0-9A-Fa-f]{6}")
DRINK = "Drink"
# The food families, in the order a meal serves them
COURSES = ("Starter", "Main", "Dessert")
FAMILIES = (DRINK, *COURSES)
HELD = "Waiting"

SEND = "send"
HOLD = "hold"
LEFT = "left"
# //// Neoffice — a line that would be held, in a restaurant that prepares ahead: it leaves marked ahead instead
AHEAD = "ahead"

# //// Neoffice — the service rhythm of a restaurant (NeoResto lot 1, Daniel, 01.11: « Oui, les deux modes »), the Select `service_rhythm` of the Restaurant:
# //// the room calls each course (the default: the later courses are held back until the waiter orders them), or the kitchen prepares ahead (everything leaves at
# //// « Valider », the later courses arrive marked as ahead, and the waiter's call only tells the kitchen to serve them now)
CALLED_BY_THE_ROOM = "Called by the room"
PREPARED_AHEAD = "Prepared ahead"
RHYTHMS = (CALLED_BY_THE_ROOM, PREPARED_AHEAD)


def _family(line) -> str:
	"""The family of a line, `""` for a line with none or one nobody knows."""
	value = (line.get(FIELD) or "").strip() if line else ""
	return value if value in FAMILIES else ""


def _color(value) -> str:
	"""A color as the screens may put it in a style: a strict `#RRGGBB` (`fullmatch`, so that no trailing newline slips through),
	`""` for anything else."""
	return value if isinstance(value, str) and _COLOR.fullmatch(value) else ""


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


# //// Neoffice — the lines that left AHEAD of their course (NeoResto lot 1, the service rhythm, Daniel, 01.11)
def is_ahead(line) -> bool:
	"""Whether a line left for the kitchen before its course was called (`kds_ahead`)."""
	return bool(cint(line.get("kds_ahead"))) if line else False


def is_uncalled(line) -> bool:
	"""Whether a line left ahead and the room has not called its course yet: it is at the kitchen, which may start and finish it, and it
	counts for nothing (no time, not offered to the runner) until `kds_called_at` says the room wants it now."""
	return is_ahead(line) and _has_left(line) and not line.get("kds_called_at")


# //// Neoffice — what a save ADDS to an order the kitchen already has (NeoResto lot 1, Daniel, 05.11: « il faut faire un pop-up, parce qu'autrement, en cuisine, ils ne savent pas qu'on a rajouté cette information sur leur ticket,
# //// et il faut imprimer le ticket avec l'ajout »)
def added_dishes(before, after) -> dict:
	"""The dishes a save ADDED to an order that had already left for the kitchen, as `{item_code: units}`.

	`before` and `after` are the order's lines (`item_code`, `qty`, `kds_status`) as they were stored before the save and as they are after it. A dish
	counts when the order holds MORE of it than before AND the kitchen holds more of it than before: a line held back by the waiter is more of the
	order and nothing for the kitchen, and the waiter's order of the next course is more for the kitchen and nothing more on the order (the dishes
	were there, held). An order that had nothing at the kitchen before is a first send, not an addition."""
	if not any(_has_left(line) for line in before or []):
		return {}

	def totals(lines):
		held, sent = {}, {}
		for line in lines or []:
			code = line.get("item_code")
			if not code:
				continue
			units = float(line.get("qty") or 0)
			held[code] = held.get(code, 0.0) + units
			if _has_left(line):
				sent[code] = sent.get(code, 0.0) + units
		return held, sent

	order_before, kitchen_before = totals(before)
	order_after, kitchen_after = totals(after)
	added = {}
	for code, units in order_after.items():
		more = min(units - order_before.get(code, 0.0), kitchen_after.get(code, 0.0) - kitchen_before.get(code, 0.0))
		if more > 0:
			added[code] = more
	return added


def go_time(line):
	"""The time a line counts from: the room's call for a line sent ahead (nothing while it is not called), the time it left for any other."""
	if not line:
		return None
	return line.get("kds_called_at") if is_ahead(line) else line.get("kds_sent_at")


# ------------------------------------------------------------------------------------------------------ the rhythm


def normalise_rhythm(value) -> str:
	"""The rhythm a stored value means: `Prepared ahead` only when it says so exactly, the room's call for anything else (no value, a
	site not migrated yet, a word nobody knows). The default is the safe one: it is how a restaurant served until it chose."""
	return PREPARED_AHEAD if value == PREPARED_AHEAD else CALLED_BY_THE_ROOM


def rhythm_of_restaurant(restaurant) -> str:
	"""The rhythm of a restaurant (`""` and a restaurant nobody knows: the room's call)."""
	if not restaurant or not frappe.db.has_column("Restaurant", "service_rhythm"):
		return CALLED_BY_THE_ROOM
	return normalise_rhythm(frappe.db.get_value("Restaurant", restaurant, "service_rhythm"))


def rhythm_of_table(table) -> str:
	"""The rhythm a table follows: that of the restaurant it belongs to (a table that names none, the default restaurant), never the
	till's or the site's. No table, or a table nobody knows, is the room's call: a takeaway and a counter order hold nothing anyway."""
	if not table or not frappe.db.exists("Restaurant Table", table):
		return CALLED_BY_THE_ROOM
	from pos_next.restaurant import scope

	return rhythm_of_restaurant(scope.restaurant_of_record("Restaurant Table", table))


# ------------------------------------------------------------------------------------------------------ the rule


def plan_send(lines, table_service, sent_families=(), rhythm=CALLED_BY_THE_ROOM) -> list[str]:
	"""What a send does with each line: `send`, `hold` (the line is, or goes, on hold), `left` (it already left) or, where the kitchen
	prepares ahead, `ahead` (the line leaves, marked ahead, instead of being held).

	- Outside a table's service every new line is sent.
	- At a table, a new drink or a new line of no family is sent. A new food line is sent when its family has already left
	  (it is never held behind a family that left) or, while no food has left yet, when it belongs to the first food family
	  present among the new lines, unless a line of that family or an earlier one is held back already. Any other new food
	  line is held: the meal has begun, and only the waiter's gesture orders the next course.
	- A held line stays held: a plain send never releases one.
	- Where the kitchen prepares ahead (`rhythm`), a new food line that would be held leaves instead, `ahead`. A line that left ahead and is
	  not called yet is no course that left: its family is not "sent", so a later line of that family joins it, ahead, and the family of a
	  course the room has called is.

	`sent_families` are the families the stored order already sent (the lines of the till's cart may not tell it all).
	"""
	lines = list(lines or [])
	later = AHEAD if normalise_rhythm(rhythm) == PREPARED_AHEAD else HOLD
	left_rank = max(
		[_rank(family) for family in sent_families]
		+ [_rank(_family(line)) for line in lines if _has_left(line) and not is_uncalled(line)],
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
				plan.append(SEND if rank <= left_rank else later)
			else:
				plan.append(SEND if rank == lead and lead_is_free else later)
	return plan


def _waits_for_the_room(line, rhythm) -> bool:
	"""Whether a line waits for the waiter's word: it is held back, or (where the kitchen prepares ahead) it left ahead and is not called yet."""
	return _is_held(line) or (normalise_rhythm(rhythm) == PREPARED_AHEAD and is_uncalled(line))


def held_lines(lines, rhythm=CALLED_BY_THE_ROOM) -> list[int]:
	"""The indexes of every line on hold, and (where the kitchen prepares ahead) of every line sent ahead and not called yet: what « order everything » sends."""
	return [index for index, line in enumerate(lines or []) if _waits_for_the_room(line, rhythm)]


def next_release(lines, rhythm=CALLED_BY_THE_ROOM) -> dict:
	"""The next course among the lines that wait for the room: the family and the indexes of its lines (« order the next course »).

	The lines that wait are the held ones and, where the kitchen prepares ahead, the ones that left ahead and are not called yet (a
	restaurant that changed its rhythm while a table was open may have both). Only the food families are courses: a held drink, or a held
	line of no family, is released by « order everything », by the kitchen dialog or by the quick send of its own line. No course waiting:
	no family and no index.
	"""
	lines = list(lines or [])
	held = [
		(index, _rank(_family(line))) for index, line in enumerate(lines) if _waits_for_the_room(line, rhythm)
	]
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


def _inherited(rows, value_of) -> dict[str, str]:
	"""For each Item Group row, the value of its own, else the nearest one up the tree; a group with none anywhere is left out.

	`value_of` reads a row's own value and answers `""` for none (or for a value that counts for nothing). The tree is walked
	once, each group remembered: a parent that loops back on itself ends the walk instead of running for ever."""
	by_name = {row.name: row for row in rows}
	resolved: dict[str, str] = {}

	def resolve(name):
		seen = set()
		path = []
		value = ""
		while name and name in by_name and name not in seen:
			if name in resolved:
				value = resolved[name]
				break
			seen.add(name)
			path.append(name)
			own = value_of(by_name[name])
			if own:
				value = own
				break
			name = by_name[name].parent_item_group
		for step in path:
			resolved[step] = value
		return value

	return {row.name: value for row in rows if (value := resolve(row.name))}


def _group_maps() -> tuple[dict[str, str], dict[str, str]]:
	"""The family and the color of every Item Group that has one, its own or the nearest up its tree: `(families, colors)`, from
	ONE read of the groups. A column the site does not have yet (the code is updated before the site is migrated) gives an empty map."""
	columns = [column for column in (FIELD, COLOR_FIELD) if frappe.db.has_column("Item Group", column)]
	if not columns:
		return {}, {}
	rows = frappe.get_all("Item Group", fields=["name", "parent_item_group", *columns])
	families = _inherited(rows, _family) if FIELD in columns else {}
	colors = _inherited(rows, lambda row: _color(row.get(COLOR_FIELD))) if COLOR_FIELD in columns else {}
	return families, colors


def group_families() -> dict[str, str]:
	"""The family of every Item Group that has one, its own or the nearest one up its tree: what the till loads once, so
	that it never walks the tree itself. A group with no family anywhere up its tree is not in the map."""
	return _group_maps()[0]


def group_colors() -> dict[str, str]:
	"""The color (`#RRGGBB`) of every Item Group that has one, its own or the nearest one up its tree. A group with no color
	anywhere up its tree is not in the map; a value that is no `#RRGGBB` is no color and is walked past."""
	return _group_maps()[1]


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


def color_of_group(group) -> str:
	"""The color of an Item Group (its own, else the nearest up the tree), `""` for none."""
	if not group:
		return ""
	return group_colors().get(group, "")


def stamp_lines(lines, maps=None):
	"""Give each line of a kitchen or runner list its `service_family` and its `service_color`, in the line itself.

	The family is the one the line was stored with (the waiter may have given one line another), else that of its item's group.
	The color is that of its item's group, or of the nearest ancestor that has one (`""` for none). The items and the groups are
	each read ONCE for all the lines given, whatever their number: a list of forty tickets must not ask the database forty times.

	Answers the group maps it used (`(families, colors)`, None when there was no line to stamp): a second stamp of the same call (the covers' count
	of an order's whole lines) hands them back as `maps` instead of reading the group tree again.
	"""
	lines = [line for line in lines or [] if line]
	if not lines:
		return maps
	families, colors = maps or _group_maps()
	groups: dict[str, str] = {}
	if families or colors:
		codes = {line.get("item_code") for line in lines if line.get("item_code")}
		if codes:
			rows = frappe.get_all("Item", filters={"name": ["in", list(codes)]}, fields=["name", "item_group"])
			groups = {row.name: row.item_group for row in rows}
	for line in lines:
		group = groups.get(line.get("item_code"))
		line[FIELD] = _family(line) or families.get(group, "")
		line[COLOR_FIELD] = colors.get(group, "")
	return families, colors


# ---------------------------------------------------------------------------------------------------- the send path


def is_table_service(data) -> bool:
	"""Whether an order is a table's: it names a table and is no takeaway. The rest (counter, pager, takeaway) goes at once."""
	return bool(data.get("restaurant_table")) and not cint(data.get("is_takeaway"))


def stored_lines(invoice_name, lock=False) -> list:
	"""The lines of the stored draft, in order, as they were before this save rewrites them: name, item, unit, status, batch,
	the time it left for the kitchen, whether it left ahead and when the room called it, and family (the columns a site not migrated yet
	does not have are left out).

	`lock` reads them FOR UPDATE: a save of the till rebuilds the lines from its payload, which carries no call, so the call of a course that
	the room makes at that very moment must be seen, not lost (a call locks the same rows, `restaurant.call_next_course`)."""
	if not invoice_name:
		return []
	# //// Neoffice — the quantity too: what a save ADDS to an order already sent is read from it (`added_dishes`)
	fields = ["name", "item_code", "uom", "qty"]
	fields += [
		column
		for column in ("kds_status", "kds_batch", "kds_sent_at", "kds_ahead", "kds_called_at", FIELD)
		if frappe.db.has_column("Sales Invoice Item", column)
	]
	if not lock:
		return frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": invoice_name, "parenttype": "Sales Invoice"},
			fields=fields,
			order_by="idx asc",
		)
	item = frappe.qb.DocType("Sales Invoice Item")
	return (
		frappe.qb.from_(item)
		.select(*[item[column] for column in fields])
		.where((item.parent == invoice_name) & (item.parenttype == "Sales Invoice"))
		.orderby(item.idx)
		.for_update()
		.run(as_dict=True)
	)


def sent_families_of(lines) -> list[str]:
	"""The families of the lines that already left and that the room has called (a cart that lost them cannot tell): a line sent ahead and not
	called yet is no course that left."""
	return [
		_family(line) for line in lines or [] if _has_left(line) and not is_uncalled(line) and _family(line)
	]


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
	left_before = {}
	for position, line in enumerate(items):
		if line.get("kds_status") or "":
			row = row_of_the_line(stored or [], position, line, taken)
			if row:
				taken.add(row.name)
				if (row.get("kds_status") or "") not in ("", HELD):
					left_before[id(line)] = row
	for position, line in enumerate(items):
		if line.get("kds_status") or "":
			continue
		row = row_of_the_line(stored or [], position, line, taken)
		if row and (row.get("kds_status") or ""):
			taken.add(row.name)
			line["kds_status"] = row.get("kds_status")
			if (row.get("kds_status") or "") != HELD:
				left_before[id(line)] = row
			if not _family(line):
				line[FIELD] = row.get(FIELD) or ""

	table_service = is_table_service(data)
	rhythm = rhythm_of_table(data.get("restaurant_table")) if table_service else CALLED_BY_THE_ROOM
	# //// Neoffice — whether a line left ahead, and when the room called it, is the stored row's word for a line that already left (the cart's rows
	# //// do not carry the call, and the rebuilt document must not lose it); for a line leaving in this save, the till's mark is kept only where it means
	# //// something: a food line of a table whose restaurant prepares ahead. Any other mark is dropped, so that no till can send a line ahead by itself.
	for line in items:
		row = left_before.get(id(line))
		if row is not None:
			line["kds_ahead"] = 1 if is_ahead(row) else 0
			line["kds_called_at"] = row.get("kds_called_at")
			continue
		goes_ahead = (
			is_ahead(line)
			and table_service
			and rhythm == PREPARED_AHEAD
			and bool(_rank(_family(line)))
			and (line.get("kds_status") or "") not in ("", HELD)
		)
		line["kds_ahead"] = 1 if goes_ahead else 0
		line.pop("kds_called_at", None)

	undecided = [line for line in items if not (line.get("kds_status") or "")]
	if not undecided:
		return
	undecided_ids = {id(line) for line in undecided}

	wanted = [line.get("item_code") for line in undecided if not _family(line)]
	from_group = families_of_items(wanted)
	for line in undecided:
		if not _family(line):
			line[FIELD] = from_group.get(line.get("item_code"), "")

	sent = sent_families_of(stored) if table_service else []
	plan = plan_send(items, table_service, sent_families=sent, rhythm=rhythm)
	for line, decision in zip(items, plan):
		if id(line) in undecided_ids:
			line["kds_status"] = "Pending" if decision in (SEND, AHEAD) else HELD
			# //// Neoffice — a line that would be held leaves instead, marked ahead, where the kitchen prepares ahead
			if decision == AHEAD:
				line["kds_ahead"] = 1
