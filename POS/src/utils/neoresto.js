//// Neoffice — added file (no upstream equivalent). Whether the site runs NeoResto, as the /pos page told the app
//// when it loaded (window.posnext_neoresto_active, set by pos_next.optional_apps.update_pos_page_context): known at
//// once, for every screen, with or without a till profile or a session (NeoResto lot 1, task 4, fix round 1); and the
//// door a visitor came through, which NeoResto's entry route names in its query (/pos?mode=restaurant, task 5).

/**
 * Whether the site runs NeoResto. A page that did not say is taken for a site that does not: nothing of the
 * restaurant shows on a doubt.
 */
export function neorestoActive() {
	return typeof window !== "undefined" && window.posnext_neoresto_active === true
}

/**
 * Where a visitor of a restaurant screen goes instead where the site does not run NeoResto: the till. Null for a
 * route that is no restaurant screen (no `meta.needsNeoResto`), and where the site runs NeoResto.
 */
export function redirectWhereNeoRestoIsOff(to) {
	if (to?.meta?.needsNeoResto && !neorestoActive()) {
		return { name: "POSSale" }
	}
	return null
}

/** The `mode` of the entry route NeoResto opens (`/pos?mode=restaurant`): the restaurant door. */
export const RESTAURANT_DOOR = "restaurant"

/**
 * The door a visitor came through, read from the query of a route: "restaurant" for `?mode=restaurant`, null for the usual
 * door (no mode, another mode, a mode given twice, no route to read). The server owns the rule (any other mode is the usual
 * door); this keeps off the wire what it would ignore.
 */
export function doorOf(route) {
	return route?.query?.mode === RESTAURANT_DOOR ? RESTAURANT_DOOR : null
}
