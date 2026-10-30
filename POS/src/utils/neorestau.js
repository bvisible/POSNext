//// Neoffice — added file (no upstream equivalent). Whether the site runs NeoRestau, as the /pos page told the app
//// when it loaded (window.posnext_neorestau_active, set by pos_next.optional_apps.update_pos_page_context): known at
//// once, for every screen, with or without a till profile or a session (NeoRestau lot 1, task 4, fix round 1).

/**
 * Whether the site runs NeoRestau. A page that did not say is taken for a site that does not: nothing of the
 * restaurant shows on a doubt.
 */
export function neorestauActive() {
	return typeof window !== "undefined" && window.posnext_neorestau_active === true
}

/**
 * Where a visitor of a restaurant screen goes instead where the site does not run NeoRestau: the till. Null for a
 * route that is no restaurant screen (no `meta.needsNeoRestau`), and where the site runs NeoRestau.
 */
export function redirectWhereNeoRestauIsOff(to) {
	if (to?.meta?.needsNeoRestau && !neorestauActive()) {
		return { name: "POSSale" }
	}
	return null
}
