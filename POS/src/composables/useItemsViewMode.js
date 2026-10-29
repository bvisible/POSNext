import { ref } from "vue"

const VIEW_MODES = ["grid", "list"]

/**
 * Items grid/list view mode, remembered per user in localStorage.
 *
 * Tiles by default; the list only when the user picks it, and the choice is
 * remembered for the next visit.
 *
 * @param {string|null} user - Session user the choice is stored for
 * @returns {{ viewMode: import("vue").Ref<string>, userManuallySetView: import("vue").Ref<boolean>, setViewMode: Function }}
 */
export function useItemsViewMode(user) {
	const storageKey = `pos_next_items_view_mode:${user || "guest"}`
	let saved = null
	try {
		saved = localStorage.getItem(storageKey)
	} catch {
		// Storage blocked (private mode): fall back to the default view
	}
	const viewMode = ref(VIEW_MODES.includes(saved) ? saved : "grid")
	const userManuallySetView = ref(VIEW_MODES.includes(saved))

	function setViewMode(mode) {
		viewMode.value = mode
		userManuallySetView.value = true
		try {
			localStorage.setItem(storageKey, mode)
		} catch {
			// Storage blocked: the choice lasts for this session only
		}
	}

	return { viewMode, userManuallySetView, setViewMode }
}
