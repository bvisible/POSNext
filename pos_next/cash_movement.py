# //// Neoffice — added file (no upstream equivalent). The one journal-entry writer for money that enters
# //// or leaves a till's drawer outside a sale: the movements a cashier records (« Entrées/Sorties de
# //// caisse ») and the withdrawal made when a shift is closed. Both book exactly what their Journal Entry
# //// Template declares (neoffice_theme's structure: a totalization and a counterparty account, Credit or
# //// Debit), and the drawer's direction is read from what happens to the till's cash account, never
# //// guessed from where that account sits in the template (NeoRestau lot 1, task 15; study
# //// cash-movements-study.md, defect D1). The movements are tagged on the Journal Entry with link fields
# //// of ours (posa_cash_movement*, fixtures/custom_field.json), which the closing, the cash control report
# //// and the Neopos register read; upstream's POS expense fields (posa_pos_opening_shift, ...) stay theirs.
"""Money in and out of a till's drawer, booked as submitted Journal Entries.

A Journal Entry Template declares two accounts (``accounting_entry_totalization`` and
``accounting_entry_counterparty``, first row of each) and ``credit_or_debit``, following the desk's
quick entry convention (neoffice_theme.mobile.create_journal_entry_from_scan):

- ``Credit``: the counterparty is debited and the totalization credited (an expense paid out);
- ``Debit``: the totalization is debited and the counterparty credited (an income taken in).

The movement goes OUT of the drawer when the till's cash account is the credited one, and IN when it is
the debited one. A template that moves neither side of the till's cash account is refused: it cannot be
a drawer movement. The VAT is never typed at the till: the counterparty's amount is split by the desk's
own journal-entry VAT logic (neoffice_theme.vat_utils.calculate_journal_entry_with_vat, the rate hanging
on Account.taxable_account), unless the template turns the calculation off or the cashier marks the
movement « without VAT ». The amount typed at the till is the cash that moved, VAT included.
"""

from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import cint, cstr, flt, getdate, now_datetime

IN = "In"
OUT = "Out"
CREDIT = "Credit"
DEBIT = "Debit"

# The voucher types a drawer movement may carry; any other type the template names (an opening, a
# depreciation, an inter-company entry...) has validations of its own that a till cannot satisfy.
VOUCHER_TYPES = ("Journal Entry", "Cash Entry", "Bank Entry", "Contra Entry")

# A movement made in the small hours after the shift's opening day is booked on that day, so a service
# that runs past midnight stays on one ledger day; any later movement is booked on the day the money moved,
# so a shift left open for days never books into a past period.
BUSINESS_DAY_CUTOFF_HOURS = 6

# The accounts a party must come with: a till movement names none, so ERPNext would refuse the entry.
PARTY_ACCOUNT_TYPES = ("Receivable", "Payable")


def till_cash_account(pos_profile, company, required=True):
	"""The account of the till's cash mode of payment for the company: the drawer, in the ledger. None
	when the mode has no account for the company and ``required`` is off; a refusal otherwise."""
	from pos_next.api.cash_entry import _get_cash_mode

	mode = _get_cash_mode(pos_profile)
	account = frappe.db.get_value(
		"Mode of Payment Account", {"parent": mode, "company": company}, "default_account"
	)
	if not account and required:
		frappe.throw(
			_("The till's cash mode of payment {0} has no account for {1}.").format(mode, company),
			title=_("Missing Account"),
		)
	return account


def till_template_names(pos_profile):
	"""The operations the till may record, in the order its POS Profile lists them. An empty list means
	no movement at this till: it is a control, not a filter (defect D2)."""
	if not pos_profile:
		return []
	names = frappe.get_all(
		"POS Cash Entry Template",
		filters={
			"parent": pos_profile,
			"parenttype": "POS Profile",
			"parentfield": "posa_cash_entry_templates",
		},
		pluck="journal_entry_template",
		order_by="idx asc",
	)
	return list(dict.fromkeys(name for name in names if name))


def _first_account(rows):
	for row in rows or []:
		if row.get("account"):
			return row.get("account")
	return None


