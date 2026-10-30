# //// Neoffice — added file (no upstream equivalent). Table reservations: a retail POS has no
# //// booking notion at all. Covers the POS dialog and the public /pos/reservation form, the
# //// Pending → Confirmed → Seated → Completed / Cancelled / No Show workflow, overlap detection
# //// by duration, frappe.lock_doc so two clerks cannot book the same table, rate limiting per
# //// e-mail for web bookings, the double opt-in / confirmation / reminder / cancellation mails
# //// and the hourly reminder + auto-no-show jobs (ebc3ecc5, 2026-03-29 "feat: restaurant
# //// reservation system with POS dialog, online booking, and email notifications"; 26659089
# //// and 0e3f3fcd the same day — MySQL rejects a Duration default and stores it as seconds).
# //// The public form gives a visitor which tables are free and nothing of the other guests, counts
# //// the bookings it mails per visitor, per address and per site, and a booking its guest never
# //// confirms expires instead of holding its tables (NeoRestau lot 1, task 18).
import frappe
from frappe import _
from frappe.utils import (
	add_to_date,
	cint,
	escape_html,
	get_time,
	getdate,
	now_datetime,
	nowdate,
	validate_email_address,
)
from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import (
	EXPIRED,
	HOLD_STATUSES,
	_parse_duration,
	awaits_its_guest,
	hold_has_expired,
)
from pos_next.restaurant import permissions, scope
from pos_next.restaurant.mode import require_neorestau
from pos_next.restaurant.settings import get_restaurant_settings, restaurant_of
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
from datetime import datetime, timedelta
from time import time as epoch_seconds

# What a visitor reads of a table on the public form: which one it is, its label, its seats, and whether it is free
# for the slot he asks. Never who holds it, nor when.
VISITOR_TABLE_FIELDS = ("name", "table_name", "capacity", "available")

# How many bookings the public form takes, as (count, window in seconds): per visitor (his IP address, an IPv6 one by
# its /64 network), per e-mail address, and for the whole site, each counted in fixed windows. A booking mails an
# address nobody has confirmed yet: whatever the visitors, the site never mails more than its own budget.
# `guest_reservation_limits` in the site config overrides any entry, e.g. {"site_day": [400, 86400]}.
GUEST_LIMITS = {
	"ip_minute": (3, 60),
	"ip_hour": (10, 3600),
	"ip_day": (20, 86400),
	"address_hour": (3, 3600),
	"address_day": (5, 86400),
	"site_hour": (40, 3600),
	"site_day": (200, 86400),
}
LIMIT_KEY = "pos_next:guest_reservation_limit:"
# The minutes a guest has to confirm an online booking from the e-mail, when his restaurant sets none
DEFAULT_CONFIRMATION_MINUTES = 30
# The longest name the public form takes, and what a name never holds: a link, an address, markup
GUEST_NAME_MAX = 80
NOT_A_NAME = re.compile(r"https?:|://|www\.|@|<|>", re.IGNORECASE)


# ==========================================
# Authenticated POS endpoints
# ==========================================


@frappe.whitelist()
def get_reservations(date=None, area=None, status=None, restaurant=None):
	"""Get the reservations of one restaurant (the till's own unless one is named) for a date, with optional filters."""
	# Whoever reads the reservations (a cashier, a manager), from a desk account (NeoRestau lot 1, task 3)
	permissions.require("Restaurant Reservation", "read")

	restaurant = restaurant or scope.current_restaurant()
	if not date:
		date = nowdate()

	filters = {"reservation_date": date}
	if status:
		if isinstance(status, str) and status.startswith("["):
			status = json.loads(status)
		if isinstance(status, list):
			filters["status"] = ["in", status]
		else:
			filters["status"] = status
	else:
		# An online booking its guest never confirmed is gone from the day's list (it stays on the desk, Expired)
		filters["status"] = ["!=", EXPIRED]

	reservations = scope.stamp(
		_reservations_of(
			restaurant,
			filters=filters,
			fields=[
				"name", "status", "reservation_date", "reservation_time",
				"end_time", "duration", "no_of_guests", "guest_name",
				"phone", "email", "customer", "channel", "notes",
			],
			order_by="reservation_time asc",
		),
		restaurant,
	)

	# Attach tables for each reservation, each with the label of its room (`area_name`) beside the room's name
	for res in reservations:
		res["tables"] = frappe.get_all(
			"Restaurant Reservation Table",
			filters={"parent": res["name"]},
			fields=["restaurant_table", "table_name", "area", "capacity"],
		)
	area_labels = scope.labels_of(
		"Restaurant Area", "area_name", {t.area for res in reservations for t in res["tables"]}
	)
	for res in reservations:
		for t in res["tables"]:
			t["area_name"] = area_labels.get(t.area) or t.area

	# Filter by area if specified
	if area:
		reservations = [
			r for r in reservations
			if any(t.get("area") == area for t in r.get("tables", []))
		]

	return reservations


