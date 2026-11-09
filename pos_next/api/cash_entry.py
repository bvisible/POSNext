# //// Neoffice — added file (no upstream equivalent). Upstream POSNext has no cash in / cash
# //// out: a till float taken out or a change fund put in had to be booked by hand in the ERP,
# //// so the shift closing never matched the drawer. Movements are posted as submitted Journal
# //// Entries built from Journal Entry Templates, following the erpnextswiss template
# //// structure (totalization / counterparty accounts) and restricted to the templates the
# //// POS Profile allows (6c598630 2026-03-28 "feat: cash in/out from POS using Journal Entry
# //// Templates"; 9cb47184, ee6587a0, 2e2ef1a0, 82b2493a the same day). Rebuilt by NeoResto lot 1,
# //// task 15: booked as each template declares, the till's list enforced, the closing's rule for who
# //// records, link fields instead of the remark, cancel, cap, receipt photo and offline queue.
# Copyright (c) 2024, POS Next and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt

from pos_next import cash_movement


# //// Neoffice — added function (no upstream equivalent). Whoever may work at the named till: a desk
# //// account assigned to the POS Profile, or reading sales invoices as every cashier does, or a till
# //// manager (TILL_MANAGER_ROLES), who works at any till. The till's money endpoints (cash in/out,
# //// customer credit) and its read endpoints (settings, payment methods, taxes, approvers...) use
# //// it; those whose POS Profile may be blank pass profile_optional=True: without a profile only
# //// the desk-account half applies, and their blank-profile answer is unchanged.
def require_till_access(pos_profile, profile_optional=False):
	from pos_next.api.partial_payments import _has_pos_profile_access

	require_system_user()
	if profile_optional and not pos_profile:
		return
	# //// Neoffice — a till is named by a text: a list from a payload was read as an operator by the row
	# //// lookup below (maintenance#2296).
	if not pos_profile or not isinstance(pos_profile, str):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	# //// Neoffice — a till manager runs every till but those a User Permission keeps him from
	# //// (maintenance#2296): see user_permissions_leave_till.
	if is_till_manager() and user_permissions_leave_till(pos_profile):
		return
	if not _has_pos_profile_access(pos_profile):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). Whether the caller's User Permissions leave him
# //// this till: its POS Profile and its company. The gate asked the doctype alone, with no document, so a
# //// user kept to one company worked at any till with permissions off, and his sales were posted to the
# //// other company's books (maintenance#2296). A row of the till's own user table is an assignment and is
# //// answered before this (partial_payments._has_pos_profile_access), so that no assigned cashier stops. No
# //// User Permission at all, the case of nearly every account, costs one cached read.
def user_permissions_leave_till(pos_profile):
	from frappe.permissions import get_user_permissions

	kept_to = get_user_permissions(frappe.session.user)
	if not (kept_to.get("POS Profile") or kept_to.get("Company")):
		return True
	for doctype, value in (
		("POS Profile", pos_profile),
		("Company", frappe.db.get_value("POS Profile", pos_profile, "company")),
	):
		allowed = [
			row.doc for row in kept_to.get(doctype) or [] if row.applicable_for in (None, "", "Sales Invoice")
		]
		if allowed and value not in allowed:
			return False
	return True


# //// Neoffice — added function (no upstream equivalent). The right every cashier holds, read on the roles:
# //// `frappe.has_permission` with no document is also true on one shared invoice, which is no till
# //// (maintenance#2296).
def reads_sales_invoices():
	from frappe.permissions import get_role_permissions

	user = frappe.session.user
	return bool(get_role_permissions(frappe.get_meta("Sales Invoice"), user=user).get("read"))


# //// Neoffice — added function (no upstream equivalent). Whether the session user is a desk account:
# //// the one rule every gate of the till and of the restaurant reads (require_system_user,
# //// is_till_manager, pos_next.restaurant.permissions). A visitor or a portal account (Website User) is
# //// not, whatever roles it was given. Administrator is a desk account by construction (frappe fixes
# //// its user_type), so it is answered without a lookup.
def is_desk_account():
	user = frappe.session.user
	if user == "Administrator":
		return True
	return user != "Guest" and frappe.get_cached_value("User", user, "user_type") == "System User"


