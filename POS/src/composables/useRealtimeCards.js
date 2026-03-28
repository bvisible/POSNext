/**
 * Real-time Restaurant Card updates composable.
 * Listens to card save/update events and restaurant settings changes
 * via Socket.IO to keep the POS card display in sync.
 */

import { onUnmounted } from "vue"
import { useRestaurantStore } from "@/stores/restaurant"
import { logger } from "@/utils/logger"

const log = logger.create("RealtimeCards")

export function useRealtimeCards() {
	const restaurantStore = useRestaurantStore()
	let debounceTimer = null

	function handleCardUpdate(data) {
		log.info("Card update received", data)
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			restaurantStore.fetchActiveCards()
		}, 500)
	}

	function handleSettingsUpdate() {
		log.info("Restaurant settings update received")
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => {
			restaurantStore.fetchActiveCards()
			restaurantStore.fetchRestaurantSettings()
		}, 500)
	}

	// Register immediately (not in onMounted — component may already be mounted)
	if (window.frappe?.realtime) {
		window.frappe.realtime.on("pos_card_updated", handleCardUpdate)
		window.frappe.realtime.on(
			"pos_restaurant_settings_updated",
			handleSettingsUpdate,
		)
		log.info("Listening for card and settings updates")
	} else {
		log.warn("Socket.IO not available, card realtime updates disabled")
	}

	onUnmounted(() => {
		if (window.frappe?.realtime) {
			window.frappe.realtime.off("pos_card_updated", handleCardUpdate)
			window.frappe.realtime.off(
				"pos_restaurant_settings_updated",
				handleSettingsUpdate,
			)
		}
		clearTimeout(debounceTimer)
	})
}
