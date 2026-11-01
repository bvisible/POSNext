<template>
	<div data-test="tables-list" class="relative flex flex-col flex-1 min-h-0 bg-[#FAF3EA] text-[#141414] dark:bg-[#181b21] dark:text-ds-paper" :style="LIST_FONT">
		<!-- //// Neoffice — dark mode (NeoRestau lot 1, smoke-test fix): the list stayed cream and white in the dark mode of the till, beside a dark cart. Every surface, line and text colour of the list has its dark counterpart from the design system's dark scope (the classes are `dark:` ones beside the light ones, or tablesListLook.js's constants); the plan's canvas beside it is the same ground. The light mode draws what it drew. -->
		<!-- //// Neoffice — added file (no upstream equivalent). The list of tables of the restaurant till, as the waiter
		     //// mockup draws it (NeoRestau lot 1, task 26; product owner, 31.10.2026: « on the phone, show the list of
		     //// the tables by default rather than the plan »). The filters (« All · N », then the rooms of the plan),
		     //// the tables with something going on as cards, the most urgent first; « Soon », the reservations
		     //// arriving; then the other tables, one line each, so that « All » finds any table. A tap opens the table
		     //// as a tap on the plan does; the QR code of a table is one tap away, on its card. On a phone a bar at
		     //// the bottom opens a free table or a takeaway order. What the list shows is worked out in
		     //// utils/tablesOfTheService.js. -->
		<!-- The filters: every table with something going on, then a room of the plan -->
		<div
			data-test="room-filter"
			role="toolbar"
			:aria-label="__('Rooms')"
			class="flex items-center gap-1.5 px-4 pt-1 pb-2 overflow-x-auto flex-shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			<button
				type="button"
				data-test="room-chip"
				:aria-pressed="model.room === ALL_ROOMS"
				:class="[CHIP, model.room === ALL_ROOMS ? CHIP_ON : CHIP_OFF]"
				@click="$emit('select-room', ALL_ROOMS)"
			>
				{{ __("All · {0}", [model.activeCount]) }}
			</button>
			<button
				v-for="room in model.rooms"
				:key="room.name"
				type="button"
				data-test="room-chip"
				:aria-pressed="model.room === room.name"
				:class="[CHIP, model.room === room.name ? CHIP_ON : CHIP_OFF]"
				@click="$emit('select-room', room.name)"
			>
				{{ room.label }}
			</button>
		</div>

		<!-- //// Neoffice — the rows go in as many columns as the width holds (kitchen test, 01.11): a row stretched over a wide screen left a gap of a thousand pixels between the table and its state. A column is at least 22 rem, and no more than the width itself, so a phone keeps one column and a till two or more. The titles of the sections take the whole width. -->
		<div data-test="tables-scroll" class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-1 pb-3 grid content-start gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
			<!-- The tables with something going on, the most urgent first -->
			<TableCard
				v-for="entry in model.busy"
				:key="entry.key"
				:entry="entry"
				:qr-enabled="qrEnabled"
				:currency="currency"
				:room-code="roomCodeOf(entry)"
				@open="(table) => $emit('open-table', table)"
				@qr="(table) => $emit('show-qr', table)"
			/>

			<!-- « Soon »: the reservations that arrive within the hour -->
			<template v-if="model.soon.length">
				<div data-test="soon-title" :class="SECTION">{{ __("Soon") }}</div>
				<div
					v-for="booking in model.soon"
					:key="booking.key"
					data-test="reservation-card"
					class="rounded-[12px] border border-dashed border-[#BFB5A4] bg-[#FFFDF8] dark:border-ds-sand-400 dark:bg-[#1c1f26]"
				>
					<button
						v-if="booking.table"
						type="button"
						class="w-full flex items-center justify-between gap-2 px-[14px] py-3 text-start touch-manipulation"
						@click="$emit('open-table', booking.table)"
					>
						<span class="text-[18px] font-bold leading-tight truncate">{{ booking.title }}</span>{{ " " }}<span class="shrink-0 text-[13px] text-[#6F665A] dark:text-ds-sand-300 whitespace-nowrap">{{ booking.detail }}<template v-if="booking.late">{{ " · " }}<span data-test="late" :class="LATE_CLASS">{{ __("Late") }}</span></template></span>
					</button>
					<div v-else class="flex items-center justify-between gap-2 px-[14px] py-3">
						<span class="text-[18px] font-bold leading-tight truncate">{{ booking.title }}</span>{{ " " }}<span class="shrink-0 text-[13px] text-[#6F665A] dark:text-ds-sand-300 whitespace-nowrap">{{ booking.detail }}<template v-if="booking.late">{{ " · " }}<span data-test="late" :class="LATE_CLASS">{{ __("Late") }}</span></template></span>
					</div>
				</div>
			</template>

			<!-- The other tables (free, being cleaned, reserved), one line each -->
			<template v-if="model.others.length">
				<div data-test="others-title" :class="SECTION">{{ __("Other tables") }}</div>
				<div
					v-for="entry in model.others"
					:key="entry.key"
					data-test="table-row"
					class="flex items-center gap-1 rounded-[12px] border border-[#ECE7DE] bg-[#FFFDF8] dark:border-[rgba(255,251,245,0.14)] dark:bg-[#1c1f26]"
				>
					<button
						type="button"
						data-test="open-table"
						class="flex-1 min-w-0 min-h-[48px] flex items-center justify-between gap-2 ps-[14px] text-start touch-manipulation"
						:class="qrEnabled && entry.qr ? 'pe-1' : 'pe-[14px]'"
						@click="$emit('open-table', entry.table)"
					>
						<span class="flex min-w-0 items-baseline gap-1.5">
							<span v-if="roomCodeOf(entry)" data-test="table-room" :class="ROOM_CHIP">{{ roomCodeOf(entry) }}</span>
							<span class="text-[16px] font-semibold truncate">{{ entry.title }}</span>
						</span>{{ " " }}<span class="shrink-0 text-[13px]" :class="ROW_STATE_CLASSES[entry.tier] || 'text-[#6F665A] dark:text-ds-sand-300'">
							{{ entry.badge.text }}
						</span>
					</button>
					<button
						v-if="qrEnabled && entry.qr"
						type="button"
						data-test="table-qr"
						class="w-11 h-11 me-0.5 shrink-0 flex items-center justify-center rounded-[10px] text-[#141414] hover:bg-[#F6F3ED] active:bg-[#ECE7DE] dark:text-ds-paper dark:hover:bg-[rgba(255,251,245,0.10)] dark:active:bg-[rgba(255,251,245,0.14)] touch-manipulation"
						:aria-label="__('QR code of {0}', [entry.title])"
						:title="__('QR code of {0}', [entry.title])"
						@click="$emit('show-qr', entry.table)"
					>
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ICON_QR" />
						</svg>
					</button>
				</div>
			</template>

			<p v-if="isEmpty" data-test="tables-empty" class="col-span-full py-10 text-center text-[15px] text-[#6F665A] dark:text-ds-sand-300">
				{{ __("No table to show") }}
			</p>
		</div>

		<!-- A phone's bar: open a free table, or a takeaway order (a tablet's line holds its takeaway) -->
		<div
			v-if="phone"
			data-test="tables-bar"
			class="grid grid-cols-2 gap-2 px-4 pt-2.5 pb-[max(18px,env(safe-area-inset-bottom))] bg-[#FFFDF8] border-t border-[#ECE7DE] dark:bg-[#1c1f26] dark:border-[rgba(255,251,245,0.14)] flex-shrink-0"
		>
			<button type="button" :class="[BAR_BUTTON, takeawayEnabled ? '' : 'col-span-2']" @click="openFreeTables">
				{{ __("Open a table") }}
			</button>
			<button v-if="takeawayEnabled" type="button" :class="BAR_BUTTON" @click="$emit('start-takeaway')">
				{{ __("Takeaway") }}
			</button>
		</div>

		<!-- « Open a table »: the free tables of what is shown; the one picked is seated as the plan seats it -->
		<div
			v-if="freeTablesOpen"
			data-test="free-tables"
			role="dialog"
			aria-modal="true"
			:aria-label="__('Open a table')"
			class="absolute inset-0 z-30 flex items-end bg-[#141414]/40 dark:bg-black/60"
			@click.self="closeFreeTables"
		>
			<div class="w-full max-h-[75%] flex flex-col rounded-t-[20px] bg-[#FFFDF8] dark:bg-[#1c1f26] shadow-lg">
				<div class="flex items-center justify-between gap-2 ps-4 pe-1.5 pt-1.5 border-b border-[#ECE7DE] dark:border-[rgba(255,251,245,0.14)] flex-shrink-0">
					<span class="font-display text-[22px] leading-none">{{ __("Open a table") }}</span>
					<button
						type="button"
						data-test="free-tables-close"
						class="w-11 h-11 flex items-center justify-center rounded-[10px] text-[#524B41] hover:bg-[#F6F3ED] dark:text-ds-sand-300 dark:hover:bg-[rgba(255,251,245,0.10)]"
						:aria-label="__('Close')"
						@click="closeFreeTables"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div class="overflow-y-auto overscroll-contain p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
					<div v-if="model.free.length" class="grid grid-cols-3 gap-2">
						<button
							v-for="table in model.free"
							:key="table.name"
							type="button"
							data-test="free-table"
							class="min-h-[48px] px-2 rounded-[10px] border border-[#CBEDD7] bg-[#E9F7EE] text-[15px] font-semibold truncate touch-manipulation dark:border-ds-success/40 dark:bg-ds-success/20 dark:text-ds-success-soft"
							@click="pickFreeTable(table)"
						>
							{{ table.table_name || table.name }}
						</button>
					</div>
					<p v-else class="py-6 text-center text-[15px] text-[#6F665A] dark:text-ds-sand-300">{{ __("No free table") }}</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from "vue"
