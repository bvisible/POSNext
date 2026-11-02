<template>
	<!-- //// Neoffice — added file (no upstream equivalent). One band of the kitchen screen (NeoResto lot 1, task 23): the -->
	<!-- //// tickets WAITING, or the tickets IN PREPARATION. The product owner asked for the two apart, each in order of -->
	<!-- //// arrival, and the screen is a tablet that can hold thirty tickets in a band: so a band is bounded (a share of the -->
	<!-- //// screen that does not move when tickets come and go), its tickets scroll inside it by touch, and it says how many -->
	<!-- //// are out of sight. As a LANE (bands one above the other) the tickets stand in one row that scrolls sideways, oldest -->
	<!-- //// on the left; as a COLUMN (bands side by side) they stand in a grid that scrolls up and down, oldest at the top. -->
	<!-- //// A band is drawn only when it holds a ticket (Daniel, 01.11: « la colonne est affichée uniquement s'il y a quelque chose dedans »): the screen leaves an empty one out, and the other takes the room. -->
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
				<!-- //// Neoffice — dark mode (task 46): `dark:text-gray-400` never applied, the till's dark remap of `.text-gray-500` is `!important` (index.css) and wins at equal weight; the count read 4.35:1. `[&&]` doubles the selector so that this variant outranks it. -->
				<span data-test="band-count" class="font-medium text-gray-500 dark:[&&]:!text-gray-400">({{ aliveCount }})</span>
			</h2>
			<!-- The tickets scrolled past are counted here, in the header, in either layout: a cook who has swiped away from the -->
			<!-- oldest tickets must be told so. A lane scrolls sideways, so the ones still to come are counted here too, at its -->
			<!-- right edge; a column's are counted under it (below). Nothing is drawn over a ticket: a count over a ticket hides -->
			<!-- the ticket's button. -->
			<div class="flex items-center gap-1.5">
				<!-- //// Neoffice — the tickets that blink stand FIRST in the band (the screen puts them there): the chip counts them and brings the band back to its head, where the cook finds them when it has scrolled away (Daniel, 01.11) -->
				<button v-if="blinking > 0" type="button" data-test="band-blinking" class="touch-manipulation rounded-full bg-[#F55D1A] px-2.5 text-xs font-bold leading-6 text-[#141414] motion-safe:animate-pulse" @click="backToHead">{{ __("{0} to take", [blinking]) }}</button>
				<span v-if="behind > 0" data-test="band-before" :class="CHIP">{{ mode === "lane" ? (oldestRight ? "›" : "‹") : "↑" }} {{ __("+{0}", [behind]) }}</span>
				<span v-if="mode === 'lane' && ahead > 0" data-test="band-more" :class="CHIP">{{ __("+{0}", [ahead]) }}</span>
			</div>
		</header>

			<div
				ref="scroller"
				:class="scrollerClass"
				:style="scrollerStyle"
				:data-test="mode === 'lane' ? 'ticket-lane' : 'ticket-column'"
				:dir="oldestRight ? 'rtl' : undefined"
				:data-oldest-side="oldestRight ? 'right' : 'left'"
				@scroll.passive="measure"
			>
				<!-- //// Neoffice — a ticket with many dishes takes two columns of the grid or of the lane (task 38a-3, ruling 107: the wide card). `data-wide` says it. -->
				<div
					v-for="order in orders"
					:key="order.name"
					data-test="ticket-cell"
					:data-wide="isWide(order) ? 'true' : undefined"
					:dir="oldestRight ? 'ltr' : undefined"
					:class="[cellClass, isWide(order) ? TICKET_CELL_WIDE : '', isDelivered(order) ? 'opacity-60' : '']"
				>
					<!-- //// Neoffice — the card gets a function, not an event to emit: a press that moves its ticket to the other band
					     //// unmounts it before the server answers, and Vue drops the events of a component that is gone (fix round 1) -->
					<KDSOrderCard
						:order="order"
						:stations="stations"
						:show-station-badge="showStationBadge"
						:station="station"
						:refresh="refresh"
						:room-name="roomNameOf(order)"
						:use-runner="orderUsesRunner(order, stations, runnerEnabled)"
						:highlighted="flashOrders.includes(order.name)"
						:can-print="!!copy?.canPrint(order)"
						:print-state="copy?.stateOf(order)"
						@print="copy?.print($event)"
						@acknowledge="emit('acknowledge', $event)"
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
	</section>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import KDSOrderCard from "@/components/invoices/KDSOrderCard.vue"
