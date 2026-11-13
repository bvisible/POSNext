# //// Neoffice — added file (no upstream equivalent).
"""The packages of sessions at the till (NeoSalon, lots G11, voie 1; product owner, 13.11.2026).

A business sells a package of sessions (ten brushings, nine physio sessions, a ten-entry card) as an ordinary item, to a named customer; the customer then uses
a session of it to pay a line of a later sale. The till never holds the package: it asks the site, through extension points (hooks) of the package lane, like
the appointments (`pos_next.api.appointments`), and takes the first answer that is not None:

- `pos_next_customer_packages`  `(pos_profile, customer) -> list | None`  the packages a customer can use today (active, not expired, at least one session left):
  `[{"package", "title", "remaining", "total", "valid_till", "items", "item_groups"}]`, `[]` for the till's cash customer or one with no package;
- `pos_next_use_package`        `(pos_profile, customer, package, item_code, qty=1, in_cart=0) -> dict | None`  may a line be paid by this package. It WRITES NOTHING: the
  session is counted when the invoice is submitted, and given back when it is cancelled. `{"ok": True, "line": {"customer_package", "discount_percentage"},
  "remaining_after", "label"}` or `{"ok": False, "why"}`.

The two methods here are the till's door to them: a cashier of the till, a site that says it runs packages today (`appointments._capabilities()["packages"]`:
the hooks are declared on every site, the answer is the site's), a customer that is named. They keep only the keys they know, with the types they expect, and
cut every list: a package lane that breaks must not break the till. The server refuses at the submission a line it did not agree to.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from pos_next.api import appointments

MOST_PACKAGES = 50
MOST_ITEMS = 300
MOST_QTY = 100


def _gate(pos_profile: str, customer) -> str:
	"""A cashier of this till, and a customer that is named (a package is in the name of one customer)."""
	from pos_next.api.cash_entry import require_till_access

	require_till_access(pos_profile)
	if not isinstance(customer, str) or not customer.strip():
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return customer.strip()


def _day(value) -> str | None:
	try:
		return str(getdate(value)) if value else None
	except Exception:
		return None


def _names(values, most) -> list[str]:
	if not isinstance(values, list | tuple):
		return []
	return [text for text in (appointments._text(value, 140) for value in list(values)[:most]) if text]


def _package(row) -> dict | None:
	if not isinstance(row, dict):
		return None
	name = appointments._text(row.get("package"), 140)
	if not name:
		return None
	return {
		"package": name,
		"title": appointments._text(row.get("title"), 140) or name,
		"remaining": max(0, cint(row.get("remaining"))),
		"total": max(0, cint(row.get("total"))),
		"valid_till": _day(row.get("valid_till")),
		"items": _names(row.get("items"), MOST_ITEMS),
		"item_groups": _names(row.get("item_groups"), MOST_ITEMS),
	}


@frappe.whitelist()
def get_customer_packages(pos_profile: str, customer) -> dict:
	"""`{"available": bool, "packages": [...]}`: the packages the customer can use today. Not available where the site does not run packages (the till then shows
	nothing): that is not an empty list, which is a customer with no package."""
	customer = _gate(pos_profile, customer)
	if not appointments._capabilities()["packages"]:
		return {"available": False, "packages": []}
	answer = appointments._first_answer(appointments.PACKAGES_HOOK, pos_profile, customer)
	if not isinstance(answer, list):
		return {"available": False, "packages": []}
	packages = [package for package in map(_package, answer[:MOST_PACKAGES]) if package]
	return {"available": True, "packages": packages}


@frappe.whitelist()
def check_package_use(pos_profile: str, customer, package, item_code, qty=1, in_cart=0) -> dict:
	"""May a line of the cart be paid by a session of this package. Writes nothing: `{"ok": True, "line": {"customer_package", "discount_percentage"},
	"remaining_after", "label"}` (the till puts those fields on the line, the card price stays and the line is worth 0.00) or `{"ok": False, "why"}`."""
	customer = _gate(pos_profile, customer)
	package = appointments._text(package, 140)
	item_code = appointments._text(item_code, 140)
	if not package or not item_code:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	quantity = cint(qty)
	if not 1 <= quantity <= MOST_QTY:
		frappe.throw(_("Use 1 to {0} sessions at once.").format(MOST_QTY))
	if not appointments._capabilities()["packages"]:
		frappe.throw(_("This till does not use packages."))
	answer = appointments._first_answer(
		appointments.USE_PACKAGE_HOOK,
		pos_profile,
		customer,
		package,
		item_code,
		quantity,
		max(0, cint(in_cart)),
	)
	if not isinstance(answer, dict):
		frappe.throw(_("This till does not use packages."))
	line = answer.get("line")
	# A session pays the whole line (the server refuses at the submission a package line that is not worth 0.00): any other discount is not an agreement
	if (
		answer.get("ok") is True
		and isinstance(line, dict)
		and appointments._text(line.get("customer_package"), 140) == package
		and flt(line.get("discount_percentage", 100)) == 100
	):
		return {
			"ok": True,
			"line": {"customer_package": package, "discount_percentage": 100},
			"remaining_after": max(0, cint(answer.get("remaining_after"))),
			"label": appointments._text(answer.get("label"), 140),
		}
	return {
		"ok": False,
		"why": appointments._text(answer.get("why"), 300) or _("This package cannot pay this line."),
	}
