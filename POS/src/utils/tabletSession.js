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

/**
 * The domain of the tablets' accounts (pos_next.restaurant.devices.ACCOUNT_DOMAIN): the server confines such a session to
 * its screens.
 */
export const TABLET_DOMAIN = "devices.invalid"

/** Who is signed in, or null for a visitor. */
export function signedInUser() {
	const user = readCookie("user_id")
	return !user || user === "Guest" ? null : user
}

/**
 * Whether the browser is signed in with a tablet's own account (NeoRestau lot 1, task 48): a portal account (no desk
 * session) at an address of the tablets' domain, the one the server confines to the kitchen's and the runner's screens.
 * The server decides what such a session may do; this only says whether to ask it where the tablet's screen is.
 */
export function isTabletSession() {
	const user = signedInUser()
	return !!user && !isDeskSession() && user.endsWith(`@${TABLET_DOMAIN}`)
}

// --- the screen a tablet was paired for, kept for a start with no network (task 48) -----------------------------------

const SCREEN_MEMORY = "pos_tablet_screen"
// The addresses the server gives as a tablet's screen (pos_next.restaurant.devices.screen_path): the kitchen's or the
// runner's page of the app, with its query. Nothing else is ever kept or followed.
const SCREEN_ADDRESS = /^\/pos\/(?:kds|runner)(?:\?[^#\s]*)?$/

/** Whether `path` is the address of a tablet's screen, as the server gives it. */
export function isScreenAddress(path) {
	return typeof path === "string" && SCREEN_ADDRESS.test(path)
}

/**
 * Keep the screen the tablet signed in now was paired for, so that a start with no network still opens it. Kept with
 * the account it is for; nothing is kept for a visitor or for an address that is no screen of the app. A browser that
 * keeps nothing (a private window) is not an error: the tablet then needs the server to find its screen.
 */
export function rememberScreen(path) {
	const user = signedInUser()
	if (!user || !isScreenAddress(path)) return
	try {
		window.localStorage.setItem(SCREEN_MEMORY, JSON.stringify({ user, path }))
	} catch {
		// Nothing to keep it in
	}
}

/** The screen kept for the tablet that is signed in now, or null (nothing kept, another tablet's, or not a screen). */
export function rememberedScreen() {
	const user = signedInUser()
	if (!user) return null
	try {
		const kept = JSON.parse(window.localStorage.getItem(SCREEN_MEMORY) || "null")
		return kept?.user === user && isScreenAddress(kept.path) ? kept.path : null
	} catch {
		return null
	}
}

/**
 * Whether this browser was paired as a tablet: it keeps a screen, whoever is signed in now. A tablet whose sessions were
 * ended (disconnected at the till, expired) is signed out when the app starts, and nothing else says it was one.
 */
export function wasPairedAsATablet() {
	try {
		const kept = JSON.parse(window.localStorage.getItem(SCREEN_MEMORY) || "null")
		return isScreenAddress(kept?.path)
	} catch {
		return false
	}
}

/** Drop the screen kept: the server refused the tablet, or the browser is signed in as something else. */
export function forgetScreen() {
	try {
		window.localStorage.removeItem(SCREEN_MEMORY)
	} catch {
		// Nothing was kept
	}
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
