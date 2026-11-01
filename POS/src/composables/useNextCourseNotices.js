//// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la
//// cuisine, et aussi un son pour aviser »). The screen hands every reading of its orders to `read`; the rule that tells a next course from two readings is utils/nextCourseWatch. What is done about it follows
//// the till's settings (POS Settings, "Kitchen alerts"; composables/useKitchenAlertSettings):
////
//// - a NOTICE per table, in a small stack, newest on top: ONE per table (a second send of the same table replaces it), until it is dismissed or until the settings' seconds run out (0 = until dismissed);
//// - the SOUND the till chose, once per reading however many tables ordered (a bell for four tables at once is still one bell), played by the shared player (utils/alertSoundPlayer);
//// - the ticket scrolled into view, and FLASHING until the cook has taken its dishes up (one of them leaves « to start ») or has closed the notice, however long that takes (Daniel, 01.11); the banner's
////   seconds are the banner's. The notice and the flash are the popup's: with the popup off only the sound remains.
import { getCurrentInstance, nextTick, onUnmounted, ref, unref } from "vue"
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
 *   settings: import("vue").Ref<{ popup: boolean, popupSeconds: number, nextCourseSound: string, volume: string }>,
 *   accept?: (order: Object) => boolean,
 *   scrollTo?: (order: string) => void,
 * }} options - `settings`: the till's kitchen alerts; `accept`: whether the screen shows an order (its room), a table it does not show is neither announced nor rung for; `scrollTo`: brings a ticket into view
 * @returns {{ notices: import("vue").Ref<Object[]>, highlighted: import("vue").Ref<string>, flashing: import("vue").Ref<string[]>, read: Function, reset: Function, dismiss: Function, dismissAll: Function, show: Function, stop: Function }}
 */
export function useNextCourseNotices({ settings, accept = () => true, scrollTo = scrollToTicket }) {
	const notices = ref([])
	// The name of the order the cook is brought to (the newest table, or the one whose notice was pressed), "" for none
	const highlighted = ref("")
	//// Neoffice — the tickets that FLASH: a table that has ordered its next course flashes until the cook takes its dishes up (one of them leaves « to start ») or closes its
	//// notice, however long that takes and whatever the seconds of the banner (Daniel, 01.11: « il faut la laisser clignoter jusqu'à ce qu'on ait validé »)
	const flashing = ref([])
	const watched = new Map()
	let memory = null
	const timers = new Map()

	function forget(key) {
		clearTimeout(timers.get(key))
		timers.delete(key)
	}

	/** Takes a notice off the stack (its seconds ran out): the ticket goes on flashing. */
	function hide(key) {
		forget(key)
		notices.value = notices.value.filter((notice) => notice.key !== key)
	}

	/** The cook closes a notice: it has been seen, the ticket stops flashing. */
	function dismiss(key) {
		const closed = notices.value.find((notice) => notice.key === key)
		hide(key)
		if (closed) {
			watched.delete(closed.order)
			flashing.value = flashing.value.filter((order) => order !== closed.order)
		}
	}

	function dismissAll() {
		for (const key of [...timers.keys()]) forget(key)
		notices.value = []
		watched.clear()
		flashing.value = []
	}

	/** Brings an order's ticket into view (the cook pressed its notice, or the table has just ordered). */
	function show(order) {
		highlighted.value = order
		scrollTo(order)
	}

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
		if (next.length !== flashing.value.length || next.some((name, at) => name !== flashing.value[at])) flashing.value = next
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
		if (!told.length) {
			updateFlashing(orders, scope.station || "")
			return told
		}

		const chosen = unref(settings)
		if (chosen.nextCourseSound && chosen.nextCourseSound !== "none") playAlertSound(chosen.nextCourseSound, chosen.volume)
		if (!chosen.popup) return told

		// ONE notice per table: the one a table already has goes, the new one stands on top
		for (const replaced of notices.value.filter((notice) => told.some((alert) => alert.order === notice.order))) forget(replaced.key)
		notices.value = [...told, ...notices.value.filter((notice) => !told.some((alert) => alert.order === notice.order))]
		if (chosen.popupSeconds > 0) {
			for (const alert of told) timers.set(alert.key, setTimeout(() => hide(alert.key), chosen.popupSeconds * 1000))
		}
		for (const alert of told) watched.set(alert.order, alert.key)
		updateFlashing(orders, scope.station || "")
		show(told[0].order)
		return told
	}

	/** Begins again: the next reading is only what the following ones are compared with (the screen changed what it shows). */
	function reset() {
		memory = null
		watched.clear()
		flashing.value = []
	}

	/** Clears every timer: the screen is left. */
	function stop() {
		for (const key of [...timers.keys()]) forget(key)
	}

	if (getCurrentInstance()) onUnmounted(stop)

	return { notices, highlighted, flashing, read, reset, dismiss, dismissAll, show, stop }
}
