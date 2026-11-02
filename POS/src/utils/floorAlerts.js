//// Neoffice — added file (no upstream equivalent). The floor alerts as the till reads them (NeoResto lot 1, Daniel, 01.11, after ordering a drink from the QR code of a table as a guest: « regarde comment la
//// caisse sommelier reçoit l'info (popup et autre) »). When a guest orders or pays from the QR code of a table, the waiter's and the sommelier's till shows a notice (stores/floorNotices) and rings.
////
//// They are settings of the TILL (POS Settings, "Floor alerts", pos_next.till_settings.registry), read with the rest of the till's settings (`get_pos_settings`, the bootstrap), and the volume is the one the kitchen
//// alerts already have (`kitchen_alert_volume`). The tablets of the kitchen read theirs from the server (utils/kitchenAlerts); the till has its settings already, so this reads them where they are. A till whose settings do not
//// carry them (a site not migrated yet, a copy of the settings kept before the update) reads the defaults: a popup of 30 seconds and the chime, so that it is never without an alert.

import { DEFAULT_GUEST_SOUND, DEFAULT_VOLUME, normaliseSound, normaliseVolume } from "@/utils/alertSounds"
import { DEFAULT_POPUP_SECONDS, secondsOf } from "@/utils/kitchenAlerts"

export const DEFAULT_FLOOR_ALERTS = Object.freeze({
	popup: true,
	popupSeconds: DEFAULT_POPUP_SECONDS,
	guestSound: DEFAULT_GUEST_SOUND,
	volume: DEFAULT_VOLUME,
})

/**
 * The floor alerts out of the till's settings.
 *
 * @param {Object|null|undefined} settings - The till's POS Settings as the till holds them (`floor_guest_popup`, `floor_popup_seconds`, `floor_guest_sound`, `kitchen_alert_volume`), any of them missing
 * @returns {{ popup: boolean, popupSeconds: number, guestSound: string, volume: string }} `guestSound` and `volume` are ids (`double_beep`, `high`)
 */
export function readFloorAlerts(settings) {
	if (!settings || typeof settings !== "object") return { ...DEFAULT_FLOOR_ALERTS }
	const popup = settings.floor_guest_popup
	const volume = settings.kitchen_alert_volume
	return {
		popup: popup == null || popup === "" ? DEFAULT_FLOOR_ALERTS.popup : Boolean(Number(popup)),
		popupSeconds: secondsOf(settings.floor_popup_seconds),
		guestSound: normaliseSound(settings.floor_guest_sound, DEFAULT_GUEST_SOUND),
		volume: volume == null || volume === "" ? DEFAULT_VOLUME : normaliseVolume(volume),
	}
}
