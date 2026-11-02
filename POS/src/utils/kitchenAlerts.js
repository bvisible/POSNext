//// Neoffice — added file (no upstream equivalent). The kitchen alerts as a screen reads them (NeoResto lot 1, Daniel, 01.11: a popup and a sound when the next course is ordered, a sound when dishes
//// come up ready). They are settings of the till (POS Settings, "Kitchen alerts"); the server resolves them for the restaurant a screen is opened on and answers `kitchen_alerts` in
//// `get_restaurant_settings` (pos_next.restaurant.kitchen_alerts). This reads that answer, and reads anything it does not understand as the default: a screen never breaks on an answer that is missing, old or odd.

import { DEFAULT_NEXT_COURSE_SOUND, DEFAULT_RUNNER_SOUND, DEFAULT_VOLUME, normaliseSound, normaliseVolume } from "@/utils/alertSounds"

//// Neoffice — 0 = until somebody has seen the notice (Daniel, 02.11): the floor alerts of the till stay until they are dismissed, unless a till asks for seconds
export const DEFAULT_POPUP_SECONDS = 0
// The longest a popup may stay, ten minutes: the same range the server holds
export const MAX_POPUP_SECONDS = 600

//// Neoffice — no `popupSeconds` any more: the banner is gone (Daniel, 01.11), the ticket flashes until the kitchen starts it
export const DEFAULT_KITCHEN_ALERTS = Object.freeze({
	popup: true,
	nextCourseSound: DEFAULT_NEXT_COURSE_SOUND,
	runnerSound: DEFAULT_RUNNER_SOUND,
	volume: DEFAULT_VOLUME,
})

/** How long a popup stays, in seconds: a whole number from 0 to 600, the default for no value or one that is no number. The floor alerts of the till read their seconds the same way. */
export function secondsOf(value) {
	if (value == null || value === "") return DEFAULT_POPUP_SECONDS
	const seconds = Number(value)
	if (Number.isNaN(seconds)) return DEFAULT_POPUP_SECONDS
	return Math.min(MAX_POPUP_SECONDS, Math.max(0, Math.round(seconds)))
}

/**
 * The kitchen alerts out of the `kitchen_alerts` of a settings answer.
 *
 * @param {Object|null|undefined} answer - `{ popup, next_course_sound, runner_sound, volume }`, any of them missing
 * @returns {{ popup: boolean, nextCourseSound: string, runnerSound: string, volume: string }}
 */
export function readKitchenAlerts(answer) {
	if (!answer || typeof answer !== "object") return { ...DEFAULT_KITCHEN_ALERTS }
	return {
		popup: answer.popup == null || answer.popup === "" ? DEFAULT_KITCHEN_ALERTS.popup : Boolean(Number(answer.popup)),
		nextCourseSound: normaliseSound(answer.next_course_sound, DEFAULT_NEXT_COURSE_SOUND),
		runnerSound: normaliseSound(answer.runner_sound, DEFAULT_RUNNER_SOUND),
		volume: answer.volume == null || answer.volume === "" ? DEFAULT_VOLUME : normaliseVolume(answer.volume),
	}
}
