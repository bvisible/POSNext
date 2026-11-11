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
# //// confirms expires instead of holding its tables (NeoResto lot 1, task 18).
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
from datetime import datetime, timedelta
from time import time as epoch_seconds

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
from pos_next.restaurant import direct_service, permissions, scope
from pos_next.restaurant.mode import require_neoresto
from pos_next.restaurant.settings import get_restaurant_settings, restaurant_of

# What a visitor reads of a table on the public form: which one it is, its label, its seats, and whether it is free
# for the slot he asks. Never who holds it, nor when.
VISITOR_TABLE_FIELDS = ("name", "table_name", "capacity", "available")

# How many bookings the public form takes, as (count, window in seconds): per visitor (the connection nginx accepted,
# an IPv6 one by its /64 network), per mailbox, and for the whole site, each counted in fixed windows; and how many
# confirmation links one visitor may try. A booking mails an address nobody has confirmed yet: whatever the visitors,
# the site never mails more than its own budget.
# `guest_reservation_limits` in the site config overrides any entry, e.g. {"site_day": [400, 86400]}.
GUEST_LIMITS = {
	"ip_minute": (3, 60),
	"ip_hour": (10, 3600),
	"ip_day": (20, 86400),
	"address_hour": (3, 3600),
	"address_day": (5, 86400),
	"site_hour": (40, 3600),
	"site_day": (200, 86400),
	# A guest opens his link once or twice, a mail scanner a few times more
	"verify_minute": (10, 60),
	"verify_day": (60, 86400),
}
LIMIT_KEY = "pos_next:guest_reservation_limit:"
# What a visitor's address is counted under when no address can be read: one bucket, never one per value written
UNKNOWN_VISITOR = "unknown"
# The minutes a guest has to confirm an online booking from the e-mail, when his restaurant sets none
DEFAULT_CONFIRMATION_MINUTES = 30
# The longest name the public form takes, and what a name never holds: a link, an address, markup
GUEST_NAME_MAX = 80
NOT_A_NAME = re.compile(r"https?:|://|www\.|@|<|>", re.IGNORECASE)
# The most tables one online booking may name
GUEST_TABLES_MAX = 20
# The step of the times the booking page offers, from the start of each opening window (GuestReservation.vue,
# `timeOptions`): a visitor asks about those times only
OFFERED_STEP_MINUTES = 30
# The one form of a date the booking page writes, ASCII digits only (a date input's value)
PAGE_DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


# ==========================================
# Authenticated POS endpoints
# ==========================================


