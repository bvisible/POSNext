# //// Neoffice — added file (no upstream equivalent). The notes of a table (NeoResto lot 1): the several parties seated at one table, each with its own
# //// order, covers, kitchen ticket and payment, told ".0" (the table's own first group), ".1", ".2" by the waiter (« je rajoute une bouteille sur la table 4, mais ce serait le .2 »; « on pourrait faire point zéro », product owner, 05.11.2026).
"""The notes of a restaurant table: a note is a draft Sales Invoice on a table, and a table may hold several.

- A table has ONE note by default and is then « T5 »; « T5.0 », « T5.1 » (the NUMBER of the note after a dot, counted from zero: the table's own first group is « .0 ») appear only when the table
  holds a second open note, with the optional NAME of the party beside the number (« T5.1 · Dupont »). See `table_label`, the one place that composes it.
- The RANK lives on the draft, in the hidden Custom Field `restaurant_note` (an Int), the NAME in `restaurant_note_name` (a Small Text: a `text` column costs the row 10 bytes where a 60-character
  varchar costs 242, and the Sales Invoice table has no room for the second on a fleet site; the server keeps the 60 characters, see `clean_name`). Both are written by the
  till's save (`invoices.update_invoice`, when the payload carries them) and the name by `restaurant.set_table_note_name`, never by a payment. An Int
  column is NOT NULL: a rank stored 0 means « legacy / unset » and is read as rank 1 (`effective_rank`), and an empty name is stored '' and read
  back as None. Two OPEN drafts of one table never share an effective rank.
- A note is OPEN while its draft is (docstatus 0). Paying a note leaves the table Occupied while another note is open; the last one paid frees it.
- A line already sent to the kitchen never moves to another note: the till's cart moves only lines it has not sent.

Reads that serve a list (the floor plan, the kitchen's and the pass's cards) are made once for all the tables or orders of the list, never one per row.
"""

import unicodedata

import frappe
from frappe import _
from frappe.query_builder.functions import Count
from frappe.utils import cint, flt

from pos_next.restaurant import covers as covers_module
from pos_next.restaurant.covers import _whole_number
from pos_next.restaurant.text import plain_text

# The Custom Fields of Sales Invoice that hold the rank and the name of a note
FIELD = "restaurant_note"
NAME_FIELD = "restaurant_note_name"
# The most notes a table can hold: the server refuses a higher rank (the till stops at the same number)
MAX_NOTE = 99
# The longest name a party can be given (the column is a Data of this length)
MAX_NAME_CHARS = 60
# What separates the number and the name of a party on a label: « T5.1 · Dupont »
NAME_SEPARATOR = " · "


def has_columns() -> bool:
	"""Whether the site has both Custom Fields of the notes (the code can be updated before the site is migrated)."""
	return bool(frappe.db.has_column("Sales Invoice", FIELD) and frappe.db.has_column("Sales Invoice", NAME_FIELD))


def order_fields() -> list[str]:
	"""The Sales Invoice fields to read with an order to know its note (none on a site not migrated yet)."""
	return [FIELD, NAME_FIELD] if has_columns() else []


# --- the pure rules ---------------------------------------------------------------------------------------------------


def effective_rank(value) -> int:
	"""The rank a stored value means: the number itself, and rank 1 for 0 or nothing (a draft saved before the notes existed)."""
	number = cint(value)
	return number if number >= 1 else 1


def clean_rank(value) -> int | None:
	"""The rank a payload or a call means: a whole number from 1 to 99, or None for none sent.

	Nothing (None, an empty text) is no rank. Anything else that is not a whole number from 1 to 99 (0, -1, 100, "abc", 2.5, a list, True)
	is refused with a translated ValidationError, so that a till's slip never files an order under a note nobody can open.
	"""
	if value is None or (isinstance(value, str) and not value.strip()):
		return None
	number = _whole_number(value)
	if number is None or not 1 <= number <= MAX_NOTE:
		frappe.throw(
			_("The number of a note must be a whole number from 1 to {0}").format(MAX_NOTE),
			frappe.ValidationError,
		)
	return number


def clean_name(value) -> str | None:
	"""The name of a party as it is kept: its tags removed, its white space collapsed, its control characters dropped, at most 60 characters.

	Nothing, an empty text and a text of white space alone all mean no name (None). Anything that is not a text is refused with a translated
	ValidationError. The name is shown on the till's pills, the kitchen's and the pass's cards and the paper, as typed.
	"""
	if value is None:
		return None
	if not isinstance(value, str):
		frappe.throw(_("The name of a note must be a text"), frappe.ValidationError)
	text = "".join(" " if char.isspace() else char for char in plain_text(value))
	text = "".join(char for char in text if unicodedata.category(char)[0] != "C")
	return " ".join(text.split())[:MAX_NAME_CHARS].strip() or None


