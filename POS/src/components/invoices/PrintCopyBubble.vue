<template>
	<!-- //// Neoffice — added file (no upstream equivalent). What the state of the print button means, in words, under it (NeoResto lot 1, task 44; the bill's printer button says it above itself,
	     InvoiceCart, ruling 97): « Sending… », « Printing… », « Printed », « Printer offline: the ticket will come out when it is back (15 min) », « Not printed: … ». It hangs from the
	     action row of the ticket (the row is `relative`), at its right, over the dishes for the few seconds the state lasts; a screen reader hears it (role status). Nothing is drawn while
	     nothing is on its way. -->
	<span
		v-if="state.phase !== 'idle'"
		role="status"
		aria-live="polite"
		data-test="ticket-print-state"
		:data-print-state="state.phase"
		class="pointer-events-none absolute right-2 top-full z-20 mt-1 w-max max-w-[16rem] rounded-lg px-2 py-1 text-right text-[11px] font-semibold leading-tight shadow-md"
		:class="TONES[state.phase] || TONES.sending"
	>
		{{ state.text }}
	</span>
</template>

<script setup>
/** state: `{ phase, text }` (utils/kitchenCopy `copyState`) */
defineProps({
	state: { type: Object, required: true },
})

// The bill's own colours: green once printed, amber when the printer is off, red when it did not come out, ink while it is on its way
const TONES = {
	printed: "bg-green-600 text-white",
	offline: "bg-amber-500 text-white",
	failed: "bg-red-600 text-white",
	sending: "bg-gray-800 text-white",
	printing: "bg-gray-800 text-white",
}
</script>
