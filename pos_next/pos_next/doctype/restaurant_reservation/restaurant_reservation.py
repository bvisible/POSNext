# //// Neoffice — added file (no upstream equivalent). Table booking: a reservation may span several
# //// tables, walks a 5-state workflow (Pending → Confirmed → Seated → Completed / Cancelled / No
# //// Show), is checked against the configured opening hours, and takes its overlap check under a
# //// row lock before insert — two clerks booking the same table at the same minute is the normal
# //// case, not the rare one (ebc3ecc5, 2026-03-29 "restaurant reservation system with POS dialog,
# //// online booking, and email notifications"; duration parsing hardened for int / float / HH:MM:SS
# //// by ac07efed, same day). Upstream POSNext has no table service, so nothing to book.
# //// An online booking holds its tables only until the deadline its guest has to confirm it from the e-mail, then
# //// it expires: it never blocks a table nor ends as a no-show (NeoResto lot 1, task 18).
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import (
	add_to_date,
	cint,
	get_datetime,
	get_time,
	getdate,
	now_datetime,
	nowdate,
	time_diff_in_seconds,
)
from datetime import timedelta

from pos_next.restaurant import scope
from pos_next.restaurant.settings import get_restaurant_settings, restaurant_of

# The states in which an online booking still waits for its guest to confirm it from the e-mail (Pending when the
# restaurant validates online bookings itself, Confirmed when it does not). The deadline to confirm it,
# `verification_deadline`, is set by the public form and cleared when a manager confirms the booking himself.
HOLD_STATUSES = ("Pending", "Confirmed")
# What such a booking becomes when its guest has not confirmed it in time: it holds no table, is no no-show, and is
# not one of the restaurant's bookings any more (NeoResto lot 1, task 18)
EXPIRED = "Expired"


def awaits_its_guest(reservation) -> bool:
	"""Whether a booking was made on the public form and its guest has not confirmed it from the e-mail yet.

	A booking taken at the till, one its guest confirmed, and one a manager confirmed himself (the deadline is cleared
	then) are not: they are the restaurant's bookings.
	"""
	return bool(reservation.get("verification_deadline")) and not cint(reservation.get("verified"))


def hold_has_expired(reservation, now=None) -> bool:
	"""Whether a booking that awaits its guest is past its deadline: from that moment it holds nothing, whether the
	job that marks it Expired has run yet or not."""
	return (
		awaits_its_guest(reservation)
		and reservation.get("status") in HOLD_STATUSES
		and get_datetime(reservation.get("verification_deadline")) <= (now or now_datetime())
	)


class RestaurantReservation(Document):
	def validate(self):
		# A reservation naming no restaurant belongs to the default one, and holds that restaurant's tables only
		scope.attach_to_restaurant(self)
		self._validate_tables_belong_to_the_restaurant()
		self._validate_date()
		self._validate_within_opening_hours()
		self._compute_end_time()

	def _validate_tables_belong_to_the_restaurant(self):
		"""A table of another restaurant cannot be booked: it is not on this restaurant's floor."""
		restaurant = restaurant_of(self)
		for row in self.tables:
			if scope.restaurant_of_record("Restaurant Table", row.restaurant_table) != restaurant:
				label = frappe.db.get_value("Restaurant Table", row.restaurant_table, "table_name")
				frappe.throw(_("Table {0} belongs to another restaurant").format(label or row.restaurant_table))

	def before_insert(self):
		self._lock_and_check_overlap()

	def on_update(self):
		if self.has_value_changed("status"):
			if self.status == "Seated":
				self._seat_tables()
			# The tills hear of it once it is committed: a booking the request rolls back (an online one refused on the
			# site's mail budget after it was written, say) never reaches them
			frappe.publish_realtime("reservation_update", after_commit=True)

	def _validate_date(self):
		"""Reject reservations in the past."""
		if getdate(self.reservation_date) < getdate(nowdate()):
			frappe.throw(_("Cannot create a reservation in the past"))

	def _validate_within_opening_hours(self):
		"""Ensure reservation time falls within the opening hours its restaurant sets for the day."""
		settings = get_restaurant_settings(restaurant_of(self))
		if not settings.opening_hours:
			return

		from datetime import datetime
		day_name = datetime.strptime(str(self.reservation_date), "%Y-%m-%d").strftime("%A")
		res_time = get_time(self.reservation_time)

		for row in settings.opening_hours:
			if row.day_of_week == day_name:
				from_t = get_time(row.from_time)
				to_t = get_time(row.to_time)
				if from_t <= res_time <= to_t:
					return

		frappe.throw(
			_("Reservation time {0} is outside opening hours for {1}").format(
				self.reservation_time, day_name
			)
		)

	def _compute_end_time(self):
		"""Compute end_time from reservation_time + duration."""
		if self.reservation_time and self.duration:
			from datetime import datetime, timedelta
			base = datetime.strptime(str(self.reservation_time), "%H:%M:%S")
			dur_seconds = _parse_duration(self.duration)
			end = base + timedelta(seconds=dur_seconds)
			self.end_time = end.strftime("%H:%M:%S")

	def _lock_and_check_overlap(self):
		"""Lock tables and check for overlapping reservations to prevent race conditions."""
		if not self.tables:
			return

		for row in self.tables:
			# Lock each table to serialize concurrent writes
			frappe.get_doc("Restaurant Table", row.restaurant_table, for_update=True)

		conflicts = check_overlap(
			tables=[row.restaurant_table for row in self.tables],
			date=self.reservation_date,
			time=str(self.reservation_time),
			duration=self.duration,
			exclude=self.name if not self.is_new() else None,
		)

		if conflicts:
			table_names = ", ".join(sorted({c["table_name"] for c in conflicts}))
			frappe.throw(
				_("Tables {0} have overlapping reservations at the requested time").format(
					table_names
				)
			)

	def _seat_tables(self):
		"""When status changes to Seated, set tables to Occupied and assign customer."""
		for row in self.tables:
			frappe.db.set_value("Restaurant Table", row.restaurant_table, "status", "Occupied")

		# If a customer is linked, set it on the current invoice context
		if self.customer:
			for row in self.tables:
				frappe.db.set_value(
					"Restaurant Table", row.restaurant_table, {
						"status": "Occupied",
					}
				)

		frappe.publish_realtime("table_update")


