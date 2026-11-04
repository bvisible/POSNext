//// Neoffice — added file (no upstream equivalent).
////
//// What a browser test needs from the server, and cannot get from the page: a table to scan, the code a diner
//// receives by e-mail, what the server holds once they have ordered, and the clean-up. Everything goes through
//// one door, `ssh <host>` and the bench's own Python, like the shop's suite does; nothing here opens an account
//// or mints a code (the code is the one `frappe.passwordless` mailed: the mail is queued by Frappe before it
//// leaves, so its queue row holds exactly what the mailbox would).
////
//// Needs POSNEXT_E2E_SSH_HOST and POSNEXT_E2E_SITE (~/.config/pos-next-e2e.env).

const { execFileSync } = require("node:child_process");

const HOST = process.env.POSNEXT_E2E_SSH_HOST;
const SITE = process.env.POSNEXT_E2E_SITE;

//// The script travels on STDIN: quoting a multi-line Python snippet through a shell, through ssh and through
//// execFileSync is three levels of escaping.
function onTheServer(snippet) {
	if (!HOST || !SITE)
		throw new Error("POSNEXT_E2E_SSH_HOST and POSNEXT_E2E_SITE are needed to read the server");
	const script = `import frappe, json\nfrappe.init(site="${SITE}")\nfrappe.connect()\nfrappe.set_user("Administrator")\n${snippet}\n`;
	return execFileSync(
		"ssh",
		[HOST, "cd /home/neoffice/frappe-bench/sites && ../env/bin/python -"],
		{
			input: script,
			encoding: "utf8",
			timeout: 240_000,
		}
	).trim();
}

/** A JavaScript value as a Python expression (JSON's null, true and false are not Python's). */
function py(value) {
	return `json.loads(${JSON.stringify(JSON.stringify(value))})`;
}

function json(out) {
	return JSON.parse(out.split("\n").pop().trim());
}

/** A throwaway address of the suite: the only kind the clean-up will touch. */
function aDiner() {
	return `e2e-pos-${Math.random().toString(36).slice(2, 10)}@yopmail.com`;
}

const ONLY_OURS = `import re\nOURS = re.compile(r"^e2e[.\\-][^@]*@yopmail\\.com$", re.I)\n`;

/**
 * A table of the restaurant and the QR token that opens its page, and the dish the tests order (the first of the
 * guest card with no options, in stock, priced).
 */
function aTable() {
	return json(
		onTheServer(`
from pos_next.api import guest_ordering
from pos_next.restaurant import settings as restaurant_settings
restaurant = restaurant_settings.default_restaurant()
profile = frappe.db.get_value("POS Settings", {"enabled": 1, "restaurant": restaurant}, "pos_profile", order_by="creation asc")
area = frappe.db.get_value("Restaurant Area", {"restaurant": restaurant}, "name")
table = frappe.get_doc({"doctype": "Restaurant Table", "restaurant": restaurant, "area": area, "table_name": "E2E " + frappe.generate_hash(length=5)}).insert(ignore_permissions=True)
token = frappe.get_doc({"doctype": "Guest Order Token", "mode": "restaurant", "table": table.name, "pos_profile": profile}).insert(ignore_permissions=True)
settings = restaurant_settings.get_restaurant_settings_for_profile(profile)
card = settings.get("guest_menu")
menu = guest_ordering._build_menu_from_card(card)
dish = next(d for c in menu["categories"] for d in c.get("menu_items", []) if not d.get("product_options") and d.get("price"))
frappe.db.commit()
print(json.dumps({"table": table.name, "table_name": table.table_name, "token": token.token, "token_name": token.name, "profile": profile, "dish": dish["item_name"], "item_code": dish["item_code"], "price": dish["price"]}))
`)
	);
}

