# //// Neoffice — added file (no upstream equivalent). The shopping list read and changed from words, the way Nora does it by voice
# //// (NeoResto, purchases, lot G). Study: Obsidian `Neoffice/NeoResto/18-…`. Adding is spoken_list.py; the rules of the list are shopping.py.
"""The shopping list in progress, read and changed from what the owner says.

Nora makes the list by talking (spoken_list.py) and the owner must be able to mend it the same way: hear what is on it, take a
line off, change a quantity, tick a line as bought or not needed, empty it. Otherwise a list made by voice has to be finished with
a finger, and nobody would use it.

As for adding, the work is in two steps and never one:

- `read` WRITES NOTHING: the lines of the list in progress, numbered as the owner will hear them.
- `propose` WRITES NOTHING either. For each change said it answers which line of the list it understood (matched), the several
  lines it could be (ambiguous: the owner chooses), or no line (unknown). Nora reads it back (« I take off the brown beer: yes? »).
- `apply` carries out the changes the owner confirmed, all or none.

The speech recognition is wrong now and then, and a line taken off by mistake is a line the owner no longer sees: hence the proposal.
Nothing here reads the sentence itself: the agent that listens turns it into `{action, text, qty, unit, state}` changes.

A new quantity is in the line's own unit unless a `unit` was said. A measure (« mets les carottes à 12 kilos ») comes to whole packs
of what the line is bought in; another packaging, or a measure nothing converts, is left to the owner (`no_conversion`): a line of
bags set to 12 would be 60 kg.
"""

import frappe
from frappe import _
from frappe.utils import flt

from pos_next.restaurant import permissions, shopping, spoken_list

MATCHED, AMBIGUOUS, UNKNOWN = spoken_list.MATCHED, spoken_list.AMBIGUOUS, spoken_list.UNKNOWN

REMOVE, QUANTITY, STATE, CLEAR = "remove", "quantity", "state", "clear"
ACTIONS = (REMOVE, QUANTITY, STATE, CLEAR)
# What a person can say a line has become, and the state of the line it is
STATES = {"bought": "Bought", "not_needed": "Not needed", "in_stock": "Already in stock"}
# The lines offered to choose from, at most: a longer list of look-alikes is a question of its own
CANDIDATES = 6
# A hundred changes at once is not a sentence
MOST_CHANGES = 100


def _label(line) -> str:
	return (line.item_name or line.free_text or "").strip()


def _unit(line) -> str | None:
	return line.uom or line.unit_text or None


def _described(position: int, line) -> dict:
	"""A line as Nora reads it: its place on the list (what the owner will say, « the third »), its name and what is asked."""
	return {
		"n": position,
		"row": line.name,
		"label": _label(line),
		"qty": flt(line.qty),
		"unit": _unit(line),
		"supplier": line.supplier or None,
		"state": line.line_state,
	}


def _current(right: str):
	"""(name, document) of the list in progress, or (None, None); the right is the doctype's own."""
	permissions.require(shopping.DOCTYPE, right)
	name = spoken_list.current_list()
	if not name:
		return None, None
	permissions.require(shopping.DOCTYPE, right, name)
	return name, frappe.get_doc(shopping.DOCTYPE, name)


def read() -> dict:
	"""The list in progress, line by line in the order of the list: {list, status, lines, estimated_total} (list is None when
	there is none)."""
	name, doc = _current("read")
	if not doc:
		return {"list": None, "status": None, "lines": [], "estimated_total": 0}
	return {
		"list": name,
		"status": doc.status,
		"lines": [_described(position, line) for position, line in enumerate(doc.lines, 1)],
		"estimated_total": flt(doc.estimated_total),
	}


