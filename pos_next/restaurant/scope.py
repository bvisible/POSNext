# //// Neoffice — added file (no upstream equivalent). What a restaurant owns (NeoRestau lot 1, task 2):
# //// its rooms, tables, preparation stations, cards, menus, reservations and tips. A site can run several
# //// restaurants, so every list the till reads is the list of ONE restaurant (the till's), a record is
# //// created in the restaurant that asked, and a label (the name of a room, a table, a station) only has to be
# //// unique within its restaurant. This module holds the rules those endpoints and doctypes share.
"""Which restaurant a thing belongs to: two rules, which every list and every write of the restaurant code follows.

A TILL (a POS Profile) belongs to the restaurant its enabled POS Settings name. A till whose settings name none, or
that has no enabled settings, is not a restaurant till and belongs to no restaurant. Only "no till at all" (a guest, a
web order, an invoice without a POS Profile, a user with no shift open) works for the default restaurant. See
`restaurant_for_profile`.

A RECORD (a room, a table, a station, a card, a menu, a reservation, a tip) belongs to the restaurant it names. One
that names none (saved before the restaurants existed, until the patch attaches it) belongs to the default
restaurant, so that a site that predates the restaurants keeps reading what it always read: the data stays
compatible, and a till that belongs to no restaurant does not see it. An ORDER has no restaurant field: it belongs to
the restaurant of its table, else of the restaurant till that took it, else to the default restaurant. See
`keep_orders_of`.
"""

import frappe
from frappe import _

from pos_next.restaurant import settings as restaurant_settings
from pos_next.restaurant.settings import default_restaurant, restaurant_for_profile


def current_profile() -> str | None:
	"""The POS Profile of the till the current user has open (None for a visitor, or when no shift is open)."""
	return restaurant_settings.open_shift_profile()


def current_restaurant(pos_profile: str | None = None) -> str | None:
	"""The restaurant the caller works for: the one of the POS Profile named, else of the user's open shift.

	A till that is not a restaurant till has none (None); a caller that cannot name a till at all (no profile named,
	no shift open) works for the default restaurant. It is the restaurant `get_restaurant_settings()` reads the
	settings of, so that the settings and the lists of a screen never come from two restaurants. A site without
	any restaurant answers None.
	"""
	return restaurant_for_profile(pos_profile or current_profile())


def restaurant_or_filters(restaurant: str | None) -> list[list]:
	"""The `or_filters` of `frappe.get_all` that keep the records of one restaurant.

	A record that names no restaurant belongs to the default restaurant (it is how the records of a site that
	predates the restaurants read until the patch attaches them), so asked for no restaurant (a till that is not a
	restaurant till) the answer is no record at all. On a site without any restaurant every record names none, and
	the records that name none are the ones kept.
	"""
	if not restaurant:
		if default_restaurant():
			# `name` is never empty: this keeps nothing
			return [["name", "is", "not set"]]
		return [["restaurant", "is", "not set"]]
	filters = [["restaurant", "=", restaurant]]
	if restaurant == default_restaurant():
		filters.append(["restaurant", "is", "not set"])
	return filters


def restaurant_of_record(doctype: str, name: str | None) -> str | None:
	"""The restaurant of a record: the one it names, else the default restaurant.

	A record that names none, and a record that does not exist (or no record at all), answer the default restaurant:
	it is for the link validation to refuse a record that is gone, with its own message, not for this lookup.
	"""
	if not name:
		return default_restaurant()
	return frappe.db.get_value(doctype, name, "restaurant") or default_restaurant()


def attach_to_restaurant(doc, restaurant: str | None = None) -> None:
	"""Give a record that names no restaurant the one asked for, else the default restaurant."""
	if not doc.get("restaurant"):
		doc.restaurant = restaurant or default_restaurant()


def stamp(rows: list, restaurant: str | None) -> list:
	"""Name the restaurant on each row an endpoint answers (a row that named none was read as the restaurant's)."""
	for row in rows:
		row["restaurant"] = restaurant
	return rows


def validate_label_unique_in_restaurant(doc, label_field: str) -> None:
	"""Refuse a label (a room, table or station name) that another record of the same restaurant already has.

	Two restaurants may each have a "Table 5" or a "Kitchen"; one restaurant may not have two. The comparison is
	the database's, so it ignores case, as the unique index it replaces did.
	"""
	label = (doc.get(label_field) or "").strip()
	if not label:
		return
	filters = {label_field: label}
	if doc.get("name"):
		filters["name"] = ["!=", doc.name]
	others = frappe.get_all(
		doc.doctype,
		filters=filters,
		or_filters=restaurant_or_filters(doc.get("restaurant")),
		limit=1,
		pluck="name",
	)
	if others:
		frappe.throw(
			_("{0} {1} already exists in this restaurant").format(_(doc.doctype), frappe.bold(label))
		)


def keep_orders_of(orders: list, restaurant: str | None) -> list:
	"""The draft orders (Sales Invoice rows) that belong to one restaurant.

	An order belongs to the restaurant of its table, and a table that names none to the default restaurant. A
	takeaway order has no table: it belongs to the restaurant of the till that took it (its POS Profile). An order
	whose till is not a restaurant till (its settings name no restaurant, or it has none) names no restaurant, and
	so belongs to the default restaurant, like any record that names none; an order with no till as well.
	"""
	table_names = {order.get("restaurant_table") for order in orders if order.get("restaurant_table")}
	of_table = {}
	if table_names:
		of_table = dict(
			frappe.get_all(
				"Restaurant Table",
				filters={"name": ["in", list(table_names)]},
				fields=["name", "restaurant"],
				as_list=True,
			)
		)
	default = default_restaurant()
	of_profile = {}
	kept = []
	for order in orders:
		table = order.get("restaurant_table")
		if table:
			owner = of_table.get(table) or default
		else:
			profile = order.get("pos_profile")
			if profile not in of_profile:
				of_profile[profile] = restaurant_for_profile(profile) or default
			owner = of_profile[profile]
		if owner == restaurant:
			kept.append(order)
	return kept


def labels_of(doctype: str, label_field: str, names: set | list) -> dict[str, str]:
	"""The label (area_name, table_name, station_name…) of each record named, by name."""
	names = [name for name in names if name]
	if not names:
		return {}
	return dict(
		frappe.get_all(doctype, filters={"name": ["in", names]}, fields=["name", label_field], as_list=True)
	)


def till_settings(pos_profile: str | None, fields: list[str]) -> dict:
	"""Some fields of the POS Settings row of a till, as the till itself reads it (all empty without such a row).

	POS Settings is one row per POS Profile, not a single: `frappe.db.get_single_value("POS Settings", …)` reads a
	stray row of `tabSingles` that holds whatever an earlier version left there, not any till's setting. It is the
	row `restaurant_for_profile` reads the restaurant of the till from (`pos_settings_of`): enabled rows only.
	"""
	return restaurant_settings.pos_settings_of(pos_profile, fields) or frappe._dict.fromkeys(fields)


def extend_bootstrap_settings(settings: dict, pos_profile: str | None = None) -> None:
	"""Tell a till which restaurant it belongs to: its name (`restaurant`) and its label (`restaurant_name`).

	Registered on `pos_next_bootstrap_settings`, the seam the bootstrap, the settings dialog and the profile data
	all call after they read the till's POS Settings.
	"""
	restaurant = settings.get("restaurant") or ""
	settings["restaurant"] = restaurant
	settings["restaurant_name"] = (
		(frappe.db.get_value("Restaurant", restaurant, "restaurant_name") or "") if restaurant else ""
	)
