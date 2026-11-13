# //// Neoffice — added file (no upstream equivalent).
"""The salon mode of the till: the day's agenda and what the till does with it (NeoSalon, step 2, lot G4; product owner, 10.11.2026).

A salon books its customers in a reservation app. In salon mode the till shows the day's agenda and works the appointments: it takes one over
(a DRAFT Sales Invoice the reservation prepared, loaded into the cart and paid as THAT draft, never a second invoice), moves it, cancels it,
starts, pauses and finishes its time, and books a new one.

POS Next never names a reservation app, nor a client: it calls functions of the site through extension points (hooks, like
`pos_next_bootstrap_settings`) and takes the first answer that is not None. The three lanes of the salon each fill theirs:

the day (the planning lane)
- `pos_next_salon_day`                `(pos_profile, date=None) -> {"day", "visibility", "people", "unassigned"} | None`  who is there, and what each holds;
- `pos_next_appointment_check_move`   `(pos_profile, booking, starts_at, sales_person=None) -> {"ok", "why"}`  can it go there;
- `pos_next_appointment_move`         `(pos_profile, booking, starts_at, sales_person=None, notify=1) -> dict`;

the money (the reservation lane)
- `pos_next_appointments_of_the_day`  `(pos_profile, date=None, providers=None) -> list | None`  where each stands, what it announces and what was paid;
- `pos_next_appointment_draft`        `(booking, pos_profile) -> {"invoice", ...} | None`  the draft of one appointment (made or found);
- `pos_next_appointment_sold`         `(booking, invoice, pos_profile) -> dict | None`  a sale takes the place of the draft (a till that was offline);
- `pos_next_appointment_cancel`       `(booking, pos_profile, reason="cancelled", notify=True) -> dict`;
- `pos_next_appointment_services`     `(pos_profile) -> list[dict]`  what can be booked at the till, with its options and its people;
- `pos_next_appointment_slots`        `(pos_profile, date, items, sales_person=None) -> list[dict]`  the free slots of a chain of services;
- `pos_next_appointment_book`         `(pos_profile, customer, items, starts_at, sales_person=None, notify=True) -> dict`;

the time (the margin lane)
- `pos_next_appointment_time_action`  `(appointment, action, pos_profile, employee=None) -> dict | None`  start, pause, finish, close_unmeasured;
- `pos_next_appointment_time_state`   `(appointments, pos_profile) -> {appointment: state} | None`;

the series (the package and series lane)
- `pos_next_appointment_repeat`       `(pos_profile, booking, every_weeks, count=None, until=None, changes=None, confirm=0) -> dict | None`  a preview of the dates
                                      of an appointment that comes back (`confirm=0`), then the booking of them (`confirm=1`);

the people who rent their chair (the planning lane)
- `pos_next_independent_users`        `() -> list[str]`  the accounts the salon declared independent: what they do is theirs, so the till never offers
                                      one as the seller of a line (`pos_next.api.pos_profile.get_sales_persons`).

The day view also says how the salon stands that day (`salon`: open, closed, or other hours) and, on each appointment, why it needs somebody (`to_handle`:
« closed » when the salon is closed that day, « away » when its person is on leave or on a holiday). An appointment booked before is never cancelled by itself:
the till marks the ones nobody has begun « to handle », for the cashier to move or cancel with the customer. (`pos_next_salon_calendar`, the days and absences of a
period, is not read yet.)

The till never sends an hour for the time (the server's clock is the only one) and never shows a cost or a margin. The shapes are the contract of the
plan (note 10 of the vault, § G4, « Contrat v2 », and the notes of the lanes). The user of the session is the cashier: the hooks decide what that cashier may
see and do and mask the rest on the server (a colleague's appointment comes as « busy », without a name); the till reads only the keys it knows, with the
types it expects, cuts every list, composes the day from what the lanes answer, and shows a booking the day view does not show to nobody.

The mode is off until a till manager ticks `POS Settings.enable_appointments` (a shop till), and absent where the site has no hook: then the agenda is
not available and nothing is taken, moved, cancelled, timed or booked.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, nowdate

# //// Neoffice — the day view is read under a name that says what it is (13.11.2026: a software for every trade, nothing named « salon » that a garage or a
# //// practice would read), and under the old name when the site still declares that one (a lane renames its declaration when it is ready)
DAY_HOOK = "pos_next_booking_day"
LEGACY_HOOKS = {DAY_HOOK: "pos_next_salon_day"}
CHECK_MOVE_HOOK = "pos_next_appointment_check_move"
MOVE_HOOK = "pos_next_appointment_move"
LIST_HOOK = "pos_next_appointments_of_the_day"
DRAFT_HOOK = "pos_next_appointment_draft"
SOLD_HOOK = "pos_next_appointment_sold"
CANCEL_HOOK = "pos_next_appointment_cancel"
SERVICES_HOOK = "pos_next_appointment_services"
SLOTS_HOOK = "pos_next_appointment_slots"
BOOK_HOOK = "pos_next_appointment_book"
TIME_ACTION_HOOK = "pos_next_appointment_time_action"
TIME_STATE_HOOK = "pos_next_appointment_time_state"
INDEPENDENTS_HOOK = "pos_next_independent_users"
REPEAT_HOOK = "pos_next_appointment_repeat"

# More than a salon books in a day, and than one appointment holds lines: a hook that answers more is cut, never trusted
MOST_APPOINTMENTS = 300
MOST_PEOPLE = 60
MOST_STEPS = 50
MOST_LINES = 100
MOST_SERVICES = 300
MOST_SLOTS = 200
MOST_GROUPS = 12
MOST_CHOICES = 30
MOST_IN_A_CHAIN = 10
MOST_PERIODS = 6
MOST_REPEATS = 12
MOST_WEEKS = 52
OPTIONS_LENGTH = 5000

STATES = ("booked", "started", "finished", "paid", "absent")
STAFF_STATES = ("present", "break", "not_yet", "done", "scheduled", "on_leave", "holiday", "off")
# How the salon stands on a day (the planning lane's `salon` block), and why it is closed or has other hours
SALON_STATES = ("open", "closed", "special")
SALON_REASONS = ("holiday", "closure", "weekly_off", "special_hours", "no_hours")
GESTURES = ("collect", "move", "cancel", "clock")
# Why an appointment of a day needs somebody, as the planning lane says it
TO_HANDLE = ("closed", "away")
CLOCK_STATES = ("idle", "running", "paused", "done")
# What the time lane calls a state, and what the till calls it
TIME_STATUS = {"Not started": "idle", "In progress": "running", "Paused": "paused", "Finished": "done"}
CANCEL_REASONS = ("cancelled", "no_show")
CLOCK_ACTIONS = ("start", "pause", "finish", "close_unmeasured")

_HOUR = re.compile(r"^\d{2}:\d{2}$")


def _declared(hook: str) -> list[str]:
	"""The paths the site declares for an extension point: under its name, then under the old name it used to have (never twice)."""
	paths = list(frappe.get_hooks(hook) or [])
	old = LEGACY_HOOKS.get(hook)
	if old:
		paths += [path for path in (frappe.get_hooks(old) or []) if path not in paths]
	return paths


def site_has_appointments() -> bool:
	"""Whether the site declares a reservation app for the till (a hook of the day or of the list). Not whether it answers: see `site_takes_appointments`."""
	return bool(_declared(DAY_HOOK) or _declared(LIST_HOOK))


def site_takes_appointments(pos_profile: str | None) -> bool:
	"""Whether the site's booking ANSWERS for this till today: the day view, or failing it the list, says something other than None.

	A theme declares its hooks on every site and answers None where nothing is booked, so the presence of a hook proves nothing (13.11.2026: a till
	ticked on a site that did not book showed an agenda « unavailable »). The question is about the site, not about the account that asks: it is put
	as the administrator, so that nobody is told « no » for want of a right, and only whether there is an answer is kept.
	"""
	if not pos_profile or not site_has_appointments():
		return False
	today = str(getdate(nowdate()))
	user = frappe.session.user
	frappe.set_user("Administrator")
	try:
		for hook, args in ((DAY_HOOK, (pos_profile, today)), (LIST_HOOK, (pos_profile, today, None))):
			for path in _declared(hook):
				try:
					if frappe.get_attr(path)(*args) is not None:
						return True
				except Exception:
					frappe.log_error("The appointments hook failed", f"{path}\n{frappe.get_traceback()}")
		return False
	finally:
		frappe.set_user(user)


def appointments_enabled(pos_profile: str | None) -> bool:
	"""Whether this till is in salon mode: its tick, on an enabled till."""
	if not pos_profile:
		return False
	return bool(
		cint(
			frappe.db.get_value(
				"POS Settings", {"pos_profile": pos_profile, "enabled": 1}, "enable_appointments"
			)
		)
	)


def _first_answer(hook: str, *args):
	"""What the first hook that answers says (a hook that has nothing to say answers None); None when no hook answers.

	A refusal the reservation words for the cashier (`frappe.ValidationError`) goes up as it is. Any other failure of a hook is logged and the
	next hook is tried: a reservation app that breaks must not break the till.
	"""
	for path in _declared(hook):
		try:
			answer = frappe.get_attr(path)(*args)
		except frappe.ValidationError:
			raise
		except Exception:
			frappe.log_error("The appointments hook failed", f"{path}\n{frappe.get_traceback()}")
			continue
		if answer is not None:
			return answer
	return None


def _text(value, most=140):
	"""A text of at most `most` characters, or None."""
	return None if value in (None, "") else str(value)[:most]


def _number(value) -> float:
	return flt(value) if isinstance(value, int | float | str) else 0.0


def _amount_or_none(value) -> float | None:
	"""An amount the money lane may leave out (a reservation app that predates it says nothing): None, not 0, when it is not there."""
	return (
		flt(value) if isinstance(value, int | float) or (isinstance(value, str) and value.strip()) else None
	)


def _moment(value):
	"""A date and time as the site writes them (`YYYY-MM-DD HH:MM:SS`), or None."""
	return _text(value, 19)


def _hour(value):
	"""A time of the day as `HH:MM`, or None."""
	text = _text(value, 5)
	return text if text and _HOUR.match(text) else None


def _options(value):
	"""The options of a line as the line carries them (a JSON text), or None: a hook may give the text or the structure."""
	if value in (None, "", [], {}):
		return None
	text = value if isinstance(value, str) else json.dumps(value, default=str)
	return text if len(text) <= OPTIONS_LENGTH else None


def _clock(value) -> dict:
	"""The time of an appointment as the time lane states it: where it stands and how long it has really run. No cost, no margin: never."""
	value = value if isinstance(value, dict) else {}
	return {
		"state": TIME_STATUS.get(value.get("status"), "idle"),
		"started_at": _moment(value.get("started_at")),
		"ended_at": _moment(value.get("ended_at")),
		"active_seconds": max(cint(value.get("active_seconds")), 0),
		"paused_by": _text(value.get("paused_by")),
	}


def _step(row) -> dict | None:
	if not isinstance(row, dict):
		return None
	return {
		"step": cint(row.get("step")) or None,
		"label": _text(row.get("label")),
		"item_code": _text(row.get("item_code")),
		"qty": _number(row.get("qty")) or 1.0,
		"options": _options(row.get("options")),
		"starts_at": _moment(row.get("starts_at")),
		"ends_at": _moment(row.get("ends_at")),
		"sales_person": _text(row.get("sales_person")),
		"sales_person_name": _text(row.get("sales_person_name")),
		# //// Neoffice — the price this step announced, options included, as the reservation states it (13.11.2026): kept with the agenda the till holds, so that
		# //// a till set to collect the price announced at booking holds that choice without the network too. None when the reservation does not say.
		"price": _amount_or_none(row.get("price")),
	}


def _my_sales_people() -> set[str]:
	"""The sales persons the signed-in account is: those of the employee whose user she is."""
	employees = frappe.get_all(
		"Employee", filters={"user_id": frappe.session.user, "status": "Active"}, pluck="name"
	)
	if not employees:
		return set()
	return set(frappe.get_all("Sales Person", filters={"employee": ["in", employees]}, pluck="name"))


def without_independents(sales_persons: list[dict]) -> list[dict]:
	"""The sales persons of the picker, less the people who rent their chair (the accounts the site declares independent).

	What an independent does is hers, not the salon's: she is never offered as the seller of a line, nor chosen first as « the cashier ». A site with no
	planning lane declares none, and a hook that breaks declares none either (logged): the picker stays as it was.
	"""
	try:
		declared = _first_answer(INDEPENDENTS_HOOK)
	except frappe.ValidationError:
		return sales_persons
	users = (
		{u for u in (_text(user) for user in declared) if u}
		if isinstance(declared, list | tuple | set)
		else set()
	)
	employees = [row["employee"] for row in sales_persons if row.get("employee")]
	if not users or not employees:
		return sales_persons
	hers = set(
		frappe.get_all(
			"Employee", filters={"name": ["in", employees], "user_id": ["in", list(users)]}, pluck="name"
		)
	)
	return [row for row in sales_persons if row.get("employee") not in hers]


def _capabilities() -> dict:
	"""What the site can do for the till: a gesture whose hook the site does not declare is not offered."""
	return {
		"check_move": bool(frappe.get_hooks(CHECK_MOVE_HOOK)),
		"move": bool(frappe.get_hooks(MOVE_HOOK)),
		"cancel": bool(frappe.get_hooks(CANCEL_HOOK)),
		"clock": bool(frappe.get_hooks(TIME_ACTION_HOOK)),
		"repeat": bool(frappe.get_hooks(REPEAT_HOOK)),
		"book": bool(
			frappe.get_hooks(BOOK_HOOK) and frappe.get_hooks(SERVICES_HOOK) and frappe.get_hooks(SLOTS_HOOK)
		),
	}


def _can(state: str, busy: bool, may: bool, capabilities: dict) -> dict:
	"""What the cashier may do with an appointment: what its state allows, if it is hers to work (or she sees the whole salon), and
	if the site has the gesture. A paid appointment lets nothing be done to it."""
	if busy or not may:
		return {"collect": False, "move": False, "cancel": False, "clock": False}
	return {
		"collect": state in ("booked", "started", "finished"),
		"move": state == "booked" and capabilities["move"],
		"cancel": state == "booked" and capabilities["cancel"],
		"clock": state in ("booked", "started") and capabilities["clock"],
	}


def _gestures(value) -> dict | None:
	"""What the money lane says this cashier may do (`can`: collect, move, cancel, clock), or None when it says nothing."""
	if not isinstance(value, dict):
		return None
	return {gesture: bool(cint(value.get(gesture))) for gesture in GESTURES}


def _listed(row) -> dict | None:
	"""A row of the reservation's list, read as the money lane states it (contract v2): where it stands (`state`: booked, started, finished, paid,
	absent), whether a cashier holds its draft (`in_the_till`, and `invoice` is then the draft, or the sale once paid), what it announces, what was
	paid, its steps, and what this cashier may do (`can`)."""
	if not isinstance(row, dict) or not _text(row.get("booking")):
		return None
	return {
		"booking": _text(row.get("booking")),
		"starts_at": _moment(row.get("starts_at")),
		"ends_at": _moment(row.get("ends_at")),
		"customer": _text(row.get("customer")),
		"customer_name": _text(row.get("customer_name")),
		"steps": [s for s in (_step(r) for r in (row.get("steps") or [])[:MOST_STEPS]) if s],
		"amount": _number(row.get("amount")),
		"paid_amount": _number(row.get("paid_amount")),
		# What marking her absent would keep of what she paid (the scale's fee of an absence, compensation) and give back to her card: the
		# dialog says it before the cashier marks it (12.11). None when the reservation app does not say.
		"absent_kept": _amount_or_none(row.get("absent_kept")),
		"absent_refund": _amount_or_none(row.get("absent_refund")),
		# ...and what cancelling it now would (the scale at this notice): a late cancellation keeps part of what she paid
		"cancel_kept": _amount_or_none(row.get("cancel_kept")),
		"cancel_refund": _amount_or_none(row.get("cancel_refund")),
		"state": row.get("state") if row.get("state") in STATES else None,
		"in_the_till": bool(cint(row.get("in_the_till"))),
		"can": _gestures(row.get("can")),
		"invoice": _text(row.get("invoice")),
	}


def _periods(value) -> list[list[str]]:
	"""The hours a person works, or the salon is open, as `[["09:00", "12:00"], ...]`: only well-formed periods."""
	if not isinstance(value, list | tuple):
		return []
	periods = []
	for period in value[:MOST_PERIODS]:
		if isinstance(period, list | tuple) and len(period) == 2 and _hour(period[0]) and _hour(period[1]):
			periods.append([_hour(period[0]), _hour(period[1])])
	return periods


def _salon(view) -> dict | None:
	"""How the salon stands on the day (the planning lane's `salon` block): open, closed (a holiday, a closure, a weekly day off) or with other
	hours; None when the lane does not say (a site without the planning lane, or a lane that has not delivered it yet)."""
	block = view.get("salon") if isinstance(view, dict) else None
	if not isinstance(block, dict) or block.get("state") not in SALON_STATES:
		return None
	return {
		"state": block["state"],
		"reason": block.get("reason") if block.get("reason") in SALON_REASONS else None,
		"label": _text(block.get("label")),
		"periods": _periods(block.get("periods")),
	}


def _staff(row) -> dict | None:
	"""A column of the agenda: a person of the team, how she stands today and the hours she works."""
	if not isinstance(row, dict):
		return None
	person, user = _text(row.get("sales_person")), _text(row.get("user"))
	if not person and not user:
		return None
	periods = _periods(row.get("periods"))
	name = _text(row.get("sales_person_name")) or _text(row.get("name")) or person or user
	return {
		"key": person or user,
		"user": user,
		"sales_person": person,
		"sales_person_name": name,
		"status": row.get("state") if row.get("state") in STAFF_STATES else "unknown",
		"reason": _text(row.get("reason")),
		"periods": periods,
		"from": _hour(row.get("from")),
		"until": _hour(row.get("until")),
		"checked_in": _text(row.get("checked_in"), 40),
	}


def _people_of(appointments: list[dict]) -> list[dict]:
	"""The columns when the site gives no team: the people who have a step in the appointments, in the order of their first step."""
	seen = {}
	for appointment in appointments:
		for step in appointment["steps"]:
			if step["sales_person"] and step["sales_person"] not in seen:
				seen[step["sales_person"]] = {
					"key": step["sales_person"],
					"user": None,
					"sales_person": step["sales_person"],
					"sales_person_name": step["sales_person_name"] or step["sales_person"],
					"status": "unknown",
					"reason": None,
					"periods": [],
					"from": None,
					"until": None,
					"checked_in": None,
				}
	return list(seen.values())


def _appointment(row, listed, clock, may, capabilities, key) -> dict | None:
	"""An appointment of the agenda, as the till reads it, from the day view (who, when, where it stands) and the money lane's list (what it
	announces, what was paid): only its own keys. A « busy » appointment (a colleague's, for a cashier who may not read it) carries only its
	hours and its person, whatever the hooks said besides."""
	if not isinstance(row, dict):
		return None
	person, person_name = _text(row.get("sales_person")), _text(row.get("sales_person_name"))
	if cint(row.get("busy")):
		return {
			"key": key,
			"booking": None,
			"starts_at": _moment(row.get("starts_at")),
			"ends_at": _moment(row.get("ends_at")),
			"customer": None,
			"customer_name": None,
			"steps": [
				{
					"step": None,
					"label": None,
					"item_code": None,
					"qty": 1.0,
					"options": None,
					"starts_at": _moment(row.get("starts_at")),
					"ends_at": _moment(row.get("ends_at")),
					"sales_person": person,
					"sales_person_name": person_name,
				}
			],
			"amount": 0.0,
			"paid_amount": 0.0,
			"absent_kept": None,
			"absent_refund": None,
			"cancel_kept": None,
			"cancel_refund": None,
			"state": "booked",
			"invoice": None,
			"in_the_till": False,
			"to_handle": None,
			"busy": True,
			"clock": _clock(None),
			"can": _can("booked", True, False, capabilities),
		}
	booking = _text(row.get("booking"))
	if not booking:
		return None
	listed = listed or {}
	stands = listed.get("state")
	# Where the time stands is the time lane's word; the money lane's list says it too (from the same records) where the time lane says nothing
	worked = (
		clock["state"]
		if clock["state"] != "idle"
		else {"finished": "done", "started": "running"}.get(stands, "idle")
	)
	if row.get("attendance") == "No Show" or stands == "absent":
		state = "absent"
	elif stands == "paid" or row.get("payment_status") == "Paid":
		state = "paid"
	elif worked == "done":
		state = "finished"
	elif worked in ("running", "paused"):
		state = "started"
	else:
		state = "booked"
	can = _can(state, False, may, capabilities)
	# What the money lane says this cashier may do with it (a draft open in the till, a start already past) can only take gestures away
	if listed.get("can"):
		can = {gesture: can[gesture] and listed["can"][gesture] for gesture in GESTURES}
		# Paid online and not served yet: the reservation app says it may still be cancelled or marked absent, and the till offers it
		# (everything happens at the till, 10.11). Paid at the till, or an app that says nothing: nothing, as before.
		if state == "paid" and listed["can"]["cancel"] and capabilities["cancel"] and may:
			can["cancel"] = True
	steps = listed.get("steps") or [
		_step(
			{
				"label": row.get("label"),
				"item_code": row.get("item_code"),
				"starts_at": row.get("starts_at"),
				"ends_at": row.get("ends_at"),
				"sales_person": person,
				"sales_person_name": person_name,
			}
		)
	]
	return {
		"key": key,
		"booking": booking,
		"starts_at": _moment(row.get("starts_at")),
		"ends_at": _moment(row.get("ends_at")),
		"customer": _text(row.get("customer")),
		"customer_name": _text(row.get("customer_name")),
		"steps": steps,
		"amount": listed.get("amount", 0.0),
		"paid_amount": listed.get("paid_amount", 0.0),
		"absent_kept": listed.get("absent_kept"),
		"absent_refund": listed.get("absent_refund"),
		"cancel_kept": listed.get("cancel_kept"),
		"cancel_refund": listed.get("cancel_refund"),
		"state": state,
		"invoice": _text(row.get("invoice")) or listed.get("invoice"),
		"in_the_till": bool(listed.get("in_the_till")),
		# Why it needs somebody (the planning lane's word, for an appointment nobody has begun): « closed » (the salon is closed that day) or
		# « away » (its person is on leave or on a holiday); None otherwise
		"to_handle": row.get("to_handle")
		if row.get("to_handle") in TO_HANDLE and state == "booked" and not listed.get("in_the_till")
		else None,
		"busy": False,
		"clock": clock,
		"can": can,
	}


def _hints(answer) -> dict:
	"""What a hook says of the lines of the draft that the invoice does not hold, by the name of the line: its step."""
	hints = {}
	for row in (answer.get("items") or [])[:MOST_LINES]:
		if isinstance(row, dict) and _text(row.get("line")):
			hints[_text(row.get("line"))] = {
				"step": cint(row.get("step")) or None,
				"starts_at": _moment(row.get("starts_at")),
			}
	return hints


def _person_names(codes) -> dict:
	"""The names the sales persons of the lines are known by."""
	codes = sorted({code for code in codes if code})
	if not codes:
		return {}
	rows = frappe.get_all(
		"Sales Person", filters={"name": ["in", codes]}, fields=["name", "sales_person_name"]
	)
	return {row.name: row.sales_person_name for row in rows}


def _line(row, hints, names) -> dict:
	"""A line of the draft, with the keys of a phone's cart (`shop_scan.cart.lines_of`) plus its sales person, its options and its step.

	The prices are the draft's, for the record: the till does not keep them, it prices the line again at the day's prices.
	"""
	hint = hints.get(row.name) or {}
	person = _text(row.get("sales_person"))
	return {
		"line": row.name,
		"item_code": row.item_code,
		"item_name": row.item_name,
		"image": _text(row.get("image"), 500) or frappe.db.get_value("Item", row.item_code, "image"),
		"qty": flt(row.qty),
		"uom": row.uom,
		"stock_uom": row.stock_uom,
		"conversion_factor": flt(row.conversion_factor) or 1.0,
		"price_list_rate": flt(row.price_list_rate),
		"rate": flt(row.rate),
		"discount_percentage": flt(row.discount_percentage),
		"amount": flt(row.amount),
		"is_free_item": cint(row.is_free_item),
		"posa_item_modifiers": _text(row.get("posa_item_modifiers"), OPTIONS_LENGTH),
		"sales_person": person,
		"sales_person_name": names.get(person) if person else None,
		"step": hint.get("step"),
		"starts_at": hint.get("starts_at"),
	}


def _draft_of_the_till(invoice: str | None, pos_profile: str):
	"""The invoice a hook names, when it is a draft of THIS till; refused otherwise."""
	row = (
		frappe.db.get_value("Sales Invoice", invoice, ["docstatus", "pos_profile", "is_pos"], as_dict=True)
		if invoice
		else None
	)
	if not row or cint(row.docstatus) != 0 or not cint(row.is_pos) or row.pos_profile != pos_profile:
		frappe.throw(_("This appointment is not a draft of this till."))
	return frappe.get_doc("Sales Invoice", invoice)


def _draft(answer, booking: str, pos_profile: str) -> dict:
	"""The draft of an appointment as the till takes it, read from the invoice the hook names: refused when it is not a draft of THIS till,
	or says it is another appointment's."""
	if not isinstance(answer, dict):
		frappe.throw(_("This appointment could not be taken."))
	named = _text(answer.get("booking"))
	if named and named != booking:
		frappe.throw(_("This appointment could not be taken."))
	doc = _draft_of_the_till(_text(answer.get("invoice")), pos_profile)
	rows = [row for row in doc.items[:MOST_LINES] if row.item_code]
	if not rows:
		frappe.throw(_("This appointment has nothing to collect."))
	hints = _hints(answer)
	names = _person_names(row.get("sales_person") for row in rows)
	return {
		"booking": booking,
		"invoice": doc.name,
		"customer": doc.customer,
		"customer_name": doc.customer_name,
		"starts_at": _moment(answer.get("starts_at")),
		"ends_at": _moment(answer.get("ends_at")),
		"items": [_line(row, hints, names) for row in rows],
		"additional_discount_percentage": flt(doc.additional_discount_percentage),
		"discount_amount": flt(doc.discount_amount),
		"apply_discount_on": doc.apply_discount_on,
		"grand_total": flt(doc.grand_total),
		"paid_amount": flt(doc.paid_amount),
		# What the customer has already paid (online, a deposit): the till shows it as a locked payment, the amount acquired
		"payments": [
			{
				"mode_of_payment": row.mode_of_payment,
				"amount": flt(row.amount),
				"reference_no": _text(row.get("reference_no")),
				"account": _text(row.get("account")),
			}
			for row in doc.payments
			if flt(row.amount) > 0
		],
		"currency": doc.currency,
	}


def _names(value) -> list[str] | None:
	"""The names of sales persons the till filters by (a list, or the JSON of one); None for all."""
	if isinstance(value, str):
		value = json.loads(value) if value.strip() else None
	if value is None:
		return None
	if not isinstance(value, list) or not all(isinstance(name, str) for name in value):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return value


def _may_work(pos_profile: str, booking: str, date=None, person: str | None = None) -> bool:
	"""Whether the signed-in cashier may work this booking: it is on the planning lane's day view of that day as an appointment she may read (never
	as a colleague's « busy » row) and either she sees the whole salon or it is one of her own; and, for a gesture that names the person timed, that
	person is one of hers too. The agenda hides a colleague's appointment from a cashier who may not read it; this is the same rule at the door of
	the gestures, because a hidden button is not a permission (found on the work site: a coiffeuse took, and started the time of, a colleague's)."""
	if not _declared(DAY_HOOK):
		# A site with no day view has no one to hide an appointment from: the whole list is the cashier's
		return True
	view = _first_answer(DAY_HOOK, pos_profile, str(getdate(date or nowdate())))
	if view is None:
		# A planning lane that cannot say who holds what shows nothing, and lets nothing be worked
		return False
	if not isinstance(view, dict):
		frappe.throw(_("The appointments could not be read."))
	own = view.get("visibility") == "own"
	mine = _my_sales_people() if own else set()
	if own and person is not None and person not in mine:
		return False
	held = [
		a
		for s in (view.get("people") or [])[:MOST_PEOPLE]
		if isinstance(s, dict)
		for a in (s.get("appointments") or [])
	]
	held += view.get("unassigned") or []
	for appointment in held:
		if (
			not isinstance(appointment, dict)
			or cint(appointment.get("busy"))
			or _text(appointment.get("booking")) != booking
		):
			continue
		return not own or _text(appointment.get("sales_person")) in mine
	return False


def _gate(pos_profile: str, booking: str | None = None, date=None, person: str | None = None) -> str | None:
	"""The door of every gesture: a cashier of this till, on a till in salon mode; the booking, when one is asked, cleaned, and one the cashier may
	not work refused (as a visitor is: `Not permitted`, before any lane hears of it)."""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if booking is not None:
		if not isinstance(booking, str) or not booking.strip():
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		booking = booking.strip()
	if not appointments_enabled(pos_profile):
		frappe.throw(_("This till does not take appointments."))
	if booking is not None and not _may_work(pos_profile, booking, date, person):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return booking


def _the_moment(value, what: str) -> str:
	"""A date and time the cashier or the till sends, as the site writes them; refused when it is none."""
	try:
		return get_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
	except Exception:
		frappe.throw(_("{0} is not a valid date and time.").format(what))


def _a_person(sales_person) -> str | None:
	"""A sales person the cashier names, or None; refused when the site does not know her."""
	if sales_person in (None, ""):
		return None
	if not isinstance(sales_person, str) or not frappe.db.exists("Sales Person", sales_person):
		frappe.throw(_("This person is not known."))
	return sales_person


def _employee_of(sales_person: str | None) -> str | None:
	"""The employee behind a sales person (the time lane times a person, not a column); None for the appointment's own person."""
	return frappe.db.get_value("Sales Person", sales_person, "employee") if sales_person else None


def _chain(items) -> list[dict]:
	"""The services of an appointment to book, as the cashier sends them: `[{"item_code", "options"}]`, each an item the site knows."""
	if isinstance(items, str):
		try:
			items = json.loads(items) if items.strip() else None
		except ValueError:
			items = None
	if not isinstance(items, list) or not 0 < len(items) <= MOST_IN_A_CHAIN:
		frappe.throw(_("Choose at least one service."))
	chain = []
	for row in items:
		code = row.get("item_code") if isinstance(row, dict) else None
		if not isinstance(code, str) or not frappe.db.exists("Item", code):
			frappe.throw(_("This service is not known."))
		options = _options(row.get("options"))
		if row.get("options") not in (None, "", [], {}) and options is None:
			frappe.throw(_("These options are too long."))
		chain.append({"item_code": code, "options": options})
	return chain


def _clocks_of(bookings: list[str], pos_profile: str) -> dict:
	"""The state of the time of each appointment, from the time lane (nothing: every clock is idle)."""
	if not bookings or not frappe.get_hooks(TIME_STATE_HOOK):
		return {}
	try:
		answer = _first_answer(TIME_STATE_HOOK, bookings, pos_profile)
	except frappe.ValidationError:
		return {}
	return answer if isinstance(answer, dict) else {}


def after_a_sale(booking, invoice: str, pos_profile, offline: bool, date=None) -> None:
	"""Tell the site that the sale of an appointment is booked.

	A sale replayed from a till that was offline REPLACES the appointment's draft (`pos_next_appointment_sold`: the reservation deletes the draft,
	points at the sale and does what a validation does). The time of the appointment is closed with the sale: one nobody started is closed as
	« unmeasured » by the time lane (so that its margin is known to be unknown), one still running or in pause is finished. Never raises: the sale
	is submitted, and a site that fails to hear of it must not turn it into an error. An appointment the cashier may not work (a colleague's, for a cashier
	who may only read her own; `date` is its day, today by default) is left alone, and said in the error log.
	"""
	if not isinstance(booking, str) or not booking.strip():
		return
	booking = booking.strip()
	try:
		allowed = _may_work(pos_profile, booking, date)
	except Exception:
		frappe.log_error("The appointments hook failed", frappe.get_traceback())
		return
	if not allowed:
		frappe.log_error("A sale named an appointment its cashier may not work", f"{booking} on {invoice}")
		return
	try:
		if offline:
			_first_answer(SOLD_HOOK, booking, invoice, pos_profile)
	except Exception:
		frappe.log_error("The appointments hook failed", frappe.get_traceback())
	try:
		if frappe.get_hooks(TIME_ACTION_HOOK):
			state = _clock(_clocks_of([booking], pos_profile).get(booking))["state"]
			action = {"idle": "close_unmeasured", "running": "finish", "paused": "finish"}.get(state)
			if action:
				_first_answer(TIME_ACTION_HOOK, booking, action, pos_profile, None)
	except Exception:
		frappe.log_error("The appointments hook failed", frappe.get_traceback())


@frappe.whitelist()
def get_appointments(pos_profile: str, date: str | None = None, providers=None) -> dict:
	"""The agenda of the day of the till: `{"available", "date", "visibility", "capabilities", "salon", "mine", "people", "appointments"}`
	(`salon`: how the salon stands that day, `{"state": open|closed|special, "reason", "label", "periods"}`, or None when the planning lane does not say).

	Not available (nothing to show, nothing done) while the till's tick is off or where the site has no reservation app. The agenda is composed:
	the planning lane gives who is there and what each holds (a colleague's appointment « busy » for a cashier who may not read it), the money
	lane where each stands, what it announces and what was paid, the time lane the state of the clock. A booking the day view does not show is shown
	to nobody, whatever the money lane lists. Without a day view the list of the money lane is the agenda, and the people are those of its steps.
	"""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	day = getdate(date or nowdate())
	names = _names(providers)
	nothing = {
		"available": False,
		"date": str(day),
		"visibility": "all",
		"capabilities": {},
		"salon": None,
		"mine": [],
		"people": [],
		"appointments": [],
	}
	if not appointments_enabled(pos_profile) or not site_has_appointments():
		return nothing
	view = _first_answer(DAY_HOOK, pos_profile, str(day))
	listing = _first_answer(LIST_HOOK, pos_profile, str(day), names)
	if view is None and listing is None:
		return nothing
	if view is not None and not isinstance(view, dict):
		frappe.throw(_("The appointments could not be read."))
	if listing is not None and not isinstance(listing, list):
		frappe.throw(_("The appointments could not be read."))
	listed = {}
	for row in (listing or [])[:MOST_APPOINTMENTS]:
		row = _listed(row)
		if row:
			listed[row["booking"]] = row
	capabilities = _capabilities()
	mine = _my_sales_people()
	rows, people = [], []
	if view is None:
		visibility = "all"
		for row in listed.values():
			first = row["steps"][0] if row["steps"] else {}
			rows.append(
				_appointment(
					{
						"booking": row["booking"],
						"starts_at": row["starts_at"],
						"ends_at": row["ends_at"],
						"customer": row["customer"],
						"customer_name": row["customer_name"],
						"sales_person": first.get("sales_person"),
						"sales_person_name": first.get("sales_person_name"),
						"label": first.get("label"),
						"item_code": first.get("item_code"),
						"invoice": row["invoice"],
					},
					row,
					_clock(None),
					True,
					capabilities,
					row["booking"],
				)
			)
		people = _people_of([r for r in rows if r])
	else:
		visibility = "own" if view.get("visibility") == "own" else "all"
		staff = view.get("people") or []
		unassigned = view.get("unassigned") or []
		if not isinstance(staff, list) or not isinstance(unassigned, list):
			frappe.throw(_("The appointments could not be read."))
		taken = []
		for person in staff[:MOST_PEOPLE]:
			column = _staff(person)
			if column:
				people.append(column)
				taken.extend(a for a in (person.get("appointments") or []) if isinstance(a, dict))
		taken.extend(a for a in unassigned if isinstance(a, dict))
		taken = taken[:MOST_APPOINTMENTS]
		clocks = _clocks_of(
			[b for b in (_text(a.get("booking")) for a in taken if not cint(a.get("busy"))) if b], pos_profile
		)
		for n, appointment in enumerate(taken):
			booking = _text(appointment.get("booking"))
			person = _text(appointment.get("sales_person"))
			may = visibility == "all" or (person is not None and person in mine)
			rows.append(
				_appointment(
					appointment,
					listed.get(booking),
					_clock(clocks.get(booking)),
					may,
					capabilities,
					booking if booking and not cint(appointment.get("busy")) else f"busy-{n}",
				)
			)
	rows = [r for r in rows if r]
	if names:
		rows = [r for r in rows if any(s["sales_person"] in names for s in r["steps"])]
	rows.sort(key=lambda row: row["starts_at"] or "")
	salon = _salon(view)
	if salon and salon["state"] == "closed":
		# An appointment booked on a day the salon then closes is never cancelled by itself (product owner, 10.11.2026): the till marks the ones nobody
		# has begun « to handle », for the cashier to move or cancel with the customer
		# (the planning lane says it on each appointment: a lane that does not leaves the day's own word to say it)
		for row in rows:
			if (
				not row["to_handle"]
				and not row["busy"]
				and row["state"] == "booked"
				and not row["in_the_till"]
			):
				row["to_handle"] = "closed"
	return {
		"available": True,
		"date": str(day),
		"visibility": visibility,
		"capabilities": capabilities,
		"salon": salon,
		"mine": sorted(mine),
		"people": people,
		"appointments": rows,
	}


@frappe.whitelist(methods=["POST"])
def take_appointment(booking: str, pos_profile: str, date: str | None = None) -> dict:
	"""The draft of one appointment, made or found, for the till to load into its cart: the draft of the contract, with its lines, each
	with its sales person and its options, the customer, and what the customer has already paid. The till then pays THIS draft. `date` is the day
	of the agenda the appointment was touched on (today by default): the day view of that day is where the cashier's right to it is read."""
	booking = _gate(pos_profile, booking, date)
	answer = _first_answer(DRAFT_HOOK, booking, pos_profile)
	if answer is None:
		frappe.throw(_("This till does not take appointments."))
	return _draft(answer, booking, pos_profile)


@frappe.whitelist()
def check_appointment_move(
	booking: str, pos_profile: str, starts_at: str, sales_person: str | None = None, date: str | None = None
) -> dict:
	"""Whether an appointment could go to this hour (and to this person): `{"ok", "why"}`. Not a promise: the move asks the engine again, under its lock."""
	booking = _gate(pos_profile, booking, date)
	answer = _first_answer(
		CHECK_MOVE_HOOK,
		pos_profile,
		booking,
		_the_moment(starts_at, _("The new time")),
		_a_person(sales_person),
	)
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not take appointments."))
	return {"ok": bool(cint(answer.get("ok"))), "why": _text(answer.get("why"), 300)}


@frappe.whitelist(methods=["POST"])
def move_appointment(
	booking: str,
	pos_profile: str,
	starts_at: str,
	sales_person: str | None = None,
	notify=1,
	date: str | None = None,
) -> dict:
	"""Move an appointment to another hour, and to another person when one is named. The planning lane warns the customer when `notify`, checks the
	slot under its own lock and refuses in its own words; it answers `{"booking", "from", "to", "provider_changed", "notified"}`."""
	booking = _gate(pos_profile, booking, date)
	answer = _first_answer(
		MOVE_HOOK,
		pos_profile,
		booking,
		_the_moment(starts_at, _("The new time")),
		_a_person(sales_person),
		1 if cint(notify) else 0,
	)
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not take appointments."))
	notified = answer.get("notified") if isinstance(answer.get("notified"), dict) else {}
	return {
		"booking": booking,
		"from": _moment(answer.get("from")),
		"to": _moment(answer.get("to")),
		"provider_changed": bool(cint(answer.get("provider_changed"))),
		"notified": {"email": bool(cint(notified.get("email"))), "sms": bool(cint(notified.get("sms")))},
	}


@frappe.whitelist(methods=["POST"])
def cancel_appointment(
	booking: str, pos_profile: str, reason: str = "cancelled", notify=1, date: str | None = None
) -> dict:
	"""Cancel an appointment (the customer cancels) or mark it absent (she did not come). The reservation gives back what was paid online and answers
	`{"state", "refunded", "to_refund"}`: what it refunded, and what is still to be given back when the refund did not go through."""
	booking = _gate(pos_profile, booking, date)
	if reason not in CANCEL_REASONS:
		frappe.throw(_("This reason is not known."))
	answer = _first_answer(CANCEL_HOOK, booking, pos_profile, reason, bool(cint(notify)))
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not take appointments."))
	default = "absent" if reason == "no_show" else "cancelled"
	return {
		"booking": booking,
		"state": answer.get("state") if answer.get("state") in ("cancelled", "absent") else default,
		"refunded": max(_number(answer.get("refunded")), 0.0),
		"to_refund": max(_number(answer.get("to_refund")), 0.0),
	}


REPEAT_STATES = ("free", "shifted", "skipped", "beyond")


def _repeat_dates(value) -> list[dict]:
	"""The dates of a preview as the till reads them: where each stands (free, shifted to the nearest free hour, skipped, beyond the booking horizon)."""
	dates = []
	if not isinstance(value, list):
		return dates
	for row in value[:MOST_REPEATS]:
		if not isinstance(row, dict) or row.get("state") not in REPEAT_STATES:
			continue
		dates.append(
			{
				"index": cint(row.get("index")),
				"date": _text(row.get("date"), 10),
				"starts_at": _moment(row.get("starts_at")) if _text(row.get("starts_at")) else None,
				"was": _hour(row.get("was")),
				"state": row["state"],
				"why": _text(row.get("why"), 300),
			}
		)
	return dates


def _changes(value) -> dict | None:
	"""The dates the cashier changed by hand, `{"<index>": "YYYY-MM-DD HH:MM"}`: only well-formed ones, at most one per date of the series."""
	if isinstance(value, str):
		try:
			value = json.loads(value) if value.strip() else None
		except ValueError:
			value = None
	if not isinstance(value, dict):
		return None
	changes = {}
	for index, moment in list(value.items())[:MOST_REPEATS]:
		text = _text(moment, 16)
		if (
			cint(index) in range(1, MOST_REPEATS + 1)
			and text
			and re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$", text)
		):
			changes[str(cint(index))] = text
	return changes or None


@frappe.whitelist(methods=["POST"])
def repeat_appointment(
	booking: str,
	pos_profile: str,
	every_weeks,
	count=None,
	until: str | None = None,
	changes=None,
	confirm=0,
	date: str | None = None,
) -> dict:
	"""Repeat an appointment every so many weeks: a preview of the dates, each checked one by one (`confirm` 0), then their booking (`confirm` 1).

	The preview answers `{"mode": "preview", "every_weeks", "max", "dates"}`; the booking `{"mode": "booked", "series", "booked", "skipped"}`. The same person, the same
	service and the same customer: the reservation books ordinary appointments, each paid on its day. Which dates are free is the reservation's word, asked again at the
	moment of the booking.
	"""
	booking = _gate(pos_profile, booking, date)
	weeks = cint(every_weeks)
	if not 1 <= weeks <= MOST_WEEKS:
		frappe.throw(_("Repeat every 1 to {0} weeks.").format(MOST_WEEKS))
	times = cint(count) if count not in (None, "") else None
	if times is not None and not 1 <= times <= MOST_REPEATS:
		frappe.throw(_("Repeat 1 to {0} times.").format(MOST_REPEATS))
	last = str(getdate(until)) if until else None
	if times is None and last is None:
		frappe.throw(_("Say how many times, or until when."))
	answer = _first_answer(
		REPEAT_HOOK, pos_profile, booking, weeks, times, last, _changes(changes), 1 if cint(confirm) else 0
	)
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not repeat appointments."))
	if cint(confirm):
		return {
			"mode": "booked",
			"series": _text(answer.get("series")),
			"booked": [
				{
					"index": cint(row.get("index")),
					"booking": _text(row.get("booking")),
					"starts_at": _moment(row.get("starts_at")),
					"state": _text(row.get("state"), 20),
				}
				for row in (answer.get("booked") or [])[:MOST_REPEATS]
				if isinstance(row, dict) and _text(row.get("booking"))
			],
			"skipped": [
				{
					"index": cint(row.get("index")),
					"date": _text(row.get("date"), 10),
					"why": _text(row.get("why"), 300),
				}
				for row in (answer.get("skipped") or [])[:MOST_REPEATS]
				if isinstance(row, dict)
			],
		}
	return {
		"mode": "preview",
		"every_weeks": cint(answer.get("every_weeks")) or weeks,
		"max": min(cint(answer.get("max")) or MOST_REPEATS, MOST_REPEATS),
		"dates": _repeat_dates(answer.get("dates")),
	}


@frappe.whitelist(methods=["POST"])
def clock_appointment(
	booking: str, pos_profile: str, action: str, sales_person: str | None = None, date: str | None = None
) -> dict:
	"""Start, pause or finish the time of an appointment (a person has one running at a time: starting another puts hers in pause by itself).
	The till never sends an hour: the server reads its clock. `sales_person` only when the person timed is not the appointment's own one
	(the front desk that starts it for a colleague). Answers the state of the clock afterwards."""
	_gate(pos_profile)
	person = _a_person(sales_person)
	booking = _gate(pos_profile, booking, date, person)
	if action not in CLOCK_ACTIONS:
		frappe.throw(_("This action is not known."))
	answer = _first_answer(TIME_ACTION_HOOK, booking, action, pos_profile, _employee_of(person))
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not take appointments."))
	return {"booking": booking, "clock": _clock(answer)}


def _service(row) -> dict | None:
	if not isinstance(row, dict) or not _text(row.get("item_code")):
		return None
	groups = []
	for group in (row.get("options") or [])[:MOST_GROUPS]:
		if not isinstance(group, dict) or not _text(group.get("group")):
			continue
		# `item` is the article that sells the choice: it is what the reservation applies to the booking when the till sends the choice back
		choices = [
			{
				"item": _text(choice.get("item")),
				"label": _text(choice.get("label")),
				"price_delta": _number(choice.get("price_delta")),
			}
			for choice in (group.get("choices") or [])[:MOST_CHOICES]
			if isinstance(choice, dict) and _text(choice.get("label"))
		]
		groups.append(
			{
				"group": _text(group.get("group")),
				"required": bool(cint(group.get("required"))),
				"choices": choices,
			}
		)
	people = [
		{"sales_person": _text(p.get("sales_person")), "duration_minutes": cint(p.get("duration_minutes"))}
		for p in (row.get("people") or [])[:MOST_PEOPLE]
		if isinstance(p, dict) and _text(p.get("sales_person"))
	]
	return {
		"item_code": _text(row.get("item_code")),
		"label": _text(row.get("label")) or _text(row.get("item_code")),
		"price": _number(row.get("price")),
		"duration_minutes": cint(row.get("duration_minutes")),
		"options": groups,
		"people": people,
	}


@frappe.whitelist()
def get_services(pos_profile: str) -> list[dict]:
	"""What can be booked at this till: the services, their options and who does them."""
	_gate(pos_profile)
	answer = _first_answer(SERVICES_HOOK, pos_profile)
	if answer is None:
		return []
	if not isinstance(answer, list):
		frappe.throw(_("The services could not be read."))
	return [s for s in (_service(r) for r in answer[:MOST_SERVICES]) if s]


@frappe.whitelist()
def get_slots(pos_profile: str, date: str, items, sales_person: str | None = None) -> list[dict]:
	"""The free slots of the day for a chain of services, with the person of its first step (none named: whoever the reservation puts there)."""
	_gate(pos_profile)
	answer = _first_answer(
		SLOTS_HOOK, pos_profile, str(getdate(date)), _chain(items), _a_person(sales_person)
	)
	if answer is None:
		return []
	if not isinstance(answer, list):
		frappe.throw(_("The free slots could not be read."))
	slots = []
	for row in answer[:MOST_SLOTS]:
		if isinstance(row, dict) and _moment(row.get("starts_at")):
			slots.append(
				{
					"starts_at": _moment(row.get("starts_at")),
					"sales_person": _text(row.get("sales_person")),
					"sales_person_name": _text(row.get("sales_person_name")),
				}
			)
	return slots


@frappe.whitelist(methods=["POST"])
def book_appointment(
	pos_profile: str,
	customer: str,
	items,
	starts_at: str,
	sales_person: str | None = None,
	notify=1,
) -> dict:
	"""Book a new appointment for a customer: the services in their order, the hour of the first one, and a person or none (the reservation
	places each step). The customer pays at the till: nothing is paid here. Answers the booking made, as `{"booking"}` at least."""
	_gate(pos_profile)
	if not frappe.db.exists("Customer", customer):
		frappe.throw(_("This customer is not known."))
	answer = _first_answer(
		BOOK_HOOK,
		pos_profile,
		customer,
		_chain(items),
		_the_moment(starts_at, _("The time of the appointment")),
		_a_person(sales_person),
		bool(cint(notify)),
	)
	if not isinstance(answer, dict) or not _text(answer.get("booking")):
		frappe.throw(_("This appointment could not be read."))
	return {"booking": _text(answer.get("booking")), "starts_at": _moment(answer.get("starts_at"))}
