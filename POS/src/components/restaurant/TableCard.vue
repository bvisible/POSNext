<template>
	<div
		data-test="table-card"
		class="flex items-stretch gap-1 rounded-[12px] bg-[#FFFDF8] dark:bg-[#1c1f26]"
		:class="entry.tier === 'ready' ? 'border-2 border-[#D68A59]' : 'border border-[#ECE7DE] dark:border-[rgba(255,251,245,0.14)]'"
	>
		<!-- //// Neoffice — dark mode (NeoResto lot 1, smoke-test fix): the card, its title, its details and its QR button have dark classes beside the light ones (the card's ground, its line, the paper and the secondary text of the design system's dark scope; the badge's are in tablesListLook.js); the clay edge of a table whose dishes are ready is the same in both modes. -->
		<!-- //// Neoffice — added file (no upstream equivalent). One table of the list of tables, as the waiter mockup draws
		     //// it (NeoResto lot 1, task 26): a white card, the table's name in 18 px bold, a badge on the right that says
		     //// what needs the waiter, one muted line under it (how long the table has been seated, the total of its order,
		     //// the lines on hold). A tap on the card opens the table; the QR button beside it shows the table's code. -->
		<button
			type="button"
			data-test="open-table"
			class="flex-1 min-w-0 flex flex-col justify-center gap-1 ps-[14px] py-3 text-start touch-manipulation"
			:class="canShowQR ? 'pe-1' : 'pe-[14px]'"
			@click="$emit('open', entry.table)"
		>
			<span class="flex items-center justify-between gap-2 w-full">
				<span class="flex min-w-0 items-baseline gap-1.5">
					<span v-if="roomCode" data-test="table-room" :class="ROOM_CHIP">{{ roomCode }}</span>
					<span data-test="card-title" class="text-[18px] font-bold leading-tight text-[#141414] dark:text-ds-paper truncate">
						{{ entry.title }}
					</span>
				</span>{{ " " }}<span data-test="badge" class="shrink-0 text-[13px] leading-[18px] whitespace-nowrap" :class="badgeClass">
					{{ entry.badge.text }}
				</span>
			</span>{{ details ? " " : "" }}<span v-if="details" data-test="card-details" class="block text-[13px] leading-[18px] text-[#6F665A] dark:text-ds-sand-300 truncate">
				{{ details }}
			</span>
		</button>
		<button
			v-if="canShowQR"
			type="button"
			data-test="table-qr"
			class="w-11 h-11 self-center me-1.5 shrink-0 flex items-center justify-center rounded-[10px] text-[#141414] hover:bg-[#F6F3ED] active:bg-[#ECE7DE] dark:text-ds-paper dark:hover:bg-[rgba(255,251,245,0.10)] dark:active:bg-[rgba(255,251,245,0.14)] touch-manipulation"
			:aria-label="__('QR code of {0}', [entry.title])"
			:title="__('QR code of {0}', [entry.title])"
			@click="$emit('qr', entry.table)"
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="ICON_QR" />
			</svg>
		</button>
	</div>
</template>

<script setup>
import { computed } from "vue"
import { formatCurrency } from "@/utils/currency"
import {
	ICON_QR,
	BADGE_CLASSES,
	ROOM_CHIP,
	durationOf,
} from "@/components/restaurant/tablesListLook"

const props = defineProps({
	// An entry of tablesOfTheService(): the table, its title, badge, minutes seated, total, lines on hold, and whether
	// it may have a QR code
	entry: { type: Object, required: true },
	// The restaurant takes QR orders (the button is shown only then)
	qrEnabled: { type: Boolean, default: false },
	currency: { type: String, default: "CHF" },
	// The short code of the table's room (« S01 »): none, no chip
	roomCode: { type: String, default: "" },
})
defineEmits(["open", "qr"])

const canShowQR = computed(() => props.qrEnabled && Boolean(props.entry.qr))
const badgeClass = computed(
	() => BADGE_CLASSES[props.entry.badge?.tone] || BADGE_CLASSES.neutral,
)

// What the card knows, and only that: the time since the table was seated, the total of its order, the lines on hold
// (the orange count the plan's table shows)
const details = computed(() => {
	const parts = []
	//// Neoffice — a table with several groups says how many first, and the names they were given last (NeoResto lot 1, notes: « 2 groups · 14 min · CHF 120.00 · Dupont, Martin »): the line is one line, the names are what can be cut
	if (props.entry.notesCount > 1) parts.push(__("{0} groups", [props.entry.notesCount]))
	if (props.entry.minutes != null) parts.push(durationOf(props.entry.minutes))
	if (props.entry.total != null)
		parts.push(formatCurrency(Number(props.entry.total) || 0, props.currency))
	if (props.entry.waiting > 0)
		parts.push(__("{0} waiting", [props.entry.waiting]))
	if (props.entry.notesCount > 1 && props.entry.noteNames?.length)
		parts.push(props.entry.noteNames.join(", "))
	return parts.join(" · ")
})
</script>
