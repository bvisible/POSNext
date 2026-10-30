//// Neoffice — added file (no upstream equivalent). A kitchen's or a runner's tablet signs in with an account of its own,
//// paired by a QR code shown at the till, with no password (NeoRestau lot 1, task 16). What its screens need to know
//// of the browser's session, read from the cookies Frappe sets on every answer: no store, no request, nothing that
//// a screen of a visitor could not load.

/** The page a tablet opens by scanning a QR code; with no code, it says how to get one. */
export const PAIR_PAGE = "/pos/pair"

function readCookie(name) {
	const found = `; ${document.cookie}`.split(`; ${name}=`)
	return found.length === 2 ? decodeURIComponent(found.pop().split(";").shift() || "") : null
}

/**
 * Whether the browser is signed in with a desk account: Frappe says so in its `system_user` cookie. A tablet's device
 * account is a portal account (the cookie says "no"), and has no till to go back to.
 */
export function isDeskSession() {
	return readCookie("system_user") !== "no"
}

/** Whether the browser is no longer signed in: Frappe answered its last call as a visitor's (`user_id` is Guest). */
export function isSignedOut() {
	const user = readCookie("user_id")
	return !user || user === "Guest"
}

/** The one place a tablet's pages leave the app (a test watches it: the browser's location cannot be stubbed). */
export const navigation = {
	open(url) {
		window.location.replace(url)
	},
}

/** Load a page anew, so that the app starts again with the session the browser now holds. */
export function openPage(url) {
	navigation.open(url)
}

/**
 * After a screen's call failed: a call that leaves the browser signed out means the tablet was disconnected, or its
 * session ended. It goes to the pairing page, which says how to open it again with a new code. Whether it went.
 *
 * The cookies decide, not the error: Frappe answers a visitor's refused call with a 403 whose body is an HTML redirect
 * to the login, which frappe-ui's `call` cannot parse, so the error that reaches the screen carries no status at all.
 * The same answer sets `user_id` to Guest. A call that fails for any other reason (the network) leaves the cookies as
 * they were.
 */
export function leaveWhenSignedOut() {
	if (!isSignedOut()) return false
	openPage(PAIR_PAGE)
	return true
}
