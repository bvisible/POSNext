<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The header bar of the open table (or takeaway ticket), at the top of -->
	<!-- //// its order view: its name, how many lines it holds, the status of the kitchen, and on the right the two things a -->
	<!-- //// waiter reaches for: the QR button of the table and "Back". The QR button used to sit at the right end of the row -->
	<!-- //// of the restaurant's cards, where a few cards (or one more button) pushed it off a phone's screen; here it is -->
	<!-- //// always in view, whatever the width, and it is a 44 px touch target (NeoRestau lot 1, product owner: a waiter -->
	<!-- //// shows the table's code on his phone to the guests, who scan it). It was in POSSale.vue (c5208ba7 2026-03-28). -->
	<div
		class="flex items-center justify-between gap-2 px-4 py-3 border-b-2"
		:class="
			isTakeaway
				? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-300'
				: 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
		"
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
		</div>
		<div class="flex flex-shrink-0 items-center gap-2">
			<!-- The QR code of the table: always here, never in the row of the cards, at every width -->
			<button
				v-if="showQr"
				type="button"
				data-test="table-qr-button"
				class="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-[10px] border border-[#DCD4C7] bg-white px-3 text-sm font-semibold text-[#141414] transition-colors hover:bg-[#F6F3ED] active:bg-[#ECE7DE]"
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
			<!-- //// Neoffice — Back is the way out of the table, and it was frappe-ui's grey "subtle" button on a tinted bar: it melted into it (Daniel, 01.11: « faire le bouton retour plus visible »). It is now the solid ink button of the design system (the one the dialogs' primary action wears), with an arrow, as high as the QR button. -->
			<button
				type="button"
				data-test="table-back-button"
				class="inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center gap-1.5 rounded-[10px] bg-[#141414] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2B2B2B] active:bg-black"
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
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"

defineProps({
	// The table's label, or the takeaway ticket's number
	title: { type: [String, Number], default: "" },
	isTakeaway: { type: Boolean, default: false },
	itemCount: { type: Number, default: 0 },
	// The kitchen status of the order as the server writes it (it picks the colour), and the label to show for it
	kdsStatus: { type: String, default: "" },
	kdsStatusLabel: { type: String, default: "" },
	// Whether the table can show a QR code: the restaurant has QR ordering on, and a table (not a ticket) is open
	showQr: { type: Boolean, default: false },
})

const emit = defineEmits(["qr", "back"])
</script>
