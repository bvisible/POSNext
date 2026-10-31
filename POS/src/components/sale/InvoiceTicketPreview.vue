<template>
	<div :class="rootClass" :title="preview.title" data-testid="invoice-preview">
		<!-- //// Neoffice — added file (no upstream equivalent). What a ticket holds, in the middle column of a row of -->
		<!-- //// the invoice history: its first dishes, one per line, each cut with an ellipsis by itself, then -->
		<!-- //// « +n items » on a line of its own (NeoRestau lot 1, task 29). Below 768 px the row has no middle column -->
		<!-- //// any more and the dishes sit side by side under its left block, in the room of two lines. -->
		<div ref="box" dir="auto" :class="boxClass">
			<span
				v-for="(dish, index) in preview.lines"
				:key="index"
				data-testid="invoice-preview-line"
				class="flex min-w-0 max-w-full items-baseline"
				:aria-hidden="index >= fitting ? 'true' : undefined"
			>
				<span class="min-w-0 truncate">{{ dish.text }}</span>
				<span v-if="!stacked && index < preview.lines.length - 1" class="flex-none whitespace-pre" aria-hidden="true">{{ SEPARATOR }}</span>
			</span>
		</div>
		<span
			v-if="hiddenCount"
			data-testid="invoice-preview-more"
			class="flex-none whitespace-nowrap font-medium text-gray-600"
		>
			{{ moreLabel }}
		</span>
	</div>
</template>

<script setup>
import { fittingLines } from "@/utils/invoicePreview"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps({
	// What utils/invoicePreview.js made of a row: {lines: [{text, title}], title, hidden}
	preview: { type: Object, required: true },
})

const SEPARATOR = " · "

// From this width up (Tailwind's `md`, where the row's grid gets its middle column) the dishes are stacked
const WIDE = "(min-width: 768px)"
const media = typeof matchMedia === "function" ? matchMedia(WIDE) : null
const stacked = ref(media ? media.matches : true)

const box = ref(null)
// Dishes that fit in the room of two lines, found by looking at how the browser laid them out (narrow layout only);
// stacked, none is clipped
const fitting = ref(props.preview.lines.length)
let observer = null

const rootClass = computed(() =>
	stacked.value
		? "flex min-w-0 flex-col text-xs text-gray-500 text-start"
		: "mt-1.5 flex min-w-0 items-start gap-1.5 text-xs text-gray-500 text-start",
)
// Two lines of room (2 x the 1.15 line height of text-xs): a dish that would fall on a third line is clipped
const boxClass = computed(() =>
	stacked.value ? "flex min-w-0 flex-col" : "flex min-w-0 max-h-[2.3em] flex-wrap overflow-hidden",
)

// The dishes the ticket holds beyond the ones handed over, plus the ones that did not fit
const hiddenCount = computed(
	() => props.preview.hidden + Math.max(0, props.preview.lines.length - fitting.value),
)

//// Neoffice — « +1 item » / « +n items »: two msgids, the till's way of a plural (`n === 1 ? __("item") : __("items")`).
const moreLabel = computed(() =>
	hiddenCount.value === 1
		? __("+{0} item", [hiddenCount.value])
		: __("+{0} items", [hiddenCount.value]),
)

function measure() {
	const element = box.value
	if (stacked.value || !element) {
		fitting.value = props.preview.lines.length
		return
	}
	fitting.value = fittingLines(Array.from(element.children, (dish) => dish.offsetTop))
}

// A dish changing size (a font arriving, the dialog resized) can move the others to another line
function observeSizes() {
	if (!observer || !box.value) return
	observer.disconnect()
	if (stacked.value) return
	observer.observe(box.value)
	for (const dish of box.value.children) observer.observe(dish)
}

async function look() {
	fitting.value = props.preview.lines.length
	await nextTick()
	measure()
	observeSizes()
}

function onWidthChange(event) {
	stacked.value = event.matches
	look()
}

onMounted(() => {
	if (typeof ResizeObserver !== "undefined") observer = new ResizeObserver(measure)
	media?.addEventListener?.("change", onWidthChange)
	measure()
	observeSizes()
})

watch(() => props.preview, look)

onBeforeUnmount(() => {
	observer?.disconnect()
	media?.removeEventListener?.("change", onWidthChange)
})
</script>
