# //// Neoffice — added file (no upstream equivalent). The drafts a till left behind, deleted once they have been
# //// abandoned for the days their till sets (maintenance#1980; product owner, 16.11.2026: 30 days by default, a
# //// setting of the till). Since the cleanup after each sale only deletes the caller's own drafts (#1943) and a
# //// shift's closing only those of a profile that allows it (`posa_allow_delete`, off everywhere), a draft left by a
# //// cashier who no longer sells stayed for ever.
"""A till's draft that nobody will finish is deleted after the lifetime its till sets (daily).

A draft is abandoned when the shift it was saved at is no longer open (closed, cancelled, gone), or when its cashier's
account is disabled; it goes once it has not been touched for `abandoned_draft_days` days (the POS Settings of its
till, 30 when the till sets none). Never deleted: a restaurant table's order, a takeaway order, a printed draft (the
till's own exclusions, `_kept_draft_exclusions`), a draft made outside a till shift, a draft of a guest's session
(a QR order, a web takeaway, a phone's cart: the guest pages and the shop's own purge follow those), and a draft a
payment provider has taken money for. `frappe.delete_doc` keeps a Deleted Document of each. A till whose drafts fail
is logged and the others go on.
"""

import frappe
from frappe.utils import add_to_date, cint, now_datetime

from pos_next.restaurant.settings import pos_settings_of

FIELD = "abandoned_draft_days"
DEFAULT_DAYS = 30
SALES_INVOICE = "Sales Invoice"


def lifetime_days(pos_profile) -> int:
	"""The days a draft of this till is kept once abandoned: its POS Settings' value (as the till reads them: the enabled
	row), else the default."""
	if not frappe.db.has_column("POS Settings", FIELD):
		return DEFAULT_DAYS
	row = pos_settings_of(pos_profile, [FIELD])
	return cint(row.get(FIELD) if row else 0) or DEFAULT_DAYS


def _candidate_filters():
	"""The till's own drafts, saved at a shift, none of them kept on purpose: the filters the till's cleanup uses, without
	its owner."""
	from pos_next.api.invoices import _kept_draft_exclusions

	return {
		"docstatus": 0,
		"is_pos": 1,
		"posa_pos_opening_shift": ["is", "set"],
		**_kept_draft_exclusions(),
	}


def purge_abandoned_drafts() -> int:
	"""Delete the abandoned drafts of every till; the number deleted."""
	deleted = 0
	tills = frappe.get_all(SALES_INVOICE, filters=_candidate_filters(), pluck="pos_profile", distinct=True)
	for pos_profile in tills:
		try:
			deleted += purge_the_drafts_of(pos_profile)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(
				"Abandoned drafts of a till could not be purged",
				f"POS Profile {pos_profile}\n\n{frappe.get_traceback()}",
			)
	return deleted


def purge_the_drafts_of(pos_profile) -> int:
	"""Delete the abandoned drafts of one till (None: the drafts saved without a POS Profile); the number deleted."""
	before = add_to_date(now_datetime(), days=-lifetime_days(pos_profile))
	drafts = frappe.get_all(
		SALES_INVOICE,
		filters={
			**_candidate_filters(),
			"pos_profile": pos_profile if pos_profile else ["is", "not set"],
			"modified": ["<", before],
		},
		fields=["name", "owner", "posa_pos_opening_shift"],
	)
	if not drafts:
		return 0
	open_shifts = set(
		frappe.get_all(
			"POS Opening Shift",
			filters={
				"name": ["in", list({draft.posa_pos_opening_shift for draft in drafts})],
				"docstatus": 1,
				"status": "Open",
			},
			pluck="name",
		)
	)
	disabled = set(
		frappe.get_all(
			"User",
			filters={"name": ["in", list({draft.owner for draft in drafts})], "enabled": 0},
			pluck="name",
		)
	)
	names = [
		draft.name
		for draft in drafts
		if draft.posa_pos_opening_shift not in open_shifts or draft.owner in disabled
	]
	kept = _of_a_guest(names) | _paid_by_a_provider(names)
	deleted = 0
	for name in names:
		if name in kept:
			continue
		frappe.delete_doc(SALES_INVOICE, name, ignore_permissions=True, force=True)
		deleted += 1
	return deleted


def _of_a_guest(names) -> set:
	"""The drafts a guest's session holds (a table's QR code, a web takeaway, a phone's cart in the shop)."""
	if not names or not frappe.db.table_exists("Guest Order Token"):
		return set()
	return set(frappe.get_all("Guest Order Token", filters={"invoice": ["in", names]}, pluck="invoice"))


def _paid_by_a_provider(names) -> set:
	"""The drafts a payment provider took money for: that money is never deleted with its draft."""
	if not names or not frappe.db.table_exists("Payment Intent"):
		return set()
	return set(
		frappe.get_all(
			"Payment Intent",
			filters={
				"reference_doctype": SALES_INVOICE,
				"reference_name": ["in", names],
				"status": ["in", ["succeeded", "refunded"]],
			},
			pluck="reference_name",
		)
	)
