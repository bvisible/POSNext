//// Neoffice — added file (no upstream equivalent). What is still open when a shift closes (NeoResto lot 1, the product owner, 08.11.2026, solution C of the study of the open tables): the open
//// orders of the restaurant, which the closing does not count (it reads submitted invoices only), the drafts the till left on the server, and the tickets held on this device, which signing out
//// used to erase in silence and keeps now. The closing lists them all, so that nothing disappears or hangs unseen and the user keeps or deletes each by his own hand. Pure helpers: the
//// components ask the server and the device, these say what it means.

// « 1 line » / « 3 lines »: the count of lines of a ticket or a draft
export function linesText(count) {
	const total = Math.max(0, Math.floor(Number(count) || 0))
	return total === 1 ? __("1 line") : __("{0} lines", [total])
}

// What a held ticket is worth: the net amount of its lines after offers and coupons (older tickets lack it, then quantity times rate)
export function heldTicketTotal(draft) {
	return (draft?.items || []).reduce((sum, item) => {
		if (typeof item.amount === "number") return sum + item.amount
		return sum + (Number(item.quantity ?? item.qty ?? 1) || 0) * (Number(item.rate) || 0)
	}, 0)
}

// The tickets held on THIS device (IndexedDB `pos_next_drafts`) that carry a line, of this till's profile and of the user (a ticket carries its owner: utils/draftOwner; one with
// none is shown to whoever signs in). A ticket with no profile (written before the profile was kept) is counted. `draft` is the stored ticket itself, to delete it.
export function heldTicketsOf(drafts, profile, user) {
	const list = Array.isArray(drafts) ? drafts : []
	return list
		.filter((draft) => Array.isArray(draft?.items) && draft.items.length > 0)
		.filter((draft) => !profile || !draft.pos_profile || draft.pos_profile === profile)
		.filter((draft) => !user || !draft.owner || draft.owner === user)
		.map((draft) => ({
			id: draft.draft_id,
			table: draft.restaurant_table || "",
			customer: draft.customer?.customer_name || draft.customer?.name || draft.customer || "",
			lines: draft.items.length,
			total: heldTicketTotal(draft),
			since: draft.updated_at || draft.created_at || null,
			draft,
		}))
}

// What the closing and the sign-out dialogs tell: the held tickets are KEPT on the device (they are no longer erased with the session), for their owner; he keeps them or deletes the ones he does not want
export function heldTicketsNotice(count) {
	const total = Math.max(0, Math.floor(Number(count) || 0))
	if (total === 0) return ""
	if (total === 1) return __("1 held ticket on this device stays here for your next session")
	return __("{0} held tickets on this device stay here for your next session", [total])
}

// The drafts the till left on the server (get_loose_drafts): never purged in silence, listed so that the cashier deletes the ones he does not want
export function looseDraftsLine(count) {
	if (!count) return ""
	if (count === 1) return __("1 draft of this till was never finished")
	return __("{0} drafts of this till were never finished", [count])
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
