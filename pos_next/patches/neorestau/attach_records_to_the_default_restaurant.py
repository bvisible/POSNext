# //// Neoffice — added file (no upstream equivalent). A restaurant owns its rooms, tables, stations, cards, menus,
# //// reservations and tips, and a till works for one restaurant (NeoRestau lot 1, task 2). The records a site made
# //// before the restaurants existed name none: this patch attaches them to the default restaurant, and every till
# //// in restaurant mode to that restaurant too, since the till's `restaurant` link is mandatory once the mode is on.
import frappe

from pos_next.restaurant.settings import create_default_restaurant, default_restaurant

# The doctypes that carry their own `restaurant` link; a table takes the restaurant of its room
OWN_LINK = (
	"Restaurant Area",
	"Preparation Station",
	"Restaurant Card",
	"Restaurant Menu",
	"Restaurant Reservation",
	"Restaurant Tip",
)
NO_RESTAURANT = {"restaurant": ["is", "not set"]}


def execute():
	"""Attach what names no restaurant to the default restaurant, and make it first when only this needs one.

	Idempotent: once everything names a restaurant there is nothing left to attach.
	"""
	tills = frappe.get_all(
		"POS Settings", filters={**NO_RESTAURANT, "enable_restaurant_mode": 1}, pluck="name"
	)
	if not tills and not any(
		frappe.db.count(doctype, NO_RESTAURANT) for doctype in (*OWN_LINK, "Restaurant Table")
	):
		return

	restaurant = _the_default_restaurant()
	if not restaurant:
		# The site has no company to attach a restaurant to: nothing can be attached, and nothing needs it
		return

	for doctype in OWN_LINK:
		frappe.db.sql(
			f"UPDATE `tab{doctype}` SET restaurant = %s WHERE IFNULL(restaurant, '') = ''", (restaurant,)
		)
	# A table is in the restaurant of its room
	frappe.db.sql(
		"""
		UPDATE `tabRestaurant Table` t
		JOIN `tabRestaurant Area` a ON a.name = t.area
		SET t.restaurant = a.restaurant
		WHERE IFNULL(t.restaurant, '') = ''
		"""
	)
	# A table whose room is gone (deleted by force, or lost in a restore) goes with the default restaurant
	frappe.db.sql(
		"UPDATE `tabRestaurant Table` SET restaurant = %s WHERE IFNULL(restaurant, '') = ''", (restaurant,)
	)
	# The tills in restaurant mode: the link is mandatory with the mode, and their settings could not be saved without
	frappe.db.sql(
		"""
		UPDATE `tabPOS Settings` SET restaurant = %s
		WHERE enable_restaurant_mode = 1 AND IFNULL(restaurant, '') = ''
		""",
		(restaurant,),
	)

	# Raw SQL leaves the cached documents as they were, without their restaurant: drop them all
	for doctype in (*OWN_LINK, "Restaurant Table", "POS Settings"):
		frappe.clear_document_cache(doctype)


def _the_default_restaurant() -> str | None:
	"""The default restaurant; the oldest one when none is enabled; a new one, named after the company, when none exists."""
	restaurant = default_restaurant()
	if restaurant:
		return restaurant
	oldest = frappe.get_all("Restaurant", pluck="name", order_by="creation asc, name asc", limit=1)
	if oldest:
		# Restaurants exist but none is enabled (or several are, and none is the default): never make another
		return oldest[0]
	return create_default_restaurant()
