//// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoResto lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la
//// cuisine, et aussi un son pour aviser », then « enlever le bandeau et afficher la carte [à faire] »). The screen hands every reading of its orders to `read`; the rule that tells a next course from two readings is
//// utils/nextCourseWatch. What is done about it follows the till's settings (POS Settings, "Kitchen alerts"; composables/useKitchenAlertSettings):
////
//// - the SOUND the till chose, once per reading however many tables ordered (a bell for four tables at once is still one bell), played by the shared player (utils/alertSoundPlayer);
//// - the ticket scrolled into view and made to FLASH, in the first band (« To do »), until the cook starts its dishes (one of them leaves « to start »), says it has been seen (`acknowledge`, the ticket's « To do »
////   button) or the ticket leaves the screen, however long that takes
////   (Daniel: « il faut la laisser clignoter jusqu'à ce qu'on ait validé »). There is no banner any more: the ticket is the alert. Every table that has ordered and not been taken up flashes, not only the newest.
////   The flash is the popup setting's: with it off only the sound remains.
//// - an ADDITION (Daniel, 05.11: « il faut faire un pop-up, parce qu'autrement, en cuisine, ils ne savent pas qu'on a rajouté cette information sur leur ticket ») flashes the same way, with what was added told on the ticket
////   (`added`), and it flashes whether or not the cook can start the dish now: a dish added behind the course before it must be KNOWN even if it cannot start yet.
import { nextTick, ref, unref } from "vue"
import { playAlertSound } from "@/utils/alertSoundPlayer"
//// Neoffice — the dishes of an order's latest send: the ticket flashes while one of them is still to start (Daniel, 01.11)
import { linesOfLatestSend } from "@/utils/courseTimer"
import { readNextCourses } from "@/utils/nextCourseWatch"

/**
 * Brings the ticket of an order into view once the screen has drawn it: the card carries its order's name (`data-order`). The page scrolls to it, and its band (a lane scrolls sideways) with it.
 */
