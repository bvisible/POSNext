import { ref } from "vue"
import { call } from "@/utils/apiWrapper"

const menuBadges = ref([])
const menuBadgesLoaded = ref(false)
const loading = ref(false)

export function useBadges() {
	async function loadMenuBadges() {
		if (menuBadgesLoaded.value) return menuBadges.value
		loading.value = true
		try {
			const response = await call("pos_next.api.restaurant.get_menu_badges")
			menuBadges.value = response || []
			menuBadgesLoaded.value = true
		} catch (e) {
			console.error("Failed to load menu badges:", e)
		} finally {
			loading.value = false
		}
		return menuBadges.value
	}

	async function loadItemBadges(itemCode) {
		try {
			const response = await call("pos_next.api.restaurant.get_item_badges", {
				item_code: itemCode,
			})
			return response || { badges: [], spice_level: 0 }
		} catch (e) {
			console.error("Failed to load item badges:", e)
			return { badges: [], spice_level: 0 }
		}
	}

	async function saveItemBadges(itemCode, badgeNames, spiceLevel) {
		try {
			await call("pos_next.api.restaurant.update_item_badges", {
				item_code: itemCode,
				badges: JSON.stringify(badgeNames),
				spice_level: spiceLevel,
			})
			return true
		} catch (e) {
			console.error("Failed to save item badges:", e)
			return false
		}
	}

	function getBadgesByType(type) {
		return menuBadges.value.filter((b) => b.badge_type === type)
	}

	function getBadgeIconUrl(icon) {
		if (!icon) return ""
		return `/assets/pos_next/icons/badges/${icon}`
	}

	return {
		menuBadges,
		loading,
		loadMenuBadges,
		loadItemBadges,
		saveItemBadges,
		getBadgesByType,
		getBadgeIconUrl,
	}
}
