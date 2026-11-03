# //// Neoffice — added file (no upstream equivalent). The customer behind a guest's phone on the QR page: upstream POSNext has no
# //// guest surface, so no customer ever signs in there. A guest proves an e-mail address with the code the frappe fork's engine
# //// (`frappe.passwordless`, the one door every Neoffice surface signs in through) mails to it, the customer of that address is the
# //// customer of the table's order (a new account is opened after the proof), and a table whose order the till already gave a customer
# //// takes that identity with no sign-in (NeoResto lot 1, Daniel, 02.11.2026; the engine replaced this file's own code on 03.11.2026,
# //// neoffice-maintenance#2192).
"""The customer behind a guest's phone on the QR page, and on the takeaway page.

One customer per table: the one the till put on the table's order, else the first guest who signed in. The page reads the customer's
name and loyalty points, nothing else.

The code is not made here. `frappe.passwordless` mails it (six digits, kept hashed, ten minutes, five tries, the same answer for every
address, limited per address and per connection) and either signs the person in, when the address already has an account, or hands back
the PROOF of the mailbox. This module turns a signed-in account, or a proof and a name, into the customer of the table, so a guest ends up
with a real account (a Website User, its Customer and its Contact) and not only a customer record. Nothing here takes an address from the
browser for granted: the account is the session's, or the address a proof was minted for.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, validate_email_address

NAME_LENGTH = 140
PHONE_LENGTH = 40


def engine():
	"""`frappe.passwordless`, or None on a frappe that does not carry the Neoffice fork (a stock frappe): there nobody signs in."""
	try:
		from frappe import passwordless
	except ImportError:
		return None
	return passwordless


def is_available():
	"""Whether a guest can sign in with a code on this site: the engine is there, its switch is on and a mail can leave. When it is not,
	the QR page offers no sign-in at all and an account is never required, so that nobody is locked out of a table by a mail that cannot go."""
	passwordless = engine()
	return bool(passwordless and passwordless.is_enabled())


def _engine():
	passwordless = engine()
	if not (passwordless and passwordless.is_enabled()):
		frappe.throw(_("Signing in with a code is not available here."), frappe.PermissionError)
	return passwordless


def brand():
	"""Hook `passwordless_brand`: the name the sign-in mail speaks for is the restaurant of the guest page that asked for the code (set by
	`request_code` for the length of that one call), nothing otherwise. A caller of the engine cannot choose a name: it comes from here."""
	return frappe.flags.get("pos_next_guest_brand") or ""


def clean_email(address):
	"""The address as it is compared (lower case, trimmed); a message for what is not one."""
	address = (address or "").strip().lower()
	if not (address and validate_email_address(address)):
		frappe.throw(_("Please enter a valid email address."))
	return address


def clean_name(name):
	return " ".join((name or "").split())[:NAME_LENGTH]


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
	"""The loyalty points of a customer as ERPNext counts them ({"loyalty_points", "conversion_factor", "loyalty_program"}), or None when the
	customer is in no programme. Read with `get_loyalty_details`, the count itself: the whitelisted wrapper above it checks the permissions of the
	caller (a guest has none) and, given no programme, reads one named None."""
	from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_details

	program = frappe.db.get_value("Customer", customer, "loyalty_program")
	if not program:
		return None
	company = frappe.db.get_value("POS Profile", pos_profile, "company") if pos_profile else None
	details = get_loyalty_details(customer, program, company=company) or {}
	return {
		"loyalty_points": details.get("loyalty_points") or 0,
		"conversion_factor": frappe.db.get_value("Loyalty Program", program, "conversion_factor") or 0,
		"loyalty_program": program,
	}


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


# ------------------------------------------------------------------------------------------------ the code, which the engine owns


def request_code(token_doc, address, redirect_to=None):
	"""Ask the engine to mail a code and a link to `address`. Its answer ({"ok", "resend_in", "expires_in"}) is the same whatever the address
	is, and so is what comes back from here. The mail speaks for the restaurant of the page."""
	passwordless = _engine()
	from pos_next.restaurant.settings import get_restaurant_settings_for_profile

	frappe.flags.pos_next_guest_brand = (
		get_restaurant_settings_for_profile(token_doc.pos_profile).get("restaurant_name") or ""
	)
	try:
		answer = passwordless.request_code(address, redirect_to)
	finally:
		frappe.flags.pos_next_guest_brand = None
	if not answer.get("ok"):
		if answer.get("reason") == "invalid_address":
			frappe.throw(_("Please enter a valid email address."))
		frappe.throw(_("Signing in with a code is not available here."), frappe.PermissionError)
	return answer


class _NoSession:
	"""Stands for the login manager while the engine checks a code: the guest page asks without any session (`credentials: "omit"`, so that a
	phone signed in at the till, a waiter's or the owner's, never sends its own), so a session opened here would be written to the table of sessions
	and never found again. The engine opens one by `frappe.local.login_manager.login_as`; this takes the call and does nothing."""

	def login_as(self, user, *args, **kwargs):
		return None


def check_code(address, code):
	"""Check the code with the engine: {"status": "signed_in", "user"} for an address that has an account, {"status": "unknown_address",
	"proof"} for an address nobody has an account for. No session is opened (see _NoSession): the account is the table's. A refusal is a message."""
	passwordless = _engine()
	had = hasattr(frappe.local, "login_manager")
	kept = getattr(frappe.local, "login_manager", None)
	frappe.local.login_manager = _NoSession()
	try:
		answer = passwordless.verify_code(address, code)
	finally:
		if had:
			frappe.local.login_manager = kept
		else:
			del frappe.local.login_manager
	if answer.get("ok"):
		return answer
	if answer.get("reason") == "locked":
		frappe.throw(_("Too many wrong codes. Please ask for a new one."))
	if answer.get("reason") == "not_allowed":
		frappe.throw(_("Signing in with a code is not available for this account."), frappe.PermissionError)
	frappe.throw(_("Wrong code, or the code has expired. Please check it or ask for a new one."))