/** What the server holds for a token and the diner behind it. */
function stateOf({ tokenName = null, tokenValue = null, address }) {
	return json(
		onTheServer(`
name = ${py(tokenName)} or frappe.db.get_value("Guest Order Token", {"token": ${py(
			tokenValue
		)}}, "name")
token = frappe.db.get_value("Guest Order Token", name, ["name", "customer", "invoice", "mode", "pos_profile", "table"], as_dict=True) if name else None
invoices = []
if token:
    filters = {"restaurant_table": token.table} if token.table else {"customer": token.customer or "-"}
    for name in frappe.get_all("Sales Invoice", filters=filters, pluck="name", order_by="creation asc"):
        doc = frappe.db.get_value("Sales Invoice", name, ["name", "customer", "docstatus", "is_takeaway", "pos_profile", "grand_total", "paid_amount", "posa_ticket_no"], as_dict=True)
        doc["lines"] = frappe.get_all("Sales Invoice Item", filters={"parent": name}, fields=["item_code", "qty", "rate", "kds_status"], order_by="idx asc")
        invoices.append(doc)
user = frappe.db.get_value("User", ${py(
			address
		)}, ["name", "user_type", "enabled", "full_name"], as_dict=True) if ${py(
			address
		)} else None
roles = frappe.get_roles(${py(address)}) if user else []
customer = frappe.db.get_value("Customer", {"email_id": ${py(
			address
		)}}, ["name", "customer_name", "mobile_no"], as_dict=True) if ${py(address)} else None
contact = frappe.db.get_value("Contact", {"user": ${py(address)}}, "name") if user else None
linked = frappe.db.get_value("Dynamic Link", {"parent": contact, "parenttype": "Contact", "link_doctype": "Customer"}, "link_name") if contact else None
print(json.dumps({"token": token, "invoices": invoices, "user": user, "roles": roles, "customer": customer, "contact_user": bool(contact), "contact_customer": linked}, default=str))
`)
	);
}

/** The payment provider settles the order (what its webhook does): a succeeded Payment Intent for the invoice, which the payments app puts on it. */
function theProviderSettles(invoice) {
	return json(
		onTheServer(`
total = frappe.db.get_value("Sales Invoice", ${py(invoice)}, "grand_total")
doc = frappe.get_doc({"doctype": "Payment Intent", "status": "succeeded", "amount": int(round(total * 100)), "currency": frappe.db.get_value("Sales Invoice", ${py(
			invoice
		)}, "currency"), "reference_doctype": "Sales Invoice", "reference_name": ${py(
			invoice
		)}}).insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
frappe.db.commit()
print(json.dumps({"intent": doc.name, "total": total}))
`)
	);
}

/**
 * Take away everything a test made: its table, its token, the orders on them (a paid one is cancelled first), the
 * intents, and the accounts of the throwaway diners it used (only ones that match the suite's address pattern).
 */
