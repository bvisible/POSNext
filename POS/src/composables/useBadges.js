//// Neoffice — added file (no upstream equivalent). Upstream POSNext is a retail POS
//// with no menu: nothing declares that a dish contains gluten or how hot it is. This
//// reads the Menu Badge catalogue and the per-item badges + spice level from
//// pos_next.api.restaurant, and backs the printable menu PDF (b6e757dd, 2026-03-26
//// "add menu PDF generator with badges"). Reads go through utils/apiWrapper `call`,
//// which retries once after refreshing the CSRF token — window.frappe.call does not,
//// and a POS left open all day hits a stale token (4f6f8755). saveItemBadges keeps a
//// raw fetch with an explicit CSRF header, and the PDF is fetched through an iframe
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
			console.log("[useBadges] Saving:", itemCode, badgeNames, spiceLevel)
			const csrfToken =
				document.cookie.match(/csrf_token=([^;]+)/)?.[1] ||
				window.csrf_token ||
				""
			const response = await fetch(
				"/api/method/pos_next.api.restaurant.update_item_badges",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Frappe-CSRF-Token": csrfToken,
					},
					body: JSON.stringify({
						item_code: itemCode,
						badges: JSON.stringify(badgeNames),
						spice_level: spiceLevel,
					}),
				},
			)
			const data = await response.json()
			console.log("[useBadges] Save result:", data)
			return data?.message?.status === "ok"
		} catch (e) {
			console.error("[useBadges] Failed to save:", e)
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
