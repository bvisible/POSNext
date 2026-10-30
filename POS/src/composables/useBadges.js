//// Neoffice — added file (no upstream equivalent). Upstream POSNext is a retail POS
//// with no menu: nothing declares that a dish contains gluten or how hot it is. This
//// reads the Menu Badge catalogue from pos_next.api.restaurant, for the item sheet that
//// sets the badges and spice level of a dish, and so for the printable menu PDF (b6e757dd,
//// 2026-03-26 "add menu PDF generator with badges"). Reads go through utils/apiWrapper
//// `call`, which retries once after refreshing the CSRF token — window.frappe.call does
//// not, and a POS left open all day hits a stale token (4f6f8755). The item sheet saves
//// a dish's badges itself, with update_item_badges. The read and the save of one dish's
//// badges that this file also held lost their only caller with the badge panel
//// (NeoRestau lot 1, task 9) and are gone. The PDF is fetched through an iframe
//// (1b29c36f, 2026-03-26).
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
		getBadgesByType,
		getBadgeIconUrl,
	}
}