@frappe.whitelist()
def create_reservation(
	reservation_date,
	reservation_time,
	no_of_guests,
	guest_name,
	tables=None,
	phone=None,
	email=None,
	customer=None,
	channel="Phone",
	notes=None,
	duration=None,
	force=False,
	restaurant=None,
):
	"""Create a reservation from POS (status=Confirmed, skips Pending), in the restaurant named or the till's own."""
	permissions.require("Restaurant Reservation", "create")

	if isinstance(tables, str):
		tables = json.loads(tables)

	# The reservation belongs to the restaurant of the till that takes it
	settings = get_restaurant_settings(restaurant or scope.current_restaurant())
	if not duration:
		duration = settings.default_reservation_duration or 5400

	# Ensure duration is in seconds (float) for the Duration field
	duration = _parse_duration(duration)

	# Check overlap (warn but allow force from POS)
	if tables and not force:
		from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap
		conflicts = check_overlap(
			tables=tables,
			date=reservation_date,
			time=reservation_time,
			duration=duration,
		)
		if conflicts:
			return {
				"status": "conflict",
				"conflicts": conflicts,
				"message": _("Overlapping reservations found. Force to override."),
			}

	doc = frappe.get_doc({
		"doctype": "Restaurant Reservation",
		"restaurant": settings.get("name"),
		"status": "Confirmed",
		"reservation_date": reservation_date,
		"reservation_time": reservation_time,
		"duration": duration,
		"no_of_guests": int(no_of_guests),
		"guest_name": guest_name,
		"phone": phone,
		"email": email,
		"customer": customer,
		"channel": channel,
		"notes": notes,
		"tables": [{"restaurant_table": t} for t in (tables or [])],
	})
	doc.insert()

	frappe.publish_realtime("reservation_update")

	return {"status": "ok", "name": doc.name}


@frappe.whitelist()
def update_reservation_status(name, status, force=False):
	"""Update reservation status (check-in, cancel, no-show, complete)."""
	permissions.require("Restaurant Reservation", "write", name)

	doc = frappe.get_doc("Restaurant Reservation", name)
	old_status = doc.status

	# An online booking whose guest did not confirm it in time has let its tables go: it can be cancelled, not revived
	# (another booking may hold its tables by now). One whose guest may still confirm it is no no-show of his.
	if status != "Cancelled" and hold_has_expired(doc):
		frappe.throw(_("This online reservation expired before the guest confirmed it"))
	if status == "No Show" and awaits_its_guest(doc):
		frappe.throw(
			_("The guest has not confirmed this online reservation: it cannot be marked as a no-show")
		)

	# Validate transitions
	valid_transitions = {
		"Pending": ["Confirmed", "Cancelled"],
		"Confirmed": ["Seated", "Cancelled", "No Show"],
		"Seated": ["Completed", "Cancelled"],
	}
	allowed = valid_transitions.get(old_status, [])
	if status not in allowed:
		frappe.throw(
			_("Cannot change status from {0} to {1}").format(old_status, status)
		)

	doc.status = status
	if status == "Confirmed" and awaits_its_guest(doc):
		# The restaurant confirms the booking itself: it is its booking now, which no deadline expires
		doc.verification_deadline = None
	doc.save()

	return {"status": "ok", "name": doc.name, "new_status": status}


