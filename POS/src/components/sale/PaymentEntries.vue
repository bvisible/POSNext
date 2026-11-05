<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The payments typed so far, under the invoice's totals in the payment dialog (NeoResto lot 1; product owner, 05.11.2026: « si on encaisse en espèces,
	     est-ce qu'il serait possible, avant la clôture du ticket, de repasser ce montant en carte ou en Twint si la personne n'a pas assez de cash ? »). One slim row per payment: the method and the amount; a
	     cash row has a button that takes it back (the amount is then to pay again, with the same method or another); a payment a terminal captured (card, TWINT) is locked: the customer has paid it, nothing here takes it back. -->
	<ul v-if="rows.length" data-test="payment-entries" class="m-0 list-none border-t border-gray-200 p-0" :aria-label="__('Payments entered')">
		<li
			v-for="row in rows"
			:key="row.index"
			data-test="payment-entry"
			:data-locked="row.locked ? 'true' : undefined"
			class="flex min-h-[40px] items-center justify-between gap-2 px-3 py-1 text-sm"
		>
			<span class="flex min-w-0 items-center gap-1.5 text-gray-700">
				<svg v-if="row.locked" data-test="payment-entry-lock" class="h-3.5 w-3.5 flex-none text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :title="__('Already collected by the terminal')"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
				<span class="truncate font-medium" data-test="payment-entry-mode">{{ __(row.mode) }}</span>
			</span>
			<span class="flex flex-none items-center gap-1">
				<span class="font-semibold tabular-nums text-gray-900" data-test="payment-entry-amount">{{ money(row.amount) }}</span>
				<button
					v-if="!row.locked"
					type="button"
					data-test="payment-entry-remove"
					class="flex h-9 w-9 flex-none touch-manipulation items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 active:bg-red-100"
					:aria-label="__('Take back this payment')"
					:title="__('Take back this payment')"
					@click="emit('remove', row.index)"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
				</button>
				<span v-else class="h-9 w-9 flex-none" aria-hidden="true"></span>
			</span>
		</li>
	</ul>
</template>

<script setup>
import { computed } from "vue"
import { entryRows } from "@/utils/paymentEntries"

/**
 * entries: the dialog's own list of typed payments (`mode_of_payment`, `amount`, `is_locked`)
 * format:  how the dialog writes an amount of money (its currency)
 */
const props = defineProps({
	entries: { type: Array, default: () => [] },
	format: { type: Function, default: (amount) => String(amount) },
})
const emit = defineEmits(["remove"])

const rows = computed(() => entryRows(props.entries))
const money = (amount) => props.format(amount)
</script>
