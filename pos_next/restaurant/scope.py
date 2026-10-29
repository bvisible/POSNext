# //// Neoffice — added file (no upstream equivalent). What a restaurant owns (NeoRestau lot 1, task 2):
# //// its rooms, tables, preparation stations, cards, menus, reservations and tips. A site can run several
# //// restaurants, so every list the till reads is the list of ONE restaurant (the till's), a record is
# //// created in the restaurant that asked, and a label (the name of a room, a table, a station) only has to be
# //// unique within its restaurant. This module holds the rules those endpoints and doctypes share.
import frappe
from frappe import _

from pos_next.restaurant import settings as restaurant_settings
from pos_next.restaurant.settings import default_restaurant, restaurant_for_profile


def current_profile() -> str | None:
	"""The POS Profile of the till the current user has open (None for a visitor, or when no shift is open)."""
	return restaurant_settings.open_shift_profile()


def current_restaurant(pos_profile: str | None = None) -> str | None:
	"""The restaurant the caller works for: the one of the POS Profile named, else of the user's open shift.

	Without a till at all (no profile named, no shift open) it is the default restaurant, as for any code that
	cannot name its till. A site without any restaurant answers None.
	"""
	return restaurant_for_profile(pos_profile or current_profile())


def restaurant_or_filters(restaurant: str | None) -> list[list]:
	"""The `or_filters` of `frappe.get_all` that keep the records of one restaurant.

	A record that names no restaurant belongs to the default restaurant (it is how the records of a site that
	predates the restaurants read until the patch attaches them), and on a site without any restaurant every
	record names none.
	"""
	if not restaurant:
		return [["restaurant", "is", "not set"]]
	filters = [["restaurant", "=", restaurant]]
	if restaurant == default_restaurant():
		filters.append(["restaurant", "is", "not set"])
	return filters


def restaurant_of_record(doctype: str, name: str | None) -> str | None:
	"""The restaurant of a record: the one it names, else the default restaurant (None for a record that is gone)."""
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

	An order belongs to the restaurant of its table. A takeaway order has no table: it belongs to the restaurant
	of the till that took it (its POS Profile), the default restaurant when it names none.
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
				of_profile[profile] = restaurant_for_profile(profile)
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
	stray row of `tabSingles` that holds whatever an earlier version left there, not any till's setting.
	"""
	row = None
	if pos_profile:
		row = frappe.db.get_value(
			"POS Settings", {"pos_profile": pos_profile, "enabled": 1}, fields, as_dict=True
		)
	return row or frappe._dict.fromkeys(fields)


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