def template_definition(template_name):
	"""What a Journal Entry Template declares, read through neoffice_theme's structure.

	A site without that structure (no totalization / counterparty rows, no ``credit_or_debit``) gets a
	definition with blanks, which ``definition_problem`` refuses: a plain ERPNext template declares no
	direction, so the till cannot book it as declared."""
	template = frappe.get_doc("Journal Entry Template", template_name)
	return frappe._dict(
		name=template.name,
		title=template.get("template_title") or template.name,
		company=template.get("company"),
		voucher_type=template.get("voucher_type") or "Journal Entry",
		totalization=_first_account(template.get("accounting_entry_totalization")),
		counterparty=_first_account(template.get("accounting_entry_counterparty")),
		credit_or_debit=cstr(template.get("credit_or_debit")),
		disable_calculation=cint(template.get("disable_calculation")),
	)


def booking_sides(definition):
	"""(debited account, credited account), as the template declares them."""
	if definition.credit_or_debit == CREDIT:
		return definition.counterparty, definition.totalization
	if definition.credit_or_debit == DEBIT:
		return definition.totalization, definition.counterparty
	return None, None


def drawer_direction(definition, cash_account):
	"""IN when the till's cash account is debited, OUT when it is credited, None when the template does
	not move it (or moves it against itself)."""
	debited, credited = booking_sides(definition)
	if not debited or not credited or debited == credited or not cash_account:
		return None
	if credited == cash_account:
		return OUT
	if debited == cash_account:
		return IN
	return None


def definition_problem(definition, cash_account, company):
	"""Why the till cannot book this template, in words for the till's manager; None when it can."""
	title = definition.title
	if definition.company != company:
		return _("{0} belongs to another company.").format(title)
	if not definition.totalization or not definition.counterparty:
		return _("{0} does not name the two accounts it moves.").format(title)
	if definition.credit_or_debit not in (CREDIT, DEBIT):
		return _("{0} does not say whether it is a Credit or a Debit.").format(title)
	if not drawer_direction(definition, cash_account):
		return _("{0} does not move the till's cash account {1}.").format(title, cash_account)
	company_currency = frappe.get_cached_value("Company", company, "default_currency")
	for account in (definition.totalization, definition.counterparty):
		row = frappe.db.get_value(
			"Account",
			account,
			["company", "is_group", "disabled", "account_type", "account_currency"],
			as_dict=True,
		)
		if not row:
			return _("{0}: the account {1} does not exist.").format(title, account)
		if row.company != company:
			return _("{0}: the account {1} belongs to another company.").format(title, account)
		if cint(row.is_group):
			return _("{0}: the account {1} is a group, not a ledger.").format(title, account)
		if cint(row.disabled):
			return _("{0}: the account {1} is disabled.").format(title, account)
		if row.account_type in PARTY_ACCOUNT_TYPES:
			return _(
				"{0}: the account {1} needs a customer or a supplier, which the till does not name."
			).format(title, account)
		if row.account_currency and company_currency and row.account_currency != company_currency:
			return _("{0}: the account {1} is kept in another currency.").format(title, account)
	return None


def withdrawal_problem(template_name, pos_profile, company):
	"""Why the closing cannot book its withdrawal with this template; None when it can. A withdrawal takes
	the takings out of the drawer: its template must credit the till's cash account."""
	if not frappe.db.exists("Journal Entry Template", template_name):
		return _("{0} no longer exists.").format(template_name)
	cash_account = till_cash_account(pos_profile, company, required=False)
	if not cash_account:
		return _("The till's cash mode of payment has no account for {0}.").format(company)
	definition = template_definition(template_name)
	problem = definition_problem(definition, cash_account, company)
	if problem:
		return problem
	if drawer_direction(definition, cash_account) != OUT:
		return _("{0} puts money into the drawer: a withdrawal takes it out.").format(definition.title)
	return None


def other_account(definition, cash_account):
	"""The account the money comes from or goes to, the one the till shows on the operation's card."""
	return definition.counterparty if definition.totalization == cash_account else definition.totalization


def _desk_vat_logic():
	"""neoffice_theme's journal-entry VAT logic, or None where the theme (or the company settings it
	reads, from neoffice_wizard) is absent: then no VAT is split, as on a site without the desk's VAT."""
	if not frappe.db.exists("DocType", "App Customization"):
		return None
	if not frappe.db.exists("DocType", "Neoffice Company Settings"):
		return None
	try:
		from neoffice_theme.vat_utils import calculate_journal_entry_with_vat
	except ImportError:
		return None
	return calculate_journal_entry_with_vat


