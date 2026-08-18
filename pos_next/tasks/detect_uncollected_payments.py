# Copyright (c) 2026, Neoffice and contributors
# License: AGPL-3.0
#
#//// Neoffice — added file (no upstream equivalent)
#
# Safety net for POS payments that the till never turned into a sale.
#
# Why this exists
# ---------------
# A POS card/QR payment is finalized by the *browser*: the till watches the
# Payment Intent and, on `succeeded`, creates and submits the Sales Invoice.
# Everything upstream of that browser can succeed while the browser does not —
# the tab is closed, the page was never reloaded after a `bench restart`, the
# network drops, the cashier walks away, or (until commit "failed is not final")
# the till stopped listening on a soft decline.
#
# In every one of those cases the customer IS charged and the shop has no sale,
# no receipt and no accounting entry — and nothing anywhere says so. At guigoz
# that silence lasted from 24.06 to 18.08: 6 uncollected sales and 3 customers
# charged twice, found only because a cashier happened to mention it.
#
# So: never rely on the till alone to notice. Reconcile server-side and shout.

import frappe
from frappe import _
from frappe.utils import get_url_to_form, now_datetime, time_diff_in_seconds

# How long the till is allowed to take between "the PSP settled" and "the sale
# is submitted". The happy path takes ~2 s; a slow finalize a few seconds more.
# 15 minutes is far past any legitimate delay while still catching the same day.
GRACE_SECONDS = 15 * 60

# Don't re-alert forever on intents someone has already looked at.
LOOKBACK_DAYS = 7

# Marker left as a Comment on an intent already reported, so the hourly run
# raises each discrepancy exactly once. Alert fatigue is how a real signal
# becomes invisible — the same way the silent FSM rejection hid this bug.
FLAG_MARKER = "[POS-UNCOLLECTED]"


def detect_uncollected_payments():
	"""Flag settled Payment Intents that never became a sale.

	Runs hourly. Read-only with respect to money: it never creates, cancels or
	refunds anything — reconciling the till is a human decision. It only makes
	the discrepancy impossible to miss.
	"""
	if not frappe.db.table_exists("Payment Intent"):
		# `payments` not installed on this site — nothing to reconcile.
		return

	orphans = frappe.get_all(
		"Payment Intent",
		filters={
			"status": "succeeded",
			"reference_name": ["is", "not set"],
			"creation": [">", frappe.utils.add_days(None, -LOOKBACK_DAYS)],
		},
		fields=["name", "amount", "currency", "provider", "channel", "creation", "completed_at"],
		order_by="creation asc",
	)

	now = now_datetime()
	candidates = [
		o
		for o in orphans
		if time_diff_in_seconds(now, o.completed_at or o.creation) > GRACE_SECONDS
		and not _already_flagged(o.name)
	]

	# An unlinked intent is NOT proof of a missing sale. The sale may have been
	# recorded and only the back-link lost (a provider renamed in the mapping is
	# enough — blowbackshop, 21.07: 180.- collected via `twint_migrated`, invoice
	# ACC-SINV-2026-01898 booked 2 s later, link never made). Repair those
	# silently. Crying wolf on a healthy sale is how an alert stops being read.
	ripe = []
	for o in candidates:
		if _try_relink(o):
			continue
		ripe.append(o)

	if not ripe:
		return

	total = sum((o.amount or 0) for o in ripe) / 100
	currency = ripe[0].currency or "CHF"

	lines = []
	for o in ripe:
		lines.append(
			"- {amount:.2f} {cur} — {when} — {provider}/{channel} — {name}\n  {url}".format(
				amount=(o.amount or 0) / 100,
				cur=o.currency or currency,
				when=frappe.utils.format_datetime(o.completed_at or o.creation),
				provider=o.provider,
				channel=o.channel,
				name=o.name,
				url=get_url_to_form("Payment Intent", o.name),
			)
		)

	message = (
		"{count} encaissement(s) confirmé(s) par le prestataire de paiement n'ont "
		"donné lieu à AUCUNE vente dans l'ERP. Le client a payé, la caisse n'a rien "
		"enregistré.\n\n"
		"Total : {total:.2f} {cur}\n\n{lines}\n\n"
		"À faire : vérifier chaque ligne côté prestataire, puis soit saisir la vente "
		"manquante, soit rembourser le client s'il a payé deux fois."
	).format(count=len(ripe), total=total, cur=currency, lines="\n".join(lines))

	# frappe.log_error(title, message) — title is capped at 140 chars.
	frappe.log_error(
		_("POS: {0} payment(s) collected but never recorded as a sale").format(len(ripe)),
		message,
	)

	_notify_pos_managers(len(ripe), total, currency, message)

	# Flag each intent so the next run stays quiet about it. An unresolved
	# discrepancy must be raised once and stay visible on the record — not
	# re-sent every hour until people learn to ignore the alert.
	for o in ripe:
		_flag(o.name)


