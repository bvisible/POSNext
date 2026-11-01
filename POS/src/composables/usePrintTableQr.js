//// Neoffice — added file (no upstream equivalent). The Print button of a table's QR dialog puts a TICKET on the till's receipt printer
//// (NeoRestau lot 1, task 53): the table's name in large letters, a line telling the guest to scan to order, the QR code and its link in
//// small characters. It used to open the browser's print window. One tap asks the SERVER (pos_next.api.table_qr_ticket), with the guest
//// token of the code and the till: the server works the table and the link out from the token, so the browser sends no text and no address.
//// The button then says where the paper stands as the bill's printer button does (utils/provisionalTicket.js, ruling 97): sending, printing,
//// printed, printer offline, not printed. The browser prints the code ONLY when the server says the till has no printer; a refusal of the
//// server is shown, never printed. A double tap prints once (the dialog ignores a tap while the paper is on its way, and the server keeps the
//// same paper for a few seconds).
import { computed, getCurrentInstance, onBeforeUnmount, reactive, unref } from "vue"
import { useToast } from "@/composables/useToast"
import { call } from "@/utils/apiWrapper"
import { logger } from "@/utils/logger"
import { POLL_MS, POLL_TRIES, SHOWN_MS } from "@/utils/provisionalTicket"

const log = logger.create("PrintTableQr")

export const PRINT_METHOD = "pos_next.api.table_qr_ticket.print_table_qr_ticket"
/** Where a paper the printer was given stands: the bill's follow-up, which answers for any job of a printer of the till. */
export const STATUS_METHOD = "cloudprnt.provisional_ticket.ticket_status"

/** The phases in which a tap does nothing: the paper is on its way (a printer that is off keeps it, a second tap would print it twice). */
export const BUSY_PHASES = ["sending", "printing", "offline"]

/** The server's refusals (the code is no longer valid, the user may not, another restaurant's table, too many tickets): shown, not printed. */
const REFUSALS = new Set(["PermissionError", "ValidationError", "DoesNotExistError", "RateLimitExceededError", "AuthenticationError"])

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const read = (value) => (typeof value === "function" ? value() : unref(value))

/** The server's own words for a refusal (frappe-ui puts them in `messages`), as plain text; "" when it gave none. */
function reasonOf(error) {
	const first = Array.isArray(error?.messages) ? error.messages.find(Boolean) : null
	return String(first?.message ?? first ?? "")
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim()
}

const offlineText = (minutes) => __("Printer offline: the ticket will come out when it is back ({0} min)", [minutes])

/**
 * @param {object} options
 * @param {*} options.token - the guest token of the table's code (a value, a ref or a getter)
 * @param {*} options.posProfile - the till the ticket prints for (a value, a ref or a getter)
 * @param {*} [options.table] - the table's record name when the caller knows it: it must be the token's table
 * @param {() => void} options.printInBrowser - what prints the code from the browser, used only when the till has no printer
 * @returns {{ state: { phase: string, text: string }, label: import("vue").ComputedRef<string>, busy: import("vue").ComputedRef<boolean>, print: () => Promise<string> }}
 *   `print` never throws and answers "queued", "busy", "refused", "failed", "browser" or "none".
 */
export function usePrintTableQr({ token, posProfile, table = null, printInBrowser }) {
	/** What the button shows: `phase` is idle, sending, printing, printed, offline or failed; `text` what the waiter reads under it. */
	const state = reactive({ phase: "idle", text: "" })
	let clearTimer = null
	let following = 0
	let inFlight = null
	let gone = false

	function show(phase, text = "") {
		clearTimeout(clearTimer)
		state.phase = phase
		state.text = text
	}

	function showFor(phase, text) {
		show(phase, text)
		clearTimer = setTimeout(() => show("idle"), SHOWN_MS)
	}

	const label = computed(
		() =>
			({
				sending: __("Sending…"),
				printing: __("Printing…"),
				printed: __("Printed"),
				offline: __("Printer offline"),
			})[state.phase] || __("Print"),
	)
	const busy = computed(() => BUSY_PHASES.includes(state.phase))

	/** Follow the paper until the printer confirms it or it fails; a newer print takes the button over. */
	async function follow(job, minutes) {
		const mine = following
		for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
			await wait(POLL_MS)
			if (gone || mine !== following) return
			let status
			try {
				status = await call(STATUS_METHOD, { job })
			} catch (error) {
				log.warn("The status of a table's QR ticket could not be read:", error)
				break
			}
			if (gone || mine !== following) return
			if (status?.status === "Printed") {
				showFor("printed", __("Printed"))
				return
			}
			if (status?.status === "Failed" || status?.status === "Expired") {
				const text = __("Not printed: {0}", [status.reason || status.status])
				showFor("failed", text)
				useToast().showError(text)
				return
			}
			if (status?.printer_online === false) show("offline", offlineText(minutes))
			else show("printing", __("Printing…"))
		}
		// Not followed to its end: the button keeps what it said for a while, then goes back to Print
		if (!gone && mine === following) showFor(state.phase, state.text)
	}

	function fromTheBrowser(toast) {
		try {
			printInBrowser()
			return "browser"
		} catch (error) {
			log.error("Error printing the QR code from the browser:", error)
			toast.showError(__("Failed to print the QR code"))
			return "none"
		}
	}

	async function printOnce() {
		const toast = useToast()
		following += 1
		show("sending", __("Sending…"))
		const named = read(table)
		let answer
		try {
			answer = await call(PRINT_METHOD, {
				token: read(token),
				pos_profile: read(posProfile),
				...(named ? { table: named } : {}),
			})
		} catch (error) {
			const reason = reasonOf(error)
			if (REFUSALS.has(error?.exc_type)) log.warn("The QR ticket was refused:", error)
			else log.warn("The QR ticket could not be sent:", error)
			// The server said no, or could not be reached: the waiter reads why, and taps again; nothing is printed from the browser
			const text = __("Not printed: {0}", [reason || error?.exc_type || __("The printer could not be reached")])
			showFor("failed", text)
			toast.showError(text)
			return REFUSALS.has(error?.exc_type) ? "refused" : "failed"
		}
		if (!answer?.printed) {
			show("idle")
			if (answer?.no_printer) {
				toast.showInfo(__("This till has no ticket printer: the QR code prints from the browser"))
				return fromTheBrowser(toast)
			}
			toast.showInfo(__("Nothing was printed"))
			return "none"
		}
		const minutes = answer.valid_minutes || 15
		if (answer.printer_online === false) show("offline", offlineText(minutes))
		else show("printing", __("Printing…"))
		if (answer.job_token) follow(answer.job_token, minutes)
		return "queued"
	}

	/** Print the ticket. A tap while the paper is on its way, or while a first tap is still being sent, does nothing more. */
	function print() {
		if (busy.value) return Promise.resolve("busy")
		if (!inFlight) {
			inFlight = printOnce().finally(() => {
				inFlight = null
			})
		}
		return inFlight
	}

	// The dialog closes: nothing more to follow or to show (the paper is on its way all the same)
	if (getCurrentInstance()) {
		onBeforeUnmount(() => {
			gone = true
			clearTimeout(clearTimer)
		})
	}

	return { state, label, busy, print }
}
