<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The runner screen: what the kitchen -->
	<!-- //// has finished and somebody must now carry to a table. Upstream POSNext has no -->
	<!-- //// preparation workflow at all. One card per ready batch, grouped either by table or by -->
	<!-- //// preparation station (the station colour tints the header), with the time since it was -->
	<!-- //// marked Ready turning orange past 5 minutes and red past 10, so nothing sits under the -->
	<!-- //// pass. Modifiers arrive as JSON groups and are flattened to readable names before -->
	<!-- //// display (d59036f1, 2026-03-23 "preparation workflows, runner display, and workflow -->
	<!-- //// APIs"; fbba3b7a, 2026-03-23, for the modifier names). -->
	<!-- //// Neoffice — the card has the anatomy of the kitchen's, top to bottom (task 38a-2, ruling 130): (1) a HEADER of one line, the room's code as a small chip, the table big and -->
	<!-- //// bold, the ticket's number, the timer at the right: no invoice name (ruling 122), no « Ready » pill (every card of this screen is ready, the green border says it); (2) the -->
	<!-- //// ACTION ROW directly under it, which never scrolls: « Deliver » (« Hand over » for a takeaway) taking the width, and the print button (task 44; drawn when `canPrint`) -->
	<!-- //// at its right; (3) the DISHES, which scroll inside the card with the « +N lines » strip when they are too many, the card never growing past the screen; nothing at the bottom. The -->
	<!-- //// button was at the foot of the card, hidden under the dishes of a long ticket, which is the one a runner needs to reach. The quantity stands BEFORE the name, as on the -->
	<!-- //// kitchen ticket, and the station is a small colour dot before the dish (its three letters too in the large sizes), nothing in a view filtered on one station. -->
	<!-- //// Neoffice — the card has TWO forms, as the kitchen's (task 38a-3, ruling 107 layer 3): the card of the board, and the same ticket opened FULL SCREEN over it (`fullscreen`), which the board's card draws by rendering itself -->
	<!-- //// inside TicketFullScreen: the dishes, the buttons and the calls are written once. The panel is bigger (its own CSS variables, `fullScreenVariables`), has an × beside its buttons and lays its dishes out in columns side by side. -->
	<div class="flex min-h-0 flex-col border-green-500 bg-white dark:bg-gray-800"
		:class="fullscreen ? ['flex-1 overflow-hidden rounded-2xl border-l-[6px] shadow-xl', FULLSCREEN_FRAME.card] : 'rounded-xl border-l-4 shadow-sm'"
		:style="fullscreen ? fullVariables : undefined"
		:data-test="fullscreen ? 'ticket-panel' : 'runner-ticket'">
		<!-- Header and action row: the top of the card, tinted -->
		<div class="flex-shrink-0 rounded-tr-xl"
			:class="viewMode === 'station' ? '' : 'bg-green-50 dark:bg-green-900/30'"
			:style="viewMode === 'station' ? { backgroundColor: (card.stationColor || '#22C55E') + '15' } : {}"
			data-test="ticket-top">
			<!-- The frame (padding, title, order number, timer, dish lines) is the one the kitchen ticket has: utils/ticketLayout -->
			<div class="border-b border-gray-100 dark:border-gray-700" :class="[TICKET_FRAME.header, KITCHEN_FRAME.header, fullscreen ? 'relative !pe-[calc(var(--kds-btn-h,44px)+20px)]' : '']" data-test="ticket-header">
				<!-- //// Neoffice — the way out of the panel is a × in the top-right corner of the header, as the kitchen ticket's (NeoResto lot 1, product owner, 05.11.2026) -->
				<button v-if="fullscreen" type="button" data-test="ticket-close"
					class="absolute end-3 top-3 flex h-[var(--kds-btn-h,44px)] w-[var(--kds-btn-h,44px)] flex-none items-center justify-center rounded-lg border border-gray-300 text-gray-700 active:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:active:bg-gray-700"
					:aria-label="__('Close')" :title="__('Close')"
					@click="emit('close')">
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
				<div class="flex items-center justify-between gap-x-1.5">
					<div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5" data-test="ticket-ref">
						<span v-if="roomChip" data-test="ticket-room"
							class="rounded-md bg-gray-100 px-1.5 text-[length:var(--kds-fs-ref,11px)] font-semibold leading-snug tracking-wide text-gray-600 dark:bg-gray-700">
							{{ roomChip }}
						</span>
						<h3 data-test="ticket-title" class="whitespace-nowrap text-gray-900 dark:text-white" :class="[TICKET_FRAME.title, KITCHEN_FRAME.title]">
							<template v-if="card.takeaway">{{ __("Takeaway") }}</template>
							<template v-else>{{ card.title }}</template>
						</h3>
						<!-- //// Neoffice — the name given to the group (« · Dupont »), beside the table's (NeoResto lot 1, notes): the kitchen ticket's own span, in the grey of the covers line, with the dark rule they wear -->
						<span v-if="!card.takeaway && card.noteName" data-test="ticket-note-name" class="whitespace-nowrap font-medium text-gray-600 dark:[&&]:!text-gray-300" :class="[TICKET_FRAME.number, KITCHEN_FRAME.number]">· {{ card.noteName }}</span>
						<!-- //// Neoffice — the people seated at the table, beside its name (NeoResto lot 1, covers): the kitchen ticket's own line, so that the pass reads the same. Wraps with the line, never pushes the number or the timer off the card. -->
						<span v-if="coversLabel" data-test="ticket-covers" class="inline-flex items-baseline gap-1 whitespace-nowrap font-medium text-gray-600 dark:[&&]:!text-gray-300" :class="[TICKET_FRAME.number, KITCHEN_FRAME.number]">
							<svg class="h-[0.95em] w-[0.95em] flex-none self-center" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
							<span>{{ coversLabel }}</span>
						</span>
						<!-- //// Neoffice — dark mode (task 46): the till's dark remap of `.text-gray-500` is `!important` (index.css), so no plain `dark:` colour reaches it; `[&&]` doubles the selector so that this variant outranks it. -->
						<span v-if="numberText" data-test="ticket-number" class="font-medium tabular-nums text-gray-500 dark:[&&]:!text-gray-300" :class="[TICKET_FRAME.number, KITCHEN_FRAME.number]">
							{{ numberText }}
						</span>
						<!-- //// Neoffice — the panel says in words where the ticket stands and how long it is, as the kitchen's does: the card has its green border for the state (task 38a-3) -->
						<span v-if="fullscreen" data-test="ticket-fs-state" class="font-semibold text-green-700 text-[length:var(--kds-fs-ref,11px)] dark:text-ds-success">
							{{ kitchenStatusLabel("Ready", { takeaway: !!card.takeaway }) }} · {{ lineCountLabel }}
						</span>
					</div>
					<span class="flex-none whitespace-nowrap" data-test="ticket-timer" :class="[TICKET_FRAME.timer, KITCHEN_FRAME.timer, waitTimeClass]">{{ elapsedTime }}</span>
				</div>
			</div>

			<!-- Action row: sticky, never in the scroll -->
			<!-- //// Neoffice — dark mode (task 46): the Button's own ink fill turns to bright paper in dark (frappe-ui's `surface-gray-7`) and `text-white` was forced on it: a blank bar. `dark:enabled:text-ink-white` gives the Button's own text colour back in dark while it is enabled. Light mode is untouched. -->
			<div class="relative flex items-stretch" :class="fullscreen ? FULLSCREEN_FRAME.actions : 'gap-1.5 px-2 pb-2 pt-0.5'" data-test="ticket-actions">
				<Button
					variant="solid"
					size="lg"
					data-test="ticket-main"
					class="min-w-0 flex-1 !h-[var(--kds-btn-h,44px)] !text-[length:var(--kds-fs-btn,14px)] font-bold text-white dark:enabled:text-ink-white"
					:class="fullscreen ? 'max-w-[520px]' : ''"
					@click="markDelivered"
					:loading="loading"
				>
					{{ mainLabel }}
				</Button>
				<!-- //// Neoffice — the PRINT BUTTON (task 44, ruling 130), the kitchen card's: a square on the button height at the right of « Deliver », drawn when the screen can print a copy of the ticket (the setting is on, off by default on the runner, and the station has a printer). One tap asks the SERVER to print; it says where the paper stands as the bill's printer button does (`printState`). -->
				<button v-if="canPrint" type="button" data-test="ticket-print"
					class="flex h-[var(--kds-btn-h,44px)] w-[var(--kds-btn-h,44px)] flex-none items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 active:bg-gray-100 disabled:opacity-70 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:active:bg-gray-700"
					:data-print-state="printState.phase" :disabled="printBusy"
					:aria-label="__('Print a copy of this ticket')" :title="__('Print a copy of this ticket')"
					@click.stop="emit('print', card)">
					<PrintCopyIcon :phase="printState.phase" />
				</button>
				<PrintCopyBubble v-if="canPrint" :state="printState" />

			</div>
		</div>

		<!-- Dishes: the part of the card that scrolls, with the hint that more follow -->
		<div class="flex min-h-0 flex-1 flex-col" data-test="ticket-scroll-area">
			<div class="relative flex min-h-0 flex-1 flex-col">
				<!-- //// Neoffice — in the panel the dishes flow in COLUMNS side by side and the body scrolls sideways (task 38a-3, ruling 107); `contents` takes the list's wrapper out of the box tree so that the dishes are the columns' own children -->
				<div ref="bodyEl" class="min-h-0 flex-1" :class="[fullscreen ? FULLSCREEN_FRAME.body : 'overflow-y-auto', TICKET_FRAME.body, KITCHEN_FRAME.body]" data-test="ticket-body"
					@scroll.passive="measureHidden">
					<div ref="linesEl" :class="fullscreen ? 'contents' : undefined">
						<!-- Table mode: one flat list of dishes, each with the dot of its station -->
						<template v-if="viewMode === 'table'">
							<!-- //// Neoffice — the dishes come in SECTIONS by family, as on the kitchen's ticket (Daniel, 01.11): `inSections` (utils/ticketFamilies) puts them in the order of the meal and tells the first dish of a labelled section (`_head`) and whether a faint rule goes above a dish (`_rule`). The label stands inside the wrapper of that first dish; the dish's row takes the pale tint of its category. A card with no family at all has no label and the rules it always had. -->
							<div v-for="item in tableItems" :key="item.name" data-ticket-line class="relative"
								:class="{ 'border-t border-gray-50 dark:border-gray-700': item._rule, 'break-inside-avoid': fullscreen }">
								<TicketSectionHeader v-if="item._head" :label="item._head.label" :family="item._head.family" :tally="tallyOf(item._head.family)" />
								<div class="grid grid-cols-[2.1em_minmax(0,1fr)] content-center gap-x-1.5 py-[var(--kds-py,3px)] rounded px-1 -mx-1"
									:class="[TICKET_FRAME.line, fullscreen ? FULLSCREEN_FRAME.line : KITCHEN_FRAME.line, lineTint(item) ? TINT_CLASS : '']"
									:style="lineTint(item)" data-test="ticket-line">
									<span class="self-start whitespace-nowrap font-bold text-gray-900 dark:text-gray-100" data-test="ticket-qty"
										:class="Number(item.qty) > 1 ? 'rounded bg-blue-100 px-1 -ml-1' : ''">{{ item.qty }}×</span>
									<span class="font-medium text-gray-900 [overflow-wrap:anywhere] dark:text-gray-100" data-test="ticket-dish-name">
										<!-- //// Neoffice — the line is bigger than what waits at the pass: « (4 of 6) » beside the quantity (kitchen test of 01.11) -->
										<span v-if="ofTheLine(item)" data-test="ticket-qty-of"
											class="mr-1 whitespace-nowrap font-semibold text-gray-500 text-[length:var(--kds-fs-ref,11px)] dark:[&&]:!text-gray-400">{{ ofTheLine(item) }}</span>
										<!-- //// Neoffice — the station is a small dot of its colour before the dish (the chips at the top carry the same dots), and its three letters too in the large sizes (`--kds-tt-d`). Not drawn in a view filtered on one station: the station is then known. -->
										<template v-if="showStation && item.preparation_station">
											<span data-test="ticket-station-dot" :title="item.station_name || item.preparation_station"
												class="mr-1 inline-block h-[0.55em] w-[0.55em] rounded-full align-[0.05em] bg-[color:var(--dot-color)] dark:bg-[color:var(--dot-on-dark)]"
												:style="{ '--dot-color': dotColor(item), '--dot-on-dark': onDark(dotColor(item)) }"></span>
											<span data-test="ticket-station-code"
												class="mr-1 -ml-0.5 text-[length:var(--kds-fs-ref,11px)] font-bold tracking-wide text-gray-500 [display:var(--kds-tt-d,none)] dark:[&&]:!text-gray-400">{{ stationCode(item) }}</span>
										</template>{{ item.item_name }}
									</span>
									<TicketDishNotes :item="item" :allergy-words="allergyWords" />
								</div>
							</div>
						</template>

						<!-- Station mode: the dishes of the station, grouped by table, each table with its own « Deliver » -->
						<template v-else>
							<div v-for="group in card.tableGroups" :key="group.tableName" class="mb-2 last:mb-0" data-test="ticket-group">
								<div class="mb-0.5 flex items-center justify-between text-[length:var(--kds-fs-ref,11px)] font-bold uppercase tracking-wider text-gray-500 dark:[&&]:!text-gray-400">
									<span>{{ group.tableName }}</span>
									<!-- //// Neoffice — dark mode (task 46): this build's palette has no `emerald`, so `text-emerald-700` and `dark:text-emerald-300` compile to nothing and the button took the grey of its row (3.1:1 on the green tint the till's dark remap gives it); the pale mint of the dark ramp reads. -->
									<button
										data-test="group-deliver"
										@click="deliverTableGroup(group)"
										class="rounded bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:text-ds-success-soft dark:hover:bg-emerald-900/60"
										:disabled="loading"
									>
										{{ __("Deliver") }}
									</button>
								</div>
								<!-- A dish is the same line here as under "By Table" and on the kitchen ticket: the frame's line -->
								<div v-for="item in groupItems.get(group)" :key="item.name" data-ticket-line class="relative"
									:class="{ 'border-t border-gray-50 dark:border-gray-700': item._rule, 'break-inside-avoid': fullscreen }">
									<TicketSectionHeader v-if="item._head" :label="item._head.label" :family="item._head.family" />
									<div class="grid grid-cols-[2.1em_minmax(0,1fr)] content-center gap-x-1.5 py-[var(--kds-py,3px)] rounded px-1 -mx-1"
										:class="[TICKET_FRAME.line, KITCHEN_FRAME.line, lineTint(item) ? TINT_CLASS : '']"
										:style="lineTint(item)" data-test="ticket-line">
										<span class="self-start whitespace-nowrap font-bold text-gray-900 dark:text-gray-100" data-test="ticket-qty"
											:class="Number(item.qty) > 1 ? 'rounded bg-blue-100 px-1 -ml-1' : ''">{{ item.qty }}×</span>
										<span class="font-medium text-gray-900 [overflow-wrap:anywhere] dark:text-gray-100" data-test="ticket-dish-name"><!-- //// Neoffice — the line is bigger than what waits at the pass: « (4 of 6) » beside the quantity (kitchen test of 01.11) -->
											<span v-if="ofTheLine(item)" data-test="ticket-qty-of"
												class="mr-1 whitespace-nowrap font-semibold text-gray-500 text-[length:var(--kds-fs-ref,11px)] dark:[&&]:!text-gray-400">{{ ofTheLine(item) }}</span>{{ item.item_name }}</span>
										<TicketDishNotes :item="item" :allergy-words="allergyWords" />
									</div>
								</div>
							</div>
						</template>
					</div>
				</div>
				<div v-if="!fullscreen && hiddenCount > 0" aria-hidden="true" data-test="ticket-more-fade"
					class="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-white to-transparent dark:from-gray-800"></div>
				<!-- //// Neoffice — « More → » says that the columns of the panel go on past its right edge (task 38a-3, ruling 107), as on the kitchen's panel: 44 px high, a tap brings the next columns in, it goes when the last one is in view -->
				<button v-if="fullscreen && moreRight" type="button" data-test="ticket-fs-more"
					class="absolute bottom-4 right-4 inline-flex min-h-[44px] touch-manipulation items-center rounded-full bg-gray-800 px-4 text-sm font-semibold text-white shadow-md dark:bg-white dark:text-gray-800"
					@click="showMoreColumns">
					{{ __("More →") }}
				</button>
			</div>
			<!-- //// Neoffice — the strip is the way into the full-screen ticket (task 38a-3, ruling 107 layer 3): a tap on « +N lines » opens the ticket over the board. It is a button now; a dish has no tap of its own here. -->
			<!-- //// Neoffice — the strip stands at the FOOT of EVERY ticket, long or short (kitchen test, 01.11): « View all » opens the ticket full screen in larger text, and « +N lines » says how many dishes are out of sight when there are some. The same on the kitchen, the bar and the pass; the TOP of the card keeps its place for the print button. -->
			<button v-if="!fullscreen" type="button" data-test="ticket-more-strip"
				class="flex h-6 w-full flex-shrink-0 touch-manipulation items-center justify-between gap-2 border-t border-gray-100 px-3 active:bg-gray-100 dark:border-gray-700 dark:active:bg-gray-700"
				@click="openFull">
				<!-- //// Neoffice — « View all » is on a card that SCROLLS, as on the kitchen's (task 38a-3, ruling 107 layer 3) -->
				<span data-test="ticket-view-all"
					class="pointer-events-none inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:[&&]:!text-gray-300">
					<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
					<!-- //// Neoffice — « View », not « View all » (Daniel, 01.11) -->
					{{ __("View", null, "Kitchen ticket strip") }}
				</span>
				<span v-if="hiddenCount > 0" data-test="ticket-more"
					class="pointer-events-none rounded-full bg-gray-800 px-2.5 py-[3px] text-xs font-bold leading-none text-white dark:bg-white dark:text-gray-800">
					{{ hiddenCount === 1 ? __("+{0} line", [1]) : __("+{0} lines", [hiddenCount]) }}
				</span>
			</button>
		</div>

		<!-- //// Neoffice — the ticket opened full screen over the board (task 38a-3, ruling 107 layer 3): THIS card again, in its full-screen form, inside the shell that takes the screen. It is fed the same card object, so the board behind and the panel never differ; when the card leaves the board it goes with it and the panel closes. -->
		<TicketFullScreen v-if="fullOpen && !fullscreen" :label="card.takeaway ? __('Takeaway') : card.title" @close="closeFull">
			<RunnerOrderCard v-bind="$props" fullscreen @close="closeFull" @print="emit('print', $event)" @delivered="emit('delivered')" />
		</TicketFullScreen>
	</div>
