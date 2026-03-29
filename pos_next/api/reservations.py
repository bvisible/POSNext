import frappe
from frappe import _
from frappe.utils import getdate, nowdate, now_datetime, get_time, add_to_date
import json
import secrets
from datetime import datetime, timedelta


# ==========================================
# Authenticated POS endpoints
# ==========================================


@frappe.whitelist()
def get_reservations(date=None, area=None, status=None):
	"""Get reservations for a given date with optional filters."""
	if not frappe.has_permission("Restaurant Reservation", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

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

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters=filters,
		fields=[
			"name", "status", "reservation_date", "reservation_time",
			"end_time", "duration", "no_of_guests", "guest_name",
			"phone", "email", "customer", "channel", "notes",
		],
		order_by="reservation_time asc",
	)

	# Attach tables for each reservation
	for res in reservations:
		res["tables"] = frappe.get_all(
			"Restaurant Reservation Table",
			filters={"parent": res["name"]},
			fields=["restaurant_table", "table_name", "area", "capacity"],
		)

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
):
	"""Create a reservation from POS (status=Confirmed, skips Pending)."""
	if not frappe.has_permission("Restaurant Reservation", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if isinstance(tables, str):
		tables = json.loads(tables)

	settings = frappe.get_single("Restaurant Settings")
	if not duration:
		duration = settings.default_reservation_duration or 5400

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
	if not frappe.has_permission("Restaurant Reservation", "write"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	doc = frappe.get_doc("Restaurant Reservation", name)
	old_status = doc.status

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
	doc.save()

	return {"status": "ok", "name": doc.name, "new_status": status}


@frappe.whitelist()
def check_table_availability(tables, date, time, duration, exclude=None):
	"""Check table availability for a given slot."""
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
def get_reservation_stats(from_date, to_date):
	"""Get reservation statistics for a date range."""
	if not frappe.has_permission("Restaurant Reservation", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={
			"reservation_date": ["between", [from_date, to_date]],
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
def get_available_slots(date):
	"""Return available time slots for a given date based on opening hours."""
	settings = frappe.get_single("Restaurant Settings")
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
def get_available_tables(date, time, duration=None, no_of_guests=None):
	"""Return tables with their availability status for a given slot."""
	settings = frappe.get_single("Restaurant Settings")
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	if not duration:
		duration = settings.default_reservation_duration or 5400

	# Get all tables grouped by area
	tables = frappe.get_all(
		"Restaurant Table",
		fields=["name", "table_name", "area", "capacity", "status"],
		order_by="area asc, table_name asc",
	)

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
):
	"""Create a reservation from the public web form."""
	settings = frappe.get_single("Restaurant Settings")
	if not settings.enable_reservations or not settings.enable_online_reservations:
		frappe.throw(_("Online reservations are not enabled"))

	if isinstance(tables, str):
		tables = json.loads(tables)

	# Rate limiting: max 3 active reservations per email
	active_count = frappe.db.count(
		"Restaurant Reservation",
		filters={
			"email": email,
			"status": ["in", ("Pending", "Confirmed")],
			"reservation_date": [">=", nowdate()],
		},
	)
	if active_count >= 3:
		frappe.throw(_("Maximum number of active reservations reached for this email"))

	if not duration:
		duration = settings.default_reservation_duration or 5400

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

	# Find or create customer
	customer = _find_or_create_customer(guest_name, email, phone)

	doc = frappe.get_doc({
		"doctype": "Restaurant Reservation",
		"status": initial_status,
		"reservation_date": reservation_date,
		"reservation_time": reservation_time,
		"duration": duration,
		"no_of_guests": int(no_of_guests),
		"guest_name": guest_name,
		"phone": phone,
		"email": email,
		"customer": customer,
		"channel": "Internet",
		"notes": notes,
		"tables": [{"restaurant_table": t} for t in (tables or [])],
		"verification_token": token,
		"verified": 0,
	})
	doc.insert(ignore_permissions=True)

	# Send verification email
	_send_verification_email(doc)

	frappe.publish_realtime("reservation_update")

	return {
		"status": "ok",
		"name": doc.name,
		"requires_verification": True,
		"message": _("Please check your email to confirm the reservation"),
	}


@frappe.whitelist(allow_guest=True)
def verify_reservation(token):
	"""Verify a reservation via email token (double opt-in)."""
	if not token:
		frappe.throw(_("Invalid verification token"))

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={"verification_token": token, "verified": 0},
		fields=["name"],
		limit=1,
	)

	if not reservations:
		frappe.throw(_("Invalid or expired verification token"))

	doc = frappe.get_doc("Restaurant Reservation", reservations[0].name)
	doc.verified = 1
	doc.save(ignore_permissions=True)

	# Send confirmation emails
	_send_confirmation_email(doc)

	return {
		"status": "ok",
		"name": doc.name,
		"message": _("Reservation confirmed successfully"),
	}


# ==========================================
# Scheduler jobs
# ==========================================


def send_reminders():
	"""Scheduled job: send reminder emails for upcoming reservations."""
	settings = frappe.get_single("Restaurant Settings")
	if not settings.enable_reservations:
		return

	reminder_hours = settings.reservation_reminder_hours or 3
	now = now_datetime()
	reminder_cutoff = add_to_date(now, hours=reminder_hours)

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={
			"status": "Confirmed",
			"reminder_sent": 0,
			"reservation_date": getdate(reminder_cutoff),
			"email": ["is", "set"],
		},
		fields=["name", "reservation_time", "reservation_date"],
	)

	for res in reservations:
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
	"""Scheduled job: mark overdue confirmed reservations as No Show."""
	settings = frappe.get_single("Restaurant Settings")
	if not settings.enable_reservations:
		return

	delay_minutes = settings.no_show_delay or 60
	now = now_datetime()

	reservations = frappe.get_all(
		"Restaurant Reservation",
		filters={
			"status": "Confirmed",
			"reservation_date": ["<=", nowdate()],
		},
		fields=["name", "reservation_time", "reservation_date"],
	)

	for res in reservations:
		res_datetime = datetime.combine(
			getdate(res.reservation_date),
			get_time(res.reservation_time),
		)
		cutoff = res_datetime + timedelta(minutes=delay_minutes)

		if now > cutoff:
			frappe.db.set_value("Restaurant Reservation", res.name, "status", "No Show")
			frappe.publish_realtime("reservation_update")

	frappe.db.commit()


# ==========================================
# Email helpers
# ==========================================


def _send_verification_email(reservation):
	"""Send double opt-in verification email to the guest."""
	if not reservation.email:
		return

	site_url = frappe.utils.get_url()
	verify_url = (
		f"{site_url}/api/method/pos_next.api.reservations.verify_reservation"
		f"?token={reservation.verification_token}"
	)

	subject = _("Confirm your reservation - {0}").format(reservation.guest_name)
	message = _(
		"Please confirm your reservation for {0} on {1} at {2} for {3} guests."
	).format(
		reservation.guest_name,
		frappe.format(reservation.reservation_date, {"fieldtype": "Date"}),
		reservation.reservation_time,
		reservation.no_of_guests,
	)
	message += f"<br><br><a href='{verify_url}'>{_('Click here to confirm')}</a>"

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
		settings = frappe.get_single("Restaurant Settings")
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

		settings = frappe.get_single("Restaurant Settings")
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
