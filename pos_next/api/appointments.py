# //// Neoffice — added file (no upstream equivalent).
"""The salon mode of the till: the day's appointments and what the till does with them (NeoSalon, step 2, lot G4; product owner, 10.11.2026).

A salon books its customers in a reservation app. In salon mode the till shows the day's agenda and works the appointments: it takes one over
(a DRAFT Sales Invoice the reservation prepared, loaded into the cart and paid as THAT draft, never a second invoice), moves it, cancels it,
starts and stops its steps (the time of the work), and books a new one.

POS Next never names a reservation app, nor a client: it calls functions of the site through extension points (hooks, like
`pos_next_bootstrap_settings`) and takes the first answer that is not None. There are nine, one per gesture:

- `pos_next_appointments_of_the_day`  `(pos_profile, date, providers=None) -> {"people", "appointments"} | list | None`  the agenda of the day;
- `pos_next_appointment_draft`        `(booking, pos_profile) -> {"invoice", ...} | None`  the draft of one appointment (made or found);
- `pos_next_appointment_move`         `(booking, pos_profile, starts_at, sales_person=None, step=None, notify=True) -> dict`;
- `pos_next_appointment_cancel`       `(booking, pos_profile, reason="cancelled", notify=True) -> dict`;
- `pos_next_appointment_clock`        `(booking, pos_profile, action, step=None, sales_person=None, at=None) -> dict`  start or stop a step;
- `pos_next_appointment_services`     `(pos_profile) -> list[dict]`  what can be booked at the till, with its options and its people;
- `pos_next_appointment_slots`        `(pos_profile, date, items, sales_person=None) -> list[dict]`  the free slots of a chain of services;
- `pos_next_appointment_book`         `(pos_profile, customer, items, starts_at, sales_person=None, notify=True) -> dict`;
- `pos_next_appointment_sold`         `(booking, invoice, pos_profile, replaced) -> None`  after an offline sale was synchronised.

The shapes are the contract of the plan (note 10 of the vault, § G4, « Contrat v2 »). The user of the session is the cashier: the hooks decide what
that cashier may see and do and mask the rest on the server (a colleague's appointment comes as « busy », without a name). What a hook answers is
the site's own code, not the cashier's input, but the till still reads only the keys it knows, with the types it expects, cuts every list, drops
what a « busy » appointment must not carry, and checks that a draft it is given is a draft of ITS till and of the appointment asked for.

The mode is off until a till manager ticks `POS Settings.enable_appointments` (a shop till), and absent where the site has no hook: then the list
is not available and nothing is taken, moved, cancelled, started or booked.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime, nowdate

LIST_HOOK = "pos_next_appointments_of_the_day"
DRAFT_HOOK = "pos_next_appointment_draft"
MOVE_HOOK = "pos_next_appointment_move"
CANCEL_HOOK = "pos_next_appointment_cancel"
CLOCK_HOOK = "pos_next_appointment_clock"
SERVICES_HOOK = "pos_next_appointment_services"
SLOTS_HOOK = "pos_next_appointment_slots"
BOOK_HOOK = "pos_next_appointment_book"
SOLD_HOOK = "pos_next_appointment_sold"

# More than a salon books in a day, and than one appointment holds lines: a hook that answers more is cut, never trusted
MOST_APPOINTMENTS = 200
MOST_PEOPLE = 60
MOST_STEPS = 50
MOST_LINES = 100
MOST_SERVICES = 300
MOST_SLOTS = 200
MOST_GROUPS = 12
MOST_CHOICES = 30
MOST_IN_A_CHAIN = 10
MOST_PERIODS = 6
OPTIONS_LENGTH = 5000
# A gesture replayed from a till that was offline: not from the future, and not from before a week
REPLAY_FUTURE_MINUTES = 5
REPLAY_PAST_DAYS = 7

STATES = ("booked", "started", "finished", "paid", "absent")
PERSON_STATUSES = ("here", "later", "leave", "holiday", "off", "unknown")
CLOCK_STATES = ("idle", "running", "done")
CANCEL_REASONS = ("cancelled", "no_show")
CLOCK_ACTIONS = ("start", "stop")

_HOUR = re.compile(r"^\d{2}:\d{2}$")


def site_has_appointments() -> bool:
	"""Whether the site has a reservation app that answers for the till (a hook of the list)."""
	return bool(frappe.get_hooks(LIST_HOOK))


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
	for path in frappe.get_hooks(hook) or []:
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
	"""The clock of a step: its state and the moments it started and stopped."""
	value = value if isinstance(value, dict) else {}
	state = value.get("state") if value.get("state") in CLOCK_STATES else "idle"
	return {
		"state": state,
		"started_at": _moment(value.get("started_at")),
		"ended_at": _moment(value.get("ended_at")),
	}


def _step(row, busy: bool) -> dict | None:
	if not isinstance(row, dict):
		return None
	return {
		"step": cint(row.get("step")) or None,
		"label": None if busy else _text(row.get("label")),
		"item_code": None if busy else _text(row.get("item_code")),
		"qty": 1.0 if busy else (_number(row.get("qty")) or 1.0),
		"options": None if busy else _options(row.get("options")),
		"starts_at": _moment(row.get("starts_at")),
		"ends_at": _moment(row.get("ends_at")),
		"sales_person": _text(row.get("sales_person")),
		"sales_person_name": _text(row.get("sales_person_name")),
		"clock": _clock(None if busy else row.get("clock")),
	}


def _can(value, state: str, busy: bool) -> dict:
	"""What the cashier may do with an appointment: what the reservation says, within what its state allows (a paid one is not moved)."""
	allowed = {
		"collect": state in ("booked", "started", "finished"),
		"move": state == "booked",
		"cancel": state == "booked",
		"clock": state in ("booked", "started"),
	}
	if busy:
		return dict.fromkeys(allowed, False)
	value = value if isinstance(value, dict) else None
	return {key: allowed[key] and (True if value is None else bool(cint(value.get(key)))) for key in allowed}


def _appointment(row) -> dict | None:
	"""An appointment of the agenda, as the till reads it: only its own keys, and nothing that has no booking to take.

	A « busy » appointment (a colleague's, for a cashier who may not read it) carries only its hours and its person: whatever the hook
	said besides is dropped here as well, so that a hook that forgets to mask does not put a customer's name on the screen.
	"""
	if not isinstance(row, dict) or not _text(row.get("booking")):
		return None
	busy = bool(cint(row.get("busy")))
	state = row.get("state") if row.get("state") in STATES else "booked"
	in_the_till = bool(cint(row.get("in_the_till"))) and not busy
	steps = [s for s in (_step(r, busy) for r in (row.get("steps") or [])[:MOST_STEPS]) if s]
	return {
		"booking": _text(row.get("booking")),
		"starts_at": _moment(row.get("starts_at")),
		"ends_at": _moment(row.get("ends_at")),
		"customer": None if busy else _text(row.get("customer")),
		"customer_name": None if busy else _text(row.get("customer_name")),
		"steps": steps,
		"amount": 0.0 if busy else _number(row.get("amount")),
		"paid_amount": 0.0 if busy else _number(row.get("paid_amount")),
		"state": state,
		"invoice": None if busy or not (in_the_till or state == "paid") else _text(row.get("invoice")),
		"in_the_till": in_the_till,
		"busy": busy,
		"can": _can(row.get("can"), state, busy),
	}


def _person(row) -> dict | None:
	"""A column of the agenda: a person, how she stands today and the hours she works."""
	if not isinstance(row, dict) or not _text(row.get("sales_person")):
		return None
	periods = []
	for period in (row.get("hours") or [])[:MOST_PERIODS]:
		if isinstance(period, list | tuple) and len(period) == 2 and _hour(period[0]) and _hour(period[1]):
			periods.append([_hour(period[0]), _hour(period[1])])
	return {
		"sales_person": _text(row.get("sales_person")),
		"sales_person_name": _text(row.get("sales_person_name")) or _text(row.get("sales_person")),
		"status": row.get("status") if row.get("status") in PERSON_STATUSES else "unknown",
		"status_note": _text(row.get("status_note")),
		"hours": periods,
	}


def _people_of(appointments: list[dict]) -> list[dict]:
	"""The columns when a hook answers only a list of appointments: the people who have a step in them, in the order of their first step."""
	seen = {}
	for appointment in appointments:
		for step in appointment["steps"]:
			if step["sales_person"] and step["sales_person"] not in seen:
				seen[step["sales_person"]] = {
					"sales_person": step["sales_person"],
					"sales_person_name": step["sales_person_name"] or step["sales_person"],
					"status": "unknown",
					"status_note": None,
					"hours": [],
				}
	return list(seen.values())


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


def _gate(pos_profile: str, booking: str | None = None) -> str | None:
	"""The door of every gesture: a cashier of this till, on a till in salon mode; the booking, when one is asked, cleaned."""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if booking is not None:
		if not isinstance(booking, str) or not booking.strip():
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		booking = booking.strip()
	if not appointments_enabled(pos_profile):
		frappe.throw(_("This till does not take appointments."))
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


def _a_step(step) -> int | None:
	"""The rank of a step, or None for the whole appointment."""
	if step in (None, ""):
		return None
	rank = cint(step)
	if rank < 1 or rank > MOST_STEPS:
		frappe.throw(_("This step is not known."))
	return rank


def _the_appointment(answer, booking: str | None = None) -> dict:
	"""The appointment a gesture answers, as the agenda reads one; refused when it is another appointment's or none."""
	row = _appointment(answer)
	if row is None or (booking is not None and row["booking"] != booking):
		frappe.throw(_("This appointment could not be read."))
	return row


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


def draft_of_the_appointment(booking, pos_profile) -> str | None:
	"""The draft an offline sale of an appointment replaces, or None: what the reservation names for that appointment, when it is a draft of THIS till.

	Never raises: a reservation that refuses (the appointment was cancelled, or is paid already), that has no hook or that breaks leaves the sale
	to be an ordinary invoice, and the reservation is told so afterwards (`after_an_offline_sale`).
	"""
	if not isinstance(booking, str) or not booking.strip():
		return None
	try:
		answer = _first_answer(DRAFT_HOOK, booking.strip(), pos_profile)
		name = _text(answer.get("invoice")) if isinstance(answer, dict) else None
		row = (
			frappe.db.get_value("Sales Invoice", name, ["docstatus", "pos_profile", "is_pos"], as_dict=True)
			if name
			else None
		)
		if row and cint(row.docstatus) == 0 and cint(row.is_pos) and row.pos_profile == pos_profile:
			return name
	except frappe.ValidationError:
		# The reservation's own « no » (cancelled, paid already): nothing to replace, and nothing to log
		return None
	except Exception:
		frappe.log_error("The appointments hook failed", frappe.get_traceback())
	return None


def after_an_offline_sale(booking, invoice: str, pos_profile, replaced: bool) -> None:
	"""Tell the reservation that the sale of an appointment made offline is booked: `replaced` when it took the place of the appointment's draft.

	Never raises: the sale is submitted, and a reservation that fails to hear of it must not turn it into an error at the till.
	"""
	try:
		if isinstance(booking, str) and booking.strip():
			_first_answer(SOLD_HOOK, booking.strip(), invoice, pos_profile, bool(replaced))
	except Exception:
		frappe.log_error("The appointments hook failed", frappe.get_traceback())


@frappe.whitelist()
def get_appointments(pos_profile: str, date: str | None = None, providers=None) -> dict:
	"""The agenda of the day of the till: `{"available", "date", "people", "appointments"}`.

	Not available (nothing to show, nothing done) while the till's tick is off or where the site has no reservation app. The people are the
	columns; when the reservation answers only a list of appointments, they are the people who have a step in it.
	"""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	day = getdate(date or nowdate())
	names = _names(providers)
	nothing = {"available": False, "date": str(day), "people": [], "appointments": []}
	if not appointments_enabled(pos_profile) or not site_has_appointments():
		return nothing
	answer = _first_answer(LIST_HOOK, pos_profile, str(day), names)
	if answer is None:
		return nothing
	if isinstance(answer, dict):
		given_people, given_rows = answer.get("people") or [], answer.get("appointments") or []
	elif isinstance(answer, list):
		given_people, given_rows = [], answer
	else:
		frappe.throw(_("The appointments could not be read."))
	if not isinstance(given_people, list) or not isinstance(given_rows, list):
		frappe.throw(_("The appointments could not be read."))
	rows = [a for a in (_appointment(r) for r in given_rows[:MOST_APPOINTMENTS]) if a]
	rows.sort(key=lambda row: row["starts_at"] or "")
	people = [p for p in (_person(r) for r in given_people[:MOST_PEOPLE]) if p] or _people_of(rows)
	return {"available": True, "date": str(day), "people": people, "appointments": rows}


@frappe.whitelist(methods=["POST"])
def take_appointment(booking: str, pos_profile: str) -> dict:
	"""The draft of one appointment, made or found, for the till to load into its cart: the draft of the contract, with its lines, each
	with its sales person and its options, the customer, and what the customer has already paid. The till then pays THIS draft."""
	booking = _gate(pos_profile, booking)
	answer = _first_answer(DRAFT_HOOK, booking, pos_profile)
	if answer is None:
		frappe.throw(_("This till does not take appointments."))
	return _draft(answer, booking, pos_profile)


@frappe.whitelist(methods=["POST"])
def move_appointment(
	booking: str,
	pos_profile: str,
	starts_at: str,
	sales_person: str | None = None,
	step: int | None = None,
	notify=1,
) -> dict:
	"""Move an appointment: the whole of it in time, or one of its steps (its hour, its person). The reservation warns the customer when
	`notify`, and checks the slot under its own lock; it answers the appointment as it now stands, or refuses in its own words."""
	booking = _gate(pos_profile, booking)
	answer = _first_answer(
		MOVE_HOOK,
		booking,
		pos_profile,
		_the_moment(starts_at, _("The new time")),
		_a_person(sales_person),
		_a_step(step),
		bool(cint(notify)),
	)
	if answer is None:
		frappe.throw(_("This till does not take appointments."))
	return _the_appointment(answer, booking)


@frappe.whitelist(methods=["POST"])
def cancel_appointment(booking: str, pos_profile: str, reason: str = "cancelled", notify=1) -> dict:
	"""Cancel an appointment (the customer cancels) or mark it absent (she did not come). Answers `{"state", "to_refund"}`: what had been paid
	online and is to be given back, which the till says and does not move."""
	booking = _gate(pos_profile, booking)
	if reason not in CANCEL_REASONS:
		frappe.throw(_("This reason is not known."))
	answer = _first_answer(CANCEL_HOOK, booking, pos_profile, reason, bool(cint(notify)))
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not take appointments."))
	default = "absent" if reason == "no_show" else "cancelled"
	return {
		"booking": booking,
		"state": answer.get("state") if answer.get("state") in ("cancelled", "absent") else default,
		"to_refund": max(_number(answer.get("to_refund")), 0.0),
	}


@frappe.whitelist(methods=["POST"])
def clock_appointment(
	booking: str,
	pos_profile: str,
	action: str,
	step: int | None = None,
	sales_person: str | None = None,
	at: str | None = None,
) -> dict:
	"""Start or stop a step of an appointment: the time of the work. `at` is only for a gesture made while the till was offline and replayed
	now (the moment it was really made: never from the future, never from before a week); without it the reservation reads its own clock."""
	booking = _gate(pos_profile, booking)
	if action not in CLOCK_ACTIONS:
		frappe.throw(_("This action is not known."))
	moment = None
	if at not in (None, ""):
		moment = _the_moment(at, _("The time of the gesture"))
		when = get_datetime(moment)
		if when > add_to_date(now_datetime(), minutes=REPLAY_FUTURE_MINUTES) or when < add_to_date(
			now_datetime(), days=-REPLAY_PAST_DAYS
		):
			frappe.throw(_("The time of the gesture is not valid."))
	answer = _first_answer(
		CLOCK_HOOK, booking, pos_profile, action, _a_step(step), _a_person(sales_person), moment
	)
	if answer is None:
		frappe.throw(_("This till does not take appointments."))
	return _the_appointment(answer, booking)


def _service(row) -> dict | None:
	if not isinstance(row, dict) or not _text(row.get("item_code")):
		return None
	groups = []
	for group in (row.get("options") or [])[:MOST_GROUPS]:
		if not isinstance(group, dict) or not _text(group.get("group")):
			continue
		choices = [
			{"label": _text(choice.get("label")), "price_delta": _number(choice.get("price_delta"))}
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
	places each step). The customer pays at the till: nothing is paid here."""
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
	if answer is None:
		frappe.throw(_("This till does not take appointments."))
	return _the_appointment(answer)