def next_free_rank(ranks) -> int | None:
	"""The rank of a new note: the lowest whole number from 1 that no open note of the table holds, None when the table holds all 99.

	`ranks` are the notes' ranks as stored (0 or nothing is rank 1). A rank freed by a note that was paid is the first to be given again."""
	taken = {effective_rank(rank) for rank in ranks or []}
	rank = 1
	while rank in taken:
		rank += 1
	return rank if rank <= MAX_NOTE else None


def rank_number(rank) -> int:
	"""The number the waiter says after the dot: the table's own first group is « .0 » (it is « T5 » alone), the next ones « .1 », « .2 »…

	The rank stored on the draft starts at 1 (0 means none, read as 1); what is said starts at 0, because the first group is the table itself and « .1 » is the first party that joins it
	(product owner, 05.11.2026: « on pourrait faire point zéro, parce que c'est l'étape première »)."""
	return effective_rank(rank) - 1


def table_label(table_name, rank, note_name, notes_count) -> str:
	"""How a table is named wherever the server writes a message or a printout that names one.

	`table_name` is the table's own label (« T5 », its `table_name`, never its record name). A table with one open note (or none) is told by
	its label alone, as it always was; a table with several adds the number of the note after a dot (`rank_number`: « .0 » for the first group, « .1 » for the
	next) and the party's name after it when it has one: « T5.1 » or « T5.1 · Dupont ». `notes_count` is the number of OPEN notes the table has, the one named included.
	"""
	label = table_name or ""
	if cint(notes_count) <= 1:
		return label
	label = f"{label}.{rank_number(rank)}"
	name = clean_name(note_name) if isinstance(note_name, str) else None
	return f"{label}{NAME_SEPARATOR}{name}" if name else label


def lowest(notes: list[dict]) -> dict | None:
	"""The note of the lowest rank of a list of note summaries (they are sorted by rank), None for none."""
	return notes[0] if notes else None


def of_rank(notes: list[dict], rank) -> dict | None:
	"""The note of a list of summaries that has this effective rank, None when no open note has it."""
	return next((note for note in notes if note["note"] == effective_rank(rank)), None)


# The kitchen's states of an order, the one a waiter must look at first coming first: a dish ready waits for the runner
_ATTENTION = ("Ready", "Preparing", "Pending", "Delivered")


def kds_status_of_table(statuses) -> str:
	"""The kitchen state a table's tile tells when its notes are at these states (a note with none is Pending): the one that most needs a look.

	A table with one note tells that note's state, as it always did. With several, a dish ready anywhere shows first, then a dish being prepared,
	then one waiting to be started, and Delivered only when every note is."""
	states = [status or "Pending" for status in statuses] or ["Pending"]
	return min(states, key=lambda status: _ATTENTION.index(status) if status in _ATTENTION else len(_ATTENTION))


# --- the reads --------------------------------------------------------------------------------------------------------


def _summary(row, lines: dict) -> dict:
	"""A note summary as the till reads it: see `read_open`."""
	return {
		"name": row.name,
		"note": effective_rank(row.get(FIELD)),
		"note_name": row.get(NAME_FIELD) or None,
		"covers": cint(row.get(covers_module.FIELD)) or None,
		"grand_total": flt(row.grand_total),
		"items_count": lines.get(row.name, 0),
		"kds_status": row.kds_status or "Pending",
	}


def count_lines(orders) -> dict[str, int]:
	"""The number of lines of each order named, in ONE read."""
	names = [name for name in dict.fromkeys(orders or []) if name]
	if not names:
		return {}
	item = frappe.qb.DocType("Sales Invoice Item")
	rows = (
		frappe.qb.from_(item)
		.select(item.parent, Count(item.name))
		.where(item.parent.isin(names))
		.where(item.parenttype == "Sales Invoice")
		.groupby(item.parent)
		.run()
	)
	return {parent: count for parent, count in rows}


def read_open(tables, with_lines: bool = True) -> dict[str, list[dict]]:
	"""The open notes of each table named, in ONE read of the orders (and one of their lines): `{table: [summary, ...]}`, sorted by rank.

	A summary is `{"name": the invoice, "note": the effective rank, "note_name": str or None, "covers": int or None, "grand_total": float,
	"items_count": number of lines, "kds_status": str}`. Only OPEN drafts of the table count (docstatus 0); a table with none has no key.
	"""
	tables = [name for name in dict.fromkeys(tables or []) if name]
	if not tables:
		return {}
	fields = [
		"name",
		"restaurant_table",
		"grand_total",
		"kds_status",
		"creation",
		"owner",
		*order_fields(),
		*covers_module.order_fields(),
	]
	rows = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "restaurant_table": ["in", tables]},
		fields=fields,
		order_by="modified desc",
	)
	lines = count_lines(row.name for row in rows) if with_lines else {}
	by_table: dict[str, list[dict]] = {}
	for row in rows:
		by_table.setdefault(row.restaurant_table, []).append(_summary(row, lines))
	for notes in by_table.values():
		notes.sort(key=lambda note: (note["note"], note["name"]))
	return by_table