@frappe.whitelist()
def check_table_availability(tables, date, time, duration, exclude=None):
	"""Check table availability for a given slot."""
	# It names the guests already booked on those tables: whoever reads the reservations, from a desk account
	permissions.require("Restaurant Reservation", "read")
	if isinstance(tables, str):
		tables = json.loads(tables)

	from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap
	conflicts = check_overlap(
		tables=tables,
		date=date,
		time=time,
		duration=duration,
		exclude=exclude,
	)

	return {
		"available": len(conflicts) == 0,
		"conflicts": conflicts,
	}


@frappe.whitelist()
def get_reservation_stats(from_date, to_date, restaurant=None):
	"""Get the reservation statistics of one restaurant (the till's own unless one is named) for a date range."""
	permissions.require("Restaurant Reservation", "read")

	reservations = _reservations_of(
		restaurant or scope.current_restaurant(),
		filters={
			"reservation_date": ["between", [from_date, to_date]],
			# A booking its guest never confirmed was never one of the restaurant's: no booking, no no-show
			"status": ["!=", EXPIRED],
		},
		fields=["status", "channel", "no_of_guests", "reservation_date"],
	)

	# Aggregate stats
	total = len(reservations)
	by_status = {}
	by_channel = {}
	total_guests = 0

	for r in reservations:
		by_status[r.status] = by_status.get(r.status, 0) + 1
		by_channel[r.channel] = by_channel.get(r.channel, 0) + 1
		total_guests += r.no_of_guests or 0

	return {
		"total": total,
		"total_guests": total_guests,
		"by_status": by_status,
		"by_channel": by_channel,
		"no_show_rate": round((by_status.get("No Show", 0) / total * 100), 1) if total else 0,
	}


# ==========================================
# Public guest endpoints
# ==========================================


@frappe.whitelist(allow_guest=True)
def get_available_slots(date, restaurant=None):
	"""Return available time slots for a given date based on the opening hours of the restaurant.

	A visitor names no restaurant on a site with one; the default restaurant answers.
	"""
	# Nothing of the restaurant shows where the site does not run NeoRestau (NeoRestau lot 1, task 4)
	require_neorestau()

	settings = get_restaurant_settings(restaurant or scope.current_restaurant())
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	if not settings.opening_hours:
		return {"slots": []}

	day_name = datetime.strptime(str(date), "%Y-%m-%d").strftime("%A")
	slots = []

	for row in settings.opening_hours:
		if row.day_of_week == day_name:
			slots.append({
				"from_time": str(row.from_time),
				"to_time": str(row.to_time),
				"label": row.label or "",
			})

	return {"slots": slots}


@frappe.whitelist(allow_guest=True)
def get_available_tables(date, time, duration=None, no_of_guests=None, restaurant=None):
	"""Return the restaurant's tables with their availability status for a given slot.

	A visitor names no restaurant on a site with one; the default restaurant answers. He learns which tables are free
	for the slot he asks, for the restaurant's own duration, and nothing of the guests who hold the others
	(VISITOR_TABLE_FIELDS); whoever reads the restaurant's reservations from a desk account sees who holds them.
	"""
	# Nothing of the restaurant shows where the site does not run NeoRestau (NeoRestau lot 1, task 4)
	require_neorestau()

	restaurant = restaurant or scope.current_restaurant()
	settings = get_restaurant_settings(restaurant)
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	staff = _reads_the_reservations_of(settings.get("name"))
	if not duration or not staff:
		# A visitor asks about the slot a booking would take, not about any window he likes
		duration = settings.default_reservation_duration or 5400

	# Get the restaurant's tables grouped by area
	tables = scope.stamp(
		frappe.get_all(
			"Restaurant Table",
			or_filters=scope.restaurant_or_filters(restaurant),
			fields=["name", "table_name", "area", "capacity", "status"],
			order_by="area asc, table_name asc",
		),
		restaurant,
	)
	area_labels = scope.labels_of("Restaurant Area", "area_name", {t.area for t in tables})
	for table in tables:
		table["area_name"] = area_labels.get(table.area) or table.area

	# Get existing reservations for this slot
	from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap

	result = []
	for table in tables:
		conflicts = check_overlap(
			tables=[table.name],
			date=date,
			time=time,
			duration=duration,
		)
		table["available"] = len(conflicts) == 0
		table["conflicts"] = conflicts
		result.append(table)

	if not staff:
		result = [{field: table[field] for field in VISITOR_TABLE_FIELDS} for table in result]
	return {"tables": result}