# //// Neoffice — added function (no upstream equivalent). The desk-account half of
# //// require_till_access, for the till's endpoints that name no POS Profile: a visitor or a portal
# //// account (Website User) is refused (is_desk_account).
def require_system_user():
	if not is_desk_account():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added (no upstream equivalent). The roles that run every till, not just the ones
# //// they are assigned to: the fork's till manager, the customer's own administrator (Admin; System
# //// Manager is held by our Administrator alone, so an admin capability is never gated on it alone)
# //// and System Manager. The one list of them: a new manager role is added here.
TILL_MANAGER_ROLES = ("POSNext Manager", "Admin", "System Manager")


# //// Neoffice — added function (no upstream equivalent). A desk account holding one of
# //// TILL_MANAGER_ROLES. A portal account is never a till manager, whatever roles it was given.
def is_till_manager():
	user = frappe.session.user
	if user == "Administrator":
		return True
	if not is_desk_account():
		return False
	return bool(set(TILL_MANAGER_ROLES).intersection(frappe.get_roles(user)))


# //// Neoffice — added function (no upstream equivalent). An endpoint that reads across every till
# //// (every gift card with its balance, for instance) answers a till manager only.
def require_till_manager():
	if not is_till_manager():
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). The till's endpoints that may name no POS
# //// Profile: with one named, whoever may work at that till (require_till_access); with none, a
# //// desk account that works at some till (assigned to a POS Profile, reading sales invoices as
# //// every cashier does, or a till manager). A visitor, a portal account and a desk account with
# //// no till are refused.
def require_till_user(pos_profile=None):
	if pos_profile:
		require_till_access(pos_profile)
		return
	require_system_user()
	user = frappe.session.user
	if user == "Administrator" or is_till_manager():
		return
	# //// Neoffice — on the roles (reads_sales_invoices): one shared invoice is no till (maintenance#2296).
	if not (frappe.db.exists("POS Profile User", {"user": user}) or reads_sales_invoices()):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


# //// Neoffice — added function (no upstream equivalent). A till endpoint that names a document (an
# //// invoice, a shift): whoever may work at the document's till, its pos_profile; a document with no
# //// till asks for a till user. The desk-account check runs before the name is looked up, so a
# //// portal account cannot learn which documents exist.
def require_document_till(doctype, name):
	require_system_user()
	pos_profile = None
	if name and isinstance(name, str):
		pos_profile = frappe.db.get_value(doctype, name, "pos_profile")
	require_till_user(pos_profile)


# //// Neoffice — added (no upstream equivalent). The till's drawer movements (« Entrées/Sorties de
# //// caisse ») were rebuilt to the standard of upstream's POS expense (NeoResto lot 1, task 15; study
# //// cash-movements-study.md, option A). The journal entry is written by pos_next.cash_movement, which
# //// books exactly what the template declares; the endpoints below decide who may record, cancel and
# //// attach, and keep the till's list of operations a control the server checks on every write.
# The receipt the cashier attaches: upstream's POS expense checks, copied (attach_pos_expense_file).
ATTACHMENT_EXTENSIONS = (
	".jpg",
	".jpeg",
	".png",
	".gif",
	".pdf",
	".txt",
	".csv",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".odt",
	".ods",
)

NOTE_MAX_LENGTH = 500


# //// Neoffice — added (no upstream equivalent). Who records, cancels or reads a till's drawer movements:
# //// the rule of the closing (require_shift_access), that is the shift's own cashier at a till they may use,
# //// or a till manager (TILL_MANAGER_ROLES) on any till's shift (defect D3). NeoResto's purse model (lot 4:
# //// one cash fund, several sommeliers) will change who records; this is the one function to change.
def require_cash_movement_access(pos_opening_shift):
	"""Refuse unless the caller may work on this shift's drawer; return the shift's stored values, its name
	included (require_shift_access reads the values only)."""
	from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import require_shift_access

	return frappe._dict(require_shift_access(pos_opening_shift), name=pos_opening_shift)