@frappe.whitelist()
def get_reservations(date=None, area=None, status=None, restaurant=None):
	"""Get the reservations of one restaurant (the till's own unless one is named) for a date, with optional filters."""
	# Whoever reads the reservations (a cashier, a manager), from a desk account (NeoResto lot 1, task 3)
	permissions.require("Restaurant Reservation", "read")

	restaurant = restaurant or scope.current_restaurant()
	# //// Neoffice — the restaurant's own rule (maintenance#2296): `frappe.get_all` reads no User Permission,
	# //// so a user kept to one restaurant read the guests of another by naming it
	permissions.require_restaurant(restaurant)
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
				"verified", "verification_deadline",
			],
			order_by="reservation_time asc",
		),
		restaurant,
	)

	for res in reservations:
		# An online booking its guest has not confirmed from the e-mail yet: the till may confirm it for him (he phoned)
		res["awaits_guest"] = awaits_its_guest(res)
		res.pop("verified", None)
		res.pop("verification_deadline", None)

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
# //// Neoffice — a name is a text: a list from a JSON body would be read as a filter (maintenance#2296).
def update_reservation_status(name: str | None, status, force=False):
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

	if status == old_status == "Confirmed" and awaits_its_guest(doc):
		# A restaurant that does not validate online bookings confirms one for its guest (he phoned): it is the
		# restaurant's booking now, which no deadline expires
		doc.verification_deadline = None
		doc.save()
		return {"status": "ok", "name": doc.name, "new_status": status}

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
	if awaits_its_guest(doc):
		# Whatever the till does to an online booking (confirms it, seats its guest, cancels it), the restaurant has
		# dealt with it: it is the restaurant's booking now, which no deadline expires
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
	# //// Neoffice — each table is named by a text, and read by whoever may read its restaurant: the answer
	# //// names the guests booked on them (maintenance#2296).
	for table in tables or []:
		if not isinstance(table, str):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		permissions.require_restaurant(scope.restaurant_of_record("Restaurant Table", table))

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

	# //// Neoffice — the restaurant's own rule, see get_reservations (maintenance#2296)
	restaurant = restaurant or scope.current_restaurant()
	permissions.require_restaurant(restaurant)
	reservations = _reservations_of(
		restaurant,
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
def get_available_slots(date: str, restaurant: str | None = None):
	"""Return available time slots for a given date based on the opening hours of the restaurant.

	A visitor names no restaurant on a site with one; the default restaurant answers. The arguments are strings: Frappe
	checks the annotations, and a list or a dict in a JSON body would otherwise be read as a filter on the restaurants.
	"""
	# Nothing of the restaurant shows where the site does not run NeoResto (NeoResto lot 1, task 4)
	require_neoresto()

	settings = get_restaurant_settings(restaurant or scope.current_restaurant())
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	# //// Neoffice — the picture the booking page opens with comes with its slots (maintenance#1975): the page read it from
	# //// frappe.client.get_list on Company, refused to a visitor (403), so the page never showed it and logged the refusal
	logo = _visitor_logo(settings)
	if not settings.opening_hours:
		return {"slots": [], "logo": logo}

	day_name = datetime.strptime(str(date), "%Y-%m-%d").strftime("%A")
	slots = []

	for row in settings.opening_hours:
		if row.day_of_week == day_name:
			slots.append({
				"from_time": str(row.from_time),
				"to_time": str(row.to_time),
				"label": row.label or "",
			})

	return {"slots": slots, "logo": logo}


# //// Neoffice — added (maintenance#1975), see get_available_slots.
def _visitor_logo(settings) -> str:
	"""The restaurant's picture for a visitor: its own, else its company's (as on its public menu), and only one a guest can open."""
	from pos_next.api.public_menu import _public_file

	own = _public_file(settings.get("logo"))
	if own or not settings.get("company"):
		return own
	return _public_file(frappe.db.get_value("Company", settings.get("company"), "company_logo"))


@frappe.whitelist(allow_guest=True)
def get_available_tables(
	date: str, time: str, duration=None, no_of_guests=None, restaurant: str | None = None
):
	"""Return the restaurant's tables with their availability status for a given slot.

	A visitor names no restaurant on a site with one; the default restaurant answers. He learns which tables are free
	for a time the booking page offers him (_require_an_offered_time), for the restaurant's own duration, and nothing of
	the guests who hold the others (VISITOR_TABLE_FIELDS); whoever reads the restaurant's reservations from a desk
	account sees who holds them, at any time and for any duration. The date, the time and the restaurant are strings.
	"""
	# Nothing of the restaurant shows where the site does not run NeoResto (NeoResto lot 1, task 4)
	require_neoresto()

	restaurant = restaurant or scope.current_restaurant()
	settings = get_restaurant_settings(restaurant)
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	staff = _reads_the_reservations_of(settings.get("name"))
	if not staff:
		# A visitor asks about a time the page offers him, for the slot a booking would take: not about any instant or
		# any window he likes, one second at a time, which would draw the other guests' bookings
		_require_an_offered_time(settings, date, time)
		duration = settings.default_reservation_duration or 5400
	elif not duration:
		duration = settings.default_reservation_duration or 5400

	# Get the restaurant's tables grouped by area
	tables = scope.stamp(
		frappe.get_all(
			"Restaurant Table",
			# //// Neoffice — a table of direct service (a bar, a counter) is not a table to book (the product owner, 08.11.2026)
			filters=direct_service.not_direct(),
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
	reservation_date: str,
	reservation_time: str,
	no_of_guests: int,
	guest_name: str,
	phone: str,
	email: str,
	tables: str | None = None,
	notes: str | None = None,
	restaurant: str | None = None,
	subject: str | None = None,
):
	"""Create a reservation from the public web form, in the restaurant named (the default restaurant otherwise).

	The booking waits for its guest to confirm it from the e-mail until the restaurant's deadline, then expires. It
	lasts the restaurant's duration (a visitor does not choose how long he keeps a table) and is asked at a date and a
	time the page offers, written as the page writes them. The form takes strings where it expects them, a number of
	guests (Frappe casts "2" and 2.0 and refuses text; this refuses fewer than one), a JSON list of the restaurant's own
	table names, one address, a name that is only a name, and so many bookings per visitor, per mailbox and per site
	(GUEST_LIMITS); `subject` is a field the page hides from people: a booking that fills it is
	answered like any other, and nothing is written nor mailed. A refused booking writes nothing, mails nothing and
	tells no till. The answer never names the booking.
	"""
	# Nothing of the restaurant shows where the site does not run NeoResto (NeoResto lot 1, task 4)
	require_neoresto()

	settings = get_restaurant_settings(restaurant or scope.current_restaurant())
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	email = _one_address(email)
	guest_name = _only_a_name(guest_name)
	# Whoever asks is counted, a script that fills the hidden field as well
	_count_the_visitor()

	if (subject or "").strip():
		# Only a script fills a field nobody sees: it is told what a guest is told, and nothing happens
		return _booking_received()

	tables = _the_tables(tables, settings.get("name"))
	if cint(no_of_guests) < 1:
		# The statistics add the guests up: a booking for nobody, or for fewer than nobody, is no booking
		frappe.throw(_("Please enter the number of guests"))

	# //// Neoffice — the time first: read after the count below, a time the page does not offer gave a
	# //// stranger, with no booking and no mail, one bit about any address (refused by the limits, or by the
	# //// time) (maintenance#2296).
	if not _reads_the_reservations_of(settings.get("name")):
		# At a time the page offers, before the tables are looked at: « not available » answered at any second
		# would
		# draw the other guests' bookings (a staff account testing the page books at any time, as at the till)
		_require_an_offered_time(settings, reservation_date, reservation_time)

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

	# The restaurant's duration: a visitor who chose his own could keep every table from the opening to midnight
	duration = _parse_duration(settings.default_reservation_duration or 5400)

	# //// Neoffice — the time the page offers is checked above, before the count of the address
	# //// (maintenance#2296).
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
	frappe.db.savepoint("guest_reservation")
	doc.insert(ignore_permissions=True)
	try:
		# The mail about to leave is counted against its mailbox and against the site's budget once the booking has
		# passed every rule of the restaurant (its date, its hours, its tables): a refused booking spends nothing
		_count_the_mail(email)
	except frappe.RateLimitExceededError:
		frappe.db.rollback(save_point="guest_reservation")
		raise

	# Send verification email
	_send_verification_email(doc)

	# The tills hear of the booking once it is committed: never of one the request ends up rolling back
	frappe.publish_realtime("reservation_update", after_commit=True)

	# The answer never names the booking: a number that counts the restaurant's bookings, and one a script caught by the
	# hidden field would not get
	return _booking_received()


def _booking_received():
	"""What the public form answers a booking it took: the same words whatever became of it."""
	return {
		"status": "ok",
		"requires_verification": True,
		"message": _("Please check your email to confirm the reservation"),
	}


@frappe.whitelist(allow_guest=True)
def verify_reservation(token: str):
	"""Verify a reservation via email token (double opt-in), before the deadline its restaurant gives the guest.

	The token is a string (Frappe checks the annotation, and this checks it again): a JSON body keeps its types, and a
	list or a dict given as a filter value is read as an operator and a value, which would confirm whatever booking it
	matched. Every link tried is counted per visitor, and a link that confirms nothing (unknown, expired, of a booking
	that is no longer waiting) gets one and the same answer. The answer never names the booking.
	"""
	_count_the_visitor("verify")
	if not isinstance(token, str) or not token.strip():
		_refuse_the_link()

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={"verification_token": token, "verified": 0},
		fields=["name", "status", "verified", "verification_deadline"],
		limit=1,
	)

	# A booking confirmed too late has let its tables go, and another guest may hold them by now: it is not revived;
	# nor is one the till has seated, cancelled or closed
	if not reservations or reservations[0].status not in HOLD_STATUSES or hold_has_expired(reservations[0]):
		_refuse_the_link()

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
		"message": _("Reservation confirmed successfully"),
	}