@frappe.whitelist(allow_guest=True, methods=["POST"])
def submit_guest_reservation(
	reservation_date,
	reservation_time,
	no_of_guests,
	guest_name,
	phone,
	email,
	tables=None,
	notes=None,
	duration=None,
	restaurant=None,
	subject=None,
):
	"""Create a reservation from the public web form, in the restaurant named (the default restaurant otherwise).

	The booking waits for its guest to confirm it from the e-mail until the restaurant's deadline, then expires. The
	form takes one address, a name that is only a name, and so many bookings per visitor, per address and per site
	(GUEST_LIMITS); `subject` is a field the page hides from people: a booking that fills it is answered like any other,
	and nothing is written nor mailed. A refused booking writes nothing and mails nothing.
	"""
	# Nothing of the restaurant shows where the site does not run NeoRestau (NeoRestau lot 1, task 4)
	require_neorestau()

	settings = get_restaurant_settings(restaurant or scope.current_restaurant())
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	email = _one_address(email)
	guest_name = _only_a_name(guest_name)
	# Whoever asks is counted, a script that fills the hidden field as well
	_enforce_guest_limits()

	if (subject or "").strip():
		# Only a script fills a field nobody sees: it is told what a guest is told, and nothing happens
		return _booking_received()

	if isinstance(tables, str):
		tables = json.loads(tables)

	# At most 3 bookings to come per address; refused in the words of the limits, so that the answer tells a stranger
	# nothing about the bookings of an address
	active_count = frappe.db.count(
		"Restaurant Reservation",
		filters={
			"email": email,
			"status": ["in", HOLD_STATUSES],
			"reservation_date": [">=", nowdate()],
		},
	)
	if active_count >= 3:
		_refuse_too_many()

	if not duration:
		duration = settings.default_reservation_duration or 5400
	duration = _parse_duration(duration)

	# Strict overlap check for web (no force override)
	if tables:
		from pos_next.pos_next.doctype.restaurant_reservation.restaurant_reservation import check_overlap
		conflicts = check_overlap(
			tables=tables,
			date=reservation_date,
			time=reservation_time,
			duration=duration,
		)
		if conflicts:
			frappe.throw(_("Selected tables are not available at the requested time"))

	# The mail about to leave is counted against its address and against the site's budget
	_enforce_guest_limits(email)

	# Determine initial status
	require_validation = settings.require_reservation_validation
	initial_status = "Pending" if require_validation else "Confirmed"

	# Generate verification token
	token = secrets.token_urlsafe(32)

	# No customer is made for a booking nobody has confirmed yet: the guest's confirmation makes it (verify_reservation)
	doc = frappe.get_doc({
		"doctype": "Restaurant Reservation",
		"restaurant": settings.get("name"),
		"status": initial_status,
		"reservation_date": reservation_date,
		"reservation_time": reservation_time,
		"duration": duration,
		"no_of_guests": int(no_of_guests),
		"guest_name": guest_name,
		"phone": phone,
		"email": email,
		"channel": "Internet",
		"notes": notes,
		"tables": [{"restaurant_table": t} for t in (tables or [])],
		"verification_token": token,
		"verified": 0,
		"verification_deadline": add_to_date(now_datetime(), minutes=_confirmation_minutes(settings)),
	})
	doc.insert(ignore_permissions=True)

	# Send verification email
	_send_verification_email(doc)

	frappe.publish_realtime("reservation_update")

	return {**_booking_received(), "name": doc.name}


