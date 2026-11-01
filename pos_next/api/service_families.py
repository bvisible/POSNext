# //// Neoffice — added file (no upstream equivalent). What the till asks of the server about the service families of a
# //// restaurant order (NeoRestau lot 1): the family of each Item Group, and the plan of a send. The rule itself is
# //// pos_next/restaurant/service_families.py; these two calls only hand it to the till.
"""The till's calls about the service families."""

import json

import frappe
from frappe.utils import cint

from pos_next.restaurant import service_families


@frappe.whitelist()
def get_group_families():
	"""The family of every Item Group that has one, its own or the nearest up its tree: `{group: family}`.

	The till reads it once, with the rest of the restaurant, and gives each line it adds the family of its article's group, so
	it never walks the group tree itself. A group with no family is not in the map: its articles are never held.
	"""
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	return service_families.group_families()


@frappe.whitelist()
def plan_kitchen_send(lines, restaurant_table=None, is_takeaway=0):
	"""What a send does with the lines of an order, and what « order the next course » and « order everything » release.

	`lines` are the order's lines as the till holds them (`service_family`, `kds_status` and, for a line sent ahead, `kds_ahead` and
	`kds_called_at` of each). Answers, in the order of the lines: `plan` (`send` / `hold` / `ahead` / `left` for each), `next` (the
	family of the next course and the indexes of its lines) and `held` (the indexes of every line that waits for the room); and the
	`rhythm` they follow, that of the table's restaurant. Only a table's order is held back or sent ahead; a takeaway or a counter order is
	not. //// Neoffice — where the kitchen prepares ahead, a line that would be held leaves instead (`ahead`), and the lines that wait for the
	room are the ones sent ahead and not called yet.
	"""
	from pos_next.api.cash_entry import require_till_user

	require_till_user()
	if isinstance(lines, str):
		lines = json.loads(lines or "[]")
	lines = [line for line in (lines or []) if isinstance(line, dict)]
	table_service = bool(restaurant_table) and not cint(is_takeaway)
	rhythm = (
		service_families.rhythm_of_table(restaurant_table)
		if table_service
		else service_families.CALLED_BY_THE_ROOM
	)
	return {
		"rhythm": rhythm,
		"plan": service_families.plan_send(lines, table_service, rhythm=rhythm),
		"next": service_families.next_release(lines, rhythm),
		"held": service_families.held_lines(lines, rhythm),
	}