function cleanUpOnce({ table = null, tables: more = [], tokenNames = [], addresses = [] }) {
	return onTheServer(`${ONLY_OURS}
tables = [t for t in [${py(table)}] + ${py(more)} if t]
tokens = ${py(tokenNames)}
addresses = [a for a in ${py(addresses)} if OURS.match(a or "")]
customers = []
for address in addresses:
    customers += frappe.get_all("Customer", filters={"email_id": address}, pluck="name")
    for contact in frappe.get_all("Contact", filters={"user": address}, pluck="name"):
        customers += frappe.get_all("Dynamic Link", filters={"parent": contact, "parenttype": "Contact", "link_doctype": "Customer"}, pluck="link_name")
customers = sorted(set(customers))
invoices = set()
for table in tables:
    invoices |= set(frappe.get_all("Sales Invoice", filters={"restaurant_table": table}, pluck="name"))
if customers:
    invoices |= set(frappe.get_all("Sales Invoice", filters={"customer": ["in", customers]}, pluck="name"))
for name in sorted(invoices):
    for intent in frappe.get_all("Payment Intent", filters={"reference_doctype": "Sales Invoice", "reference_name": name}, pluck="name"):
        frappe.delete_doc("Payment Intent", intent, force=1, ignore_permissions=True)
    doc = frappe.get_doc("Sales Invoice", name)
    if doc.docstatus == 1:
        doc.cancel()
    frappe.delete_doc("Sales Invoice", name, force=1, ignore_permissions=True)
for token in tokens:
    if frappe.db.exists("Guest Order Token", token):
        frappe.delete_doc("Guest Order Token", token, force=1, ignore_permissions=True)
for table in tables:
    if frappe.db.exists("Restaurant Table", table):
        frappe.delete_doc("Restaurant Table", table, force=1, ignore_permissions=True)
for address in addresses:
    for contact in frappe.get_all("Contact", filters={"user": address}, pluck="name"):
        frappe.delete_doc("Contact", contact, force=1, ignore_permissions=True)
    for contact in frappe.get_all("Contact Email", filters={"email_id": address}, pluck="parent"):
        if frappe.db.exists("Contact", contact):
            frappe.delete_doc("Contact", contact, force=1, ignore_permissions=True)
    for queue in frappe.db.sql_list("select parent from \`tabEmail Queue Recipient\` where recipient = %s", (address,)):
        if frappe.db.exists("Email Queue", queue):
            frappe.delete_doc("Email Queue", queue, force=1, ignore_permissions=True)
for customer in customers:
    if frappe.db.exists("Customer", customer):
        frappe.delete_doc("Customer", customer, force=1, ignore_permissions=True)
for address in addresses:
    if frappe.db.exists("User", address):
        frappe.delete_doc("User", address, force=1, ignore_permissions=True)
frappe.db.commit()
print(json.dumps({"invoices": sorted(invoices), "customers": customers, "addresses": addresses}))
`);
}

/** True when the server answered a lock wait (another session's suite or a worker holds a row we delete). */
function isALockWait(error) {
	return /Lock wait timeout|QueryTimeoutError|being modified by another user|Deadlock/i.test(
		String((error && (error.stderr || error.message)) || error)
	);
}

function pause(seconds) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/**
 * The clean-up, played again when the instance is busy: the target is shared, and a deletion that waits for a row
 * another run holds raised "can not be deleted right now" and left the table of the test behind. Every step of the
 * clean-up checks that its target still exists, so a second pass finishes what the first one began.
 */
function cleanUp(what, attempts = 4) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return cleanUpOnce(what);
		} catch (error) {
			if (attempt >= attempts || !isALockWait(error)) throw error;
			pause(15 * attempt);
		}
	}
}

/**
 * Take away the tables a run abandoned (its clean-up failed, or the run was killed): the suite's tables are named
 * "E2E …", and one older than `minutes` belongs to nobody who is still running. Called once before a run.
 */
function sweepStale(minutes = 30) {
	const stale = json(
		onTheServer(`
limit = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-${Number(minutes)})
tables = frappe.get_all("Restaurant Table", filters={"table_name": ["like", "E2E %"], "creation": ["<", limit]}, pluck="name")
tokens = frappe.get_all("Guest Order Token", filters={"table": ["in", tables or ["-"]]}, pluck="name")
print(json.dumps({"tables": tables, "tokens": tokens}))
`)
	);
	if (stale.tables.length) cleanUp({ tables: stale.tables, tokenNames: stale.tokens });
	return stale;
}

/** What is left of one test on the server (its own tables and diners): must be empty after its clean-up. */
function leftovers({ tables = [], addresses = [] } = {}) {
	return json(
		onTheServer(`${ONLY_OURS}
addresses = [a for a in ${py(addresses)} if OURS.match(a or "")]
print(json.dumps({
    "tables": [t for t in ${py(tables)} if t and frappe.db.exists("Restaurant Table", t)],
    "users": [a for a in addresses if frappe.db.exists("User", a)],
    "customers": frappe.get_all("Customer", filters={"email_id": ["in", addresses or ["-"]]}, pluck="name"),
}))
`)
	);
}

/** A throwaway Website User (a customer's account, no desk role), the kind the sign-in opens. */
function aWebsiteUser(address) {
	return json(
		onTheServer(`${ONLY_OURS}
address = ${py(address)}
assert OURS.match(address)
user = frappe.get_doc({"doctype": "User", "email": address, "first_name": "E2E", "last_name": "Customer", "enabled": 1, "user_type": "Website User", "send_welcome_email": 0, "roles": [{"role": "Customer", "doctype": "Has Role"}]}).insert(ignore_permissions=True)
frappe.db.commit()
print(json.dumps({"user": user.name}))
`)
	);
}