def _booking_received():
	"""What the public form answers a booking it took: the same words whatever became of it."""
	return {
		"status": "ok",
		"requires_verification": True,
		"message": _("Please check your email to confirm the reservation"),
	}


@frappe.whitelist(allow_guest=True)
def verify_reservation(token):
	"""Verify a reservation via email token (double opt-in), before the deadline its restaurant gives the guest."""
	if not token:
		frappe.throw(_("Invalid verification token"))

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={"verification_token": token, "verified": 0},
		fields=["name", "status", "verified", "verification_deadline"],
		limit=1,
	)

	if not reservations:
		frappe.throw(_("Invalid or expired verification token"))

	# A booking confirmed too late has let its tables go, and another guest may hold them by now: it is not revived
	if reservations[0].status == EXPIRED or hold_has_expired(reservations[0]):
		frappe.throw(_("This reservation request has expired. Please book again."))

	doc = frappe.get_doc("Restaurant Reservation", reservations[0].name)
	doc.verified = 1
	if not doc.customer:
		# The guest has shown the address is his: he is a customer now
		doc.customer = _find_or_create_customer(doc.guest_name, doc.email, doc.phone)
	doc.save(ignore_permissions=True)

	# Send confirmation emails
	_send_confirmation_email(doc)

	return {
		"status": "ok",
		"name": doc.name,
		"message": _("Reservation confirmed successfully"),
	}


# ==========================================
# Guards of the public form
# ==========================================


def _reads_the_reservations_of(restaurant) -> bool:
	"""Whether the caller may see who holds the tables of a restaurant: a desk account that reads its reservations.

	A visitor and a portal account never do (check_table_availability asks the same of whoever names the guests).
	"""
	from pos_next.api.cash_entry import is_desk_account

	if not is_desk_account() or not frappe.has_permission("Restaurant Reservation", "read"):
		return False
	return not restaurant or bool(frappe.has_permission("Restaurant", "read", doc=restaurant))


def _one_address(email) -> str:
	"""The one address a booking is mailed to, in lower case: a list, a display name or anything but a plain address
	is refused, so that one booking never mails two people."""
	address = (email or "").strip().lower()
	if (
		not address
		or any(character.isspace() or character in ",;<>" for character in address)
		or validate_email_address(address) != address
	):
		frappe.throw(_("Please enter a valid email address"), frappe.InvalidEmailAddressError)
	return address


def _only_a_name(guest_name) -> str:
	"""The guest's name as the form takes it: words, at most GUEST_NAME_MAX characters, no link, address nor markup."""
	name = " ".join((guest_name or "").split())
	if not name or len(name) > GUEST_NAME_MAX or NOT_A_NAME.search(name):
		frappe.throw(
			_("Please enter your name only (at most {0} characters, no link)").format(GUEST_NAME_MAX)
		)
	return name


def _confirmation_minutes(settings) -> int:
	"""The minutes a guest of this restaurant has to confirm an online booking from the e-mail."""
	minutes = cint(settings.get("unconfirmed_reservation_expiry"))
	return minutes if minutes > 0 else DEFAULT_CONFIRMATION_MINUTES


def _enforce_guest_limits(address=None) -> None:
	"""Count a booking asked on the public form, and refuse it past a limit of GUEST_LIMITS.

	Without an address it counts the visitor, for every booking he asks; with one, the mail about to leave, against that
	address and then against the site's budget. A booking refused at one stage is not counted at the next: a visitor
	over his own limit, or a script caught by the hidden field, spends nothing of an address's nor of the site's. A call
	made inside the server (a console, a job, a test) is no visitor and is not counted, as Frappe's own rate limiter lets
	it through.
	"""
	ip = _visitor_ip()
	if ip is None:
		return
	limits = _guest_limits()
	stages = (("ip", _hashed(ip)),) if address is None else (("address", _hashed(address)), ("site", "*"))
	for stage, who in stages:
		counted = [
			_count(kind, who, window) > allowed
			for kind, (allowed, window) in limits.items()
			if kind.startswith(stage + "_")
		]
		if any(counted):
			_refuse_too_many()