def _parse_duration(duration):
	"""Parse duration from various formats to seconds (int).

	Handles: int/float (seconds), "HH:MM:SS", "HH:MM", or plain numeric string.
	"""
	if not duration:
		return 5400  # default 1h30

	if isinstance(duration, (int, float)):
		return int(duration)

	duration_str = str(duration).strip()

	if ":" in duration_str:
		parts = duration_str.split(":")
		seconds = int(parts[0]) * 3600
		if len(parts) > 1:
			seconds += int(parts[1]) * 60
		if len(parts) > 2:
			seconds += int(float(parts[2]))
		return seconds

	# Plain numeric string (seconds)
	try:
		return int(float(duration_str))
	except ValueError:
		return 5400


def check_overlap(tables, date, time, duration, exclude=None):
	"""Check if any of the given tables have overlapping reservations.

	Returns list of conflicts: [{table, table_name, reservation, guest_name, time}], a table being named by its
	name (`table`) and shown by its label (`table_name`). An online booking whose guest did not confirm it in time
	holds nothing (`hold_has_expired`), from its deadline on.
	"""
	if not tables:
		return []

	from datetime import datetime, timedelta

	base = datetime.strptime(str(time), "%H:%M:%S")
	dur_seconds = _parse_duration(duration)

	new_start = base
	new_end = base + timedelta(seconds=dur_seconds)

	# Find all non-terminal reservations for these tables on this date
	active_statuses = ("Pending", "Confirmed", "Seated")
	filters = {
		"reservation_date": date,
		"status": ["in", active_statuses],
		"docstatus": 0,
	}
	if exclude:
		filters["name"] = ["!=", exclude]

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters=filters,
		fields=[
			"name", "reservation_time", "end_time", "guest_name",
			"status", "verified", "verification_deadline",
		],
	)

	if not reservations:
		return []

	# Get table assignments for these reservations
	table_set = set(tables)
	conflicts = []
	now = now_datetime()

	for res in reservations:
		if hold_has_expired(res, now):
			continue
		res_tables = frappe.get_all(
			"Restaurant Reservation Table",
			filters={"parent": res.name, "restaurant_table": ["in", list(table_set)]},
			fields=["restaurant_table"],
		)
		if not res_tables:
			continue

		# Check time overlap
		res_start = datetime.strptime(str(res.reservation_time), "%H:%M:%S")
		if res.end_time:
			res_end = datetime.strptime(str(res.end_time), "%H:%M:%S")
		else:
			res_end = res_start + timedelta(seconds=dur_seconds)  # fallback

		# Overlap: new_start < res_end AND new_end > res_start
		if new_start < res_end and new_end > res_start:
			for rt in res_tables:
				conflicts.append({
					"table": rt.restaurant_table,
					"table_name": frappe.db.get_value("Restaurant Table", rt.restaurant_table, "table_name")
					or rt.restaurant_table,
					"reservation": res.name,
					"guest_name": res.guest_name,
					"time": str(res.reservation_time),
				})

	return conflicts