</template>

<script setup>
import { ref, computed, inject, nextTick, onMounted, onUnmounted, watch } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { FULLSCREEN_FRAME, KITCHEN_FRAME, TICKET_FRAME } from "@/utils/ticketLayout"
//// Neoffice — a station's colour lightened for a dark card (task 46)
import { onDark } from "@/utils/stationColors"
//// Neoffice — the card is the kitchen's anatomy (task 38a-2, ruling 130): the room's short code, the button's words, the dish's texts, the « +N lines » hint
import { roomCode } from "@/utils/kitchenRoomCode"
import { kitchenActionLabel, kitchenStatusLabel } from "@/utils/kitchenStatus"
//// Neoffice — five seconds to take back a « Deliver » (task 38a-2, ruling 112)
import { offerUndo } from "@/composables/useUndoToast"
import { dishesToPutBack, dishState, putBack } from "@/utils/kitchenUndo"
//// Neoffice — the units a line holds at the pass, and the state a delivery leaves it in (kitchen test of 01.11, a line marked ready in part)
import { orderedQty, stateAfterDelivery } from "@/utils/kitchenRunner"
import { DEFAULT_ALLERGY_WORDS } from "@/utils/kitchenTextKinds"
import { dishesOutOfSight } from "@/utils/ticketScrollHints"
import TicketDishNotes from "@/components/invoices/TicketDishNotes.vue"
//// Neoffice — the dishes in sections by family, and the pale tint of a category, as on the kitchen's ticket (Daniel, 01.11)
import TicketSectionHeader from "@/components/invoices/TicketSectionHeader.vue"
import { TINT_CLASS, inSections, tintStyle } from "@/utils/ticketFamilies"
//// Neoffice — the people seated at the table, and the count of each course against them, as the server counted them over the whole order (NeoResto lot 1, covers)
import { ticketCoversLabel, ticketTally } from "@/utils/coverCounts"
//// Neoffice — the ticket opened full screen over the board (task 38a-3, ruling 107 layer 3): its shell, the size it is drawn in, and the length it says
import TicketFullScreen from "@/components/invoices/TicketFullScreen.vue"
//// Neoffice — the print button's icon and the words under it (task 44), written once for the kitchen's card and the runner's
import PrintCopyIcon from "@/components/invoices/PrintCopyIcon.vue"
import PrintCopyBubble from "@/components/invoices/PrintCopyBubble.vue"
import { BUSY_PHASES } from "@/utils/kitchenCopy"
import { DEFAULT_TEXT_SIZE, fullScreenVariables, TEXT_SIZE_KEY } from "@/utils/kitchenTextSize"
import { runnerLineCount } from "@/utils/wideTicket"
import { elapsedLabel } from "@/utils/elapsedLabel"