def _shift_is_open(opening):
	return cint(opening.docstatus) == 1 and opening.status == "Open" and not opening.pos_closing_shift


def _lock_shift(opening):
	"""Lock the shift's row and read its state again (a locking read: the state committed now). A closing
	being saved locks it too (POSClosingShift.validate): a movement waits for it, then finds the shift
	closed; and two movements of one shift go one after the other. The lock alone gives no fresh view of the
	ledger: what is read after it to decide (the offline id, the cap's total, the closing's list) is read with
	a locking read too, or it would come from the snapshot fixed before the wait."""
	row = frappe.db.sql(
		"select docstatus, status, pos_closing_shift from `tabPOS Opening Shift` where name = %s for update",
		opening.name,
		as_dict=True,
	)
	if row:
		opening.update(row[0])
	return opening


def _out_limit(pos_profile):
	"""The till's cap on money taken out during one shift; 0 when none is set."""
	if not pos_profile or not frappe.db.has_column("POS Profile", "posa_cash_movement_out_limit"):
		return 0
	return flt(frappe.db.get_value("POS Profile", pos_profile, "posa_cash_movement_out_limit"))


def _offline_window_hours(pos_profile):
	"""How many hours after the till recorded a movement offline the server still books it on the till's
	moment (POS Profile.posa_cash_movement_offline_hours; cash_movement.OFFLINE_WINDOW_HOURS where the field is
	not there yet or empty; 0 never believes the till's clock)."""
	if not pos_profile or not frappe.db.has_column("POS Profile", "posa_cash_movement_offline_hours"):
		return cash_movement.OFFLINE_WINDOW_HOURS
	hours = frappe.db.get_value("POS Profile", pos_profile, "posa_cash_movement_offline_hours")
	return cash_movement.OFFLINE_WINDOW_HOURS if hours in (None, "") else cint(hours)


def _with_clock_note(note, device_moment):
	"""The cashier's note, followed by why the movement is booked on the day it reached the server."""
	from frappe.utils import format_datetime

	clock = _("Booked on the day it reached the server: the till's clock said {0}.").format(
		format_datetime(device_moment)
	)
	if not note:
		return clock[:NOTE_MAX_LENGTH]
	room = NOTE_MAX_LENGTH - len(clock) - 3
	return f"{note[: max(0, room)]} — {clock}"[:NOTE_MAX_LENGTH]


def _currency(company):
	return frappe.get_cached_value("Company", company, "default_currency")


def _format_amount(amount, company):
	return frappe.format_value(flt(amount), {"fieldtype": "Currency", "options": _currency(company)})


def _till_operations(pos_profile, company, cash_account):
	"""The till's operations: those it can book (with the drawer direction the server reads from the
	template, so the screen never guesses it) and those it cannot, with the reason."""
	usable, unusable = [], []
	for name in cash_movement.till_template_names(pos_profile):
		if not frappe.db.exists("Journal Entry Template", name):
			unusable.append(
				{"name": name, "template_title": name, "reason": _("{0} no longer exists.").format(name)}
			)
			continue
		definition = cash_movement.template_definition(name)
		problem = cash_movement.definition_problem(definition, cash_account, company)
		if not problem:
			try:
				vat_applies = cash_movement.vat_applies(definition, cash_account, company)
			except cash_movement.VatEngineUnavailable as error:
				# Its account names a VAT rate the desk's logic cannot work out here: listed with the reason.
				problem = f"{definition.title}: {error}"
		if problem:
			unusable.append({"name": name, "template_title": definition.title, "reason": problem})
			continue
		usable.append(
			{
				"name": name,
				"template_title": definition.title,
				"voucher_type": definition.voucher_type,
				"direction": cash_movement.drawer_direction(definition, cash_account).lower(),
				"account": cash_movement.other_account(definition, cash_account),
				"vat_applies": vat_applies,
				# « Without VAT » is offered on an expense paid out whose VAT is split, never on an income.
				"no_vat_allowed": vat_applies and definition.credit_or_debit == cash_movement.CREDIT,
				# The two account lists a till built before the direction came from the server reads.
				"totalization": [{"account": definition.totalization}],
				"counterparty": [{"account": definition.counterparty}],
			}
		)
	return usable, unusable


