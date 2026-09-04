<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// Neoffice — the whole file is one change. Upstream's spinner is an in-flow flex child, so
  //// showing it pushed the POS content down and the layout jumped on every load; it is a
  //// fixed inset-0 overlay at z-500 instead (c524a0d4, 2026-03-24 "make LoadingSpinner a
  //// fixed overlay to prevent pushing POS content down").
  //// make LoadingSpinner a fixed overlay to prevent pushing POS content do… — c524a0d
-->
<template>
	<!-- //// Neoffice — fixed inset-0 z-[500] in place of upstream's in-flow flex-1: as a flex -->
	<!-- //// child the spinner pushed the whole POS layout down each time it appeared -->
	<!-- //// (c524a0d4, 2026-03-24). -->
	<div class="fixed inset-0 flex items-center justify-center bg-gray-50 z-[500]">
		<div class="text-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
			<p v-if="text" class="mt-4 text-sm text-gray-500">{{ text }}</p>
		</div>
	</div>
</template>

<script setup>
defineProps({
	text: {
		type: String,
		default: __("Loading..."),
	},
})
</script>