def address_of_proof(proof):
	"""The address whose mailbox `proof` was minted for, once; refused when the proof is gone, spent or was never one."""
	address = _engine().consume_proof(proof)
	if not address:
		frappe.throw(_("This confirmation has expired. Please ask for a new code."), frappe.PermissionError)
	return address


def website_user(user):
	"""{"user", "full_name"} when `user` is an enabled Website User (a customer's account), None for a guest, a member of the staff or a
	disabled account: the only accounts that order here."""
	if not user or user == "Guest":
		return None
	row = frappe.db.get_value("User", user, ["enabled", "user_type", "full_name"], as_dict=True)
	if not row or not cint(row.enabled) or row.user_type != "Website User":
		return None
	return {"user": user, "full_name": row.full_name or user}


# ------------------------------------------------------------------------------------------------ the account behind an address


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


def _customer_of_contact(user):
	"""The customer of the contact an account is tied to (`Contact.user`, which the shop and this module both set)."""
	rows = frappe.db.sql(
		"""
		select link.link_name from `tabContact` contact
		join `tabDynamic Link` link on link.parent = contact.name and link.parenttype = 'Contact' and link.link_doctype = 'Customer'
		join `tabCustomer` customer on customer.name = link.link_name
		where contact.user = %s and customer.disabled = 0
		order by customer.creation asc limit 1
		""",
		user,
	)
	return rows[0][0] if rows else None


def _contact_of(customer, address):
	"""The contact of `customer` that carries `address`, or None."""
	rows = frappe.db.sql(
		"""
		select contact.name from `tabContact` contact
		join `tabContact Email` email on email.parent = contact.name
		join `tabDynamic Link` link on link.parent = contact.name and link.parenttype = 'Contact'
			and link.link_doctype = 'Customer' and link.link_name = %s
		where email.email_id = %s
		order by contact.creation asc limit 1
		""",
		(customer, address),
	)
	return rows[0][0] if rows else None


def _make_customer(customer_name, address, mobile_no, pos_profile):
	"""A customer made the way the till makes one. Runs as the system (`create_customer` asks for the right to create)."""
	from pos_next.api.customers import create_customer

	company = frappe.db.get_value("POS Profile", pos_profile, "company") if pos_profile else None
	made = create_customer(
		customer_name=customer_name,
		mobile_no=(mobile_no or "").strip()[:PHONE_LENGTH] or None,
		email_id=address,
		company=company or frappe.defaults.get_defaults().get("company"),
		pos_profile=pos_profile,
	)
	return made["name"]


def _tie_contact(customer, user, address, customer_name, mobile_no):
	"""Tie the account to its customer through a contact (`Contact.user`), the link the shop's own account page reads."""
	contact = _contact_of(customer, address)
	if contact:
		if not frappe.db.get_value("Contact", contact, "user"):
			frappe.db.set_value("Contact", contact, "user", user)
		return
	first_name, _space, last_name = customer_name.partition(" ")
	phone = (mobile_no or "").strip()[:PHONE_LENGTH]
	frappe.get_doc(
		{
			"doctype": "Contact",
			"first_name": first_name,
			"last_name": last_name,
			"user": user,
			"email_ids": [{"email_id": address, "is_primary": 1}],
			"phone_nos": [{"phone": phone, "is_primary_mobile_no": 1}] if phone else [],
			"links": [{"link_doctype": "Customer", "link_name": customer}],
		}
	).insert(ignore_permissions=True)


def open_account(address, customer_name=None, mobile_no=None, pos_profile=None):
	"""Open the account of a mailbox the engine proved: its Website User (no password, the code is how it comes back), the customer behind it
	(the one that already carries the address, a customer the till made for instance, else a new one) and the contact that ties them.
	(user, customer). Runs as the system. A name is asked for only when the address has no customer yet."""
	address = clean_email(address)
	customer = customer_by_email(address)
	name = clean_name(customer_name) or (
		clean_name(frappe.db.get_value("Customer", customer, "customer_name")) if customer else ""
	)
	if not name:
		frappe.throw(_("Please enter your name."))

	if not frappe.db.exists("User", address):
		first_name, _space, last_name = name.partition(" ")
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": address,
				"first_name": first_name,
				"last_name": last_name,
				"enabled": 1,
				"user_type": "Website User",
				"send_welcome_email": 0,
				"roles": [{"role": "Customer", "doctype": "Has Role"}],
			}
		)
		try:
			user.insert(ignore_permissions=True)
		except frappe.DuplicateEntryError:  # a parallel request opened it first; the mailbox is proven all the same
			frappe.clear_messages()

	customer = customer or _make_customer(name, address, mobile_no, pos_profile)
	_tie_contact(customer, address, address, name, mobile_no)
	return address, customer


def customer_of_user(user, pos_profile=None):
	"""The customer behind a Website User the engine signed in: the one of its contact, else the one that carries its address; a shop account
	that never ordered has none yet, and one is made from its own name. Runs as the system."""
	customer = _customer_of_contact(user) or customer_by_email(user)
	if customer:
		return customer
	name = clean_name(frappe.db.get_value("User", user, "full_name")) or user
	customer = _make_customer(name, user, None, pos_profile)
	_tie_contact(customer, user, user, name, None)
	return customer


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
