//// Neoffice — added file (no upstream equivalent). The door of an appointment (NeoSalon, voie 4, 19.11.2026): `/pos?appointment=<booking>&date=<YYYY-MM-DD>` opens the till on
//// the agenda of that day with the sheet of that appointment open, so that a link from a message or from the desk of the bookings lands where the cashier works. The till is
//// never a different place from the one a cashier opens by hand: the door waits for the shift to be open and the agenda to answer, then does what she would do (open the
//// agenda, go to the day, press the appointment). A link to something that is not there says so; it never opens another appointment.
import { watch } from "vue"
import { useToast } from "@/composables/useToast"

// A booking is named as the site names it (letters, digits, dots, dashes, underscores); a day is a day
const BOOKING = /^[A-Za-z0-9][A-Za-z0-9._-]{0,139}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * What the address asks for, or null: `{ booking, date }` (`date` is "" for today).
 * @param {string} search - the query part of the address
 */
export function readTheDoor(search) {
	const params = new URLSearchParams(search || "")
	const booking = (params.get("appointment") || "").trim()
	if (!BOOKING.test(booking)) return null
	const date = (params.get("date") || "").trim()
	return { booking, date: DAY.test(date) ? date : "" }
}

/** The address without what the door asked, so that a reload does not open it again. */
export function addressWithoutTheDoor(search) {
	const params = new URLSearchParams(search || "")
	params.delete("appointment")
	params.delete("date")
	const rest = params.toString()
	return rest ? `?${rest}` : ""
}

/**
 * Open the appointment the address names, once, when the agenda is there to open it on.
 *
 * @param {object} options
 * @param {object} options.store - the appointments store
 * @param {import("vue").Ref<boolean>} options.offered - the till offers the agenda (its tick is on and the site's booking answers)
 * @param {import("vue").Ref<boolean>} options.show - the middle column shows the agenda
 * @param {string} [options.search] - the query part of the address (the browser's, when not given)
 * @returns {() => void} stop watching
 */
export function useAppointmentDoor({ store, offered, show, search = globalThis.location?.search }) {
	const door = readTheDoor(search)
	if (!door) return () => {}
	const { showWarning } = useToast()
	let used = false

	const forget = () => {
		try {
			const clean = addressWithoutTheDoor(globalThis.location?.search)
			globalThis.history?.replaceState(globalThis.history.state, "", `${globalThis.location.pathname}${clean}${globalThis.location.hash || ""}`)
		} catch {
			// An address that cannot be rewritten is left as it is
		}
	}

	// The watcher may run once before it is handed back (`immediate`): it is stopped then, after the call
	let stop = null
	stop = watch(
		() => [store.loaded, store.available, offered.value],
		async ([loaded, available, isOffered]) => {
			if (used || !loaded || !available || !isOffered) return
			used = true
			show.value = true
			if (door.date && door.date !== store.date) await store.setDay(door.date)
			const row = store.appointments.find((each) => each.booking === door.booking || each.key === door.booking)
			if (row) store.select(row.key)
			else showWarning(__("The appointment {0} is not on the agenda of {1}.", [door.booking, store.date]))
			forget()
			stop?.()
		},
		{ immediate: true },
	)
	if (used) stop()
	return stop
}
