# //// Neoffice — added file (no upstream equivalent). The site-wide single `Restaurant Settings`
# //// becomes the settings of one default restaurant, named after the default company (NeoRestau lot 1,
# //// task 1): the opening hours, tips, QR and web ordering and reservation rules a site had set keep
# //// working, now as the first of its restaurants. The single stays in place, untouched but for its opening
# //// hours, which move with the settings.
import frappe

from pos_next.restaurant.settings import SETTINGS_FIELDS, create_default_restaurant
from pos_next.restaurant.usage import site_used_the_restaurant

SINGLE = "Restaurant Settings"


def execute():
	"""Create the default restaurant from the single, when the site used the restaurant module.

	What counts as use is `site_used_the_restaurant`, which the patch that switches NeoRestau on shares: never the
	stored values of the single, which a migrate writes on every site, a client that never used the module included.
	Idempotent: nothing happens once a restaurant exists.
	"""
	if frappe.db.count("Restaurant") or not site_used_the_restaurant():
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
