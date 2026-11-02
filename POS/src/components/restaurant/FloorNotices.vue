<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The notices at the top of the till when a guest orders or pays from the QR code of a table (NeoResto lot 1, Daniel, 01.11, after ordering a drink from the QR code of a table as a guest: « regarde comment la caisse sommelier reçoit l'info (popup et autre) »). -->
	<!-- //// ONE notice per table, « T2 — the guest is ordering » with the lines of the order beneath (three, then « +N »), a button that opens the table and a button that dismisses. It stands in the page's column, between the header and the work, not over it (nothing is drawn over the cart or the floor: it would hide its buttons): the work gives -->
	<!-- //// it the room it takes, and at most three stand at a time (the others are counted) so that a busy minute never takes the till from the waiter. An order the waiter has to VALIDATE is drawn stronger (an ink ring round the field) and -->
	<!-- //// kept in view before the others. The design system: the signal is a FIELD and a gesture, with ink on it (5.7:1), and every action is ink: the notice is the signal's field, its buttons ink ones, in light and in dark alike. -->
	<section v-if="notices.length" data-test="floor-notices" role="status" aria-live="polite" class="flex flex-none flex-col gap-2 px-3 pt-2">
		<TransitionGroup name="floor-notice" tag="div" class="flex flex-col gap-2">
			<div
				v-for="notice in shown"
				:key="notice.key"
				data-test="floor-notice"
				:data-notice-table="notice.table"
				:data-notice-kind="notice.kind"
				:class="[
					'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#F55D1A] py-1.5 pl-3 pr-1.5 text-[#141414] shadow-sm',
					notice.kind === 'pending' ? 'ring-2 ring-[#141414]' : '',
				]"
			>
				<component :is="iconOf(notice)" class="h-6 w-6 flex-none self-start mt-2.5" aria-hidden="true" />
				<div class="min-w-0 flex-1 basis-[220px] py-1">
					<p data-test="notice-title" class="font-display text-[22px] leading-tight max-md:text-[18px]">{{ titleOf(notice) }}</p>
					<ul v-if="linesOf(notice).shown.length" data-test="notice-lines" class="mt-0.5 text-[15px] font-medium leading-5">
						<li v-for="(line, at) in linesOf(notice).shown" :key="at" class="truncate">{{ __("{0} × {1}", [line.qty, line.item_name]) }}</li>
						<li v-if="linesOf(notice).more > 0" class="font-bold">{{ __("+{0}", [linesOf(notice).more]) }}</li>
					</ul>
				</div>
				<div class="flex flex-none items-center gap-1.5 max-md:w-full">
					<button
						v-if="notice.table !== openTable"
						type="button"
						data-test="notice-see"
						class="inline-flex h-11 min-w-[44px] flex-none touch-manipulation items-center justify-center gap-1.5 rounded-[10px] bg-[#141414] px-3 text-sm font-bold text-[#FFFDF8] active:bg-[#2b2b2b] max-md:flex-1"
						@click="emit('see', notice)"
					>
						<LucideEye class="h-5 w-5" aria-hidden="true" />
						<span>{{ __("View table") }}</span>
					</button>
					<button
						type="button"
						data-test="notice-dismiss"
						class="inline-flex h-11 min-w-[44px] flex-none touch-manipulation items-center justify-center gap-1.5 rounded-[10px] bg-[#141414] px-3 text-sm font-bold text-[#FFFDF8] active:bg-[#2b2b2b] max-md:flex-1"
						:aria-label="__('Dismiss: {0}', [tableTitleOf(notice)])"
						@click="emit('dismiss', notice.key)"
					>
						<LucideX class="h-5 w-5" aria-hidden="true" />
						<span>{{ __("Dismiss") }}</span>
					</button>
				</div>
			</div>
		</TransitionGroup>
		<p v-if="hidden > 0" data-test="notices-more" class="self-start rounded-full bg-[#141414] px-2.5 text-xs font-bold leading-5 text-[#FFFDF8]">{{ __("+{0}", [hidden]) }}</p>
	</section>
</template>

<script setup>
import { computed } from "vue"
import LucideBellRing from "~icons/lucide/bell-ring"
import LucideCircleCheck from "~icons/lucide/circle-check"
import LucideEye from "~icons/lucide/eye"
import LucideX from "~icons/lucide/x"
import { KIND_PAYMENT, KIND_PENDING, linesOf } from "@/utils/floorNotices"

/**
 * The notices of the till when a guest orders or pays (stores/floorNotices).
 *
 * notices: `{ key, kind, table, items, count, orders, partial }`, newest first; at most `max` are drawn (the orders to validate first), the others are counted
 * labelOf: the label of a table from its name (the notice names the table by what the floor shows, never by its hash)
 * openTable: the name of the table that is open in the till, if any: its notice has no « View table », the table is in front of the waiter
 * Says `see` (the notice) when its first button is pressed and `dismiss` (the notice's key) when its second is.
 */
const props = defineProps({
	notices: { type: Array, default: () => [] },
	max: { type: Number, default: 3 },
	labelOf: { type: Function, default: (table) => table },
	openTable: { type: String, default: "" },
})
const emit = defineEmits(["see", "dismiss"])

// An order to validate must not be hidden behind newer ones: it is drawn first, the others keep their order
const ordered = computed(() => [...props.notices.filter((n) => n.kind === KIND_PENDING), ...props.notices.filter((n) => n.kind !== KIND_PENDING)])
const shown = computed(() => ordered.value.slice(0, props.max))
const hidden = computed(() => Math.max(0, props.notices.length - props.max))

// The table by its label; a label that is only a number is « Table 3 », as a waiter says it
function tableTitleOf(notice) {
	const label = String(props.labelOf(notice.table) ?? notice.table)
	return /^\d+$/.test(label) ? __("Table {0}", [label]) : label
}

function titleOf(notice) {
	const table = tableTitleOf(notice)
	if (notice.kind === KIND_PAYMENT) {
		return notice.partial ? __("{0} — the guest has paid part of the bill", [table]) : __("{0} — the guest has paid", [table])
	}
	if (notice.kind === KIND_PENDING) {
		return notice.orders > 1 ? __("{0} — {1} orders to validate", [table, notice.orders]) : __("{0} — order to validate", [table])
	}
	return __("{0} — the guest is ordering", [table])
}

const iconOf = (notice) => (notice.kind === KIND_PAYMENT ? LucideCircleCheck : LucideBellRing)
</script>

<style scoped>
/* Calm and Swiss: a short fade and a few pixels of rise, no bounce, and none at all for somebody who asked for less motion */
.floor-notice-enter-active,
.floor-notice-leave-active {
	transition: opacity 200ms ease, transform 200ms ease;
}
.floor-notice-enter-from,
.floor-notice-leave-to {
	opacity: 0;
	transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
	.floor-notice-enter-active,
	.floor-notice-leave-active {
		transition: none;
	}
}
</style>
