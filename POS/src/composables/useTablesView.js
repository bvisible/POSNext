//// Neoffice — added file (no upstream equivalent). How the restaurant till shows its tables: as the list of the tables
//// or as the floor plan (NeoResto lot 1, task 26). On a phone the till opens on the list (product owner, 31.10.2026:
//// « on the phone, show the list of the tables by default rather than the plan »); on a tablet and a PC it opens on
//// the plan, as before, and a small switch on the plan's line lets them use the list too. The waiter's choice is kept
//// on THIS device, in the browser's storage: a phone that chose the plan opens on the plan the next time.
import { computed, onMounted, onUnmounted, ref } from "vue"

// Where the choice is kept, in this browser
export const TABLES_VIEW_KEY = "pos_tables_view"
// Below this width the till is a phone's (the mockup's 390 px; a tablet held upright is 768 px or more)
export const PHONE_BELOW_PX = 768
export const VIEWS = ["list", "plan"]

// A storage that refuses (a private window, a blocked or full one) leaves the choice to the page alone
function readChoice() {
	try {
		const kept = window.localStorage.getItem(TABLES_VIEW_KEY)
		return VIEWS.includes(kept) ? kept : null
	} catch {
		return null
	}
}

function keepChoice(view) {
	try {
		window.localStorage.setItem(TABLES_VIEW_KEY, view)
	} catch {
		// Not kept: the choice still holds while the page is open
	}
}

/**
 * @returns {{view: import("vue").ComputedRef<"list"|"plan">, isPhone: import("vue").ComputedRef<boolean>,
 *   setView: (view: "list"|"plan") => void}}
 */
export function useTablesView() {
	const width = ref(typeof window === "undefined" ? 1024 : window.innerWidth)
	const choice = ref(readChoice())

	const isPhone = computed(() => width.value < PHONE_BELOW_PX)
	// What the waiter chose on this device, else what suits it: the list on a phone, the plan elsewhere
	const view = computed(() => choice.value || (isPhone.value ? "list" : "plan"))

	function setView(next) {
		if (!VIEWS.includes(next)) return
		choice.value = next
		keepChoice(next)
	}

	// A phone turned sideways, a window narrowed: the layout follows the width
	const onResize = () => {
		width.value = window.innerWidth
	}
	onMounted(() => window.addEventListener("resize", onResize))
	onUnmounted(() => window.removeEventListener("resize", onResize))

	return { view, isPhone, setView }
}
