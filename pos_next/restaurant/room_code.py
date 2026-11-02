# //// Neoffice — added file (no upstream equivalent). The short code of a room on a kitchen ticket (NeoResto lot 1, task 38b,
# //// rulings 124 and 126). A kitchen can feed several rooms, so the room opens the line of a ticket as a small chip, then the
# //// table: « S01 · Table 15 · 0007 ». The code of a room is its `short_code`, and when the restaurant typed none it is
# //// derived from the room's name by the rule below, which the client util `POS/src/utils/kitchenRoomCode.js` has too (the
# //// screen's fallback); `pos_next/tests/room_code_cases.json` is the one table of examples both are tested against.
"""The short code of a room: typed on the room, else derived from its name.

The derivation (the same as the client's `roomCode`):

- a takeaway order: `EMP`
- a name with a number: the first letter and the first number on two digits (`Salle 1` is `S01`, `Salle 100` is `S100`)
- a name with no number: the first three letters of its first word (`Terrasse` is `TER`)
- a name that is only a number: the number on two digits
- no name: an empty string, so that a ticket draws no chip rather than a guess

Accents are folded to the letter under them, and the ligatures Unicode leaves alone are spelt out (`Cœur` is `COE`).
"""

import re
import unicodedata

import frappe

TAKEAWAY_CODE = "EMP"
# The longest code a room can be given (the field's length)
MAX_LENGTH = 6

_NUMBER = re.compile(r"[0-9]+")
_LIGATURES = str.maketrans({"œ": "oe", "Œ": "OE", "æ": "ae", "Æ": "AE"})


def _fold(text: str) -> str:
	"""Accents folded to the letter under them, and the ligatures spelt out."""
	decomposed = unicodedata.normalize("NFD", text)
	return "".join(char for char in decomposed if not unicodedata.category(char).startswith("M")).translate(_LIGATURES)


def _is_letter(char: str) -> bool:
	return unicodedata.category(char).startswith("L")


def derived_room_code(name, takeaway: bool = False) -> str:
	"""The code a room's name gives, in capitals (empty when it gives none)."""
	if takeaway:
		return TAKEAWAY_CODE
	text = _fold(str(name if name is not None else "")).strip()
	if not text:
		return ""

	letters = "".join(char for char in text if _is_letter(char))
	number = _NUMBER.search(text)
	if number:
		digits = number.group(0)
		# Leading zeros go, but a number keeps its last digit (« 000 » is 0), then two digits at least
		digits = (digits.lstrip("0") or "0").rjust(2, "0")
		return f"{letters[0].upper()}{digits}" if letters else digits

	# The first word only: « Salle des fêtes » is SAL, not letters picked across words
	first_word = ""
	for char in text:
		if _is_letter(char):
			first_word += char
		elif first_word:
			break
	return first_word[:3].upper()


def room_code(short_code, name, takeaway: bool = False) -> str:
	"""The code a ticket shows for a room: the one typed on the room (in capitals), else the one its name gives."""
	if takeaway:
		return TAKEAWAY_CODE
	typed = str(short_code or "").strip().upper()
	return typed or derived_room_code(name)


def area_fields() -> list[str]:
	"""The fields of a Restaurant Area to read to know its code (the typed one is read where the site has it)."""
	fields = ["name", "area_name"]
	if frappe.db.has_column("Restaurant Area", "short_code"):
		fields.append("short_code")
	return fields


def codes_of_areas(names) -> dict[str, str]:
	"""The code of each room named, {room name: code}, all read together."""
	names = sorted({name for name in names if name})
	if not names:
		return {}
	rows = frappe.get_all("Restaurant Area", filters={"name": ["in", names]}, fields=area_fields())
	return {row.name: room_code(row.get("short_code"), row.area_name) for row in rows}
