<template>
	<!-- //// Neoffice — added file (no upstream equivalent). What the print button of a kitchen or runner ticket draws (NeoResto lot 1, task 44), as the bill's printer button does (InvoiceCart,
	     ruling 97): a spinner while the copy is sent and printed, a tick once printed, a warning when the printer is off or the copy did not come out, the printer when nothing is on its way. -->
	<svg v-if="phase === 'sending' || phase === 'printing'" data-test="print-copy-icon" data-icon="spinner" class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
		<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
	</svg>
	<svg v-else-if="phase === 'printed'" data-test="print-copy-icon" data-icon="tick" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
	</svg>
	<svg v-else-if="phase === 'offline' || phase === 'failed'" data-test="print-copy-icon" data-icon="warning" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5m0 3.5v.01M12 3l9.5 17h-19L12 3z" />
	</svg>
	<svg v-else data-test="print-copy-icon" data-icon="printer" class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 9V3h12v6M6 14h12v8H6z" />
	</svg>
</template>

<script setup>
/** phase: idle, sending, printing, printed, offline or failed (utils/kitchenCopy `copyState`) */
defineProps({
	phase: { type: String, default: "idle" },
})
</script>
