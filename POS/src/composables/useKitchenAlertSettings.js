//// Neoffice — added file (no upstream equivalent). How a kitchen or runner screen gets the alerts of its till (NeoRestau lot 1, Daniel, 01.11). The screens run on paired device accounts with no till behind them
//// (no POS Profile, no POS Settings of their own): they ask `get_restaurant_settings`, the call a tablet already makes, for their restaurant, and the server resolves the alerts from the POS Settings of the
//// restaurant's till (pos_next.restaurant.kitchen_alerts). The reading is repeated every few minutes so that a change made at the till reaches a tablet that stays open for days.
import { onMounted, onUnmounted, ref } from "vue"
import { call } from "@/utils/apiWrapper"
import { DEFAULT_KITCHEN_ALERTS, readKitchenAlerts } from "@/utils/kitchenAlerts"
//// Neoffice — the restaurant's service rhythm rides in the same answer: the kitchen greys the later courses only where the room calls them (NeoRestau lot 1, Daniel, 01.11)
import { CALLED_BY_THE_ROOM, rhythmOf } from "@/utils/serviceRhythm"

/** How often the settings are read again, in milliseconds. */
export const REFRESH_MS = 5 * 60 * 1000

/**
 * @param {{ restaurant?: () => { restaurant?: string } }} [options] - `restaurant` hands the parameters that name the restaurant the screen is opened on (the screens' `ofTheRestaurant`)
 * @returns {{ settings: import("vue").Ref<Object>, rhythm: import("vue").Ref<string>, refresh: () => Promise<void> }}
 *   settings: `{ popup, popupSeconds, nextCourseSound, runnerSound, volume }` (utils/kitchenAlerts), the defaults until the server has answered and after an answer that failed
 *   rhythm: the restaurant's service rhythm ("Called by the room" or "Prepared ahead", utils/serviceRhythm), the room's call until the server has answered
 */
export function useKitchenAlertSettings({ restaurant } = {}) {
	const settings = ref({ ...DEFAULT_KITCHEN_ALERTS })
	const rhythm = ref(CALLED_BY_THE_ROOM)
	let timer = null

	async function refresh() {
		try {
			const answer = await call("pos_next.api.restaurant.get_restaurant_settings", { _: Date.now(), ...(restaurant?.() || {}) })
			settings.value = readKitchenAlerts(answer?.kitchen_alerts)
			rhythm.value = rhythmOf(answer?.service_rhythm)
		} catch (error) {
			// A failed reading keeps what the last good one said: a screen is never left without alerts, nor with others than its till chose
			console.warn("Failed to read the kitchen alert settings:", error)
		}
	}

	onMounted(() => {
		refresh()
		timer = setInterval(refresh, REFRESH_MS)
	})
	onUnmounted(() => {
		if (timer) clearInterval(timer)
	})

	return { settings, rhythm, refresh }
}