def _change(raw) -> dict:
	"""One change as it is understood, or frappe.ValidationError saying what is wrong with it."""
	if not isinstance(raw, dict):
		frappe.throw(_("A change is {action, text, qty, state}."))
	action = str(raw.get("action") or "").strip().lower()
	if action not in ACTIONS:
		frappe.throw(_("{0} is not a change of the list: {1}.").format(action or "-", ", ".join(ACTIONS)))
	change = {"action": action, "every": bool(raw.get("every"))}
	if action != CLEAR:
		text = str(raw.get("text") or "").strip()
		if not text:
			frappe.throw(_("Say which line: the change has no text."))
		change["text"] = text
	if action == QUANTITY:
		try:
			qty = flt(str(raw.get("qty")).replace(",", "."))
		except (TypeError, ValueError):
			qty = 0
		if qty <= 0:
			frappe.throw(_("The new quantity of {0} must be more than zero.").format(change["text"]))
		change["qty"] = qty
		unit = str(raw.get("unit") or "").strip()
		if unit:
			change["unit"] = unit
	if action == STATE:
		state = str(raw.get("state") or "").strip().lower()
		if state not in STATES:
			frappe.throw(_("{0} is not a state of a line: {1}.").format(state or "-", ", ".join(STATES)))
		change["state"] = state
	return change


def _wanted(change: dict) -> list[str]:
	return spoken_list._words(change["text"])


def _closest(change: dict, lines: list) -> list[tuple[int, object]]:
	"""The (place, line) pairs a change names, the nearest first: the same scale as for an article (spoken_list._score)."""
	wanted = _wanted(change)
	scored = [
		(spoken_list._score(wanted, spoken_list._words(_label(line)), []), position, line)
		for position, line in enumerate(lines, 1)
	]
	scored = [item for item in scored if item[0] >= spoken_list.CONFIDENT]
	if not scored:
		return []
	best = max(score for score, _position, _line in scored)
	return [
		(position, line)
		for score, position, line in sorted(scored, key=lambda s: -s[0])
		if score >= best - spoken_list.TIE
	]


def _packs_of(line) -> dict:
	"""A line as spoken_list._in_packs reads an article: the unit it is counted in and the packaging it is bought in."""
	if not line.item:
		return {"stock_uom": line.unit_text, "packs": []}
	stock = frappe.db.get_value("Item", line.item, "stock_uom")
	if not line.uom or line.uom == stock:
		return {"stock_uom": stock, "packs": []}
	content = frappe.db.get_value(
		"UOM Conversion Detail", {"parenttype": "Item", "parent": line.item, "uom": line.uom}, "conversion_factor"
	)
	return {"stock_uom": stock, "packs": [{"uom": line.uom, "content": content}]}


def _quantity_of(change: dict, line) -> float | None:
	"""The quantity a line is to hold, in its own unit; None when what was said does not count what the line counts."""
	unit = change.get("unit")
	if not unit:
		return change["qty"]
	measure = spoken_list._measure(unit)
	if measure:
		counted = spoken_list._in_packs(_packs_of(line), measure, change["qty"])
		return counted[1] if counted else None
	own = _unit(line)
	if own and not set(spoken_list._words(unit)) & set(spoken_list._words(own)):
		return None
	return change["qty"]


def _target(change: dict, position: int, line) -> dict:
	"""A line a change touches, as Nora reads it, with what a quantity said in a unit comes to on it (`new_qty`, None when unknown)."""
	described = _described(position, line)
	if change.get("unit"):
		described["new_qty"] = _quantity_of(change, line)
	return described


def _edit(change: dict, line) -> dict:
	"""What `apply` carries out for a line: the change, with the line's name (its place may have moved by the time of the yes)."""
	# emptying the list is taking every line off
	edit = {"row": line.name, "action": REMOVE if change["action"] == CLEAR else change["action"]}
	if "qty" in change:
		edit["qty"] = _quantity_of(change, line)
	if "state" in change:
		edit["state"] = change["state"]
	return edit


def _settle(answer: dict, change: dict, found: list) -> None:
	"""Fill the answer of a change that names its lines: matched, or `no_conversion` when one of them cannot count what was said."""
	targets = [_target(change, position, line) for position, line in found]
	if any(target.get("new_qty", 0) is None for target in targets):
		answer.update(no_conversion=True, targets=targets)
		return
	answer.update(status=MATCHED, targets=targets, edits=[_edit(change, line) for _position, line in found])
	if spoken_list._measure(change.get("unit")):
		answer.update(qty=targets[0]["new_qty"], asked=f"{change['qty']:g} {change['unit']}")