export function scrollToTicket(order) {
	nextTick(() => {
		const name = String(order).replace(/["\\]/g, "\\$&")
		const card = document.querySelector(`[data-test="ticket"][data-order="${name}"]`)
		if (!card?.scrollIntoView) return
		const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
		card.scrollIntoView({ block: "nearest", inline: "center", behavior: calm ? "auto" : "smooth" })
	})
}

/**
 * @param {{
 *   settings: import("vue").Ref<{ popup: boolean, nextCourseSound: string, volume: string }>,
 *   accept?: (order: Object) => boolean,
 *   scrollTo?: (order: string) => void,
 *   holds?: (line: Object, lines: Object[]) => boolean,
 * }} options - `settings`: the till's kitchen alerts; `accept`: whether the screen shows an order (its room), a table it does not show is neither flashed nor rung for; `scrollTo`: brings a ticket into view;
 *   `holds`: whether a dish waits behind the course before it (the order of the meal, utils/courseOrder) and cannot be started yet: such a dish does not make its ticket blink
 *   `onAcknowledge`: told (order, key of the call) when the cook leaves a ticket « to do », so that the page tells the server and the other screens of the kitchen stop blinking too (pos_next.api.kitchen_events.acknowledge_kitchen_call)
 * @returns {{ flashing: import("vue").Ref<string[]>, read: Function, reset: Function, acknowledge: Function }}
 */
export function useNextCourseAlert({ settings, accept = () => true, scrollTo = scrollToTicket, holds = () => false, onAcknowledge = null }) {
	// The orders whose tickets FLASH: a table that has ordered its next course, until the cook takes its dishes up
	const flashing = ref([])
	// order name -> the key of the send that was told
	const watched = new Map()
	// order name -> what was ADDED by the send that was told (additions only): `[{ name, qty }]`, told on the ticket while it flashes
	const added = ref({})
	let memory = null

	/** The lines of an order the screen shows: the ones of its station. */
	const shownLines = (order, station) => (order?.items || []).filter((line) => !station || line?.preparation_station === station)

	/** Whether the call is still at the kitchen: a dish of its latest send has not been started yet (a started or delivered one is the cook's answer). */
	const stillToStart = (order, station) => linesOfLatestSend(shownLines(order, station)).some((line) => line?.kds_status === "Pending")

	/**
	 * Whether a dish of the call can be started NOW: a dish that waits behind the course before it (greyed on the ticket) cannot, and does not make the ticket blink (Daniel, 01.11: table 10 went on blinking after the cook
	 * had started it, because its dessert was held behind the mains). The call is kept: the ticket blinks once the course before is done.
	 */
	function canStart(order, station) {
		const lines = shownLines(order, station)
		return linesOfLatestSend(lines).some((line) => line?.kds_status === "Pending" && !holds(line, lines))
	}

	/** Which of the watched tickets blink after a reading: the ones still on the screen with a dish that can be started. */
	function updateFlashing(orders, station, { quiet = false } = {}) {
		const byName = new Map((orders || []).map((order) => [order?.name, order]))
		//// Neoffice — a call another screen of the kitchen took up stops blinking here too (Daniel, 01.11): the reading says which call was taken up for this station (`call_seen`), and a newer send has another key
		for (const name of [...watched.keys()]) {
			const order = byName.get(name)
			if (!stillToStart(order, station) || order?.call_seen === watched.get(name)) watched.delete(name)
		}
		//// Neoffice — an addition flashes even when its dish waits behind the course before it (Daniel, 05.11): the kitchen has to know that the ticket changed
		const next = [...watched.keys()].filter((name) => name in added.value || canStart(byName.get(name), station))
		const told = {}
		for (const name of Object.keys(added.value)) if (watched.has(name)) told[name] = added.value[name]
		if (Object.keys(told).length !== Object.keys(added.value).length) added.value = told
		const dealtWith = next.length < flashing.value.length
		if (next.length !== flashing.value.length || next.some((name, at) => name !== flashing.value[at])) flashing.value = next
		// A ticket was dealt with (started, here or at another screen): the cook is brought to the next one that blinks
		if (dealtWith && next.length && !quiet) scrollTo(next[0])
	}

	/**
	 * Reads one reading of the screen's orders.
	 *
	 * @param {Array<Object>} orders - The orders of `get_kds_orders`
	 * @param {{ station?: string }} [scope] - The station the screen shows, none for all of them
	 * @returns {Array<Object>} The next courses told by this reading
	 */
	function read(orders, scope = {}) {
		const { alerts, memory: next } = readNextCourses(orders, memory, scope)
		memory = next
		const byName = new Map((orders || []).map((order) => [order?.name, order]))
		const told = alerts.filter((alert) => accept(byName.get(alert.order))).sort((a, b) => b.sentAt - a.sentAt)
		const chosen = unref(settings)
		if (told.length) {
			if (chosen.nextCourseSound && chosen.nextCourseSound !== "none") playAlertSound(chosen.nextCourseSound, chosen.volume)
			// The oldest call goes in first: the tickets that blink stand in the order they were called
			if (chosen.popup) {
				for (const alert of [...told].reverse()) {
					watched.set(alert.order, alert.key)
					//// Neoffice — what an addition added is told on its ticket; a next course says nothing of the kind
					if (alert.kind === "addition") added.value = { ...added.value, [alert.order]: alert.added }
					else if (alert.order in added.value) {
						const { [alert.order]: _gone, ...rest } = added.value
						added.value = rest
					}
				}
			}
		}
		updateFlashing(orders, scope.station || "", { quiet: told.length > 0 })
		// The cook is brought to the FIRST ticket that blinks (the oldest call), where the tickets that blink stand first in their band: not to the newest
		if (told.length && chosen.popup && flashing.value.length) scrollTo(flashing.value[0])
		return told
	}

	/**
	 * The cook has seen the ticket and leaves it to do (« To do », Daniel, 01.11): it stops flashing and stays where it is, and the next ticket that blinks is brought into view. What was told is never told again (the memory of the readings holds the send),
	 * a later send of the same table flashes again.
	 */
	function acknowledge(order) {
		//// Neoffice — the page tells the server which call was taken up, so that the other screens of the kitchen stop blinking (Daniel, 01.11: several tablets in a kitchen)
		const key = watched.get(order)
		watched.delete(order)
		flashing.value = flashing.value.filter((name) => name !== order)
		if (order in added.value) {
			const { [order]: _gone, ...rest } = added.value
			added.value = rest
		}
		// The tickets that blink are dealt with one after the other (Daniel, 01.11): the screen brings the next one into view, the oldest call first
		if (flashing.value.length) scrollTo(flashing.value[0])
		if (key !== undefined) onAcknowledge?.(order, key)
	}

	/** Begins again: the next reading is only what the following ones are compared with (the screen changed what it shows). */
	function reset() {
		memory = null
		watched.clear()
		flashing.value = []
		added.value = {}
	}

	return { flashing, added, read, reset, acknowledge }
}
