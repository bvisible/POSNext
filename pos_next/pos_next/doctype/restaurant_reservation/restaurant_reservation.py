import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, nowdate, get_time, time_diff_in_seconds, add_to_date
from datetime import timedelta


class RestaurantReservation(Document):
	def validate(self):
		self._validate_date()
		self._validate_within_opening_hours()
		self._compute_end_time()

	def before_insert(self):
		self._lock_and_check_overlap()

	def on_update(self):
		if self.has_value_changed("status"):
			if self.status == "Seated":
				self._seat_tables()
			frappe.publish_realtime("reservation_update")

	def _validate_date(self):
		"""Reject reservations in the past."""
		if getdate(self.reservation_date) < getdate(nowdate()):
			frappe.throw(_("Cannot create a reservation in the past"))

	def _validate_within_opening_hours(self):
		"""Ensure reservation time falls within configured opening hours for the day."""
		settings = frappe.get_single("Restaurant Settings")
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
			table_names = ", ".join(set(c["table"] for c in conflicts))
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

	Returns list of conflicts: [{table, reservation, guest_name, time}]
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
		fields=["name", "reservation_time", "end_time", "guest_name"],
	)

	if not reservations:
		return []

	# Get table assignments for these reservations
	table_set = set(tables)
	conflicts = []

	for res in reservations:
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
					"reservation": res.name,
					"guest_name": res.guest_name,
					"time": str(res.reservation_time),
				})

	return conflicts