const props = defineProps({
	card: {
		type: Object,
		required: true,
	},
	viewMode: {
		type: String,
		default: "table",
	},
	//// Neoffice — show the dot of the station before each dish (task 38a-2, ruling 130): the runner collects at the bar AND the kitchen, so it helps; the page turns it
	//// off in a view filtered on one station, where it says nothing
	showStation: {
		type: Boolean,
		default: true,
	},
	//// Neoffice — the screen can print a copy of the ticket (task 44, ruling 130): the print button stands at the right of the main button. The screen says it (the setting is on,
	//// the ticket's station has a printer); false, nothing is drawn. `printState` is where the copy stands (utils/kitchenCopy).
	canPrint: {
		type: Boolean,
		default: false,
	},
	printState: {
		type: Object,
		default: () => ({ phase: "idle", text: "" }),
	},
	//// Neoffice — the words that make a remark an allergy: the restaurant's own list, or the default (task 38a-1, ruling 123)
	allergyWords: {
		type: Array,
		default: () => DEFAULT_ALLERGY_WORDS,
	},
	//// Neoffice — THIS card is the ticket opened full screen over the board, not a card of the board (task 38a-3, ruling 107 layer 3): the board's card renders itself, with this set, inside the shell that
	//// takes the screen. It is bigger, has an × and lays its dishes out in columns; it has no « +N lines » strip, since nothing is cut.
	fullscreen: {
		type: Boolean,
		default: false,
	},
})