import TableCard from "@/components/restaurant/TableCard.vue"
import {
	ICON_QR,
	LATE_CLASS,
	LIST_FONT,
	ROW_STATE_CLASSES,
	ROOM_CHIP,
} from "@/components/restaurant/tablesListLook"
import { ALL_ROOMS } from "@/utils/tablesOfTheService"
import { roomCode } from "@/utils/kitchenRoomCode"

const props = defineProps({
	// What tablesOfTheService() answers: the room shown, the rooms, the count of « All », the busy tables, the
	// reservations arriving, the other tables and the free ones
	model: { type: Object, required: true },
	// The restaurant takes QR orders: each table that may have a code shows its QR button
	qrEnabled: { type: Boolean, default: false },
	currency: { type: String, default: "CHF" },
	// A phone's list ends with the bar of « Open a table » and « Takeaway »
	phone: { type: Boolean, default: false },
	takeawayEnabled: { type: Boolean, default: false },
})
const emit = defineEmits([
	"open-table",
	"show-qr",
	"start-takeaway",
	"select-room",
])

// The mockup's chips (13 px, 12 px corners, ink when chosen), 32 px high like the chips of the floor plan's line
const CHIP =
	"inline-flex items-center h-8 px-3 rounded-xl text-[13px] whitespace-nowrap flex-shrink-0 touch-manipulation"