@frappe.whitelist()
# //// Neoffice — a name is a text: a list from a JSON body would be read as a filter (maintenance#2296).
def get_cash_entry_templates(company, pos_profile: str | None = None):
	"""The operations the till may record, with their drawer direction. ``company`` is kept for the
	callers that send it; the till's own company is the one that counts."""
	# //// Neoffice — the till's own endpoint: it reads the company's templates and accounts, so only the
	# //// till's users may call it (require_till_user).
	require_till_user(pos_profile)
	if not pos_profile or not cash_movement.till_template_names(pos_profile):
		return []
	till_company = frappe.db.get_value("POS Profile", pos_profile, "company")
	cash_account = cash_movement.till_cash_account(pos_profile, till_company)
	return _till_operations(pos_profile, till_company, cash_account)[0]


def _movement_payload(row, opening=None):
	"""One movement as the till shows it."""
	payload = {
		"name": row.journal_entry,
		"journal_entry": row.journal_entry,
		"posting_date": str(row.posting_date),
		"amount": flt(row.amount),
		"direction": row.direction.lower(),
		"template": row.title,
		"note": row.note,
		"no_vat": cint(row.no_vat),
		"owner": row.owner,
		"creation": str(row.creation),
		# //// Neoffice — the offline id that booked it: the dialog drops a queued row the server's list already shows,
		# //// so a movement whose answer was lost is not counted twice until the next sync (neoffice-maintenance#2072).
		"offline_id": row.offline_id or "",
	}
	if opening is not None:
		payload["can_cancel"] = _shift_is_open(opening) and (
			is_till_manager() or row.owner == frappe.session.user
		)
	return payload


@frappe.whitelist()
def get_cash_entries(pos_opening_shift):
	"""The drawer movements recorded during a shift, oldest first."""
	# //// Neoffice — a shift's entries follow the shift's rule (its cashier at a till they may use, or a
	# //// till manager), as its closing data does (require_shift_access).
	opening = require_cash_movement_access(pos_opening_shift)
	return [_movement_payload(row, opening) for row in cash_movement.shift_movements(pos_opening_shift)]


@frappe.whitelist()
def get_cash_movement_dialog_data(pos_opening_shift):
	"""Everything the till's « Cash In/Out » dialog shows, in one call: the dialog keeps it for offline use."""
	opening = require_cash_movement_access(pos_opening_shift)
	pos_profile, company = opening.pos_profile, opening.company
	templates, unusable, setup_problem = [], [], None
	if cash_movement.till_template_names(pos_profile):
		cash_account = cash_movement.till_cash_account(pos_profile, company, required=False)
		if cash_account:
			templates, unusable = _till_operations(pos_profile, company, cash_account)
		else:
			setup_problem = _("The till's cash mode of payment has no account for {0}.").format(company)
	movements = [_movement_payload(row, opening) for row in cash_movement.shift_movements(pos_opening_shift)]
	out_limit = _out_limit(pos_profile)
	out_total = flt(sum(row["amount"] for row in movements if row["direction"] == "out"), 2)
	from frappe.core.api.file import get_max_file_size

	return {
		"pos_profile": pos_profile,
		"pos_opening_shift": opening.name,
		"company": company,
		"currency": _currency(company),
		"templates": templates,
		"unusable": unusable,
		"setup_problem": setup_problem,
		"movements": movements,
		"out_limit": out_limit,
		"out_total": out_total,
		"remaining": max(0, flt(out_limit - out_total, 2)) if out_limit > 0 else None,
		"shift_open": _shift_is_open(opening),
		"max_file_size": get_max_file_size(),
		"attachment_extensions": list(ATTACHMENT_EXTENSIONS),
		# Who reads the dialog: a till manager may set aside the refused movements of every cashier of the
		# device, a cashier their own (the offline queue reads it).
		"user": frappe.session.user,
		"is_till_manager": is_till_manager(),
	}


