//// Neoffice — added file (no upstream equivalent). What the kitchen screen does when the next course is ordered (NeoRestau lot 1, Daniel, 01.11: « quand on commande la suite il doit y avoir un popup à la
//// cuisine, et aussi un son pour aviser »). The screen hands every reading of its orders to `read`; the rule that tells a next course from two readings is utils/nextCourseWatch. What is done about it follows
//// the till's settings (POS Settings, "Kitchen alerts"; composables/useKitchenAlertSettings):
////
//// - a NOTICE per table, in a small stack, newest on top: ONE per table (a second send of the same table replaces it), until it is dismissed or until the settings' seconds run out (0 = until dismissed);
//// - the SOUND the till chose, once per reading however many tables ordered (a bell for four tables at once is still one bell), played by the shared player (utils/alertSoundPlayer);
//// - the ticket HIGHLIGHTED for a few seconds and scrolled into view, so that the cook finds it. The notice and the highlight are the popup's: with the popup off only the sound remains.
import { getCurrentInstance, nextTick, onUnmounted, ref, unref } from "vue"
import { playAlertSound } from "@/utils/alertSoundPlayer"
import { readNextCourses } from "@/utils/nextCourseWatch"

/** How long the ticket of a notice stays highlighted, in milliseconds. */
export const HIGHLIGHT_MS = 6000

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
 * @returns {{ notices: import("vue").Ref<Object[]>, highlighted: import("vue").Ref<string>, read: Function, reset: Function, dismiss: Function, dismissAll: Function, show: Function, stop: Function }}
 */
export function useNextCourseNotices({ settings, accept = () => true, scrollTo = scrollToTicket }) {
	const notices = ref([])
	// The name of the order whose ticket is highlighted, "" for none
	const highlighted = ref("")
	let memory = null
	const timers = new Map()
	let highlightTimer = null

	function forget(key) {
		clearTimeout(timers.get(key))
		timers.delete(key)
	}

	function dismiss(key) {
		forget(key)
		notices.value = notices.value.filter((notice) => notice.key !== key)
	}

	function dismissAll() {
		for (const key of [...timers.keys()]) forget(key)
		notices.value = []
	}

	/** Highlights an order's ticket for a few seconds and brings it into view. */
	function show(order) {
		clearTimeout(highlightTimer)
		highlighted.value = order
		highlightTimer = setTimeout(() => {
			highlighted.value = ""
		}, HIGHLIGHT_MS)
		scrollTo(order)
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
		if (!told.length) return told

		const chosen = unref(settings)
		if (chosen.nextCourseSound && chosen.nextCourseSound !== "none") playAlertSound(chosen.nextCourseSound, chosen.volume)
		if (!chosen.popup) return told

		// ONE notice per table: the one a table already has goes, the new one stands on top
		for (const replaced of notices.value.filter((notice) => told.some((alert) => alert.order === notice.order))) forget(replaced.key)
		notices.value = [...told, ...notices.value.filter((notice) => !told.some((alert) => alert.order === notice.order))]
		if (chosen.popupSeconds > 0) {
			for (const alert of told) timers.set(alert.key, setTimeout(() => dismiss(alert.key), chosen.popupSeconds * 1000))
		}
		show(told[0].order)
		return told
	}

	/** Begins again: the next reading is only what the following ones are compared with (the screen changed what it shows). */
	function reset() {
		memory = null
	}

	/** Clears every timer: the screen is left. */
	function stop() {
		for (const key of [...timers.keys()]) forget(key)
		clearTimeout(highlightTimer)
	}

	if (getCurrentInstance()) onUnmounted(stop)

	return { notices, highlighted, read, reset, dismiss, dismissAll, show, stop }
}
