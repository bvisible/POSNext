# //// Neoffice — added file (no upstream equivalent). The customer behind a guest's phone on the QR page: upstream POSNext has no
# //// guest surface, so no customer ever signs in there. A guest proves an e-mail address with a code that is mailed to it (no
# //// password to keep, nothing for a stranger to guess), the customer of that address is the customer of the table's order (a new one
# //// is made after the proof, as the till makes one), and a table whose order the till already gave a customer takes that identity with
# //// no sign-in (NeoResto lot 1, Daniel, 02.11.2026).
"""The customer behind a guest's phone on the QR page.

One customer per table: the one the till put on the table's order, else the first guest who signed in. The page reads the customer's
name and loyalty points, nothing else. The code is a six-digit number valid for ten minutes, kept hashed with a salt, for one session
and one address, with a few tries; the answer to a request for a code never tells a known address from an unknown one.
"""

import hashlib
import hmac
import secrets

import frappe
from frappe import _
from frappe.utils import cint, flt, validate_email_address

CODE_MINUTES = 10
#: wrong codes a code survives
MAX_TRIES = 5
#: codes mailed per session, and per address, in an hour
MAX_SENDS = 5
#: how long the proof of an address lasts for the registration that follows it
PROOF_MINUTES = 15


def clean_email(address):
	"""The address as it is compared (lower case, trimmed); a message for what is not one."""
	address = (address or "").strip().lower()
	if not (address and validate_email_address(address)):
		frappe.throw(_("Please enter a valid email address."))
	return address


def _key(kind, *parts):
	return "pos_next_guest_{0}:{1}".format(kind, hashlib.sha256(":".join(parts).encode()).hexdigest()[:32])


def _digest(salt, code):
	return hashlib.sha256(f"{salt}:{code}".encode()).hexdigest()


def _count_a_send(kind, *parts):
	"""One more code asked for on this key within the hour; refused above the limit (a refused request counts for nothing)."""
	key = _key(kind, *parts)
	asked = cint(frappe.cache().get_value(key))
	if asked >= MAX_SENDS:
		frappe.throw(_("Too many codes asked for. Please try again later."), frappe.RateLimitExceededError)
	frappe.cache().set_value(key, asked + 1, expires_in_sec=3600)


def default_customer(pos_profile):
	"""The customer a table order has while nobody is identified: the one of the till's profile, else the site's."""
	customer = frappe.db.get_value("POS Profile", pos_profile, "customer") if pos_profile else None
	return customer or frappe.db.get_single_value("Selling Settings", "customer") or "Guest"


def customer_of(token_doc, invoice_doc=None):
	"""(customer, source) of a guest session: the one the table's order has when it is not the till's default customer ("till" when the
	till put it there, "account" when this session's sign-in did), else the one the session signed in as; (None, None) for nobody."""
	if invoice_doc and invoice_doc.customer and invoice_doc.customer != default_customer(token_doc.pos_profile):
		return invoice_doc.customer, ("account" if invoice_doc.customer == token_doc.customer else "till")
	if token_doc.customer:
		return token_doc.customer, "account"
	return None, None


def _points_of(customer, pos_profile):
	"""ERPNext's answer for the loyalty points of a customer ({"loyalty_points", "conversion_factor", "loyalty_program", ...}), or None."""
	from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details_with_points

	company = frappe.db.get_value("POS Profile", pos_profile, "company") if pos_profile else None
	return get_loyalty_program_details_with_points(customer, company=company, silent=True)


def _loyalty_is_on(pos_profile):
	from pos_next.restaurant import scope

	return bool(scope.till_settings(pos_profile, ["enable_loyalty_program"]).enable_loyalty_program)


def describe(token_doc, invoice_doc=None):
	"""What the guest page reads of the customer of its session, or None when nobody is identified: the name, where the identity comes
	from, and the loyalty points with what they are worth. No contact detail, no address, nothing of the customer's history."""
	customer, source = customer_of(token_doc, invoice_doc)
	if not customer:
		return None
	points, value, program = 0, 0, None
	if _loyalty_is_on(token_doc.pos_profile):
		try:
			details = _points_of(customer, token_doc.pos_profile) or {}
		except Exception:
			frappe.log_error("Guest page: loyalty points not read", frappe.get_traceback())
			details = {}
		points = cint(details.get("loyalty_points"))
		value = round(points * flt(details.get("conversion_factor")), 2)
		program = details.get("loyalty_program") or None
	return {
		"customer": customer,
		"customer_name": frappe.db.get_value("Customer", customer, "customer_name") or customer,
		"source": source,
		"loyalty_points": points,
		"loyalty_value": value,
		"loyalty_program": program,
	}