def _refuse_too_many():
	"""The one refusal for every limit of the public form: it never says which limit, nor whose."""
	frappe.throw(
		_("Too many reservation requests. Please try again later or call the restaurant."),
		frappe.RateLimitExceededError,
	)


def _visitor_ip() -> str | None:
	"""The address the visitor calls from (an IPv6 one by its /64 network, which one subscriber holds whole); None for a
	call made inside the server, which no HTTP request carries."""
	if getattr(frappe.local, "request", None) is None:
		return None
	ip = getattr(frappe.local, "request_ip", None) or ""
	try:
		parsed = ipaddress.ip_address(ip)
	except ValueError:
		return ip
	if parsed.version == 6:
		return str(ipaddress.ip_network(f"{parsed}/64", strict=False).network_address)
	return str(parsed)


def _guest_limits() -> dict:
	"""GUEST_LIMITS, with the entries the site config (`guest_reservation_limits`) overrides."""
	limits = dict(GUEST_LIMITS)
	for kind, pair in (frappe.conf.get("guest_reservation_limits") or {}).items():
		if kind in limits and len(pair) == 2:
			limits[kind] = (cint(pair[0]), cint(pair[1]) or limits[kind][1])
	return limits


def _hashed(value) -> str:
	"""A visitor's address and an e-mail address are counted under a keyed hash, never written as they are."""
	secret = (frappe.conf.get("encryption_key") or frappe.local.site or "pos_next").encode()
	return hmac.new(secret, str(value).encode(), hashlib.sha256).hexdigest()[:20]


def _count(kind, who, window) -> int:
	"""Count one more booking in the fixed window it falls in; how many that window holds now."""
	key = frappe.cache.make_key(f"{LIMIT_KEY}{kind}:{who}:{int(epoch_seconds() // window)}")
	count = frappe.cache.incr(key)
	if count == 1:
		frappe.cache.expire(key, window + 60)
	return int(count)


# ==========================================
# Scheduler jobs
# ==========================================


def send_reminders():
	"""Scheduled job: send reminder emails for upcoming reservations, restaurant by restaurant."""
	for restaurant in frappe.get_all("Restaurant", filters={"enable_reservations": 1}, pluck="name"):
		_send_reminders_of(restaurant)


def _send_reminders_of(restaurant):
	"""Remind the guests of one restaurant, within the reminder window that restaurant sets."""
	settings = get_restaurant_settings(restaurant)
	reminder_hours = settings.reservation_reminder_hours or 3
	now = now_datetime()
	reminder_cutoff = add_to_date(now, hours=reminder_hours)

	reservations = _reservations_of(
		restaurant,
		filters={
			"status": "Confirmed",
			"reminder_sent": 0,
			"reservation_date": getdate(reminder_cutoff),
			"email": ["is", "set"],
		},
		fields=["name", "reservation_time", "reservation_date", "verified", "verification_deadline"],
	)

	for res in reservations:
		if awaits_its_guest(res):
			# Nobody has shown this address is theirs: it gets the one mail that asks, never a second
			continue
		# Check if reservation is within reminder window
		res_datetime = datetime.combine(
			getdate(res.reservation_date),
			get_time(res.reservation_time),
		)
		if now <= res_datetime <= reminder_cutoff:
			doc = frappe.get_doc("Restaurant Reservation", res.name)
			_send_reminder_email(doc)
			frappe.db.set_value("Restaurant Reservation", res.name, "reminder_sent", 1)

	frappe.db.commit()


def auto_no_show():
	"""Scheduled job: mark overdue confirmed reservations as No Show, restaurant by restaurant."""
	for restaurant in frappe.get_all("Restaurant", filters={"enable_reservations": 1}, pluck="name"):
		_mark_no_shows_of(restaurant)