def _entry_of_offline_id(offline_id):
	"""The entry an offline id already produced, read with a lock so a resend waiting behind the first
	sees it once the first commits."""
	rows = frappe.db.sql(
		"""select name, docstatus, posa_cash_movement_shift as shift
		from `tabJournal Entry`
		where posa_cash_movement_offline_id = %s
		order by creation asc limit 1 for update""",
		offline_id,
		as_dict=True,
	)
	return rows[0] if rows else None


def _created_payload(journal_entry, offline_id=None, **extra):
	row = cash_movement.movement(journal_entry)
	payload = {
		"name": journal_entry,
		"journal_entry": journal_entry,
		"direction": row.direction.lower() if row else None,
		"amount": flt(row.amount) if row else 0,
		"template": row.title if row else "",
		"offline_id": offline_id,
	}
	payload.update(extra)
	return payload


def _check_out_limit(opening, amount):
	"""The till's optional cap on the money its movements take out during one shift. The shift's row is
	locked by the caller and the total is read with a locking read (cash_movement.shift_out_total), so a
	movement committed while this one waited for the lock is counted: two movements recorded at once cannot
	both pass on the same total."""
	limit = _out_limit(opening.pos_profile)
	if limit <= 0:
		return
	taken = cash_movement.shift_out_total(opening.name)
	precision = cash_movement.currency_precision(opening.company)
	if flt(taken + flt(amount), precision) > flt(limit, precision):
		frappe.throw(
			_(
				"This cash out would exceed the till's limit of {0} per shift. Already taken out: {1}. Still allowed: {2}."
			).format(
				_format_amount(limit, opening.company),
				_format_amount(taken, opening.company),
				_format_amount(max(0, limit - taken), opening.company),
			),
			title=_("Cash Out Limit"),
		)


