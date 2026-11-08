//// Neoffice — added file (no upstream equivalent). Whose a held ticket is (NeoResto lot 1, the product owner, 08.11.2026): signing out used to erase every ticket held on the device, in
//// silence, so that the next cashier on the same till never saw the last one's. They are kept now, and each carries its owner: a ticket is shown to the person who held it, and to
//// nobody else. A ticket held before the owner was written (none) is shown to whoever signs in, as it always was.

/** The user of the session, from the cookie Frappe sets ("" for a visitor). */
export function currentUser() {
	try {
		const cookies = new URLSearchParams(document.cookie.split("; ").join("&"))
		const user = cookies.get("user_id")
		return user && user !== "Guest" ? user : ""
	} catch {
		return ""
	}
}

/** Whether a held ticket is the user's: written by him, or written before owners were kept. */
export function draftIsMine(draft, user = currentUser()) {
	return !draft?.owner || !user || draft.owner === user
}

/** The data of a held ticket with its owner written in. */
export function withOwner(data, user = currentUser()) {
	return user ? { ...data, owner: user } : data
}
