//// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la
//// cuisine, et aussi un son pour aviser », then « enlever le bandeau et afficher la carte [à faire] »). The screen hands every reading of its orders to `read`; the rule that tells a next course from two readings is
//// utils/nextCourseWatch. What is done about it follows the till's settings (POS Settings, "Kitchen alerts"; composables/useKitchenAlertSettings):
////
//// - the SOUND the till chose, once per reading however many tables ordered (a bell for four tables at once is still one bell), played by the shared player (utils/alertSoundPlayer);
//// - the ticket scrolled into view and made to FLASH, in the first band (« To do »), until the cook starts its dishes (one of them leaves « to start »), says it has been seen (`acknowledge`, the ticket's « To do »
////   button) or the ticket leaves the screen, however long that takes
////   (Daniel: « il faut la laisser clignoter jusqu'à ce qu'on ait validé »). There is no banner any more: the ticket is the alert. Every table that has ordered and not been taken up flashes, not only the newest.
////   The flash is the popup setting's: with it off only the sound remains.
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
 * }} options - `settings`: the till's kitchen alerts; `accept`: whether the screen shows an order (its room), a table it does not show is neither flashed nor rung for; `scrollTo`: brings a ticket into view
 * @returns {{ flashing: import("vue").Ref<string[]>, read: Function, reset: Function, acknowledge: Function }}
 */
export function useNextCourseAlert({ settings, accept = () => true, scrollTo = scrollToTicket }) {
	// The orders whose tickets FLASH: a table that has ordered its next course, until the cook takes its dishes up
	const flashing = ref([])
	// order name -> the key of the send that was told
	const watched = new Map()
	let memory = null

	/** Whether the dishes of the send that was told are still to start: the ones of the stations the screen shows, Pending. */
	function stillToStart(order, station) {
		const lines = (order?.items || []).filter((line) => !station || line?.preparation_station === station)
		return linesOfLatestSend(lines).some((line) => line?.kds_status === "Pending")
	}

	/** Which of the watched tickets still flash after a reading: the ones still on the screen with dishes still to start. */
	function updateFlashing(orders, station) {
		const byName = new Map((orders || []).map((order) => [order?.name, order]))
		for (const name of [...watched.keys()]) if (!stillToStart(byName.get(name), station)) watched.delete(name)
		const next = [...watched.keys()]
		const dealtWith = next.length < flashing.value.length
		if (next.length !== flashing.value.length || next.some((name, at) => name !== flashing.value[at])) flashing.value = next
		// A ticket was dealt with (started, here or at another screen): the cook is brought to the next one that blinks
		if (dealtWith && next.length) scrollTo(next[0])
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
		if (told.length) {
			const chosen = unref(settings)
			if (chosen.nextCourseSound && chosen.nextCourseSound !== "none") playAlertSound(chosen.nextCourseSound, chosen.volume)
			if (chosen.popup) {
				for (const alert of told) watched.set(alert.order, alert.key)
				// The newest table is the one the cook is brought to; the others flash where they stand
				scrollTo(told[0].order)
			}
		}
		updateFlashing(orders, scope.station || "")
		return told
	}

	/**
	 * The cook has seen the ticket and leaves it to do (« To do », Daniel, 01.11): it stops flashing and stays where it is, and the next ticket that blinks is brought into view. What was told is never told again (the memory of the readings holds the send),
	 * a later send of the same table flashes again.
	 */
	function acknowledge(order) {
		watched.delete(order)
		flashing.value = flashing.value.filter((name) => name !== order)
		// The tickets that blink are dealt with one after the other (Daniel, 01.11): the screen brings the next one into view, the oldest call first
		if (flashing.value.length) scrollTo(flashing.value[0])
	}

	/** Begins again: the next reading is only what the following ones are compared with (the screen changed what it shows). */
	function reset() {
		memory = null
		watched.clear()
		flashing.value = []
	}

	return { flashing, read, reset, acknowledge }
}
