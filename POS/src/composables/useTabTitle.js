//// Neoffice — added file (no upstream equivalent). A screen that learns a name only after its route hands it to the tab
//// (NeoResto lot 1): `useTabTitle(() => stationLabel.value)` in the kitchen, `useTabTitle(() => guestStore.restaurantName,
//// { instead: true })` on a guest page. The name follows its source, and the tab takes it back when the source empties. The
//// navigation that leaves the screen drops it (the router's afterEach, utils/tabTitle.js), and the watcher stops with the
//// page. This file imports no store: the guest pages use it too, and they must never pull in the till's stores.
import { toValue, watch } from "vue"
import { nameTheTab } from "@/utils/tabTitle"

/**
 * @param {import("vue").MaybeRefOrGetter<string|null|undefined>} name The name this screen has learned, "" for none.
 * @param {{ instead?: boolean }} [options] `instead`: the name stands in place of the screen's own name (a restaurant's
 *   name for "Order") instead of in front of it (a station's name for "Kitchen").
 */
export function useTabTitle(name, { instead = false } = {}) {
	watch(
		() => toValue(name) || "",
		(value) => nameTheTab(value, { instead }),
		{ immediate: true },
	)
}
