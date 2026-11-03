//// Neoffice — added file (no upstream equivalent).
////
//// The sign-in code a diner receives by e-mail, read from the server's mail queue: the subject starts with the
//// six digits whatever the language the mail is written in, and the link is the one address that ends in
//// /login-link. Neither depends on the words, which the translations change. Same reading as the shop's suite.

const {onTheServer} = require('./server');

const lastRead = new Map();

const READ_LATEST = (address) =>
	`import re, json, email as em\n` +
	`from email.header import decode_header, make_header\n` +
	`rows = frappe.db.sql("""select q.message from \`tabEmail Queue\` q\n` +
	`  join \`tabEmail Queue Recipient\` r on r.parent = q.name\n` +
	`  where r.recipient = %s order by q.creation desc limit 8""", (${JSON.stringify(address)},))\n` +
	`found = None\n` +
	`for (raw,) in rows:\n` +
	`    msg = em.message_from_string(raw)\n` +
	`    subject = str(make_header(decode_header(msg["Subject"] or "")))\n` +
	`    code = re.match(r"\\s*(\\d{6})\\b", subject)\n` +
	`    if not code:\n` +
	`        continue\n` +
	`    html = ""\n` +
	`    for part in msg.walk():\n` +
	`        if part.get_content_type() == "text/html":\n` +
	`            html = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")\n` +
	`    link = re.search(r'href="([^"]*login-link\\?token=[^"]+)"', html)\n` +
	`    found = {"code": code.group(1), "link": link.group(1) if link else None, "subject": subject}\n` +
	`    break\n` +
	`print(json.dumps(found) if found else "none")\n`;

function latestSignInMail(address) {
	const out = onTheServer(READ_LATEST(address)).split('\n').pop().trim();
	return out === 'none' ? null : JSON.parse(out);
}

/** Wait for a sign-in mail to `address` whose code is not one already read, and return it. */
async function waitForSignInMail(address, {previousCode = null, timeout = 60_000} = {}) {
	const deadline = Date.now() + timeout;
	const skip = previousCode || lastRead.get(address) || null;
	let last = null;
	while (Date.now() < deadline) {
		last = latestSignInMail(address);
		if (last && last.code && last.code !== skip) {
			lastRead.set(address, last.code);
			return last;
		}
		await new Promise((resolve) => setTimeout(resolve, 2500));
	}
	throw new Error(`no new sign-in mail for ${address} after ${timeout / 1000}s (last: ${JSON.stringify(last)})`);
}

module.exports = {latestSignInMail, waitForSignInMail};
