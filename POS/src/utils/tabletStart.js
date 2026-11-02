//// Neoffice — added file (no upstream equivalent). Where a tablet goes when the app starts at the till's address
//// (NeoResto lot 1, task 48). A kitchen's or runner's tablet is installed as an app, and every launch from its
//// home-screen icon starts at /pos, the till's page, not at the screen its pairing opened: it would open the shift
//// dialog and ask for profiles a tablet's account may not read. The tablet asks the server which screen it was paired
//// for (the same address its pairing answered with), and the router sends it there before the till is even loaded.
import { neorestoActive } from "@/utils/neoresto"
import {
	forgetScreen,
	isDeskSession,
	isScreenAddress,
	isSignedOut,
	isTabletSession,
	rememberScreen,
	rememberedScreen,
	wasPairedAsATablet,
} from "@/utils/tabletSession"

/** The endpoint that answers a tablet's session with its screen (pos_next.api.restaurant_devices.my_screen). */
export const OWN_SCREEN =
	"/api/method/pos_next.api.restaurant_devices.my_screen"

/**
 * How long the tablet waits for the server before it opens the screen it remembers, in milliseconds. A kitchen's Wi-Fi
 * that is up but slow must not leave the tablet on a blank page.
 */
export const ASK_FOR = 4000

/**
 * Ask the server which screen this tablet was paired for. One of:
 *   { screen }      its address (a page of the app: the server's word is checked, not trusted blindly)
 *   { refused }     the server answered and said no: the tablet was disconnected, or is no tablet any more
 *   { unreachable } no usable answer: no network, no time, a server error, something that is not a screen
 */
export async function askForOwnScreen(timeout = ASK_FOR) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeout)
	try {
		const response = await fetch(OWN_SCREEN, {
			method: "GET",
			credentials: "same-origin",
			cache: "no-store",
			headers: { Accept: "application/json" },
			signal: controller.signal,
		})
		if (response.status === 401 || response.status === 403)
			return { refused: true }
		if (!response.ok) return { unreachable: true }
		const body = await response.json().catch(() => null)
		const screen = body?.message?.redirect
		return isScreenAddress(screen) ? { screen } : { unreachable: true }
	} catch {
		return { unreachable: true }
	} finally {
		clearTimeout(timer)
	}
}

/** The address as the router knows it: the app lives under /pos. */
function insideTheApp(address) {
	return address.replace(/^\/pos(?=\/)/, "")
}

/**
 * Where a navigation to `to` goes instead, if the browser is a tablet's. One of:
 *   null            the way it was going: not a tablet, not a page of the till, or a site that does not run NeoResto
 *   { screen }      the tablet's own screen, as a router address (the server's answer, else the one it remembers)
 *   { pair: true }  the pairing page: the server refused the tablet, or it can reach nothing and remembers nothing, or
 *                   its sessions were ended and the app starts at the till's address
 *
 * Only the till's own pages are concerned: the screens of the tablets, the pairing page and the pages a visitor may open
 * carry `meta.pairable` or `meta.allowGuest` and are never intercepted. A desk account, a visitor and a portal customer
 * are not a tablet (no account of the tablets' domain): they are not asked anything and go the way they always went.
 */
export async function whereTheTabletStarts(to) {
	if (to?.meta?.allowGuest || to?.meta?.pairable) return null
	if (!neorestoActive()) return null
	if (isTabletSession()) return await itsOwnScreen()
	if (isSignedOut()) {
		// A tablet whose sessions were ended (disconnected at the till, expired) is a visitor by the time the router runs:
		// the app asked who is signed in first, and the answer reset the cookies. It remembers its screen, which says it
		// was paired: the till's address (where the installed app starts) sends it to the pairing page, which says how to
		// open it again, not to a password it does not have. The login page itself, which the pairing page links to for
		// whoever wants a password, and the till's other pages stay as they were.
		return to?.name === "POSSale" && wasPairedAsATablet()
			? { pair: true }
			: null
	}
	// Signed in with a desk account: this browser is the till's now, not a tablet's
	if (isDeskSession()) forgetScreen()
	return null
}

async function itsOwnScreen() {
	const answer = await askForOwnScreen()
	if (answer.screen) {
		rememberScreen(answer.screen)
		return { screen: insideTheApp(answer.screen) }
	}
	if (answer.refused) {
		forgetScreen()
		return { pair: true }
	}
	const remembered = rememberedScreen()
	return remembered ? { screen: insideTheApp(remembered) } : { pair: true }
}