def _try_relink(intent) -> bool:
	"""Link the intent to a POS sale that clearly matches, if there is exactly one.

	Deliberately strict — an ambiguous match is reported, never guessed:
	  * a submitted POS invoice, paid the exact same amount,
	  * created within ±10 min of the settlement,
	  * that does not already carry a succeeded intent.
	Returns True when the discrepancy was only a missing back-link.
	"""
	settled = intent.completed_at or intent.creation
	rows = frappe.db.sql(
		"""
		SELECT si.name
		FROM `tabSales Invoice` si
		JOIN `tabSales Invoice Payment` p ON p.parent = si.name
		WHERE si.is_pos = 1
		  AND si.docstatus = 1
		  AND ABS(p.amount * 100 - %(amount)s) < 1
		  AND si.creation BETWEEN DATE_SUB(%(t)s, INTERVAL 10 MINUTE)
		                      AND DATE_ADD(%(t)s, INTERVAL 10 MINUTE)
		  AND NOT EXISTS (
			SELECT 1 FROM `tabPayment Intent` pi
			WHERE pi.reference_doctype = 'Sales Invoice'
			  AND pi.reference_name = si.name
			  AND pi.status = 'succeeded'
		  )
		""",
		{"amount": intent.amount, "t": settled},
		as_dict=True,
	)
	if len(rows) != 1:
		return False

	frappe.db.set_value(
		"Payment Intent",
		intent.name,
		{"reference_doctype": "Sales Invoice", "reference_name": rows[0].name},
		update_modified=False,
	)
	frappe.logger().info(
		f"detect_uncollected_payments: relinked {intent.name} -> {rows[0].name}"
	)
	return True


def _already_flagged(intent_name: str) -> bool:
	return bool(
		frappe.db.exists(
			"Comment",
			{
				"reference_doctype": "Payment Intent",
				"reference_name": intent_name,
				"content": ["like", f"%{FLAG_MARKER}%"],
			},
		)
	)


def _flag(intent_name: str) -> None:
	"""Leave a durable, human-visible trace on the intent itself."""
	try:
		c = frappe.new_doc("Comment")
		c.comment_type = "Comment"
		c.reference_doctype = "Payment Intent"
		c.reference_name = intent_name
		c.content = _(
			"{0} Encaissé par le prestataire mais aucune vente correspondante dans "
			"l'ERP. À rapprocher : saisir la vente manquante, ou rembourser le client "
			"s'il a payé deux fois."
		).format(FLAG_MARKER)
		c.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(
			"detect_uncollected_payments: flag failed",
			frappe.get_traceback(),
		)


def _notify_pos_managers(count, total, currency, message):
	"""Raise a desk notification for whoever can act on it.

	Best-effort: a missing recipient must never make the detection itself fail.
	"""
	try:
		recipients = frappe.get_all(
			"Has Role",
			filters={"role": ["in", ["Accounts Manager", "System Manager"]], "parenttype": "User"},
			fields=["parent"],
			pluck="parent",
			distinct=True,
		)
		recipients = [
			u
			for u in set(recipients)
			if u not in ("Administrator", "Guest")
			and frappe.db.get_value("User", u, "enabled")
		]
		if not recipients:
			return

		subject = _("{0} POS payment(s) collected without a sale — {1:.2f} {2}").format(
			count, total, currency
		)
		for user in recipients:
			note = frappe.new_doc("Notification Log")
			note.subject = subject
			note.email_content = message.replace("\n", "<br>")
			note.for_user = user
			note.type = "Alert"
			note.document_type = "Payment Intent"
			note.insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(
			"detect_uncollected_payments: notification failed",
			frappe.get_traceback(),
		)
