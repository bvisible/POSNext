//// Neoffice — added file (no upstream equivalent). The layout of the kitchen screen's two bands as a screen holds it
//// (NeoRestau lot 1, task 23): the cook's pick, kept on the device; the way the tablet is held; whether the window is wide
//// enough for two ticket columns side by side. The rules are in utils/kitchenLayout and tested there; this only wires them
//// to the window and keeps them alive for as long as the screen is.
import { computed, onMounted, onUnmounted, ref } from "vue"
import {
	LAYOUTS,
	readLayout,
	resolveLayout,
	saveLayout,
} from "@/utils/kitchenLayout"

export const PORTRAIT_QUERY = "(orientation: portrait)"
// The width at which the shared grid of tickets has two columns (Tailwind's md): the least that two bands side by side need
export const WIDE_QUERY = "(min-width: 768px)"

/** A media query list, or null where the browser has none (an old one, a test): the screen then assumes a wide window held flat. */
function mediaQuery(text) {
	try {
		return typeof window !== "undefined" &&
			typeof window.matchMedia === "function"
			? window.matchMedia(text)
			: null
	} catch {
		return null
	}
}

/**
 * @returns {{
 *   layout: import("vue").ComputedRef<"bands"|"columns">,
 *   canSplit: import("vue").Ref<boolean>,
 *   choose: (layout: string) => void,
 * }}
 *   layout: the layout to draw. canSplit: the window is wide enough for the side by side layout (the switch is offered only
 *   then). choose: the cook picks; it holds for as long as the screen is open and is kept on the device when it can be.
 */
export function useKitchenLayout() {
	const stored = ref(readLayout())
	const portraitQuery = mediaQuery(PORTRAIT_QUERY)
	const wideQuery = mediaQuery(WIDE_QUERY)
	// Read now, not on mount: the first paint must already be the right layout, not a flash of the other one
	const portrait = ref(Boolean(portraitQuery?.matches))
	const canSplit = ref(wideQuery ? Boolean(wideQuery.matches) : true)

	const layout = computed(() =>
		resolveLayout({
			stored: stored.value,
			portrait: portrait.value,
			wide: canSplit.value,
		}),
	)

	function choose(next) {
		if (!LAYOUTS.includes(next)) return
		stored.value = next
		saveLayout(next)
	}

	const stops = []
	function follow(query, apply) {
		if (!query) return
		const listener = (event) => apply(Boolean(event.matches))
		if (typeof query.addEventListener === "function") {
			query.addEventListener("change", listener)
			stops.push(() => query.removeEventListener("change", listener))
		} else if (typeof query.addListener === "function") {
			// Safari before 14
			query.addListener(listener)
			stops.push(() => query.removeListener(listener))
		}
	}
	onMounted(() => {
		follow(portraitQuery, (value) => {
			portrait.value = value
		})
		follow(wideQuery, (value) => {
			canSplit.value = value
		})
	})
	onUnmounted(() => {
		for (const stop of stops.splice(0)) stop()
	})

	return { layout, canSplit, choose }
}
