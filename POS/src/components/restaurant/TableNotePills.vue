<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The row of the notes of a table (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): `[.1 Dupont] [.2] [＋]`, one pill per group seated at the table, the one in front of the waiter
	     filled (ink on the paper of the header, paper on the ink of the phone's header), a ＋ at the end that opens a new group. A tap on a pill goes to that group; a long press, or the ✎ beside the current pill, names it. On a
	     wide pane a small caption under each name says the group's people and total. A finger's target is 44 px high, the pill is drawn inside it (as the phone's card pills are). The page decides when the row is drawn (two notes or more). -->
	<div
		data-test="note-pills"
		role="group"
		:aria-label="__('Groups of this table')"
		class="note-pills flex items-center gap-1.5 overflow-x-auto"
	>
		<div v-for="pill in pills" :key="pill.rank" data-test="note-pill-box" class="flex flex-none items-center">
			<button
				type="button"
				data-test="note-pill"
				:data-rank="pill.rank"
				:aria-pressed="String(pill.current)"
				:disabled="busy"
				class="flex min-h-[44px] flex-none touch-manipulation select-none items-center rounded-[12px] [-webkit-touch-callout:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-60"
				:class="onInk ? 'focus-visible:outline-[#FFFDF8]' : 'focus-visible:outline-[#141414] dark:focus-visible:outline-ds-paper'"
				@click="press(pill)"
				@pointerdown="startHold(pill)"
				@pointerup="endHold"
				@pointerleave="endHold"
				@pointercancel="endHold"
				@contextmenu.prevent
			>
				<span class="flex flex-col justify-center rounded-[12px] border px-3 py-1 text-start leading-tight transition-colors duration-100" :class="pill.current ? ON : OFF">
					<span class="flex items-baseline gap-1.5 whitespace-nowrap text-[14px]">
						<span data-test="note-pill-label" class="font-bold tabular-nums">{{ pill.label }}</span>
						<span v-if="pill.name" data-test="note-pill-name" class="max-w-[12ch] truncate font-medium">{{ pill.name }}</span>
					</span>
					<!-- The people and the total of the group, on a wide pane only: the numbers carry no word to translate -->
					<span v-if="caption && (pill.covers !== null || pill.total > 0)" data-test="note-pill-caption" class="flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums opacity-75">
						<span v-if="pill.covers !== null" class="inline-flex items-center gap-0.5">
							<svg class="h-3 w-3 flex-none" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>{{ pill.covers }}
						</span>
						<span v-if="pill.total > 0">{{ money(pill.total) }}</span>
					</span>
				</span>
			</button>
			<!-- The name of the group in front of the waiter: a small ✎ beside its pill (a long press does the same on any pill) -->
			<button
				v-if="pill.current"
				type="button"
				data-test="note-rename"
				:disabled="busy"
				:aria-label="__('Name this group')"
				:title="__('Name this group')"
				class="flex min-h-[44px] min-w-[36px] flex-none touch-manipulation items-center justify-center rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-60"
				:class="onInk ? 'text-[#FFFDF8]/80 active:bg-[#FFFDF8]/10 focus-visible:outline-[#FFFDF8]' : 'text-[#524B41] active:bg-[#ECE7DE] focus-visible:outline-[#141414] dark:text-ds-sand-300 dark:active:bg-[rgba(255,251,245,0.10)]'"
				@click="emit('rename', pill.rank)"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
			</button>
		</div>
		<!-- ＋ opens a new group (the next rank after the table's highest) -->
		<button
			v-if="canAdd"
			type="button"
			data-test="note-add"
			:disabled="busy"
			:aria-label="__('Add a group to this table')"
			:title="__('Add a group to this table')"
			class="flex min-h-[44px] min-w-[44px] flex-none touch-manipulation items-center justify-center rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-60"
			:class="onInk ? 'focus-visible:outline-[#FFFDF8]' : 'focus-visible:outline-[#141414] dark:focus-visible:outline-ds-paper'"
			@click="emit('add')"
		>
			<span class="flex h-8 w-9 items-center justify-center rounded-[12px] border border-dashed" :class="onInk ? 'border-[#FFFDF8]/50 text-[#FFFDF8]' : 'border-[#BFB5A4] text-[#141414] dark:border-[rgba(255,251,245,0.30)] dark:text-ds-paper'">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
			</span>
		</button>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount } from "vue"
import { formatCurrency } from "@/utils/currency"

/**
 * pills:    what utils/tableNotes `notePills` answers (`rank`, `label`, `name`, `covers`, `total`, `current`…)
 * canAdd:   draws the ＋ that opens a new group
 * caption:  draws the group's people and total under its name (a wide pane)
 * currency: the currency of the totals
 * onInk:    the row stands on the ink of the phone's header: the current pill is paper, the others outlined in paper
 * busy:     a group is being opened: the pills wait for the server
 */
const props = defineProps({
	pills: { type: Array, default: () => [] },
	canAdd: { type: Boolean, default: false },
	caption: { type: Boolean, default: false },
	currency: { type: String, default: "CHF" },
	onInk: { type: Boolean, default: false },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["select", "add", "rename"])

// The design system's ink and paper: the current pill is the one filled, as the chosen chip of the list of tables is (its dark counterpart is the bright paper one)
const ON = computed(() =>
	props.onInk
		? "border-[#FFFDF8] bg-[#FFFDF8] text-[#141414]"
		: "border-[#141414] bg-[#141414] text-[#FFFDF8] dark:border-ds-paper dark:bg-ds-paper dark:text-ds-ink",
)
const OFF = computed(() =>
	props.onInk
		? "border-[#FFFDF8]/35 bg-transparent text-[#FFFDF8]"
		: "border-[#DCD4C7] bg-[#FFFDF8] text-[#141414] dark:border-[rgba(255,251,245,0.24)] dark:bg-transparent dark:text-ds-sand-300",
)

const money = (amount) => formatCurrency(Number(amount) || 0, props.currency)

// A long press names the group (the ✎ is the other way): after it the tap that ends the press must not also go to the group
const HOLD_MS = 550
let timer = null
let held = false

function startHold(pill) {
	endHold()
	held = false
	timer = setTimeout(() => {
		timer = null
		held = true
		emit("rename", pill.rank)
	}, HOLD_MS)
}

function endHold() {
	if (timer) clearTimeout(timer)
	timer = null
}

function press(pill) {
	if (held) {
		held = false
		return
	}
	if (!pill.current) emit("select", pill.rank)
}

onBeforeUnmount(endHold)
</script>

<style scoped>
/* A row that scrolls sideways shows no scrollbar: a finger moves it */
.note-pills {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.note-pills::-webkit-scrollbar {
	display: none;
}
</style>