const emit = defineEmits(["delivered", "print", "close"])
//// Neoffice — a copy on its way is not asked for again (task 44)
const printBusy = computed(() => BUSY_PHASES.includes(props.printState.phase))
const { showError } = useToast()
const loading = ref(false)
//// Neoffice — the ticket opened full screen (task 38a-3, ruling 107 layer 3), as on the kitchen's card: open for as long as this card is on the board, fed the card the screen refreshes, closed with it when the
//// ticket leaves. The size of the text is the screen's, handed down (TEXT_SIZE_KEY); the panel is teleported out of the screen's root, so it carries its own, one step bigger (utils/kitchenTextSize).
const fullOpen = ref(false)
const openFull = () => {
	fullOpen.value = true
}
const closeFull = () => {
	fullOpen.value = false
}
const textSize = inject(TEXT_SIZE_KEY, ref(DEFAULT_TEXT_SIZE))
const fullVariables = computed(() => fullScreenVariables(textSize.value))
//// Neoffice — the dishes of the card drawn in sections by family (Daniel, 01.11), by table (the card's own list) and by station (each table's group of dishes); copies, the card's dishes are not changed
const tableItems = computed(() => inSections(props.card.items))
const groupItems = computed(
	() => new Map((props.card.tableGroups || []).map((group) => [group, inSections(group.items)])),
)
//// Neoffice — the pale tint of a dish's category: the inline style that carries it, `undefined` for a dish whose category has no colour (or one that is no strict #RRGGBB: it comes from user data)
const lineTint = (item) => tintStyle(item.service_color)
const lineCount = computed(() => runnerLineCount(props.card))
const lineCountLabel = computed(() =>
	lineCount.value === 1 ? __("{0} line", [1]) : __("{0} lines", [lineCount.value]),
)

