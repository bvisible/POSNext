<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The header bar of the open table (or takeaway ticket), at the top of -->
	<!-- //// its order view: its name, how many lines it holds, the status of the kitchen, and on the right the two things a -->
	<!-- //// waiter reaches for: the QR button of the table and "Back". The QR button used to sit at the right end of the row -->
	<!-- //// of the restaurant's cards, where a few cards (or one more button) pushed it off a phone's screen; here it is -->
	<!-- //// always in view, whatever the width, and it is a 44 px touch target (NeoResto lot 1, product owner: a waiter -->
	<!-- //// shows the table's code on his phone to the guests, who scan it). It was in POSSale.vue (c5208ba7 2026-03-28). -->
	<!-- //// Neoffice — the buttons of the cards sit in this bar's `middle` slot (NeoResto lot 1, product owner, 03.11.2026: « fusionner le bandeau et la ligne des cartes »): between the name and QR / Back on a wide pane, under them on a narrow one (the bar measures itself) -->
	<div
		ref="root"
		class="flex items-center justify-between gap-x-3 gap-y-2 px-4 py-2 border-b-2"
		:class="[
			wide ? 'flex-nowrap' : 'flex-wrap',
			isTakeaway
				? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300'
				: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200',
		]"
		data-test="table-header-bar"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
			<FeatherIcon
				:name="isTakeaway ? 'shopping-bag' : 'coffee'"
				class="w-5 h-5 flex-shrink-0 text-blue-600"
			/>
			<div class="min-w-0">
				<span class="text-lg font-bold text-blue-900" data-test="table-title">{{ title }}</span>
				<!-- //// Neoffice — msgid was French, now English (house rule); the French screen is unchanged, served by the translation catalogue. -->
				<span class="text-xs text-blue-700 ms-2">
					{{ itemCount }}
					{{ __("items") }}
				</span>
			</div>
			<!-- KDS Status Badge -->
			<div
				:class="[
					'px-2.5 py-1 rounded-full text-xs font-semibold text-white',
					kdsStatus === 'Pending'
						? 'bg-yellow-500'
						: kdsStatus === 'Preparing'
							? 'bg-blue-500'
							: 'bg-green-500',
				]"
			>
				{{ kdsStatusLabel }}
			</div>
			<!-- //// Neoffice — the people seated at the table (NeoResto lot 1, covers): « 3 / 4 » (people / seats) with a people icon, or a dash while nobody said; a press asks the number (the page opens the dialog). The button's title says the action, the pastille shows the state. A takeaway has no table to seat people at. -->
			<button
				v-if="!isTakeaway"
				type="button"
				data-test="covers-chip"
				class="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-[10px] border border-[#DCD4C7] bg-white px-2.5 text-sm font-semibold text-[#141414] transition-colors hover:bg-[#F6F3ED] active:bg-[#ECE7DE] sm:h-[34px] sm:min-h-[34px]"
				:title="hasCovers ? __('Change the number of people') : __('Set people')"
				:aria-label="hasCovers ? __('Change the number of people') : __('Set people')"
				@click="emit('covers')"
			>
				<FeatherIcon name="users" class="h-4 w-4 flex-shrink-0" />
				<span v-if="hasCovers" data-test="covers-chip-value" class="tabular-nums">{{ coversText }}</span>
				<span v-else data-test="covers-chip-empty" aria-hidden="true">&ndash;</span>
			</button>
		</div>
		<div
			v-if="$slots.middle"
			data-test="table-header-middle"
			class="min-w-0"
			:class="wide ? 'flex-1' : 'order-last basis-full'"
		>
			<slot name="middle" />
		</div>
		<div class="flex flex-shrink-0 items-center gap-2">
			<!-- The QR code of the table: always here, never in the row of the cards, at every width -->
			<button
				v-if="showQr"
				type="button"
				data-test="table-qr-button"
				class="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-[10px] border border-[#DCD4C7] bg-white px-3 text-sm font-semibold text-[#141414] transition-colors hover:bg-[#F6F3ED] active:bg-[#ECE7DE] sm:h-[34px] sm:min-h-[34px]"
				:title="__('Generate QR code for guest ordering')"
				:aria-label="__('Generate QR code for guest ordering')"
				@click="emit('qr')"
			>
				<svg
					class="h-5 w-5 flex-shrink-0"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
					/>
				</svg>
				<span>QR</span>
			</button>
			<!-- //// Neoffice — QR and Back are as high as the « Permanent items » card button under the bar from a tablet up (34 px: py-2 around a 12 px line and a 2 px border), the 44 px finger staying on a phone (Daniel, 01.11). -->
			<!-- //// Neoffice — Back is the way out of the table, and it was frappe-ui's grey "subtle" button on a tinted bar: it melted into it (Daniel, 01.11: « faire le bouton retour plus visible »). It is now the solid ink button of the design system (the one the dialogs' primary action wears), with an arrow, as high as the QR button. -->
			<button
				type="button"
				data-test="table-back-button"
				class="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-[10px] bg-[#141414] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2B2B2B] active:bg-black sm:h-[34px] sm:min-h-[34px]"
				:aria-label="__('Back')"
				@click="emit('back')"
			>
				<svg class="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
				</svg>
				<span>{{ __("Back") }}</span>
			</button>
		</div>
	</div>
	<!-- //// Neoffice — the counter of portions per course against the people seated (NeoResto lot 1, covers) sits in a thin row under the bar, not in it: the bar keeps QR and Back in view on a phone, and a row of chips would wrap it. -->
	<div
		v-if="$slots.counter"
		data-test="table-header-counter"
		class="flex-shrink-0 border-b border-[#ECE7DE] bg-[#FFFDF8] px-4 py-1"
	>
		<slot name="counter" />
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
//// Neoffice — the people seated at the table must be a valid count to be shown (NeoResto lot 1, covers)
import { normalizeCovers } from "@/utils/coverCounts"

// //// Neoffice — the width from which the name, the buttons of the cards and QR / Back share one line: the name and the status (about 250 px), the people pastille beside them (about 80 px), the cards with their « ⋯ » (about 310 px), QR and Back (about 180 px)
const WIDE_FROM = 900
const root = ref(null)
const wide = ref(false)
let observer = null
const measure = () => {
	if (root.value) wide.value = root.value.clientWidth >= WIDE_FROM
}
onMounted(() => {
	measure()
	if (typeof ResizeObserver !== "undefined" && root.value) {
		observer = new ResizeObserver(measure)
		observer.observe(root.value)
	}
})
onBeforeUnmount(() => observer?.disconnect())

const props = defineProps({
	// The table's label, or the takeaway ticket's number
	title: { type: [String, Number], default: "" },
	isTakeaway: { type: Boolean, default: false },
	itemCount: { type: Number, default: 0 },
	// The kitchen status of the order as the server writes it (it picks the colour), and the label to show for it
	kdsStatus: { type: String, default: "" },
	kdsStatusLabel: { type: String, default: "" },
	// Whether the table can show a QR code: the restaurant has QR ordering on, and a table (not a ticket) is open
	showQr: { type: Boolean, default: false },
	//// Neoffice — the people seated at the table and the seats it has, null when unknown (NeoResto lot 1, covers)
	covers: { type: Number, default: null },
	seats: { type: Number, default: null },
})

const emit = defineEmits(["qr", "back", "covers"])

//// Neoffice — « 3 / 4 » when the table's seats are known, « 3 » when they are not
const hasCovers = computed(() => normalizeCovers(props.covers) !== null)
const coversText = computed(() =>
	props.seats > 0 ? `${props.covers} / ${props.seats}` : String(props.covers),
)
</script>