// In dark the chosen chip is the bright paper one (« on dark, primary becomes a bright paper button », the design system's dark scope), as the kitchen's chips are
const CHIP_ON =
	"bg-[#141414] text-[#FFFDF8] border border-[#141414] dark:bg-ds-paper dark:text-ds-ink dark:border-ds-paper"
const CHIP_OFF =
	"border border-[#DCD4C7] text-[#524B41] bg-transparent dark:border-[rgba(255,251,245,0.24)] dark:text-ds-sand-300"
//// Neoffice — the room of a table, as a short code (kitchen test, 01.11): the code the server tells (the one typed on the room, else made from its name), else the one the room's
//// name gives; none when the room is not known. The same code as the kitchen's tickets (utils/kitchenRoomCode).
const roomNames = computed(() => new Map((props.model.rooms || []).map((room) => [room.name, room.label])))
function roomCodeOf(entry) {
	const table = entry?.table
	if (!table) return ""
	return table.area_code || roomCode(roomNames.value.get(table.area))
}

const SECTION =
	"col-span-full mt-1.5 text-[12px] uppercase tracking-[0.06em] text-[#6F665A] dark:text-ds-sand-300"
// The mockup's bar: 48 px, ink outline, Karla 600 15 px
const BAR_BUTTON =
	"min-h-[48px] rounded-[10px] border border-[#141414] bg-[#FFFDF8] text-[15px] font-semibold text-[#141414] active:bg-[#F6F3ED] touch-manipulation dark:border-ds-paper dark:bg-transparent dark:text-ds-paper dark:active:bg-[rgba(255,251,245,0.10)]"

const isEmpty = computed(
	() =>
		!props.model.busy.length &&
		!props.model.soon.length &&
		!props.model.others.length,
)

// ─── « Open a table » ────────────────────────────────────────────────────────
const freeTablesOpen = ref(false)

function openFreeTables() {
	freeTablesOpen.value = true
}

function closeFreeTables() {
	freeTablesOpen.value = false
}

function pickFreeTable(table) {
	closeFreeTables()
	emit("open-table", table)
}

function onKeyDown(event) {
	if (event.key === "Escape") closeFreeTables()
}

// Escape is heard on the page while the free tables are shown, and not a moment longer
watch(freeTablesOpen, (open) => {
	if (open) document.addEventListener("keydown", onKeyDown)
	else document.removeEventListener("keydown", onKeyDown)
})
onUnmounted(() => document.removeEventListener("keydown", onKeyDown))
</script>