const now = ref(new Date())
let timerInterval = null

const cardTime = computed(
	() => new Date(props.card.modified || props.card.creation),
)
const elapsedMinutes = computed(() =>
	Math.floor((now.value - cardTime.value) / 60000),
)

//// Neoffice — hours and minutes from the hour on (utils/elapsedLabel): a ticket left open since the day before read « 1107:52 »
const elapsedTime = computed(() => elapsedLabel(now.value - cardTime.value))

//// Neoffice — dark mode (task 46): the same lighter red and orange, and the same pulse that never dims the text, as the kitchen ticket's timer
//// (KDSOrderCard); the green is left.
const waitTimeClass = computed(() => {
	if (elapsedMinutes.value > 10)
		return "text-red-600 animate-pulse dark:text-ds-danger dark:animate-late-pulse"
	if (elapsedMinutes.value > 5) return "text-orange-500 dark:text-ds-warning"
	return "text-green-600"
})

//// Neoffice — what the header's line shows besides the table (task 38a-2, ruling 130; rulings 122, 125, 126 for the kitchen's): the room's code, and the ticket's number when
//// the order carries one. The Sales Invoice's own name is NEVER a ticket number. A station's card has no table: its count of dishes stands where the number does.
const roomChip = computed(() =>
	props.card.takeaway || props.viewMode === "station"
		? ""
		: props.card.roomCode || roomCode(props.card.roomName),
)
const numberText = computed(() => {
	if (props.viewMode === "station") return props.card.subtitle || ""
	const number = String(props.card.ticketNo || "")
	if (!number) return ""
	return props.card.takeaway ? `· ${number}` : number
})
//// Neoffice — the people seated at the table and the count of each course against them (NeoResto lot 1, covers). The card is fed the order's `covers` and `familyCounts` (the server's, over all the lines of the order); a station's card
//// gathers dishes of several tables and a takeaway has no table to seat people at: neither carries them.
const showsCovers = computed(
	() => props.viewMode !== "station" && !props.card.takeaway,
)
const coversLabel = computed(() =>
	showsCovers.value ? ticketCoversLabel(props.card.covers) : "",
)
const tallyOf = (family) =>
	showsCovers.value
		? ticketTally(
				{ covers: props.card.covers, family_counts: props.card.familyCounts },
				family,
			)
		: null
