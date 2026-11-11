//// Neoffice — added file (no upstream equivalent). A visitor with no session on a page of the till's customers (the QR menu, the takeaway order,
//// the booking page, the scan in the shop) or on the staff's sign-in page is answered by methods open to a guest only. The till asked the
//// server at start for its user, its CSRF token, its languages and its user's language, which all want a session: four refusals (403) on
//// every such page, in the logs of every shop (maintenance#1975). A visitor is told nothing by them: they are not asked. The screens a
//// device pairs with (the customer display, the kitchen's and the runner's tablets) keep asking, they authenticate in their own way.

/** The routes (under /pos) a customer or a signed-out cashier opens with no session. */
const VISITOR_PAGES = [
	/^\/account\/login\/?$/,
	/^\/order\/?$/,
	/^\/reservation\/?$/,
	/^\/guest\/[^/]+/,
	/^\/menu\/[^/]+/,
	/^\/shop\/[^/]+/,
];

/** Whether the browser holds no session: Frappe writes the user in the `user_id` cookie, `Guest` for a visitor. */
export function hasNoSession(cookie = typeof document === "undefined" ? "" : document.cookie) {
	const user = new URLSearchParams((cookie || "").split("; ").join("&")).get("user_id");
	return !user || user === "Guest";
}

/** Whether the page is one a visitor opens (the path under the till's /pos, as the router reads it). */
export function isVisitorPage(
	pathname = typeof window === "undefined" ? "" : window.location.pathname
) {
	const path = (pathname || "").replace(/^\/pos(?=\/|$)/, "") || "/";
	return VISITOR_PAGES.some((page) => page.test(path));
}

/** A visitor with no session on a visitor's page: the calls that want a session are not made. */
export function isAVisitorWithoutSession({ pathname, cookie } = {}) {
	return isVisitorPage(pathname) && hasNoSession(cookie);
}
