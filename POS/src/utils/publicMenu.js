//// Neoffice — added file (no upstream equivalent). The public menu (NeoRestau lot 1, task 17): the address that the QR
//// code on a restaurant's tables opens, the call that reads the menu behind it, and how a price is written on it.
//// Upstream POSNext has no guest surface at all.

/** The path of a restaurant's public menu in the app (the router's base is /pos). */
export function publicMenuPath(restaurant) {
	return `/pos/menu/${encodeURIComponent(restaurant)}`
}

/** The address of a restaurant's public menu on a site: what the QR code on the tables holds. */
export function publicMenuUrl(restaurant, origin = window.location.origin) {
	return `${origin}${publicMenuPath(restaurant)}`
}

// A menu read a moment ago is not read again: the page is built again each time the translations arrive, and a guest
// would watch it load twice. The server keeps its own copy for about as long.
const KEPT_FOR_MS = 60_000
let recent = null

/** The menu of this restaurant if it was read in the last minute, else null. */
export function recentPublicMenu(restaurant) {
	if (recent && recent.restaurant === restaurant && Date.now() - recent.at < KEPT_FOR_MS) {
		return recent.menu
	}
	return null
}

/** Forget the menu read last. */
export function forgetPublicMenu() {
	recent = null
}

/**
 * Read a restaurant's public menu. A guest has no session: a plain GET, no CSRF token, as a link would. Anything but a
 * menu rejects (a restaurant that does not publish one is refused with a 404, whatever the reason), and the page then
 * says so politely; nothing of the answer of a refusal is ever shown.
 */
export async function fetchPublicMenu(restaurant) {
	const known = recentPublicMenu(restaurant)
	if (known) return known

	const response = await fetch(
		`/api/method/pos_next.api.public_menu.get_public_menu?restaurant=${encodeURIComponent(restaurant)}`,
		// Never from the browser's own copy: a restaurant that switched its public menu off must be off at the next scan
		{ headers: { Accept: "application/json" }, cache: "no-store" },
	)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}
	const menu = (await response.json())?.message
	if (!menu?.restaurant || !Array.isArray(menu.sections)) {
		throw new Error("No menu in the answer")
	}
	recent = { restaurant, at: Date.now(), menu }
	return menu
}

/** A price as the guest's phone writes an amount of money; the number alone for a currency it does not know. */
export function formatPrice(amount, currency) {
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency || "CHF",
			minimumFractionDigits: 2,
		}).format(amount)
	} catch {
		return Number(amount).toFixed(2)
	}
}