def _refuse_the_link():
	"""The one answer of a confirmation link that confirms nothing, whatever the reason: no oracle on the bookings."""
	frappe.throw(_("Invalid or expired verification token"))


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
	address = email.strip().lower() if isinstance(email, str) else ""
	if (
		not address
		or any(character.isspace() or character in ",;<>" for character in address)
		or validate_email_address(address) != address
	):
		frappe.throw(_("Please enter a valid email address"), frappe.InvalidEmailAddressError)
	return address


def _mailbox(address) -> str:
	"""The mailbox an address reaches, for counting: `jane+tag@x` and `Jane@X` are one mailbox, `jane@x`."""
	local, _at, domain = address.lower().rpartition("@")
	return f"{local.split('+', 1)[0]}@{domain}"


def _only_a_name(guest_name) -> str:
	"""The guest's name as the form takes it: words, at most GUEST_NAME_MAX characters, no link, address nor markup."""
	name = " ".join(guest_name.split()) if isinstance(guest_name, str) else ""
	if not name or len(name) > GUEST_NAME_MAX or NOT_A_NAME.search(name):
		frappe.throw(
			_("Please enter your name only (at most {0} characters, no link)").format(GUEST_NAME_MAX)
		)
	return name


def _the_tables(tables, restaurant) -> list:
	"""The tables a visitor names, from the JSON list of table names the page sends: none when it sends none.

	A JSON string decodes into whatever it holds: an element that is not a name would reach the child rows, where
	Frappe's link validation reads a dict as filters, or the overlap check, where a list or a dict cannot be hashed.
	Anything but a list of at most GUEST_TABLES_MAX non-empty strings is refused, and so is a string that is no JSON
	(brackets nested so deep that the parser gives up, a RecursionError, included: a guest never gets this far with
	those, Frappe's own sanitiser fails on them first, but a signed-in account does). So is a name that is not a table
	of this restaurant, written as it is: a table that is gone, one that never was, one of another restaurant of the
	site. The answer is the one sentence, never a permission error nor the label of another restaurant's table.
	"""
	if tables is None or tables == "":
		return []
	try:
		names = json.loads(tables) if isinstance(tables, str) else tables
	except (ValueError, RecursionError):
		names = None
	if (
		not isinstance(names, list)
		or len(names) > GUEST_TABLES_MAX
		or not all(isinstance(name, str) and name.strip() for name in names)
	):
		_refuse_the_tables()
	names = list(dict.fromkeys(name.strip() for name in names))
	if names:
		of_this_restaurant = frappe.get_all(
			"Restaurant Table",
			filters={"name": ["in", names]},
			or_filters=scope.restaurant_or_filters(restaurant),
			pluck="name",
		)
		if set(of_this_restaurant) != set(names):
			_refuse_the_tables()
	return names