def ranks_of_open_notes(tables) -> dict[str, list[tuple[str, int]]]:
	"""The open drafts of each table named as `[(invoice, effective rank), ...]`, in ONE read. Cheaper than `read_open` when only the ranks matter."""
	tables = [name for name in dict.fromkeys(tables or []) if name]
	if not tables:
		return {}
	rows = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "restaurant_table": ["in", tables]},
		fields=["name", "restaurant_table", *([FIELD] if has_columns() else [])],
		order_by="modified desc",
	)
	by_table: dict[str, list[tuple[str, int]]] = {}
	for row in rows:
		by_table.setdefault(row.restaurant_table, []).append((row.name, effective_rank(row.get(FIELD))))
	return by_table


def stamp(rows: list) -> list:
	"""Tell each order row of a list (a dict with a `name`, and a `restaurant_table` when it sits at a table) its `note`, `note_name` and `notes_count`.

	The kitchen's and the pass's cards are one per order (one invoice, one note); a card writes « Table 5.1 » (and the party's name) when its table
	holds several notes. `notes_count` is the number of OPEN notes of the order's table, the order itself included: a note already paid and still
	on the screens counts itself, never the other notes already paid. An order that sits at no table (a takeaway) is its own note 1.
	`table_label` is the label the rule composes, from the row's `table_display_name` (the table's label) when it has one. ONE read of the notes of
	the orders and one of the open orders of their tables, whatever the number of rows.
	"""
	names = [row.get("name") for row in rows if row.get("name")]
	stored = {}
	if names and has_columns():
		stored = {
			order.name: order
			for order in frappe.get_all(
				"Sales Invoice", filters={"name": ["in", names]}, fields=["name", FIELD, NAME_FIELD]
			)
		}
	open_by_table = ranks_of_open_notes(row.get("restaurant_table") for row in rows)
	for row in rows:
		order = stored.get(row.get("name"))
		row["note"] = effective_rank(order.get(FIELD)) if order else 1
		row["note_name"] = (order.get(NAME_FIELD) or None) if order else None
		table = row.get("restaurant_table")
		if table:
			others = [order_name for order_name, _rank in open_by_table.get(table, []) if order_name != row.get("name")]
			row["notes_count"] = len(others) + 1
			row["table_label"] = table_label(
				row.get("table_display_name") or table, row["note"], row["note_name"], row["notes_count"]
			)
		else:
			row["notes_count"] = 1
	return rows


def draft_of_note(table: str, rank, lock: bool = False) -> str | None:
	"""The open draft of a table that has this effective rank, the most recently modified when (legacy data) several do; None when no open draft has it.

	On a site not migrated yet there are no ranks and the table has one draft at most: the most recently modified. `lock` reads FOR UPDATE, so
	that a note being created waits for another note being created at the same moment and sees it (see `lock_table`).
	"""
	if not table:
		return None
	rank = effective_rank(rank)
	order = frappe.qb.DocType("Sales Invoice")
	columns = [order.name, *([order[FIELD]] if has_columns() else [])]
	query = (
		frappe.qb.from_(order)
		.select(*columns)
		.where(order.docstatus == 0)
		.where(order.restaurant_table == table)
		.orderby(order.modified, order=frappe.qb.desc)
	)
	if lock:
		query = query.for_update()
	for row in query.run(as_dict=True):
		if not has_columns() or effective_rank(row.get(FIELD)) == rank:
			return row.name
	return None


def lowest_open_note(table: str) -> str | None:
	"""The open draft of a table that has the lowest rank (the most recently modified when several share it), None when the table has none.

	Where a guest's QR order goes: onto the table's first note, whatever the waiter has opened since."""
	notes = ranks_of_open_notes([table]).get(table, []) if table else []
	return min(notes, key=lambda note: note[1])[0] if notes else None


def lock_table(table: str) -> None:
	"""Take the table's row FOR UPDATE until the transaction ends: two tills creating a note of the same table at the same moment are served one after the other."""
	if table:
		frappe.db.get_value("Restaurant Table", table, "name", for_update=True)


def another_note_is_open(table: str, leaving: str | None = None) -> bool:
	"""Whether the table holds an open draft other than `leaving` (the note that is being paid, cancelled or deleted). With no `leaving`, any open draft."""
	if not table:
		return False
	filters = {"docstatus": 0, "restaurant_table": table}
	if leaving:
		filters["name"] = ["!=", leaving]
	return bool(frappe.db.exists("Sales Invoice", filters))


def refuse_a_rank_that_is_taken(table: str, rank, order: str | None = None) -> None:
	"""Refuse, translated, a rank that another OPEN draft of the table already holds. `order` is the draft that is to take it, which does not count."""
	if not table or not has_columns():
		return
	rank = effective_rank(rank)
	for name, other_rank in ranks_of_open_notes([table]).get(table, []):
		if name != order and other_rank == rank:
			frappe.throw(
				_("This table already has an open note .{0}").format(rank_number(rank)),
				frappe.ValidationError,
			)
