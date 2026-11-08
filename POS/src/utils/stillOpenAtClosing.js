//// Neoffice — added file (no upstream equivalent). What is still open when a shift closes (NeoResto lot 1, the product owner,
//// 08.11.2026, solution C of the study of the open tables): the open orders of the restaurant, which the closing does not count
//// (it reads submitted invoices only), and the tickets held on this device, which signing out erases. The closing lists both, so
//// that nothing disappears or hangs unseen. Pure helpers: the component asks the server and the device, these say what it means.

// The tickets held on THIS device (IndexedDB `pos_next_drafts`) that carry a line, of this till's profile. A ticket with no
// profile (written before the profile was kept) is counted: signing out erases it all the same.
export function heldTicketsOf(drafts, profile) {
	const list = Array.isArray(drafts) ? drafts : []
	return list
		.filter((draft) => Array.isArray(draft?.items) && draft.items.length > 0)
		.filter((draft) => !profile || !draft.pos_profile || draft.pos_profile === profile)
		.map((draft) => ({
			id: draft.draft_id,
			table: draft.restaurant_table || "",
			customer: draft.customer || "",
			lines: draft.items.length,
			since: draft.updated_at || draft.created_at || null,
		}))
}

// What the sign-out dialogs tell: the held tickets are erased with the session (utils/offline `cleanupUserSession`)
export function heldTicketsNotice(count) {
	const total = Math.max(0, Math.floor(Number(count) || 0))
	if (total === 0) return ""
	if (total === 1) return __("1 held ticket on this device will be erased when you sign out")
	return __("{0} held tickets on this device will be erased when you sign out", [total])
}

// « Quiet for 45 min » / « Quiet for 1 h 05 »: since when nothing moved on an order
export function quietFor(minutes) {
	const total = Math.max(0, Math.floor(Number(minutes) || 0))
	if (total < 60) return __("Quiet for {0} min", [total])
	return __("Quiet for {0} h {1}", [Math.floor(total / 60), String(total % 60).padStart(2, "0")])
}

// What the manager must know of one open order, as badges (the server says `holds_money`, `consumed`, `served`):
// - money posted on a draft is money the closing does not read;
// - a dish that was served makes the order a debt to settle, never a draft to delete;
// - an order with nothing served yet may be an oversight, or a table that left before it was served.
// Each badge is `{ key, text, tone }` (tones: danger, warning, neutral)
export function badgesOfOrder(order) {
	const badges = []
	if (order?.holds_money) {
		badges.push({ key: "money", text: __("Money posted"), tone: "danger" })
	}
	if (order?.served) {
		badges.push({ key: "served", text: __("All served"), tone: "warning" })
	} else if (order?.consumed) {
		badges.push({ key: "partly", text: __("Partly served"), tone: "warning" })
	} else {
		badges.push({ key: "untouched", text: __("Nothing served"), tone: "neutral" })
	}
	return badges
}

export const BADGE_TONES = {
	danger: "bg-red-100 text-red-800",
	warning: "bg-amber-100 text-amber-800",
	neutral: "bg-gray-100 text-gray-700",
}

// The totals the closing tells: how many open orders, for how much, how many are a debt (a dish was served), how many hold money
export function summaryOfOpenOrders(orders) {
	const list = Array.isArray(orders) ? orders : []
	return {
		count: list.length,
		total: list.reduce((sum, order) => sum + (Number(order?.grand_total) || 0), 0),
		consumed: list.filter((order) => order?.consumed).length,
		holdsMoney: list.filter((order) => order?.holds_money).length,
		untouched: list.filter((order) => !order?.consumed && !order?.holds_money).length,
	}
}

// The line under the title: the open orders are not in this closing's figures
export function openOrdersLine(count) {
	if (!count) return ""
	if (count === 1) return __("1 order is still open: it is not in the figures of this closing")
	return __("{0} orders are still open: they are not in the figures of this closing", [count])
}

// The cash is over while orders are open: one of them may have been paid in cash and never cashed in (the waiter put the bill
// on the table, the guests left the money). Only said to someone who sees the difference.
export function cashHint(summary, cashIsOver) {
	if (!cashIsOver || !summary?.count) return ""
	return __("The cash is over while orders are open: one of them may have been paid in cash and not cashed in.")
}
