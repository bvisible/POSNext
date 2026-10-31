<template>
	<!-- //// Neoffice — added file (no upstream equivalent). One band of the kitchen screen (NeoRestau lot 1, task 23): the -->
	<!-- //// tickets WAITING, or the tickets IN PREPARATION. The product owner asked for the two apart, each in order of -->
	<!-- //// arrival, and the screen is a tablet that can hold thirty tickets in a band: so a band is bounded (a share of the -->
	<!-- //// screen that does not move when tickets come and go), its tickets scroll inside it by touch, and it says how many -->
	<!-- //// are out of sight. As a LANE (bands one above the other) the tickets stand in one row that scrolls sideways, oldest -->
	<!-- //// on the left; as a COLUMN (bands side by side) they stand in a grid that scrolls up and down, oldest at the top. -->
	<!-- //// An empty band keeps its place with one short line, so the other band never jumps. -->
	<section
		:aria-labelledby="headerId"
		:data-test="`band-${band}`"
		:data-mode="mode"
		class="flex min-h-0 min-w-0 flex-col"
		:class="sectionClass"
	>
		<header class="flex flex-shrink-0 items-center justify-between gap-2 px-1 pb-1">
			<h2 :id="headerId" data-test="band-header" class="text-lg font-bold text-gray-900 dark:text-white">
				{{ label }}
				<span data-test="band-count" class="font-medium text-gray-500 dark:text-gray-400">({{ aliveCount }})</span>
			</h2>
			<!-- The tickets scrolled past are counted here, in the header, in either layout: a cook who has swiped away from the -->
			<!-- oldest tickets must be told so. A lane scrolls sideways, so the ones still to come are counted here too, at its -->
			<!-- right edge; a column's are counted under it (below). Nothing is drawn over a ticket: a count over a ticket hides -->
			<!-- the ticket's button. -->
			<div class="flex items-center gap-1.5">
				<span v-if="behind > 0" data-test="band-before" :class="CHIP">{{ mode === "lane" ? "‹" : "↑" }} {{ __("+{0}", [behind]) }}</span>
				<span v-if="mode === 'lane' && ahead > 0" data-test="band-more" :class="CHIP">{{ __("+{0}", [ahead]) }}</span>
			</div>
		</header>

		<p
			v-if="!orders.length"
			data-test="band-empty"
			class="px-1 py-1 text-base text-gray-500 dark:text-gray-400"
		>{{ emptyText }}</p>

		<template v-else>
			<div
				ref="scroller"
				:class="scrollerClass"
				:style="scrollerStyle"
				:data-test="mode === 'lane' ? 'ticket-lane' : 'ticket-column'"
				@scroll.passive="measure"
			>
				<div
					v-for="order in orders"
					:key="order.name"
					data-test="ticket-cell"
					:class="[cellClass, isDelivered(order) ? 'opacity-60' : '']"
				>
					<!-- //// Neoffice — the card gets a function, not an event to emit: a press that moves its ticket to the other band
					     //// unmounts it before the server answers, and Vue drops the events of a component that is gone (fix round 1) -->
					<KDSOrderCard
						:order="order"
						:stations="stations"
						:show-station-badge="showStationBadge"
						:station="station"
						:refresh="refresh"
					/>
				</div>
			</div>

			<!-- A column scrolls up and down: the tickets still to come are counted in a strip UNDER it. The strip is always there, -->
			<!-- empty or not, so that the column does not change height when the count appears; it is not over the tickets, which -->
			<!-- would grey out or cover the main button of the one at the foot of the column. -->
			<footer
				v-if="mode === 'column'"
				data-test="band-footer"
				class="flex h-6 flex-shrink-0 items-center justify-end px-1"
			>
				<span v-if="ahead > 0" data-test="band-more" :class="CHIP">{{ __("+{0}", [ahead]) }}</span>
			</footer>
		</template>
	</section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import KDSOrderCard from "@/components/invoices/KDSOrderCard.vue"
import { kitchenStatusOf } from "@/utils/kitchenBands"
import {
	BAND_PRODUCTION_HEIGHT,
	BAND_WAITING_HEIGHT,
	TICKET_COLUMN_PRODUCTION,
	TICKET_COLUMN_WAITING,
	TICKET_LANE,
	TICKET_SPLIT_PRODUCTION,
	TICKET_SPLIT_WAITING,
} from "@/utils/ticketLayout"
import { offScreen } from "@/utils/ticketScrollHints"