//// Neoffice — the main button's words are the kitchen's (task 38a-1, ruling 113): « Deliver », and « Hand over » for a takeaway
const mainLabel = computed(() =>
	kitchenActionLabel("deliver", { takeaway: !!props.card.takeaway }),
)

//// Neoffice — « (4 of 6) » for a line bigger than what waits at the pass: the server gives `qty` the units to carry and `ordered_qty` the line's own quantity (kitchen test of 01.11)
const ofTheLine = (item) =>
	orderedQty(item) > Number(item.qty) ? `(${__("{0} of {1}", [item.qty, orderedQty(item)])})` : ""

//// Neoffice — the colour of a dish's station, and its three letters (task 38a-2, ruling 130): the same tag the kitchen ticket writes in the view of all the stations
const dotColor = (item) => item.station_color || "#6B7280"
const stationCode = (item) => roomCode(item.station_name || item.preparation_station)

//// Neoffice — how many dishes are cut by the foot of the card (the kitchen ticket's hint), read from the boxes on the screen so that it follows the scroll and the size
const bodyEl = ref(null)
const linesEl = ref(null)
const hiddenCount = ref(0)
//// Neoffice — how many dishes the runner has scrolled by: the card still SCROLLS at the end of its dishes, where nothing is left to count (task 38a-3, ruling 107 layer 3)
const scrolledCount = ref(0)
const scrolls = computed(() => hiddenCount.value > 0 || scrolledCount.value > 0)
//// Neoffice — in the panel nothing is cut at the foot, the columns go on past the right edge: `moreRight` says whether some are out of sight there, and a tap on « More → » brings them in
const moreRight = ref(false)
function measureRight() {
	const body = bodyEl.value
	moreRight.value = !!body && body.scrollWidth - body.clientWidth - body.scrollLeft > 2
}
function showMoreColumns() {
	bodyEl.value?.scrollBy?.({ left: bodyEl.value.clientWidth * 0.8, behavior: "smooth" })
}
function measureHidden() {
	if (props.fullscreen) return measureRight()
	const { ahead, behind } = dishesOutOfSight(bodyEl.value)
	hiddenCount.value = ahead
	scrolledCount.value = behind
}
let sizeObserver = null
watch(() => props.card, () => nextTick(measureHidden), { deep: true, flush: "post" })