/**
 * A session id of `user`, minted the way \`bench browse --user\` does (a short session, journalled in the Activity Log):
 * the way to be a Website User or a member of the staff in a test without anybody's password.
 */
function aSessionOf(user) {
	const out = execFileSync(
		"ssh",
		[
			HOST,
			`cd /home/neoffice/frappe-bench && bench --site ${SITE} browse --user "${user}" --user-for-audit "pos-next-e2e" 2>&1`,
		],
		{ encoding: "utf8", timeout: 90_000 }
	);
	const match = out.match(/sid=([A-Za-z0-9]+)/);
	if (!match) throw new Error(`no session for ${user}: ${out.slice(-300)}`);
	return match[1];
}

/**
 * A takeaway session whose customer is the suite's own throwaway one, with an order sent and held, as the page leaves it
 * before the payment: the token, the order, its total. For the tests that ask who may say an order is paid.
 * `language` is the one the visitor's browser asks for (the mail that gives the pickup number is written in it).
 */
function aHeldTakeawayOrder(address, language = null) {
	return json(
		onTheServer(`${ONLY_OURS}
from pos_next.api import guest_ordering
address = ${py(address)}
assert OURS.match(address)
made = guest_ordering.create_takeaway_token()
group = frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
territory = frappe.db.get_value("Territory", {"is_group": 0}, "name")
customer = frappe.get_doc({"doctype": "Customer", "customer_name": "E2E Identity", "customer_group": group, "territory": territory, "email_id": address}).insert(ignore_permissions=True)
frappe.db.set_value("Guest Order Token", made["name"], "customer", customer.name)
token = frappe.get_doc("Guest Order Token", made["name"])
settings = guest_ordering._get_restaurant_settings(token.pos_profile)
menu = guest_ordering._build_menu_from_card(settings.get("takeaway_menu") or settings.get("guest_menu"))
dish = next(d for c in menu["categories"] for d in c.get("menu_items", []) if not d.get("product_options") and d.get("price"))
frappe.set_user("Guest")
# the language the visitor's browser asks for: frappe settles it from the request, the order remembers it
if ${py(language)}:
    frappe.local.lang = ${py(language)}
order = guest_ordering.submit_guest_order(token.token, json.dumps([{"item_code": dish["item_code"], "qty": 1}]))
frappe.set_user("Administrator")
frappe.db.commit()
print(json.dumps({"token": token.token, "token_name": token.name, "invoice": order["invoice"], "total": order["grand_total"], "status": order["status"]}))
`)
	);
}

/**
 * The mails the server queued for an address, as the mailbox would read them: the decoded subject, the HTML body and
 * the queue's own status (the mail is queued by Frappe before it leaves, so the row holds what was sent).
 */
function mailsTo(address) {
	return json(
		onTheServer(`${ONLY_OURS}
import email, email.header
address = ${py(address)}
assert OURS.match(address)
mails = []
for queue in frappe.db.sql_list("select parent from \`tabEmail Queue Recipient\` where recipient = %s", (address,)):
    row = frappe.db.get_value("Email Queue", queue, ["message", "status"], as_dict=True)
    if not row:
        continue
    message = email.message_from_string(row.message)
    subject = str(email.header.make_header(email.header.decode_header(message["Subject"] or "")))
    html = " ".join(
        part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
        for part in message.walk()
        if part.get_content_type() == "text/html"
    )
    mails.append({"subject": subject, "html": html, "status": row.status})
print(json.dumps(mails))
`)
	);
}

module.exports = {
	onTheServer,
	aDiner,
	aTable,
	stateOf,
	theProviderSettles,
	cleanUp,
	sweepStale,
	leftovers,
	aWebsiteUser,
	aSessionOf,
	aHeldTakeawayOrder,
	mailsTo,
};
