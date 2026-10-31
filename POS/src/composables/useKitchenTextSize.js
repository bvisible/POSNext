//// Neoffice — added file (no upstream equivalent). The kitchen screen's text size as the screen holds it (NeoRestau lot 1, task 38a-1,
//// ruling 109): the cook's pick, kept on the DEVICE (a tablet in the kitchen keeps its own, a cook who needs glasses sets it once), and
//// shown as the CSS variables the screen's root carries. The rules and the table of sizes are in utils/kitchenTextSize and tested there;
//// this only wires them to the browser's storage.
import { computed, ref } from "vue"
import {
	nextTextSize,
	readTextSize,
	saveTextSize,
	TEXT_SIZES,
	textSizeVariables,
} from "@/utils/kitchenTextSize"

/**
 * @returns {{
 *   size: import("vue").Ref<string>,
 *   style: import("vue").ComputedRef<Record<string, string>>,
 *   cycle: () => void,
 *   choose: (size: string) => void,
 * }}
 *   size: Compact, Normal, Large or Extra large. style: the CSS variables to bind on the screen's root. cycle: the next size (the button
 *   of the header). choose: one size; it holds for as long as the screen is open and is kept on the device when it can be.
 */
export function useKitchenTextSize() {
	// Read now, not on mount: the first paint must already be the right size, not a flash of the default
	const size = ref(readTextSize())
	const style = computed(() => textSizeVariables(size.value))

	function choose(next) {
		if (!TEXT_SIZES.includes(next)) return
		size.value = next
		saveTextSize(next)
	}
	function cycle() {
		choose(nextTextSize(size.value))
	}

	return { size, style, cycle, choose }
}
