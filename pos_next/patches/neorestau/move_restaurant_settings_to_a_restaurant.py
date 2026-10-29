# //// Neoffice — added file (no upstream equivalent). The site-wide single `Restaurant Settings`
# //// becomes the settings of one default restaurant, named after the default company (NeoRestau lot 1,
# //// task 1): the opening hours, tips, QR and web ordering and reservation rules a site had set keep
# //// working, now as the first of its restaurants. The single stays in place, untouched but for its opening
# //// hours, which move with the settings.
import frappe

from pos_next.restaurant.settings import SETTINGS_FIELDS, create_default_restaurant

SINGLE = "Restaurant Settings"
USED_BY_THE_MODULE = ("Restaurant Area", "Restaurant Card", "Preparation Station")


def execute():
	"""Create the default restaurant from the single, when the site uses the restaurant module.

	Idempotent: nothing happens once a restaurant exists.
	"""
	if frappe.db.count("Restaurant") or not _module_was_used():
		return

	single = frappe.get_single(SINGLE)
	values = {field: single.get(field) for field in SETTINGS_FIELDS}
	_drop_links_to_deleted_records(values)
	# A copy, not a set-up: the restaurant provisions nothing, it holds what the single held
	name = create_default_restaurant(values, ignore_validate=True)
	if not name:
		return

	# The opening hours move as they are, row for row: same content, same order, a new parent
	frappe.db.sql(
		"""
		UPDATE `tabRestaurant Opening Hours`
		SET parent = %s, parenttype = 'Restaurant', parentfield = 'opening_hours'
		WHERE parent = %s AND parenttype = %s AND parentfield = 'opening_hours'
		""",
		(name, SINGLE, SINGLE),
	)
	frappe.clear_document_cache("Restaurant", name)


def _drop_links_to_deleted_records(values: dict) -> None:
	"""Forget a link whose target is gone (deleted by force, by SQL, or lost in a restore).

	The restaurant is checked on insert and would refuse a dangling link, which would stop the whole migration.
	"""
	meta = frappe.get_meta("Restaurant")
	for field, value in list(values.items()):
		df = meta.get_field(field)
		if value and df.fieldtype == "Link" and not frappe.db.exists(df.options, value):
			values[field] = None


def _module_was_used() -> bool:
	"""Whether the site has set something up in the restaurant module: settings, a room, a card, a station."""
	if frappe.db.get_singles_dict(SINGLE) or frappe.db.count("Restaurant Opening Hours", {"parent": SINGLE}):
		return True
	return any(frappe.db.count(doctype) for doctype in USED_BY_THE_MODULE)
