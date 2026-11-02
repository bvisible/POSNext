//// Neoffice — added file (no upstream equivalent). The runner's setting « stack short tickets » (NeoResto lot 1, task 38a-2, ruling 130): short tickets stack in a
//// column instead of each taking a column of its own. ON by default (the point of the screen is to show more of what waits at the pass); a device can turn it off,
//// kept in its own storage as the kitchen's layout is, until the restaurant's settings carry it. The rules are here, the page only reads them.
import { ref } from "vue"

// Beside the other settings of these screens (pos_runner_area, pos_runner_show_delivered)
export const STACK_STORAGE_KEY = "pos_runner_stack"
export const STACK_SHORT_TICKETS = true

function browserStorage() {
	try {
		return window.localStorage || null
	} catch {
		return null
	}
}

/**
 * Whether short tickets stack on this device: the default, unless the device says « off » (`0` or `false`).
 *
 * @param {Storage|null} [storage]
 * @returns {boolean}
 */
export function readStackShortTickets(storage = browserStorage()) {
	try {
		const kept = storage?.getItem(STACK_STORAGE_KEY)
		if (kept === "0" || kept === "false") return false
		if (kept === "1" || kept === "true") return true
		return STACK_SHORT_TICKETS
	} catch {
		return STACK_SHORT_TICKETS
	}
}

/** @returns {{ stack: import("vue").Ref<boolean> }} stack: whether the runner stacks its short tickets (read now, so that the first paint is the right one) */
export function useStackShortTickets() {
	return { stack: ref(readStackShortTickets()) }
}