def request_code(token_doc, address):
	"""Mail a sign-in code to `address` for this session. The answer is the same whatever the address is."""
	address = clean_email(address)
	_count_a_send("sends_session", token_doc.name)
	_count_a_send("sends_address", address)
	code = f"{secrets.randbelow(10**6):06d}"
	salt = secrets.token_hex(8)
	frappe.cache().set_value(
		_key("code", token_doc.name, address),
		{"salt": salt, "hash": _digest(salt, code), "tries": 0},
		expires_in_sec=CODE_MINUTES * 60,
	)
	frappe.sendmail(
		recipients=[address],
		subject=_("Your sign-in code"),
		message=_("Your sign-in code is {0}. It is valid for {1} minutes.").format(
			f"<b>{code}</b>", CODE_MINUTES
		),
		now=True,
	)
	return {"sent": True}


def check_code(token_doc, address, code):
	"""Prove `address` for this session with the code that was mailed to it; the code is spent. Refused (and counted) when it is wrong."""
	address = clean_email(address)
	key = _key("code", token_doc.name, address)
	entry = frappe.cache().get_value(key)
	if not entry:
		frappe.throw(_("This code has expired. Please ask for a new one."))
	if cint(entry.get("tries")) >= MAX_TRIES:
		frappe.cache().delete_value(key)
		frappe.throw(_("Too many wrong codes. Please ask for a new one."))
	if not hmac.compare_digest(_digest(entry["salt"], str(code or "").strip()), entry["hash"]):
		entry["tries"] = cint(entry.get("tries")) + 1
		# The code keeps the time it had left: the count is what a wrong try changes
		frappe.cache().set_value(key, entry, expires_in_sec=CODE_MINUTES * 60)
		frappe.throw(_("Wrong code."))
	frappe.cache().delete_value(key)


def customer_by_email(address):
	"""The customer an address belongs to: the e-mail of the customer, else an address of a contact that is linked to one."""
	customer = frappe.db.get_value("Customer", {"email_id": address, "disabled": 0}, "name", order_by="creation asc")
	if customer:
		return customer
	rows = frappe.db.sql(
		"""
		select link.link_name from `tabContact Email` email
		join `tabDynamic Link` link on link.parent = email.parent and link.parenttype = 'Contact' and link.link_doctype = 'Customer'
		join `tabCustomer` customer on customer.name = link.link_name
		where email.email_id = %s and customer.disabled = 0
		order by customer.creation asc limit 1
		""",
		address,
	)
	return rows[0][0] if rows else None


def keep_the_proof(token_doc, address):
	frappe.cache().set_value(_key("proof", token_doc.name, address), 1, expires_in_sec=PROOF_MINUTES * 60)


def spend_the_proof(token_doc, address):
	"""The proof of `address` for this session, used once; refused when there is none."""
	key = _key("proof", token_doc.name, address)
	if not frappe.cache().get_value(key):
		frappe.throw(_("Please confirm your email address first."), frappe.PermissionError)
	frappe.cache().delete_value(key)


def register(token_doc, address, customer_name, mobile_no=None):
	"""Make the customer of a proven address, the way the till makes one; its name."""
	address = clean_email(address)
	customer_name = " ".join((customer_name or "").split())[:140]
	if not customer_name:
		frappe.throw(_("Please enter your name."))
	spend_the_proof(token_doc, address)
	from pos_next.api.customers import create_customer

	company = frappe.db.get_value("POS Profile", token_doc.pos_profile, "company") if token_doc.pos_profile else None
	made = create_customer(
		customer_name=customer_name,
		mobile_no=(mobile_no or "").strip()[:40] or None,
		email_id=address,
		company=company or frappe.defaults.get_defaults().get("company"),
		pos_profile=token_doc.pos_profile,
	)
	return made["name"]


def bind(token_doc, customer, invoice_doc=None):
	"""Make `customer` the customer of this session and of the table's draft order. One customer per table: refused when the table
	already has another one (the till's, or a guest's who signed in before)."""
	taken, _source = customer_of(token_doc, invoice_doc)
	if taken and taken != customer:
		frappe.throw(_("This table is already linked to another customer account."))
	# Written straight to the table: the document may have been read before another save (the invoice link is written the same way)
	frappe.db.set_value("Guest Order Token", token_doc.name, "customer", customer)
	token_doc.customer = customer
	if invoice_doc and invoice_doc.docstatus == 0 and invoice_doc.customer != customer:
		invoice_doc.customer = customer
		invoice_doc.flags.ignore_permissions = True
		invoice_doc.flags.ignore_version = True
		invoice_doc.save()