def _refuse_the_tables():
	frappe.throw(_("Please choose your tables among those offered"))


def _require_an_offered_time(settings, date, time) -> None:
	"""Refuse a visitor's date and time that the booking page does not offer on that day (_offered_times).

	The date and the time are read exactly as the page writes them, `YYYY-MM-DD` and `HH:MM:SS`, and not otherwise: a
	lenient reading ("8:30 PM", "20:30", a time zone, "11/07/2026" for the 7th of November) would pass this check and
	then reach the strict parsing of the reservation, where it fails as a server error, or book a day or an hour the
	visitor did not mean. A date that is no day of the calendar ("0000-00-00") is refused the same way.
	"""
	try:
		day = datetime.strptime(date, "%Y-%m-%d") if PAGE_DATE.fullmatch(date) else None
		offered = _offered_times(settings, day) if day else set()
	except (TypeError, ValueError, frappe.ValidationError):
		offered = set()
	if not isinstance(time, str) or time not in offered:
		frappe.throw(_("Please choose one of the times offered for this day"))


def _offered_times(settings, day) -> set:
	"""The times ("HH:MM:SS") the booking page offers on `day`, as `timeOptions` of GuestReservation.vue lists them from
	the day's opening windows (get_available_slots): from the start of each window, every OFFERED_STEP_MINUTES, up to its
	end included; seconds are ignored, and a window that ends before it starts (past midnight) offers nothing."""
	weekday = day.strftime("%A")
	offered = set()
	for row in settings.get("opening_hours") or []:
		if row.get("day_of_week") != weekday:
			continue
		opens, closes = get_time(row.get("from_time")), get_time(row.get("to_time"))
		start, end = opens.hour * 60 + opens.minute, closes.hour * 60 + closes.minute
		for minute in range(start, end + 1, OFFERED_STEP_MINUTES):
			offered.add(f"{minute // 60:02d}:{minute % 60:02d}:00")
	return offered