def split_vat(company, account, amount, cost_center=None):
	"""The counterparty's amount as the desk splits it: the net on ``account`` and the VAT on the tax
	account of the rate ``account`` carries (Account.taxable_account), the amount being VAT included.
	Without the desk's logic, or where it finds no rate, one line with the whole amount."""
	calculate = _desk_vat_logic()
	if not calculate:
		return [frappe._dict(account=account, amount=flt(amount))]
	entries = calculate(
		entries=[{"account": account, "amount": flt(amount), "cost_center": cost_center}],
		is_withdrawal=True,
		is_vat_excluded=False,
		disable_vat_calculation=False,
		company=company,
	)
	# The helper hands the VAT back as the amount less the net, a float subtraction: rounded to the currency's
	# precision here, the lines still add up to the amount (both parts carry that precision already).
	precision = frappe.get_precision("Journal Entry Account", "debit_in_account_currency") or 2
	return [
		frappe._dict(account=entry.get("account"), amount=flt(entry.get("amount"), precision))
		for entry in entries
		if entry.get("account") and flt(entry.get("amount"), precision)
	]


def vat_applies(definition, cash_account, company):
	"""Whether the desk's VAT logic would split this template's counterparty: the till offers the
	« without VAT » choice only then."""
	if definition.disable_calculation or definition.counterparty == cash_account:
		return False
	if not _desk_vat_logic():
		return False
	return len(split_vat(company, definition.counterparty, 100)) > 1


def business_day(period_start_date, moment=None):
	"""The day a movement is booked on (see BUSINESS_DAY_CUTOFF_HOURS)."""
	moment = moment or now_datetime()
	moved = (moment - timedelta(hours=BUSINESS_DAY_CUTOFF_HOURS)).date()
	if not period_start_date:
		return getdate(moment)
	return max(getdate(period_start_date), moved)


def _account_row(account, amount, debit, cost_center):
	amount = flt(amount)
	return {
		"account": account,
		"debit_in_account_currency": amount if debit else 0,
		"credit_in_account_currency": 0 if debit else amount,
		"cost_center": cost_center,
	}


def book(
	definition,
	cash_account,
	company,
	amount,
	posting_date,
	cost_center,
	reference,
	note=None,
	no_vat=False,
	shift=None,
	closing=None,
	offline_id=None,
):
	"""Post and submit the Journal Entry of one drawer movement, exactly as ``definition`` declares it.

	``reference`` is the till's document the entry answers to (the opening shift of a movement, the
	closing of a withdrawal): it is the entry's Reference No, as a Bank Entry requires one. The caller
	has checked who records and refused a template ``definition_problem`` objects to."""
	direction = drawer_direction(definition, cash_account)
	if not direction:
		frappe.throw(
			_("{0} does not move the till's cash account {1}.").format(definition.title, cash_account)
		)
	amount = flt(amount, frappe.get_precision("Journal Entry Account", "debit_in_account_currency") or 2)
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero"))

	counterparty_debited = definition.credit_or_debit == CREDIT
	counterparty_lines = [frappe._dict(account=definition.counterparty, amount=amount)]
	if not no_vat and not definition.disable_calculation and definition.counterparty != cash_account:
		counterparty_lines = split_vat(company, definition.counterparty, amount, cost_center)
	total = flt(sum(flt(line.amount) for line in counterparty_lines), 2)

	note = cstr(note).strip()
	voucher_type = definition.voucher_type if definition.voucher_type in VOUCHER_TYPES else "Journal Entry"
	entry = frappe.get_doc(
		{
			"doctype": "Journal Entry",
			"voucher_type": voucher_type,
			"company": company,
			"posting_date": posting_date,
			"cheque_no": reference,
			"cheque_date": posting_date,
			"user_remark": f"{definition.title} — {note}" if note else definition.title,
			"from_template": definition.name,
			"posa_cash_movement": direction,
			"posa_cash_movement_shift": shift,
			"posa_cash_movement_closing": closing,
			"posa_cash_entry_template": definition.name,
			"posa_cash_movement_account": cash_account,
			"posa_cash_movement_note": note or None,
			"posa_cash_movement_no_vat": 1 if no_vat else 0,
			"posa_cash_movement_offline_id": offline_id or None,
		}
	)
	for line in counterparty_lines:
		entry.append("accounts", _account_row(line.account, line.amount, counterparty_debited, cost_center))
	entry.append(
		"accounts", _account_row(definition.totalization, total, not counterparty_debited, cost_center)
	)
	entry.flags.ignore_permissions = True
	entry.insert()
	entry.submit()
	return entry


