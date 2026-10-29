# //// Neoffice — added file (no upstream equivalent). Which restaurant a piece of code is working for,
# //// and that restaurant's settings (NeoRestau lot 1, task 1). The settings used to be one single,
# //// `Restaurant Settings`, read as `frappe.get_single(...)` all over the code; they are now the fields
# //// of a `Restaurant`, one set per restaurant, and every reader asks this module for the set of the
# //// restaurant it is working for.
import frappe

# What a Restaurant carries over from the former single `Restaurant Settings`, under the same fieldnames,
# apart from the table of opening hours (a table is written row by row, not as a value).
SETTINGS_FIELDS = (
	"enable_runner",
	"enable_tips",
	"auto_detect_tip",
	"tip_item",
	"tip_account",
	"enable_qr_ordering",
	"guest_menu",
	"qr_order_validation",
	"guest_account_mode",
	"token_expiry_mode",
	"token_expiry_days",
	"enable_web_takeaway",
	"takeaway_menu",
	"enable_reservations",
	"default_reservation_duration",
	"no_show_delay",
	"reservation_reminder_hours",
	"enable_online_reservations",
	"require_reservation_validation",
	"restaurant_email",
	"reservation_channels",
)


def default_restaurant() -> str | None:
	"""The only restaurant if there is one, else the oldest enabled one (None when the site has none)."""
	try:
		restaurants = frappe.get_all("Restaurant", fields=["name", "enabled"], order_by="creation asc, name asc")
	except Exception as error:
		if frappe.db.is_table_missing(error):
			# The code is updated and the site is not migrated yet: there is no restaurant to speak of
			return None
		raise
	if len(restaurants) == 1:
		return restaurants[0].name
	for restaurant in restaurants:
		if restaurant.enabled:
			return restaurant.name
	return None


def pos_settings_of(pos_profile: str | None, fields: list[str]) -> frappe._dict | None:
	"""Some fields of the POS Settings row of a till, as the till itself reads it; None for a till without one.

	The row of a POS Profile counts when it is enabled: a disabled row is no settings at all, the till then runs on
	the defaults (the bootstrap reads `enabled = 1` rows only). Whatever the server asks of "the till's settings"
	- the restaurant it works for, its takeaway lane - is read here, so that it is always the same row.
	"""
	if not pos_profile:
		return None
	return frappe.db.get_value(
		"POS Settings", {"pos_profile": pos_profile, "enabled": 1}, fields, as_dict=True
	)


def restaurant_for_profile(pos_profile: str | None) -> str | None:
	"""The restaurant a till (a POS Profile) belongs to: the one its POS Settings name.

	- No till at all (`pos_profile` empty: a guest takeaway session that has not picked one, an invoice rung up
	  without a POS Profile, a user with no shift open): the default restaurant, written here once for every such
	  caller. A site without any restaurant answers None.
	- A till whose settings name no restaurant, or that has no enabled POS Settings: it is not a restaurant till,
	  and belongs to none (None).
	"""
	if not pos_profile:
		# No till: the default restaurant, written here once for every caller (guest takeaway token, tip of an
		# invoice with no profile) instead of resting on a lookup that happens to ignore its argument
		return default_restaurant()
	try:
		row = pos_settings_of(pos_profile, ["restaurant"])
	except Exception as error:
		if frappe.db.is_missing_column(error):
			# The code is updated and the site is not migrated yet: no till can name a restaurant, and the site has
			# the one set of settings it had before the link existed, the default restaurant's
			return default_restaurant()
		raise
	return (row.restaurant if row else None) or None


def restaurant_of(record) -> str | None:
	"""The restaurant a record belongs to: the one it names, else the default restaurant."""
	return (record.get("restaurant") if record else None) or default_restaurant()


def get_restaurant_settings(restaurant: str | None = None) -> frappe._dict:
	"""The settings of a restaurant: its fields and its opening hours, as a dict.

	Without a restaurant it is the one of the current user's open till (its shift's POS Profile; the default
	restaurant when no till is open: see `restaurant_for_profile`), the very restaurant `scope.current_restaurant()`
	reads the lists of. A site without any restaurant, a user whose open till is not a restaurant till, or a
	restaurant that does not exist, read as an empty dict: the restaurant features stay off.
	"""
	name = restaurant or _restaurant_of_the_session()
	if not name:
		return frappe._dict()
	try:
		# Cached by Frappe, and dropped from the cache each time the restaurant is saved or deleted
		doc = frappe.get_cached_doc("Restaurant", name)
	except frappe.DoesNotExistError:
		frappe.clear_last_message()
		return frappe._dict()
	except Exception as error:
		if frappe.db.is_table_missing(error):
			return frappe._dict()
		raise
	return doc.as_dict()


def get_restaurant_settings_for_profile(pos_profile: str | None) -> frappe._dict:
	"""The settings of the restaurant a till (a POS Profile) belongs to; empty when it belongs to none.

	For the code that knows its till (an invoice, a guest session): it never falls back on the user's own
	open shift, as `get_restaurant_settings()` does when it is given no restaurant. Code that has no till to name
	(`pos_profile` None) reads the default restaurant's settings, a till that is not a restaurant till has none:
	see `restaurant_for_profile`.
	"""
	restaurant = restaurant_for_profile(pos_profile)
	return get_restaurant_settings(restaurant) if restaurant else frappe._dict()


def _restaurant_of_the_session() -> str | None:
	"""The restaurant of the user's open till, the same `scope.current_restaurant()` answers: the settings and the
	lists of a screen never come from two restaurants. No shift open, no till to name: the default restaurant."""
	return restaurant_for_profile(open_shift_profile())


def open_shift_profile() -> str | None:
	"""The POS Profile of the till the current user has open."""
	user = frappe.session.user
	if not user or user == "Guest":
		return None
	return frappe.db.get_value(
		"POS Opening Shift",
		{"user": user, "pos_closing_shift": ["is", "not set"], "docstatus": 1, "status": "Open"},
		"pos_profile",
		order_by="period_start_date desc",
	)


def default_company() -> str | None:
	"""The site's default company, else its oldest company."""
	company = frappe.db.get_single_value("Global Defaults", "default_company")
	if company:
		return company
	companies = frappe.get_all("Company", pluck="name", order_by="creation asc", limit=1)
	return companies[0] if companies else None


def create_default_restaurant(
	values: dict | None = None, ignore_validate: bool = False, ignore_permissions: bool = True
) -> str | None:
	"""Create the default restaurant, named after the default company, with the settings given (if any).

	`ignore_validate` skips the restaurant's own validation, which provisions the tip item and account: a
	restaurant made as the copy of what the former single held must not provision anything. The patches make it
	whoever runs them; a user who saves the first settings from the till makes it as himself (`ignore_permissions`
	False: he must be allowed to create a restaurant).
	Returns its name, or None when the site has no company to attach it to.
	"""
	company = default_company()
	if not company:
		frappe.log_error("Default restaurant not created", "The site has no company to attach a restaurant to")
		return None
	doc = frappe.get_doc({"doctype": "Restaurant", "restaurant_name": company, "company": company, **(values or {})})
	doc.flags.ignore_validate = ignore_validate
	doc.insert(ignore_permissions=ignore_permissions)
	return doc.name