def _confirmation_minutes(settings) -> int:
	"""The minutes a guest of this restaurant has to confirm an online booking from the e-mail."""
	minutes = cint(settings.get("unconfirmed_reservation_expiry"))
	return minutes if minutes > 0 else DEFAULT_CONFIRMATION_MINUTES


def _count_the_visitor(stage="ip") -> None:
	"""Count one more call of the visitor against the `<stage>_*` limits of GUEST_LIMITS (`ip` for the bookings he
	asks, `verify` for the confirmation links he tries), and refuse it past one.

	A call made inside the server (a console, a job, a test) is no visitor and is not counted, as Frappe's own rate
	limiter lets it through.
	"""
	ip = _visitor_ip()
	if ip is not None:
		_count_against(stage, _hashed(ip))


def _count_the_mail(address) -> None:
	"""Count the mail a booking is about to send against its mailbox, then against the site's budget, and refuse it past
	a limit. Called once the booking has passed every rule, so that a refused booking spends nothing; a booking refused
	on its mailbox is not counted against the site."""
	if _visitor_ip() is None:
		return
	_count_against("address", _hashed(_mailbox(address)))
	_count_against("site", "*")


def _count_against(stage, who) -> None:
	"""Count one more event of `who` in every `<stage>_*` window of the limits, and refuse it if any is over."""
	counted = [
		_count(kind, who, window) > allowed
		for kind, (allowed, window) in _guest_limits().items()
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
	"""The address of the connection nginx accepted, which the visitor cannot write; None for a call made inside the
	server, which no HTTP request carries.

	Frappe's `frappe.local.request_ip` is the FIRST X-Forwarded-For entry. Bench's own vhost overwrites the header with
	$remote_addr, so there is one entry and it is the peer; the vhost of a customer's website domain appends the peer
	($proxy_add_x_forwarded_for), so the first entry is whatever the caller wrote and only the last one is nginx's. The
	last entry is the peer under both (the logic of the hub's `request_peer_ip`); a request without the header did not
	come through nginx, and Frappe's own address stands. A value that is no address falls back on the connection's own
	address, then on one bucket for all: never a bucket of its own. An IPv6 address counts by its /64 network, which one
	subscriber holds whole.
	"""
	request = getattr(frappe.local, "request", None)
	if request is None:
		return None
	forwarded = frappe.get_request_header("X-Forwarded-For") or ""
	entries = [part.strip() for part in forwarded.split(",") if part.strip()]
	peer = _an_address(entries[-1] if entries else getattr(frappe.local, "request_ip", None))
	if peer is None:
		peer = _an_address(getattr(request, "remote_addr", None))
	if peer is None:
		return UNKNOWN_VISITOR
	if peer.version == 6:
		return str(ipaddress.ip_network(f"{peer}/64", strict=False).network_address)
	return str(peer)


def _an_address(value):
	"""An IP address read from `value` (an IPv4 address mapped into IPv6 as the IPv4 one), or None."""
	try:
		address = ipaddress.ip_address((value or "").strip())
	except (TypeError, ValueError):
		return None
	if address.version == 6 and address.ipv4_mapped:
		return address.ipv4_mapped
	return address


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
	"""Count one more event in the fixed window it falls in; how many that window holds now."""
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
			# Frappe compiles the next line to `ifnull(verification_deadline, '0001-01-01 00:00:00.000000') <= …`
			# (model/db_query.py, its Datetime fallback): a booking with no deadline at all satisfies it. Without this
			# line every booking taken at the till, or confirmed by the restaurant, would read as past its deadline.
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
