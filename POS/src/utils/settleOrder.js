//// Neoffice — added file (no upstream equivalent). Settling an open order when the service closes (NeoResto lot 1, the product owner, 08.11.2026, solution C of the study
//// of the open tables): « soit considérer que c'est payé, mettre sur ardoise, offert, perte sur client, annuler ». Pure helpers: the dialog asks the server
//// (`settle_open_order`), these say which issues an order offers, what each asks for, and whether the form is complete.

import { OFFER_CONTEXT } from "@/utils/offeredRows"

export const CASHED = "cashed"
export const TAB = "tab"
export const OFFERED = "offered"
export const LOSS = "loss"
export const CANCELLED = "cancelled"
export const ISSUES = [CASHED, TAB, OFFERED, LOSS, CANCELLED]

// The gate's actions the two issues that give something away go through (the server names the same strings)
export const OFFER_ACTION = "Offer an item"
export const WRITE_OFF_ACTION = "Write off an order"

// What each issue says on screen: a short label and a line that tells when to use it (functions: the words are looked up when asked, once the translations are loaded)
export function issueTexts() {
	return {
		[CASHED]: {
			label: __("Paid in cash"),
			hint: __("The guests paid in cash and nobody entered it"),
			confirm: __("Cash it"),
		},
		[TAB]: {
			label: __("On a customer's tab"),
			hint: __("A known customer pays later"),
			confirm: __("Put on the tab"),
		},
		[OFFERED]: {
			// The word the till and its tickets print for what is given for free: the bare « Offered » is another app's « Proposée »
			label: __("Offered", null, OFFER_CONTEXT),
			hint: __("A gesture of the house: every line is offered"),
			confirm: __("Offer it"),
		},
		[LOSS]: {
			label: __("Customer loss"),
			hint: __("Served, and the guests left without paying"),
			confirm: __("Write it off"),
		},
		[CANCELLED]: {
			label: __("Cancelled"),
			hint: __("Nothing was served: forgotten, or gone before being served"),
			confirm: __("Cancel the order"),
		},
	}
}

/** A reason is written to offer, to write off or to cancel: what gives something away or deletes an order is explained. */
export const needsReason = (issue) => [OFFERED, LOSS, CANCELLED].includes(issue)

/** A customer is chosen to put an order on a tab. */
export const needsCustomer = (issue) => issue === TAB

/**
 * The issues of an order as the dialog lists them, in the order of the study: `{ key, label, hint, confirm, available, why }`. An order the server says nothing
 * about (an older answer) offers none.
 *
 * @param {Object} order - A row of `get_open_orders`
 */
export function issuesOf(order) {
	const texts = issueTexts()
	return ISSUES.map((key) => ({
		key,
		...texts[key],
		available: Boolean(order?.issues?.[key]?.available),
		why: order?.issues?.[key]?.why || "",
	}))
}

/** Whether anything can be done with the order from the closing: at least one issue is open to it. */
export const canBeSettled = (order) => issuesOf(order).some((issue) => issue.available)

/**
 * Whether the form is complete for the issue chosen: an available issue, a reason where one is needed, a customer where one is needed.
 *
 * @param {Object} order - A row of `get_open_orders`
 * @param {{ issue: string, reason?: string, customer?: string }} form
 */
export function formIsComplete(order, { issue, reason, customer }) {
	const chosen = issuesOf(order).find((candidate) => candidate.key === issue)
	if (!chosen?.available) return false
	if (needsReason(issue) && !String(reason || "").trim()) return false
	if (needsCustomer(issue) && !String(customer || "").trim()) return false
	return true
}

/** What the till says once an order is settled. */
export function settledText(issue, label) {
	return {
		[CASHED]: __("{0} cashed in cash", [label]),
		[TAB]: __("{0} put on the customer's tab", [label]),
		[OFFERED]: __("{0} offered", [label]),
		[LOSS]: __("{0} written off as a customer's loss", [label]),
		[CANCELLED]: __("{0} cancelled", [label]),
	}[issue]
}
