//// Neoffice — added file (no upstream equivalent). Whether the kitchen screen keeps the tickets whose dishes are ALL with the runner (NeoRestau lot 1, Daniel, 01.11: « la table quinze chez le runner reste affichée entre deux
//// plats en préparation, voire pour déplacer sur la droite, voire pour carrément enlever ? »). They stay on the screen, at the END of the band in preparation (utils/kitchenBands), and a device may leave them off it
//// instead. It is a choice of the DEVICE, kept like the side of the oldest ticket, and the default is to keep them: a ticket must not disappear from a screen without being asked to.

export const DEFAULT_SHOWN = true
export const RUNNER_TICKETS_KEY = "pos_next_kitchen_runner_tickets"

/** Whether the tickets with the runner are kept, from what a device stored; anything but "hidden" is the default. */
export function shownFromStorage(value) {
	return value === "hidden" ? false : value === "shown" ? true : DEFAULT_SHOWN
}

export function readRunnerTickets() {
	try {
		return shownFromStorage(window.localStorage?.getItem(RUNNER_TICKETS_KEY))
	} catch {
		return DEFAULT_SHOWN
	}
}

export function saveRunnerTickets(shown) {
	try {
		window.localStorage?.setItem(RUNNER_TICKETS_KEY, shown ? "shown" : "hidden")
	} catch {
		// the choice holds for as long as the page is open
	}
}