/**
 * One band of the kitchen screen.
 *
 * band:  "waiting" | "production"
 * mode:  "lane" (bands one above the other, tickets in a row that scrolls sideways) | "column" (side by side, tickets in a
 *        grid that scrolls up and down)
 * label: the header, without the count (the band adds it)
 * orders: the tickets of the band, in the order they are to be shown (the screen sorts them, see utils/kitchenBands)
 */
const props = defineProps({
	band: { type: String, required: true },
	mode: { type: String, default: "lane" },
	label: { type: String, required: true },
	emptyText: { type: String, required: true },
	orders: { type: Array, default: () => [] },
	stations: { type: Array, default: () => [] },
	showStationBadge: { type: Boolean, default: true },
	// The station the screen is opened on, none for all of them: the main button of a ticket then acts on that station's dishes
	station: { type: String, default: null },
})
const emit = defineEmits(["status-updated"])

// What each card calls once the server has answered (a function of the band, which is still there when the card is not)
const refresh = () => emit("status-updated")

// The delivered tickets "Show completed" brings in come after the ones in hand: they are shown dimmed and are not counted
const isDelivered = (order) => kitchenStatusOf(order) === "Delivered"
const aliveCount = computed(
	() => props.orders.filter((order) => !isDelivered(order)).length,
)

const headerId = computed(() => `band-${props.band}-title`)
const isWaiting = computed(() => props.band === "waiting")

// The size of the band on the screen: a fixed share of the height when the bands are one above the other, the columns of
// the shared grid its side spans when they are side by side (utils/ticketLayout)
const sectionClass = computed(() => {
	if (props.mode === "column")
		return isWaiting.value ? TICKET_SPLIT_WAITING : TICKET_SPLIT_PRODUCTION
	return isWaiting.value ? BAND_WAITING_HEIGHT : BAND_PRODUCTION_HEIGHT
})
const scrollerClass = computed(() => {
	if (props.mode === "lane") return `${TICKET_LANE} flex-1 min-h-0`
	return [
		isWaiting.value ? TICKET_COLUMN_WAITING : TICKET_COLUMN_PRODUCTION,
		// The rows keep the height of their tickets instead of stretching to fill the column
		"flex-1 min-h-0 content-start overflow-y-auto overscroll-y-contain",
	].join(" ")
})
const cellClass = computed(() =>
	props.mode === "lane"
		? "flex min-h-0 min-w-0 snap-start flex-col"
		: "flex min-w-0 flex-col",
)

// The tickets out of sight, and, for a column, the height its tickets are capped to: a ticket grows with its dishes down to
// the foot of the column and then scrolls inside itself (KDSOrderCard reads --ticket-max-h). A lane needs no cap, it
// stretches its tickets to its own height.
const scroller = ref(null)
const ahead = ref(0)
const behind = ref(0)
const maxHeight = ref(0)
const scrollerStyle = computed(() =>
	props.mode === "column" && maxHeight.value > 0
		? { "--ticket-max-h": `${maxHeight.value}px` }
		: {},
)

function measure() {
	const element = scroller.value
	if (!element) {
		ahead.value = 0
		behind.value = 0
		maxHeight.value = 0
		return
	}
	const cells = element.querySelectorAll('[data-test="ticket-cell"]')
	const counts = offScreen(element, cells, props.mode === "lane" ? "x" : "y")
	ahead.value = counts.ahead
	behind.value = counts.behind
	maxHeight.value = props.mode === "column" ? element.clientHeight : 0
}

// What the counts depend on: the tickets (they come and go with a refresh), the way the band is laid out, and the size
// of the lane or column (a tablet turned, a layout chosen)
watch(() => props.orders, () => measure(), { flush: "post" })
watch(() => props.mode, () => nextTick(measure), { flush: "post" })

let sizeObserver = null
watch(scroller, (element, previous) => {
	if (sizeObserver) {
		if (previous) sizeObserver.unobserve(previous)
		if (element) sizeObserver.observe(element)
	}
	measure()
})
onMounted(() => {
	if (typeof ResizeObserver !== "undefined") {
		sizeObserver = new ResizeObserver(() => measure())
		if (scroller.value) sizeObserver.observe(scroller.value)
	}
	measure()
})
onUnmounted(() => sizeObserver?.disconnect())

// The same small pill as the "+N lines" at the foot of a long ticket: ink on paper, nothing of a colour of its own
const CHIP =
	"rounded-full bg-gray-800 px-2.5 py-1 text-xs font-bold leading-none text-white dark:bg-white dark:text-gray-800"
</script>