onMounted(() => {
	timerInterval = setInterval(() => {
		now.value = new Date()
	}, 1000)
	measureHidden()
	if (typeof ResizeObserver !== "undefined") {
		sizeObserver = new ResizeObserver(() => measureHidden())
		if (bodyEl.value) sizeObserver.observe(bodyEl.value)
		if (linesEl.value) sizeObserver.observe(linesEl.value)
	}
})

onUnmounted(() => {
	if (timerInterval) clearInterval(timerInterval)
	sizeObserver?.disconnect()
})

//// Neoffice — the toast that offers to take a delivery back for five seconds (task 38a-2, ruling 112): each dish goes back in the state it had (the card
//// does not change them itself, so they are as they were when it was pressed), one call per line. The toast is the page's: the card is gone by then.
function offerBack(message, items) {
	const entries = dishesToPutBack(
		[...new Set(items.map((item) => item._invoiceName))].map((invoice) => {
			const ofTheInvoice = items.filter((item) => item._invoiceName === invoice)
			return {
				invoice,
				//// Neoffice — what a delivery leaves each line in, and the whole state it had (status AND counters): a line cooked in part keeps its status when the runner delivers its cooked units
				//// Neoffice — and its id: the line is put back alone, not with the other lines of its dish (maintenance#2075)
				dishes: ofTheInvoice.map((item) => ({ name: item.name, item_code: item.item_code, ...stateAfterDelivery(item) })),
				before: ofTheInvoice.map((item) => dishState(item)),
			}
		}),
	)
	if (!entries.length) return
	offerUndo({
		message: `${message} · ${kitchenStatusLabel("Delivered")}`,
		undo: async () => {
			try {
				await putBack(call, entries)
				return true
			} catch (error) {
				showError(__("Failed to update item status"))
				return false
			}
		},
	})
}

