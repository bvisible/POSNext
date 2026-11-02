// //// Neoffice — added file (no upstream equivalent). The manager's approval of what a ticket offers (« Offer an item »,
// //// NeoResto lot 1, task 24), where a rule of the authorization gate asks for it (off by default). The PIN is checked
// //// by the server (request_grant), which answers a grant: a short-lived token bound to the cashier, the till and the
// //// value approved. The till keeps the one it holds for the ticket and sends it with the payment; the server's gate
// //// spends it on that invoice (before_submit), so it is the server that decides, whatever the till sends.

import { isOfferedRow } from "@/utils/offeredRows"

// The grant must still be alive when the payment reaches the server
const MARGIN_MS = 60_000
// The server's own tolerance on an approved amount (pos_next.authorization.grants)
const AMOUNT_TOLERANCE = 0.005

let held = null

/** Keep the grant a manager just gave for `amount` offered on the ticket. */
export function holdGrant(grant, { amount, user, profile, now = Date.now() }) {
	if (!grant?.grant_token) return
	const lifetime = (Number(grant.expires_in) || 0) * 1000
	held = {
		token: grant.grant_token,
		amount: Number(amount) || 0,
		user,
		profile,
		expiresAt: now + lifetime - MARGIN_MS,
	}
}

/** Whether the grant held covers `amount` offered, for this cashier at this till, still alive. */
export function grantCovers(amount, { user, profile, now = Date.now() } = {}) {
	return (
		Boolean(held) &&
		held.user === user &&
		held.profile === profile &&
		now < held.expiresAt &&
		(Number(amount) || 0) <= held.amount + AMOUNT_TOLERANCE
	)
}

/** Forget the grant: the ticket it was given for is gone. */
export function dropGrant() {
	held = null
}

/** What the payment of `items` carries: the grant held, when the ticket offers something. */
export function authorizationFieldsFor(items) {
	return held && (items || []).some(isOfferedRow)
		? { authorization_token: held.token }
		: {}
}