@frappe.whitelist(methods=["POST"])
def create_cash_entry(
	pos_opening_shift, template_name, amount, remark=None, no_vat=0, offline_id=None, moved_at=None
):
	"""Record one drawer movement of an open shift, as the till's operation ``template_name`` declares it.

	``remark`` is the cashier's note. ``no_vat`` books the gross amount with no VAT split (a purchase
	from a supplier outside VAT; refused where the operation is not such a purchase). ``offline_id`` makes a
	resend from the till's offline queue harmless: the entry it already produced is returned, never a second
	one. ``moved_at`` is when the till's offline queue recorded the movement (milliseconds since the epoch;
	an online movement sends none): believed within the till's window, it books the movement on the business
	day it was made; otherwise the movement is booked now and its note says so (cash_movement.booking_moment)."""
	# //// Neoffice — only the shift's cashier or a till manager records (require_cash_movement_access).
	opening = require_cash_movement_access(pos_opening_shift)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero"))
	offline_id = cstr(offline_id).strip() or None
	if offline_id and len(offline_id) > 140:
		frappe.throw(_("Invalid offline id"))
	note = cstr(remark).strip()[:NOTE_MAX_LENGTH]

	_lock_shift(opening)
	if offline_id:
		existing = _entry_of_offline_id(offline_id)
		if existing:
			if existing.shift != opening.name:
				frappe.throw(_("This offline id belongs to another movement."))
			return _created_payload(
				existing.name,
				offline_id,
				duplicate_prevented=True,
				cancelled=cint(existing.docstatus) == 2,
			)

	if not _shift_is_open(opening):
		frappe.throw(_("Shift is not open"))
	if template_name not in cash_movement.till_template_names(opening.pos_profile):
		frappe.throw(_("{0} is not an operation of this till.").format(template_name), frappe.PermissionError)

	company = opening.company
	cash_account = cash_movement.till_cash_account(opening.pos_profile, company)
	definition = cash_movement.template_definition(template_name)
	problem = cash_movement.definition_problem(definition, cash_account, company)
	if problem:
		frappe.throw(problem, title=_("Operation not allowed"))
	if cint(no_vat) and not cash_movement.no_vat_allowed(definition, cash_account, company):
		frappe.throw(
			_(
				"{0} cannot be booked without VAT: that choice is for a purchase from a supplier outside VAT, on an operation whose VAT is worked out."
			).format(definition.title),
			title=_("Operation not allowed"),
		)
	if cash_movement.drawer_direction(definition, cash_account) == cash_movement.OUT:
		_check_out_limit(opening, amount)

	period_start = frappe.db.get_value("POS Opening Shift", opening.name, "period_start_date")
	moment, unused_device_moment = cash_movement.booking_moment(
		period_start, moved_at, _offline_window_hours(opening.pos_profile)
	)
	if unused_device_moment:
		note = _with_clock_note(note, unused_device_moment)
	cost_center = frappe.db.get_value(
		"POS Profile", opening.pos_profile, "cost_center"
	) or frappe.get_cached_value("Company", company, "cost_center")
	entry = cash_movement.book(
		definition,
		cash_account,
		company,
		amount,
		posting_date=cash_movement.business_day(period_start, moment),
		cost_center=cost_center,
		reference=opening.name,
		note=note,
		no_vat=cint(no_vat),
		shift=opening.name,
		offline_id=offline_id,
	)
	return _created_payload(
		entry.name, offline_id, account=cash_movement.other_account(definition, cash_account)
	)


def _tagged_movement(journal_entry):
	"""A drawer movement's entry (not a closing's withdrawal), or a refusal."""
	if not journal_entry or not isinstance(journal_entry, str):
		frappe.throw(_("Journal Entry is required"))
	values = frappe.db.get_value(
		"Journal Entry",
		journal_entry,
		["name", "docstatus", "owner", "posa_cash_movement_shift"],
		as_dict=True,
	)
	if not values or not values.posa_cash_movement_shift:
		frappe.throw(_("{0} is not a cash movement of a till.").format(journal_entry))
	return values


def require_movement_author_or_manager(journal_entry):
	"""Who may cancel a movement or attach its receipt: someone the shift's rule admits who recorded it,
	or a till manager; the shift still open. Returns (entry values, shift values)."""
	require_system_user()
	values = _tagged_movement(journal_entry)
	opening = _lock_shift(require_cash_movement_access(values.posa_cash_movement_shift))
	# The entry's state as committed now (a locking read, see _lock_shift): a cancel that waited behind
	# another one sees it cancelled.
	values.docstatus = frappe.db.sql(
		"select docstatus from `tabJournal Entry` where name = %s for update", values.name
	)[0][0]
	if not is_till_manager() and values.owner != frappe.session.user:
		frappe.throw(
			_("Only the cashier who recorded it or a till manager may change this movement."),
			frappe.PermissionError,
		)
	if not _shift_is_open(opening):
		frappe.throw(_("The shift is closed: this movement can only be changed at the desk."))
	return values, opening