def _mark_no_shows_of(restaurant):
	"""Mark the overdue reservations of one restaurant, after the no-show delay that restaurant sets."""
	settings = get_restaurant_settings(restaurant)
	delay_minutes = settings.no_show_delay or 60
	now = now_datetime()

	reservations = _reservations_of(
		restaurant,
		filters={
			"status": "Confirmed",
			"reservation_date": ["<=", nowdate()],
		},
		fields=["name", "reservation_time", "reservation_date", "verified", "verification_deadline"],
	)

	for res in reservations:
		if awaits_its_guest(res):
			# A guest who never confirmed his booking did not fail to come: it expires (expire_unconfirmed_reservations)
			continue
		res_datetime = datetime.combine(
			getdate(res.reservation_date),
			get_time(res.reservation_time),
		)
		cutoff = res_datetime + timedelta(minutes=delay_minutes)

		if now > cutoff:
			frappe.db.set_value("Restaurant Reservation", res.name, "status", "No Show")
			frappe.publish_realtime("reservation_update")

	frappe.db.commit()


def expire_unconfirmed_reservations():
	"""Scheduled job (every five minutes): an online booking whose guest did not confirm it by its deadline expires.

	It held nothing from its deadline on already (check_overlap); the job writes it down, so that the till's list and the
	statistics no longer count it. Whatever its restaurant's settings are now: the deadline was set when it was made.
	"""
	expired = frappe.get_all(
		"Restaurant Reservation",
		filters=[
			["verified", "=", 0],
			# Frappe compares `ifnull(verification_deadline, '') <= now`, which no deadline at all satisfies: without
			# this line every booking taken at the till, or confirmed by a manager, would read as past its deadline
			["verification_deadline", "is", "set"],
			["verification_deadline", "<=", now_datetime()],
			["status", "in", HOLD_STATUSES],
		],
		pluck="name",
	)
	for name in expired:
		frappe.db.set_value("Restaurant Reservation", name, "status", EXPIRED)
	if expired:
		frappe.db.commit()
		frappe.publish_realtime("reservation_update")


def _reservations_of(restaurant, filters, fields, **options):
	"""The reservations of a restaurant; one that names none belongs to the default restaurant."""
	return frappe.get_all(
		"Restaurant Reservation",
		filters=filters,
		or_filters=scope.restaurant_or_filters(restaurant),
		fields=fields,
		**options,
	)


# ==========================================
# Email helpers
# ==========================================


def _send_verification_email(reservation):
	"""Send double opt-in verification email to the guest.

	It goes to an address nobody has confirmed yet: it says only what the restaurant says, with the facts of the
	booking (date, time, number of guests), never a word the visitor typed - his name, his remark, his phone.
	"""
	if not reservation.email:
		return

	site_url = frappe.utils.get_url()
	verify_url = (
		f"{site_url}/api/method/pos_next.api.reservations.verify_reservation"
		f"?token={reservation.verification_token}"
	)

	settings = get_restaurant_settings(restaurant_of(reservation))
	restaurant_name = settings.get("restaurant_name") or settings.get("name") or ""
	subject = _("Confirm your reservation at {0}").format(restaurant_name)
	message = escape_html(
		_("Please confirm your reservation at {0} on {1} at {2} for {3} guests.").format(
			restaurant_name,
			frappe.format(reservation.reservation_date, {"fieldtype": "Date"}),
			get_time(reservation.reservation_time).strftime("%H:%M"),
			cint(reservation.no_of_guests),
		)
	)
	message += f"<br><br><a href='{verify_url}'>{escape_html(_('Click here to confirm'))}</a>"
	message += "<br><br>" + escape_html(
		_("If you did not ask for this reservation, ignore this email: it expires by itself.")
	)

	try:
		frappe.sendmail(
			recipients=[reservation.email],
			subject=subject,
			message=message,
			now=True,
		)
	except Exception as e:
		frappe.log_error("Reservation verification email failed", str(e))


