//// Neoffice — added file (no upstream equivalent). How many tickets of one width fit the area that holds them (NeoRestau lot 1, task 38a-3): the number a wide card needs to know whether
//// it may take two (utils/wideTicket). Read from the boxes on the screen, so it follows the size of the tablet, a layout chosen, and the text size (which changes the width of a ticket without
//// changing the area's: the screen hands its size down, utils/kitchenTextSize TEXT_SIZE_KEY, and the count is made again when it moves).
import { inject, onMounted, onUnmounted, ref, watch } from "vue"
import { TEXT_SIZE_KEY } from "@/utils/kitchenTextSize"
import { cardWidthOf, columnsThatFit } from "@/utils/wideTicket"

/**
 * @param {import("vue").Ref<Element|null>} area - The element the tickets stand in (a template ref; it may come and go, the band's area exists only while it has tickets)
 * @param {import("vue").Ref<string>|null} [size] - The text size the screen shows. A band, inside the screen, has it from the screen (TEXT_SIZE_KEY); the screen itself does not see what it
 *   provides, so it hands its own.
 * @returns {{ columns: import("vue").Ref<number>, measure: () => void }}
 *   columns: how many tickets of one width fit its width; 0 while it is not laid out (a card drawn outside a page, a test with no layout engine): nothing is wide until it is known
 */
export function useColumnsThatFit(area, size = inject(TEXT_SIZE_KEY, null)) {
	const columns = ref(0)

	function measure() {
		const element = area.value
		columns.value = element
			? columnsThatFit(element.clientWidth, cardWidthOf(element))
			: 0
	}

	let observer = null
	watch(
		area,
		(element, previous) => {
			if (observer) {
				if (previous) observer.unobserve(previous)
				if (element) observer.observe(element)
			}
			measure()
		},
		{ flush: "post" },
	)
	// A new text size changes the width of a ticket once the screen's root has its new variables: a watcher that runs after the DOM is patched
	if (size) watch(size, measure, { flush: "post" })

	onMounted(() => {
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => measure())
			if (area.value) observer.observe(area.value)
		}
		measure()
	})
	onUnmounted(() => observer?.disconnect())

	return { columns, measure }
}