def propose(changes: list) -> dict:
	"""What was understood of the changes said, and nothing written.

	`changes` is [{action, text, qty, unit, state, every}] (`text` names a line by its words, `qty` is the new quantity, `unit` what
	it was said in when it was, `state` one of STATES, `every` takes every line the words fit instead of asking which; `clear` has no
	text and means the whole list). Answers {list, lines, counts, total}: for each change, in order, `status` (matched, ambiguous or
	unknown), the `targets` it will touch when matched, the `candidates` when ambiguous, `no_conversion` when the line cannot count
	what was said, `asked` when a measure was turned into packs."""
	if not isinstance(changes, list) or not changes:
		frappe.throw(_("Say what to change on the list."))
	if len(changes) > MOST_CHANGES:
		frappe.throw(_("At most {0} changes at a time.").format(MOST_CHANGES))
	checked = [_change(raw) for raw in changes]
	name, doc = _current("write")
	lines = list(doc.lines) if doc else []
	answered = []
	for change in checked:
		answer = {**change, "status": UNKNOWN, "targets": [], "candidates": [], "edits": []}
		if change["action"] == CLEAR:
			found = list(enumerate(lines, 1))
			if found:
				answer.update(
					status=MATCHED,
					targets=[_described(p, line) for p, line in found],
					edits=[_edit(change, line) for _p, line in found],
				)
		else:
			found = _closest(change, lines)
			if len(found) == 1 or (found and change["every"]):
				_settle(answer, change, found)
			elif found:
				answer.update(
					status=AMBIGUOUS, candidates=[_target(change, p, line) for p, line in found[:CANDIDATES]]
				)
		answered.append(answer)
	counts = {
		status: sum(1 for line in answered if line["status"] == status)
		for status in (MATCHED, AMBIGUOUS, UNKNOWN)
	}
	return {"list": name, "lines": answered, "counts": counts, "total": len(lines)}


def apply(edits: list, list_name: str | None = None) -> dict:
	"""Carry out the changes the owner confirmed, to `list_name` or to the list in progress: all of them, or none.

	Each edit is an `edit` of the proposal: {row, action, qty?, state?}. Every line is looked for and every value checked before the
	first is written, so that a line that went in the meantime (the yes comes minutes later) leaves the list as it was; a line is
	changed once. Answers {list, removed, quantity, state, left}."""
	edits = [edit for edit in edits or [] if edit]
	if not edits:
		frappe.throw(_("Nothing to change."))
	name = list_name or spoken_list.current_list()
	if not name:
		frappe.throw(_("There is no shopping list in progress."), frappe.DoesNotExistError)
	doc = shopping._list(name)
	rows = {line.name for line in doc.lines}
	seen = set()
	for edit in edits:
		action = edit.get("action")
		if action not in (REMOVE, QUANTITY, STATE):
			frappe.throw(_("{0} is not a change of a line.").format(action or "-"))
		if edit.get("row") not in rows:
			frappe.throw(_("That line is no longer on the list."), frappe.DoesNotExistError)
		if edit["row"] in seen:
			frappe.throw(_("A line is changed once at a time."))
		seen.add(edit["row"])
		if action == QUANTITY and flt(edit.get("qty")) <= 0:
			frappe.throw(_("The quantity must be more than zero."))
		if action == STATE and edit.get("state") not in STATES:
			frappe.throw(_("{0} is not a state of a line.").format(edit.get("state") or "-"))
	done = {REMOVE: 0, QUANTITY: 0, STATE: 0}
	for edit in edits:
		if edit["action"] == REMOVE:
			shopping.remove_line(name, edit["row"])
		elif edit["action"] == QUANTITY:
			shopping.set_quantity(name, edit["row"], edit["qty"])
		else:
			shopping.set_state(name, edit["row"], STATES[edit["state"]])
		done[edit["action"]] += 1
	left = len(frappe.get_doc(shopping.DOCTYPE, name).lines)
	return {
		"list": name,
		"removed": done[REMOVE],
		"quantity": done[QUANTITY],
		"state": done[STATE],
		"left": left,
	}
