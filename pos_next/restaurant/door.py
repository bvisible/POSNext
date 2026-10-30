# //// Neoffice — added file (no upstream equivalent). The two doors a shift is opened through (NeoRestau lot 1, task 5):
# //// which of a user's tills the shift dialog offers when the cashier comes through NeoRestau's entry
# //// (`/pos?mode=restaurant`) and through the usual one.
"""Which tills a user is offered when they open a shift, by the door they came through."""

import frappe

from pos_next.restaurant.mode import effective_restaurant_mode, neorestau_active
from pos_next.restaurant.settings import pos_settings_of_profiles

# The `mode` the entry route NeoRestau opens passes (`/pos?mode=restaurant`): the restaurant door. Any other value, or none,
# is the usual door.
RESTAURANT_DOOR = "restaurant"


def restaurants_of_the_restaurant_tills(profiles: list[str]) -> dict[str, str]:
	"""{POS Profile: its restaurant} for those of the given tills that work as restaurant tills, read in ONE query.

	A till is a restaurant till by its own setting and only where the site runs NeoRestau: `mode.effective_restaurant_mode`,
	the very rule the till reads its mode by, on the row the till itself reads (`settings.pos_settings_of_profiles`, which
	says which row that is). Where the site does not run NeoRestau no till is one, and nothing is read.
	"""
	if not profiles or not neorestau_active():
		return {}
	try:
		rows = pos_settings_of_profiles(profiles, ["enable_restaurant_mode", "restaurant"])
	except Exception as error:
		if frappe.db.is_missing_column(error):
			# The code is updated and the site is not migrated yet: no till can name a restaurant, and a cashier must not be
			# left at a dead end for it
			return {}
		raise
	return {profile: row.restaurant for profile, row in rows.items() if effective_restaurant_mode(row)}


def offer_at_the_door(tills: list, mode: str | None = None) -> list:
	"""The tills a user is offered when they open a shift through a door, each one saying whether it is a restaurant till
	(`restaurant_mode`, the effective mode) and which restaurant it works for (`restaurant`, None for any other till).

	`mode == "restaurant"` is the restaurant door: it offers the restaurant tills. Any other `mode` (none, empty, unknown)
	is the usual door: it offers the other tills. The door only decides what is OFFERED: the till that is chosen is a
	restaurant till or not by its own setting, whichever door was used.

	A user who has tills never sees an empty list, at either door: where the door has none for them (a cashier who holds
	restaurant tills only, at the usual door; a user who holds none, at the restaurant door) they get all their tills. That
	is also what makes the restaurant door the usual one where the site does not run NeoRestau, as no till is a restaurant
	till there.
	"""
	restaurants = restaurants_of_the_restaurant_tills([till["name"] for till in tills])
	for till in tills:
		till["restaurant_mode"] = till["name"] in restaurants
		till["restaurant"] = restaurants.get(till["name"])
	restaurant_door = mode == RESTAURANT_DOOR
	offered = [till for till in tills if till["restaurant_mode"] is restaurant_door]
	return offered or tills