@frappe.whitelist(methods=["POST"])
def cancel_cash_entry(journal_entry, authorization_token=None):
	"""Cancel a movement while its shift is open, by its author or a till manager. When a « Void Cash
	Movement » authorization rule applies, ``authorization_token`` must carry a manager's grant; with no
	rule the cancel proceeds (the gate is opt-in)."""
	from pos_next.authorization import grants
	from pos_next.authorization.actions.cash_movement import ACTION_VOID_CASH_MOVEMENT, void_context
	from pos_next.authorization.gate import enforce_context

	values, opening = require_movement_author_or_manager(journal_entry)
	if cint(values.docstatus) == 2:
		return {
			"name": values.name,
			"journal_entry": values.name,
			"cancelled": True,
			"already_cancelled": True,
		}
	if cint(values.docstatus) != 1:
		frappe.throw(_("{0} is not submitted.").format(values.name))

	enforce_context(
		ACTION_VOID_CASH_MOVEMENT,
		void_context(values.name, opening),
		authorization_token,
		reference=values.name,
	)
	entry = frappe.get_doc("Journal Entry", values.name)
	entry.flags.ignore_permissions = True
	try:
		entry.cancel()
	except Exception:
		# The grant was pinned to this entry when the gate passed: free it, so a failed cancel does not
		# spend the manager's approval.
		grants.release(authorization_token, values.name)
		raise
	return {"name": entry.name, "journal_entry": entry.name, "cancelled": True}


# The subject of the Comment that keeps a refused offline movement the till set aside, followed by its offline
# id: the money moved, no ledger took it, and this Comment on its shift is where the books find it.
SET_ASIDE_MARK = "pos_next: refused cash movement set aside"


@frappe.whitelist(methods=["POST"])
def set_aside_refused_cash_movement(
	pos_opening_shift,
	offline_id,
	reason,
	template_title=None,
	direction=None,
	amount=None,
	remark=None,
	refusal=None,
	recorded_by=None,
	moved_at=None,
):
	"""Set aside a movement the till's offline queue could not book: the server refused it (its shift was
	closed meanwhile, the cap, a right) and it must not be sent again and again. The money moved but no ledger
	has it: a Comment on its shift says who set it aside and why, then what the till reported of it (marked as
	such: only the till knows it), so the books can trace it. The Comment is Administrator's, so neither the
	cashier nor anyone but Administrator can rewrite it. The till then forgets the movement. Answered once per
	offline id and shift; a movement this shift did book under that id is never set aside (``booked``)."""
	opening = require_cash_movement_access(pos_opening_shift)
	offline_id = cstr(offline_id).strip()
	if not offline_id or len(offline_id) > 140:
		frappe.throw(_("Invalid offline id"))
	reason = cstr(reason).strip()[:NOTE_MAX_LENGTH]
	if not reason:
		frappe.throw(_("Say why this movement is set aside: the reason stays on its shift."))
	booked = frappe.db.get_value(
		"Journal Entry",
		{"posa_cash_movement_offline_id": offline_id, "posa_cash_movement_shift": opening.name},
		"name",
	)
	if booked:
		return {"booked": booked}
	subject = f"{SET_ASIDE_MARK}: {offline_id}"
	existing = frappe.db.get_value(
		"Comment",
		{"reference_doctype": "POS Opening Shift", "reference_name": opening.name, "subject": subject},
		"name",
	)
	if existing:
		return {"comment": existing, "already_recorded": True}

	from frappe.utils import escape_html, format_datetime

	moment = cash_movement.device_datetime(moved_at)
	reported = [
		_("{0}, {1} {2}").format(
			cstr(template_title).strip()[:140] or _("Unknown operation"),
			_("into the drawer") if cstr(direction) == "in" else _("out of the drawer"),
			_format_amount(abs(flt(amount)), opening.company),
		),
		_("recorded by {0} on {1}").format(
			cstr(recorded_by).strip()[:140] or _("an unknown cashier"),
			format_datetime(moment) if moment else _("an unknown date"),
		),
	]
	if cstr(remark).strip():
		reported.append(_("note: {0}").format(cstr(remark).strip()[:NOTE_MAX_LENGTH]))
	reported.append(_("refused by the server: {0}").format(cstr(refusal).strip()[:NOTE_MAX_LENGTH] or "-"))
	lines = [
		_("Cash movement made at the till and never booked, set aside by {0}: {1}").format(
			frappe.session.user, reason
		),
		_("As reported by the till: {0}").format("; ".join(reported)),
		_("Offline id: {0}").format(offline_id),
	]
	comment = frappe.get_doc(
		{
			"doctype": "Comment",
			"comment_type": "Comment",
			"reference_doctype": "POS Opening Shift",
			"reference_name": opening.name,
			"subject": subject,
			"content": "<br>".join(escape_html(line) for line in lines),
		}
	)
	comment.insert(ignore_permissions=True)
	# Frappe makes the session user its owner, who may then edit it (frappe.desk.form.utils.update_comment):
	# the trace of money that left no entry belongs to Administrator.
	frappe.db.set_value("Comment", comment.name, "owner", "Administrator", update_modified=False)
	return {"comment": comment.name}


