//// Neoffice — added file (no upstream equivalent). The title of the browser tab, written in ONE place (NeoRestau lot 1).
//// Every tab of the app was titled "Neopos" (index.html), so with the till, the runner and the kitchen open side by side
//// nobody knew which tab was which. Now each screen names its tab, "<screen> · Neopos":
////
//// - a route names its screen with `meta.title`, a function that returns the word in the user's language
////   (`title: () => __("Kitchen")`: a function, because the word must be translated when the title is written and the
////   catalogue may arrive after the route exists; and a literal `__()`, because the catalogue extraction reads the msgid
////   from the source, it cannot follow a variable). The router's afterEach calls `showScreen(route)`;
//// - a route with no `title` (the till, the login, anything else) is plain "Neopos";
//// - a screen that learns a name only after its route (the till once a shift is open, the kitchen once a station is
////   chosen, a guest page once it has the restaurant's name) hands it over with `nameTheTab` (see composables/useTabTitle):
////   it goes in front, "Bar · Kitchen · Neopos", or, with `instead`, in place of the screen's own name, "The Bistro · Neopos"
////   rather than "Order · Neopos". That name is data (a till, a station, a restaurant): it is never translated;
//// - the catalogue of translations can change after the first navigation: `refreshTabTitle` writes the title again.
////
//// Nothing else in the app writes `document.title`: a spec (eachScreenNamesItsTab) fails when something does.

/** The product, last on every tab. A brand: it is not translated. */
export const PRODUCT = "Neopos"

const SEPARATOR = " · "

// The `title` of the route on screen, and the name its page handed over since (cleared by the next navigation)
let screenTitle = null
let pageName = ""
let pageNameInsteadOfScreen = false

/** The screen's own name in the user's language; "" when the route has none or the translator cannot be asked yet. */
function screenName() {
	try {
		return screenTitle ? String(screenTitle() || "") : ""
	} catch {
		// A title that cannot be built must never break a navigation: the tab is then the product's name
		return ""
	}
}

/** The title of the tab as it stands now: the page's name, the screen's own name, the product. */
export function tabTitle() {
	const screen = screenName()
	const parts = []
	if (pageName) parts.push(pageName)
	if (screen && !(pageName && pageNameInsteadOfScreen)) parts.push(screen)
	parts.push(PRODUCT)
	return parts.join(SEPARATOR)
}

/** The one write of the tab's title. */
function write() {
	if (typeof document !== "undefined") document.title = tabTitle()
}

/**
 * A navigation is done: the tab takes the name of the route's screen, and the name its previous page handed over goes.
 * `meta.title` is a function returning the screen's name (a plain string is taken as it is); none is plain "Neopos".
 */
export function showScreen(route) {
	const title = route?.meta?.title
	screenTitle =
		typeof title === "function"
			? title
			: typeof title === "string"
				? () => title
				: null
	pageName = ""
	pageNameInsteadOfScreen = false
	write()
}

/**
 * The screen has learned a name its route does not carry. It goes in front of the screen's own name; with `instead` it stands
 * in place of it while there is one. An empty name takes it back.
 */
export function nameTheTab(name, { instead = false } = {}) {
	pageName = name ? String(name).trim() : ""
	pageNameInsteadOfScreen = instead
	write()
}

/** The words of the tab are translated again: the catalogue of translations arrived or changed. */
export function refreshTabTitle() {
	write()
}