def _movement_rows(where, values):
	# The link fields come with the fixture: a site whose migrate has not created them yet (code pulled, migrate
	# still to run) has no movement to read, and a closing made meanwhile must not fail on it.
	if not frappe.db.has_column("Journal Entry", "posa_cash_movement_account"):
		return []
	return frappe.db.sql(
		f"""
		select
			je.name, je.posting_date, je.creation, je.owner, je.docstatus,
			je.posa_cash_movement_shift as shift, je.posa_cash_movement_closing as closing,
			je.posa_cash_entry_template as template, jet.template_title,
			je.posa_cash_movement_note as note, je.posa_cash_movement_no_vat as no_vat,
			je.user_remark, cash.delta
		from `tabJournal Entry` je
		join (
			select jea.parent, sum(jea.debit_in_account_currency - jea.credit_in_account_currency) as delta
			from `tabJournal Entry Account` jea
			join `tabJournal Entry` j on j.name = jea.parent
			where jea.parenttype = 'Journal Entry' and jea.account = j.posa_cash_movement_account and {where}
			group by jea.parent
		) cash on cash.parent = je.name
		left join `tabJournal Entry Template` jet on jet.name = je.posa_cash_entry_template
		order by je.creation asc, je.name asc
		""",
		values,
		as_dict=True,
	)


def _as_movement(row):
	delta = flt(row.delta)
	return frappe._dict(
		journal_entry=row.name,
		direction=IN if delta > 0 else OUT,
		amount=abs(delta),
		template=row.template,
		title=row.template_title or row.template or row.user_remark or "",
		note=row.note or "",
		no_vat=cint(row.no_vat),
		owner=row.owner,
		posting_date=row.posting_date,
		creation=row.creation,
		docstatus=row.docstatus,
		shift=row.shift,
		closing=row.closing,
	)


def shift_movements(shift):
	"""The drawer movements recorded during a shift, oldest first: each submitted entry tagged with the
	shift, its direction and amount read from the till's cash account rows (an entry amended at the desk
	keeps its tags and is read as the ledger now has it). The closing's withdrawal is not among them: it
	is tagged with its closing, not with the shift."""
	if not shift:
		return []
	rows = _movement_rows("j.posa_cash_movement_shift = %(shift)s and j.docstatus = 1", {"shift": shift})
	return [_as_movement(row) for row in rows if flt(row.delta)]


def movement(journal_entry):
	"""One tagged entry, whatever its docstatus, as shift_movements reads it; None when it is not one."""
	rows = _movement_rows("j.name = %(name)s", {"name": journal_entry})
	return _as_movement(rows[0]) if rows else None


def shift_totals(shifts):
	"""{shift: {"in": total, "out": total}} of the drawer movements of several shifts, in one query (the cash
	control report reads it for every shift it lists)."""
	shifts = [shift for shift in dict.fromkeys(shifts or []) if shift]
	if not shifts:
		return {}
	totals = {}
	rows = _movement_rows(
		"j.posa_cash_movement_shift in %(shifts)s and j.docstatus = 1", {"shifts": tuple(shifts)}
	)
	for row in rows:
		bucket = totals.setdefault(row.shift, {"in": 0, "out": 0})
		if flt(row.delta) > 0:
			bucket["in"] += flt(row.delta)
		elif flt(row.delta) < 0:
			bucket["out"] += -flt(row.delta)
	return totals


def shift_out_total(shift):
	"""The money the shift's movements took out of the drawer: what the per-shift cap counts."""
	return flt(sum(row.amount for row in shift_movements(shift) if row.direction == OUT), 2)


def closing_rows(shift):
	"""The shift's movements as the closing stores them (POS Closing Shift Cash Movement)."""
	cashiers = {}
	rows = []
	for row in shift_movements(shift):
		if row.owner not in cashiers:
			cashiers[row.owner] = frappe.db.get_value("User", row.owner, "full_name") or row.owner
		rows.append(
			{
				"journal_entry": row.journal_entry,
				"direction": row.direction,
				"journal_entry_template": row.template,
				"operation": row.title,
				"amount": row.amount,
				"cashier": cashiers[row.owner],
				"note": row.note,
			}
		)
	return rows