import { kitchenStatusOf } from "@/utils/kitchenBands"
//// Neoffice — whether a ticket's dishes go through a runner: its main button follows (task 38a-1, ruling 112)
import { orderUsesRunner } from "@/utils/kitchenRunner"
import {
	BAND_PRODUCTION_HEIGHT,
	BAND_WAITING_HEIGHT,
	TICKET_CELL_WIDE,
	TICKET_COLUMN_PRODUCTION,
	TICKET_COLUMN_WAITING,
	TICKET_LANE,
	TICKET_SPLIT_PRODUCTION,
	TICKET_SPLIT_WAITING,
} from "@/utils/ticketLayout"
import { offScreen } from "@/utils/ticketScrollHints"
//// Neoffice — the wide card of a long ticket (task 38a-3, ruling 107): how many tickets fit the area, and whether a ticket has the dishes for two columns
import { useColumnsThatFit } from "@/composables/useColumnsThatFit"
import { isWideTicket, kitchenLiveLineCount } from "@/utils/wideTicket"
//// Neoffice — the side where the oldest ticket stands, the device's choice (Daniel, 01.11): the tickets are drawn from the right when it is the right
import { useTicketSide } from "@/composables/useTicketSide"

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
	//// Neoffice — the printer button of the cards (task 44): what the screen hands (composables/usePrintCopy: `canPrint(order)`, `stateOf(order)`, `print(order)`); none, no card draws a button
	copy: { type: Object, default: null },
	mode: { type: String, default: "lane" },
	label: { type: String, required: true },
	orders: { type: Array, default: () => [] },
	stations: { type: Array, default: () => [] },
	showStationBadge: { type: Boolean, default: true },
	// The station the screen is opened on, none for all of them: the main button of a ticket then acts on that station's dishes
	station: { type: String, default: null },
	//// Neoffice — the rooms of the restaurant, `{ name, area_name }` (task 38a-1, ruling 126): an order carries the link to its room (`area`),
	//// the header of its card shows the room's short code, which comes from the room's name
	rooms: { type: Array, default: () => [] },
	//// Neoffice — the restaurant's own runner switch: with no runner at all the kitchen delivers whatever a station says (task 38a-1)
	runnerEnabled: { type: Boolean, default: true },
	//// Neoffice — the orders whose tickets FLASH: the tables that have ordered their next course and not been taken up yet (NeoResto lot 1, Daniel, 01.11); none, no ticket does
	flashOrders: { type: Array, default: () => [] },
	//// Neoffice — what the screen does to read its orders again, called by a card once the server has answered a press
	reload: { type: Function, default: () => {} },
	//// Neoffice — the band of the tickets to do standing ALONE (the other is empty and left out, Daniel, 01.11): side by side it then takes the width and the columns of the band in preparation
	alone: { type: Boolean, default: false },
})
const emit = defineEmits(["acknowledge"])

//// Neoffice — the name of the room an order sits in, "" for a takeaway or a room the screen does not know (the card then draws no chip)
const roomNameOf = (order) =>
	props.rooms.find((room) => room.name === order.area)?.area_name || ""

//// Neoffice — what each card calls once the server has answered: the function the SCREEN hands the band (`reload`), not an event of the band. A band is left out of the screen when it holds no ticket (Daniel, 01.11), so
//// the press that moves a band's last ticket to the other band unmounts the band with it before the server answers, and Vue drops the events of a component that is gone
const refresh = () => props.reload()

// The delivered tickets "Show completed" brings in come after the ones in hand: they are shown dimmed and are not counted
const isDelivered = (order) => kitchenStatusOf(order) === "Delivered"
const aliveCount = computed(
	() => props.orders.filter((order) => !isDelivered(order)).length,
)

//// Neoffice — how many tickets of this band blink, and the way back to the head of the band, where they stand
const blinking = computed(() => props.orders.filter((order) => props.flashOrders.includes(order.name)).length)
function backToHead() {
	const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
	scroller.value?.scrollTo?.({ left: 0, top: 0, behavior: calm ? "auto" : "smooth" })
}

const headerId = computed(() => `band-${props.band}-title`)
const isWaiting = computed(() => props.band === "waiting")
//// Neoffice — the band takes the room of the band in preparation when it is the one in preparation, or the only one on the screen
const isRoomy = computed(() => !isWaiting.value || props.alone)

// The size of the band on the screen: a fixed share of the height when the bands are one above the other, the columns of
// the shared grid its side spans when they are side by side (utils/ticketLayout)
const sectionClass = computed(() => {
	if (props.mode === "column")
		return isRoomy.value ? TICKET_SPLIT_PRODUCTION : TICKET_SPLIT_WAITING
	return isWaiting.value ? BAND_WAITING_HEIGHT : BAND_PRODUCTION_HEIGHT
})
const scrollerClass = computed(() => {
	if (props.mode === "lane") return `${TICKET_LANE} flex-1 min-h-0`
	return [
		isRoomy.value ? TICKET_COLUMN_PRODUCTION : TICKET_COLUMN_WAITING,
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
//// Neoffice — a ticket of more than `WIDE_TICKET_LINES` dishes takes two columns in the band of the tickets IN PREPARATION, where the cooks work and the room is (task 38a-3, ruling 107).
//// The band of the tickets waiting is one ticket wide in the side-by-side layout and keeps its long tickets one wide, their dishes scrolling inside them. A band whose area holds fewer than
//// three columns (a narrow screen, a big text size) has no wide ticket either: it would leave no room beside it. Nothing is wide until the area has been measured.
const { columns } = useColumnsThatFit(scroller)
//// Neoffice — by the dishes still to cook only (kitchen test, 01.11): the dishes already sent to the runner stay on the ticket, struck through, and widened the card
const isWide = (order) =>
	isRoomy.value && isWideTicket(kitchenLiveLineCount(order), columns.value)
const ahead = ref(0)
const behind = ref(0)
const { oldestRight } = useTicketSide()
watch(oldestRight, () => nextTick(measure), { flush: "post" })
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
	//// Neoffice — drawn from the right, the tickets already scrolled past (the oldest) are those cut by the right edge: what the geometry calls ahead and behind is the other way round
	ahead.value = oldestRight.value ? counts.behind : counts.ahead
	behind.value = oldestRight.value ? counts.ahead : counts.behind
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
