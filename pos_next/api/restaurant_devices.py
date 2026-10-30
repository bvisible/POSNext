# //// Neoffice — added file (no upstream equivalent). Opening a tablet as the kitchen's or the runner's screen by a
# //// QR code, with no password typed (NeoRestau lot 1, task 16). The till asks for a one-time code, shows it as a QR
# //// code, lists the restaurant's tablets and disconnects one; the tablet redeems the code and is signed in with
# //// its own device account. The rules are pos_next.restaurant.devices'.
"""The endpoints of the restaurant's tablets: make a pairing code, redeem it, list the tablets, disconnect one.

Making a code, listing the tablets and disconnecting one are the restaurant's set-up: they need the right to set the
restaurant up (pos_next.restaurant.permissions, `manage_settings`: write on the Restaurant, checked on the restaurant
named, where per-restaurant user permissions apply). A visitor, a portal account, a device account and a cashier are
refused. Redeeming a code is a visitor's: the tablet has no session yet; the code is all it brings.
"""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import add_to_date, get_datetime, get_fullname, get_url, now_datetime

from pos_next.restaurant import devices, permissions, scope
from pos_next.restaurant.mode import require_neorestau

# The redeems one address may try: a restaurant pairs a few tablets at a time, from the same address
REDEEM_LIMIT = 10
REDEEM_WINDOW = 10 * 60


def _restaurant_to_set_up(restaurant=None) -> str:
	"""The restaurant whose tablets are set up: the one named, else the till's. Refuses whoever may not set it up."""
	permissions.require_right("manage_settings")
	restaurant = restaurant or scope.current_restaurant()
	if not restaurant or not isinstance(restaurant, str) or not frappe.db.exists("Restaurant", restaurant):
		frappe.throw(_("This till belongs to no restaurant."))
	permissions.require("Restaurant", "write", restaurant)
	return restaurant


@frappe.whitelist(methods=["POST"])
def create_pairing_code(screen, station=None, restaurant=None):
	"""A one-time code that opens a tablet as the kitchen's screen (of every station, or of one) or the runner's.

	Returns the address the till shows as a QR code (the code is in its fragment, which a browser never sends to the
	server) and how many seconds it stays valid. Only the code's hash is kept.
	"""
	# Who may set the restaurant up first: anyone else is refused whether the site runs NeoRestau or not
	restaurant = _restaurant_to_set_up(restaurant)
	require_neorestau()
	if screen not in devices.SCREENS:
		frappe.throw(_("A tablet opens the kitchen screen or the runner screen."))
	# The runner's screen shows every station
	station = station if screen == devices.KITCHEN else None
	if station and (
		not isinstance(station, str)
		or not frappe.db.exists("Preparation Station", {"name": station, "is_active": 1})
		or scope.restaurant_of_record("Preparation Station", station) != restaurant
	):
		frappe.throw(_("This station is not a station of the restaurant."))
	code = devices.new_code()
	frappe.get_doc(
		{
			"doctype": devices.PAIRING,
			"code_hash": devices.code_hash(code),
			"restaurant": restaurant,
			"screen": screen,
			"station": station or None,
			"device_name": devices.device_label(screen, station),
			"expires_at": add_to_date(now_datetime(), seconds=devices.CODE_LIFETIME),
		}
	).insert(ignore_permissions=True)
	devices.forget_old_codes()
	return {
		"url": f"{get_url('/pos/pair')}#{code}",
		"expires_in": devices.CODE_LIFETIME,
		"restaurant": restaurant,
		"screen": screen,
		"station": station or None,
	}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=REDEEM_LIMIT, seconds=REDEEM_WINDOW, methods=["POST"])
def redeem_pairing_code(code):
	"""Open the tablet a code was made for: sign this browser in with its device account, and say where its screen is.

	The code is spent here, once: its row is read with a lock, so that two tablets scanning the same code cannot both
	pass, and marked used before anything else. An unknown, used or expired code is refused with the same message.
	"""
	require_neorestau()
	if not devices.well_formed(code):
		devices.refuse_code()
	found = frappe.db.sql(
		"""select name, restaurant, screen, station, device_name, expires_at, used_at, owner
		from `tabRestaurant Device Pairing` where code_hash = %s for update""",
		devices.code_hash(code),
		as_dict=True,
	)
	if not found or found[0].used_at or get_datetime(found[0].expires_at) <= now_datetime():
		devices.refuse_code()
	pairing = found[0]
	frappe.db.set_value(devices.PAIRING, pairing.name, "used_at", now_datetime(), update_modified=False)
	device = devices.pair(pairing)
	frappe.db.set_value(devices.PAIRING, pairing.name, "device", device.name, update_modified=False)
	devices.log_pairing(device, pairing.owner)
	devices.sign_in(device, pairing.owner)
	return {"redirect": devices.screen_path(device)}


@frappe.whitelist()
def get_devices(restaurant=None):
	"""The tablets of the restaurant (the till's unless one is named): name, screen, station, who paired it, when it
	was last seen, and whether it is disconnected."""
	restaurant = _restaurant_to_set_up(restaurant)
	rows = frappe.get_all(
		devices.DEVICE,
		filters={"restaurant": restaurant},
		fields=[
			"name",
			"device_name",
			"screen",
			"station",
			"paired_by",
			"paired_at",
			"last_seen",
			"disconnected",
		],
		order_by="screen asc, device_name asc",
	)
	stations = scope.labels_of("Preparation Station", "station_name", {row.station for row in rows})
	for row in rows:
		row["station_name"] = stations.get(row.station) or row.station or ""
		row["paired_by_name"] = get_fullname(row.paired_by) if row.paired_by else ""
		row["disconnected"] = bool(row.disconnected)
	return rows


@frappe.whitelist(methods=["POST"])
def disconnect_device(device):
	"""End every session of a tablet and refuse it until it scans a new code (its account can be paired again)."""
	permissions.require_right("manage_settings")
	if not isinstance(device, str) or not device:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	row = frappe.db.get_value(devices.DEVICE, device, ["name", "restaurant", "user"], as_dict=True)
	if not row:
		frappe.throw(_("This tablet no longer exists."), frappe.DoesNotExistError)
	permissions.require("Restaurant", "write", row.restaurant)
	frappe.db.set_value(devices.DEVICE, row.name, "disconnected", 1)
	ended = devices.end_sessions(row.user, _("Disconnected by {0}").format(get_fullname()))
	return {"ended_sessions": ended}