def _send_confirmation_email(reservation):
	"""Send confirmation email to guest and restaurant."""
	if not reservation.email:
		return

	subject = _("Reservation Confirmed - {0}").format(reservation.guest_name)
	message = _(
		"Your reservation has been confirmed:\n\n"
		"Name: {0}\nDate: {1}\nTime: {2}\nGuests: {3}"
	).format(
		reservation.guest_name,
		frappe.format(reservation.reservation_date, {"fieldtype": "Date"}),
		reservation.reservation_time,
		reservation.no_of_guests,
	)

	try:
		# Email to guest
		frappe.sendmail(
			recipients=[reservation.email],
			subject=subject,
			message=message,
			now=True,
		)

		# Email to restaurant
		settings = get_restaurant_settings(restaurant_of(reservation))
		if settings.restaurant_email:
			restaurant_subject = _("New Reservation - {0} ({1} guests)").format(
				reservation.guest_name, reservation.no_of_guests
			)
			frappe.sendmail(
				recipients=[settings.restaurant_email],
				subject=restaurant_subject,
				message=message,
				now=True,
			)
	except Exception as e:
		frappe.log_error("Reservation confirmation email failed", str(e))


def _send_reminder_email(reservation):
	"""Send reminder email to the guest."""
	if not reservation.email:
		return

	subject = _("Reminder: Reservation today at {0}").format(reservation.reservation_time)
	message = _(
		"This is a reminder for your reservation today:\n\n"
		"Name: {0}\nTime: {1}\nGuests: {2}"
	).format(
		reservation.guest_name,
		reservation.reservation_time,
		reservation.no_of_guests,
	)

	try:
		frappe.sendmail(
			recipients=[reservation.email],
			subject=subject,
			message=message,
			now=True,
		)
	except Exception as e:
		frappe.log_error("Reservation reminder email failed", str(e))


def _send_cancellation_email(reservation):
	"""Send cancellation email to guest and restaurant."""
	if not reservation.email:
		return

	subject = _("Reservation Cancelled - {0}").format(reservation.guest_name)
	message = _(
		"Your reservation has been cancelled:\n\n"
		"Name: {0}\nDate: {1}\nTime: {2}"
	).format(
		reservation.guest_name,
		frappe.format(reservation.reservation_date, {"fieldtype": "Date"}),
		reservation.reservation_time,
	)

	try:
		frappe.sendmail(
			recipients=[reservation.email],
			subject=subject,
			message=message,
			now=True,
		)

		settings = get_restaurant_settings(restaurant_of(reservation))
		if settings.restaurant_email:
			frappe.sendmail(
				recipients=[settings.restaurant_email],
				subject=subject,
				message=message,
				now=True,
			)
	except Exception as e:
		frappe.log_error("Reservation cancellation email failed", str(e))


# ==========================================
# Customer helpers
# ==========================================


def _find_or_create_customer(name, email, phone):
	"""Find existing customer by email/phone or create a new one."""
	# Try matching by email first
	if email:
		customers = frappe.get_all(
			"Customer",
			filters={"email_id": email},
			fields=["name"],
			limit=1,
		)
		if customers:
			return customers[0].name

	# Try matching by phone
	if phone:
		# Check in Dynamic Link contacts
		contacts = frappe.get_all(
			"Contact",
			filters={"phone": phone},
			fields=["name"],
			limit=1,
		)
		if contacts:
			links = frappe.get_all(
				"Dynamic Link",
				filters={
					"parent": contacts[0].name,
					"parenttype": "Contact",
					"link_doctype": "Customer",
				},
				fields=["link_name"],
				limit=1,
			)
			if links:
				return links[0].link_name

	# Create new customer
	try:
		customer = frappe.get_doc({
			"doctype": "Customer",
			"customer_name": name,
			"customer_type": "Individual",
			"customer_group": frappe.db.get_single_value("Selling Settings", "customer_group"),
			"territory": frappe.db.get_single_value("Selling Settings", "territory"),
			"email_id": email,
			"mobile_no": phone,
		})
		customer.insert(ignore_permissions=True)
		return customer.name
	except Exception as e:
		frappe.log_error("Customer creation from reservation failed", str(e))
		return None