async function markDelivered() {
	loading.value = true
	try {
		// The dishes as they are NOW, copied before the call: what is put back if the delivery is taken back is the state they had when it was pressed
		const delivered =
			props.viewMode === "table"
				? props.card.items.map((item) => ({ ...item, _invoiceName: props.card.invoiceName }))
				: props.card.tableGroups.flatMap((group) =>
						group.items.map((item) => ({ ...item, _invoiceName: item._invoiceName || group.invoiceName })),
					)
		if (props.viewMode === "table") {
			// Table mode: mark all items in this order as delivered
			const itemNames = props.card.items.map((i) => i.name)
			await call("pos_next.api.restaurant.mark_items_delivered", {
				invoice_name: props.card.invoiceName,
				item_names: JSON.stringify(itemNames),
			})
		} else {
			// Station mode: mark all items across all table groups
			await deliverPerInvoice(delivered)
		}
		offerBack(props.card.takeaway ? __("Takeaway") : props.card.title, delivered)
		emit("delivered")
		//// Neoffice — « Deliver » pressed in the panel is the runner's last word on the ticket: the panel closes (task 38a-3)
		if (props.fullscreen) emit("close")
	} catch (error) {
		console.error("Failed to mark delivered:", error)
		showError(__("Failed to mark items as delivered."))
	} finally {
		loading.value = false
	}
}

// A table's group can hold the lines of several orders (two drafts on one table): each order is delivered with its
// own lines, one call per invoice. The server delivers only lines of the invoice it is given (NeoResto lot 1, task 3);
// until then the group went out under its first order's invoice, with every order's lines.
async function deliverPerInvoice(items) {
	const byInvoice = {}
	for (const item of items) {
		const invoice = item._invoiceName
		if (!byInvoice[invoice]) byInvoice[invoice] = []
		byInvoice[invoice].push(item.name)
	}
	await Promise.all(
		Object.entries(byInvoice).map(([invoice, names]) =>
			call("pos_next.api.restaurant.mark_items_delivered", {
				invoice_name: invoice,
				item_names: JSON.stringify(names),
			}),
		),
	)
}

async function deliverTableGroup(group) {
	loading.value = true
	try {
		const delivered = group.items.map((item) => ({ ...item, _invoiceName: item._invoiceName || group.invoiceName }))
		await deliverPerInvoice(delivered)
		offerBack(group.tableName, delivered)
		emit("delivered")
	} catch (error) {
		console.error("Failed to deliver table group:", error)
		showError(__("Failed to mark items as delivered."))
	} finally {
		loading.value = false
	}
}
</script>
