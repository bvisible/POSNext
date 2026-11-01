//// Neoffice — added file (no upstream equivalent). The printer button of the kitchen's and the runner's cards prints a COPY of the ticket
//// (NeoRestau lot 1, task 44). One tap asks the SERVER to print (pos_next.api.kitchen_events.print_kitchen_copy: the browser prints nothing),
//// on the printer of the station the screen is opened on, marked COPY and the time. The button then says where the paper stands as the bill's
//// printer button does (provisionalTicket.js, ruling 97): sending, printing, printed, printer offline, not printed. A station with no printer
//// is told by the server and the screen hides its button; a tap while the copy is on its way, or twice in a row, prints once (the server
//// keeps the same copy for a few seconds, and so does the button).
import { reactive } from "vue"
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"
import { logger } from "@/utils/logger"
import { POLL_MS, POLL_TRIES, SHOWN_MS } from "@/utils/provisionalTicket"
import { SCOPE_ORDER } from "@/utils/printCopy"

const log = logger.create("KitchenCopy")

export const PRINT_METHOD = "pos_next.api.kitchen_events.print_kitchen_copy"
export const STATUS_METHOD = "pos_next.api.kitchen_events.kitchen_copy_status"
export const STATIONS_METHOD = "pos_next.api.kitchen_events.kitchen_copy_stations"

/** What a card's printer button shows: `phase` is idle, sending, printing, printed, offline or failed; `text` what the cook reads. */
const IDLE = Object.freeze({ phase: "idle", text: "" })
/** The phases in which a tap does nothing: the copy is on its way (a printer that is off keeps it, a second tap would print it twice). */
export const BUSY_PHASES = ["sending", "printing", "offline"]

// One state per ticket, by the name of its order: the same ticket on the board and opened full screen shows the same button
const states = reactive({})
const clearTimers = {}
const following = {}
const inFlight = new Map()
// The stations the server said have no printer, since the screen last asked which have one
export const withoutPrinter = reactive({ stations: [] })

/** The state of the printer button of the ticket of `invoice`. */
export const copyState = (invoice) => states[invoice] || IDLE

function show(invoice, phase, text = "") {
	clearTimeout(clearTimers[invoice])
	if (phase === "idle") delete states[invoice]
	else states[invoice] = { phase, text }
}

function showFor(invoice, phase, text) {
	show(invoice, phase, text)
	clearTimers[invoice] = setTimeout(() => show(invoice, "idle"), SHOWN_MS)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The server's own words for a refusal (frappe-ui puts them in `messages`), as plain text; "" when it gave none. */
function reasonOf(error) {
	const first = Array.isArray(error?.messages) ? error.messages.find(Boolean) : null
	return String(first?.message ?? first ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

const offlineText = (minutes) =>
	__("Printer offline: the ticket will come out when it is back ({0} min)", [minutes])

/** The stations the server says have a printer arrive: what it said had none is forgotten. */
export function forgetStationsWithoutPrinter() {
	withoutPrinter.stations = []
}

function noteWithoutPrinter(names, station) {
	const known = new Set(withoutPrinter.stations)
	for (const name of names) known.add(name || station || "*")
	withoutPrinter.stations = [...known]
}

/**
 * Print a copy of the ticket of `invoice` from a screen.
 *
 * @param {object} what
 * @param {string} what.invoice - the order's name
 * @param {string} what.screen - "Kitchen" or "Runner" (utils/printCopy)
 * @param {string|null} what.station - the station the screen is opened on, none for all of them
 * @param {object} what.settings - utils/printCopy resolveCopySettings: `print_scope` and `mark_copy` go to the server
 * @returns {Promise<"queued"|"busy"|"failed"|"no_printer"|"nothing">} never throws
 */
export function printCopyFromScreen(what) {
	const { invoice } = what
	if (BUSY_PHASES.includes(copyState(invoice).phase)) return Promise.resolve("busy")
	// A second tap while the first one is on its way gets the same answer: one copy
	if (!inFlight.has(invoice)) {
		inFlight.set(
			invoice,
			printOnce(what).finally(() => inFlight.delete(invoice)),
		)
	}
	return inFlight.get(invoice)
}

async function printOnce({ invoice, screen, station, settings }) {
	const toast = useToast()
	following[invoice] = (following[invoice] || 0) + 1
	show(invoice, "sending", __("Sending…"))
	let answer
	try {
		answer = await call(PRINT_METHOD, {
			invoice,
			screen,
			...(station ? { station } : {}),
			whole_order: settings?.print_scope === SCOPE_ORDER ? 1 : 0,
			mark_copy: settings?.mark_copy === false ? 0 : 1,
		})
	} catch (error) {
		log.warn("The copy of a kitchen ticket was refused or could not be sent:", error)
		const text = __("Not printed: {0}", [
			reasonOf(error) || error?.exc_type || __("The printer could not be reached"),
		])
		showFor(invoice, "failed", text)
		toast.showError(text)
		return "failed"
	}
	if (!answer?.printed) {
		show(invoice, "idle")
		if (answer?.no_printer?.length) {
			// The station has no printer after all: the button goes
			noteWithoutPrinter(answer.no_printer, station)
			toast.showInfo(__("No printer prints for this station"))
			return "no_printer"
		}
		toast.showInfo(__("Nothing to print on this ticket"))
		return "nothing"
	}
	const jobs = (answer.tickets || []).map((ticket) => ticket.job_token).filter(Boolean)
	const minutes = answer.valid_minutes || 15
	if ((answer.tickets || []).some((ticket) => ticket.printer_online === false)) {
		show(invoice, "offline", offlineText(minutes))
	} else {
		show(invoice, "printing", __("Printing…"))
	}
	if (jobs.length) follow(invoice, screen, jobs, minutes)
	return "queued"
}

/**
 * Follow the jobs of a copy until every printer confirms them or one fails: Printed, Not printed (its reason), or still waiting
 * for a printer that is off. A newer print of the same ticket takes the button over.
 */
async function follow(invoice, screen, jobs, minutes) {
	const mine = following[invoice]
	for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
		await wait(POLL_MS)
		if (mine !== following[invoice]) return
		let statuses
		try {
			statuses = await Promise.all(
				jobs.map((job) => call(STATUS_METHOD, { invoice, job, screen })),
			)
		} catch (error) {
			log.warn("The status of a kitchen copy could not be read:", error)
			break
		}
		if (mine !== following[invoice]) return
		const failed = statuses.find((status) => ["Failed", "Expired"].includes(status?.status))
		if (failed) {
			const text = __("Not printed: {0}", [failed.reason || failed.status])
			showFor(invoice, "failed", text)
			useToast().showError(text)
			return
		}
		if (statuses.every((status) => status?.status === "Printed")) {
			showFor(invoice, "printed", __("Printed"))
			return
		}
		if (statuses.some((status) => status?.printer_online === false))
			show(invoice, "offline", offlineText(minutes))
		else show(invoice, "printing", __("Printing…"))
	}
	// Not followed to its end: the button keeps what it said for a while, then goes back to the printer
	const last = copyState(invoice)
	if (mine === following[invoice]) showFor(invoice, last.phase, last.text)
}
