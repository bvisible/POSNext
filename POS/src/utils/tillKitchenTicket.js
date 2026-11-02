//// Neoffice — added file (no upstream equivalent). The till's way to print the kitchen ticket of an open table again (NeoResto lot 1, Daniel, 02.11.2026: a kitchen
//// with no screen at all, only tickets, « que la cuisine puisse imprimer un ticket s'il en a besoin »). The kitchen's and the runner's screens have a printer button on
//// each card (utils/kitchenCopy); a kitchen with paper only has no screen, so the waiter's till has the same button on the table's order: the server prints a COPY, marked
//// COPY and the time, on the printer of each station that has lines at the kitchen, and the copy is no send (what the next send prints does not change).
import { call } from "@/utils/apiWrapper"
import { copyState, printCopyFromScreen, STATIONS_METHOD } from "@/utils/kitchenCopy"
import { SCOPE_STATION, SCREEN_KITCHEN, stationsAtTheKitchen } from "@/utils/printCopy"

const NOTHING = Object.freeze({ available: false, phase: "idle", text: "" })

/** The stations of `restaurant` that have a printer, as the server says; none when it cannot be asked (the button stays away). */
export async function stationsWithAPrinter(restaurant) {
	try {
		const answer = await call(STATIONS_METHOD, { screen: SCREEN_KITCHEN, ...(restaurant ? { restaurant } : {}) })
		return Array.isArray(answer?.stations) ? answer.stations : []
	} catch {
		return []
	}
}

/**
 * What the button of the till draws: `available` when the order is a saved one with lines at a station that has a printer (the button
 * is hidden everywhere else), and the phase and words of the copy on its way, as the cards of the screens say them.
 *
 * @param {object} what
 * @param {string} what.invoice - the name of the saved order ("" when it is not saved yet)
 * @param {Array} what.items - the lines of the order
 * @param {string[]} what.printerStations - the stations that have a printer
 */
export function kitchenTicketButton({ invoice, items, printerStations }) {
	if (!invoice) return NOTHING
	const available = stationsAtTheKitchen(items).some((station) => (printerStations || []).includes(station))
	if (!available) return NOTHING
	const { phase, text } = copyState(invoice)
	return { available: true, phase, text }
}

/** Print a copy of the kitchen ticket of the order: each station with a printer prints its own lines. Never throws; says what happened. */
export function printKitchenTicketFromTill(invoice) {
	return printCopyFromScreen({
		invoice,
		screen: SCREEN_KITCHEN,
		station: null,
		settings: { print_scope: SCOPE_STATION, mark_copy: true },
	})
}