def _attachment_name_problem(filename):
	lower = (filename or "").lower()
	if not any(lower.endswith(extension) for extension in ATTACHMENT_EXTENSIONS):
		return _("File type not allowed. Use JPG, PNG, GIF, PDF, TXT, CSV, or Office documents.")
	return None


def _read_capped(stream, chunk_size=1024 * 1024):
	"""The upload, refused before it is all read when it exceeds the site's maximum file size."""
	from frappe.core.api.file import get_max_file_size

	max_size = get_max_file_size()
	too_large = _("File size exceeded the maximum allowed size of {0} MB").format(flt(max_size / 1048576, 1))
	content_length = frappe.get_request_header("Content-Length")
	if content_length and cint(content_length) > max_size:
		frappe.throw(too_large, title=_("File Too Large"))
	chunks, total = [], 0
	while True:
		chunk = stream.read(chunk_size)
		if not chunk:
			break
		total += len(chunk)
		if total > max_size:
			frappe.throw(too_large, title=_("File Too Large"))
		chunks.append(chunk)
	return b"".join(chunks)


@frappe.whitelist(methods=["POST"])
def attach_cash_entry_file(journal_entry):
	"""Attach the multipart ``file`` of the request (the receipt's photo) to a movement, while its shift is
	open, for its author or a till manager. Sending the same file again (same name and size) attaches it
	once: the offline queue may resend after a lost answer."""
	values, _opening = require_movement_author_or_manager(journal_entry)
	if cint(values.docstatus) != 1:
		frappe.throw(_("{0} is not submitted.").format(values.name))
	files = getattr(getattr(frappe.local, "request", None), "files", None) or {}
	uploaded = files.get("file") if hasattr(files, "get") else None
	filename = cstr(getattr(uploaded, "filename", None)).strip()
	if not uploaded or not filename or not hasattr(uploaded, "stream"):
		frappe.throw(_("File is required"))
	problem = _attachment_name_problem(filename)
	if problem:
		frappe.throw(problem, title=_("Invalid Attachment"))
	content = _read_capped(uploaded.stream)
	if not content:
		frappe.throw(_("File is required"))

	existing = frappe.db.get_value(
		"File",
		{"attached_to_doctype": "Journal Entry", "attached_to_name": values.name, "file_name": filename},
		["name", "file_url", "file_size"],
		as_dict=True,
	)
	if existing and cint(existing.file_size) == len(content):
		return {
			"name": existing.name,
			"file_url": existing.file_url,
			"file_name": filename,
			"journal_entry": values.name,
			"already_attached": True,
		}
	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": filename,
			"is_private": 1,
			"folder": "Home/Attachments",
			"attached_to_doctype": "Journal Entry",
			"attached_to_name": values.name,
			"content": content,
		}
	)
	file_doc.flags.ignore_permissions = True
	file_doc.insert()
	return {
		"name": file_doc.name,
		"file_url": file_doc.file_url,
		"file_name": file_doc.file_name,
		"journal_entry": values.name,
	}


def _get_cash_mode(pos_profile):
	"""Get cash mode of payment for a POS profile."""
	from pos_next.pos_next.doctype.pos_closing_shift.pos_closing_shift import (
		_get_cash_mode_of_payment,
	)

	return _get_cash_mode_of_payment(pos_profile)
