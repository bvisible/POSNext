//// Neoffice — added file (no upstream equivalent). What the till does when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11, after ordering a drink from the QR code of a table as a
//// guest: « regarde comment la caisse sommelier reçoit l'info (popup et autre) »). The realtime events reach the restaurant store (stores/restaurant), which hands them to `tell`; the rules of what a notice says and
//// how notices stack are utils/floorNotices; the stack is drawn by components/restaurant/FloorNotices. What is done follows the till's settings (POS Settings, "Floor alerts"; utils/floorAlerts):
////
//// - a NOTICE per table, newest on top, until it is dismissed or until the settings' seconds run out (0 = until dismissed). An order the waiter has to VALIDATE has no seconds: it stays until it is handled or dismissed;
//// - the SOUND the till chose, once per event, at the volume it set, on the shared player (utils/alertSoundPlayer). With the popup off only the sound remains, with the sound on none only the notice.
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { playAlertSound } from "@/utils/alertSoundPlayer"
import { readFloorAlerts } from "@/utils/floorAlerts"
import { KIND_PENDING, noticeOf, putNotice, settleNotices } from "@/utils/floorNotices"
import { usePOSSettingsStore } from "./posSettings"

export const useFloorNoticesStore = defineStore("floorNotices", () => {
	const posSettingsStore = usePOSSettingsStore()

	// Newest first, one per table
	const notices = ref([])
	const alerts = computed(() => readFloorAlerts(posSettingsStore.settings))
	// Whether the till has a sound to play: the chip that asks for a touch is there while it has and the page has not been touched
	const soundOn = computed(() => alerts.value.guestSound !== "none")
	const timers = new Map()
	let seq = 0

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

	/**
	 * Tells the till of a guest's event.
	 *
	 * @param {"order"|"payment"} event - `order`: `guest_order_submitted`; `payment`: `guest_payment_received`
	 * @param {Object} data - The payload of the realtime event
	 * @returns {Object|null} The notice, null when the event is no news (no table, an order that added no line) or when the popup is off
	 */
	function tell(event, data) {
		const notice = noticeOf(event, data, ++seq)
		if (!notice) return null

		const { popup, popupSeconds, guestSound, volume } = alerts.value
		if (guestSound !== "none") playAlertSound(guestSound, volume)
		if (!popup) return null

		const before = notices.value
		notices.value = putNotice(before, notice)
		// The notices the new one took the place of lose their timers: a timer of an older notice must not take the newer one away
		const kept = new Set(notices.value.map((other) => other.key))
		for (const old of before) if (!kept.has(old.key)) forget(old.key)
		// An order to validate stays until it is handled
		if (popupSeconds > 0 && notice.kind !== KIND_PENDING) {
			timers.set(notice.key, setTimeout(() => dismiss(notice.key), popupSeconds * 1000))
		}
		return notice
	}

	/** Takes a reading of the floor's tables: the orders waiting for validation that the waiter has handled go (utils/floorNotices.settleNotices). */
	function settle(tables) {
		const { notices: next, gone } = settleNotices(notices.value, tables)
		for (const key of gone) forget(key)
		if (gone.length || next.some((notice, at) => notice !== notices.value[at])) notices.value = next
	}

	/** Forgets everything: the user left, and the next one is not told of what was meant for the last. */
	function clear() {
		dismissAll()
	}

	return { notices, soundOn, tell, dismiss, dismissAll, settle, clear }
})
