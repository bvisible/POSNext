<!-- //// Neoffice — added file (no upstream equivalent). The cash drawer openings of the session being -->
<!-- //// closed, from the cloudprnt journal: all of them, those without a sale, those the printer did not -->
<!-- //// open. Shown next to the cash count so that a drawer opened without a sale is seen at the closing. -->
<!-- //// Nothing shows without the cloudprnt app or without any opening (maintenance#1935). -->
<template>
	<div
		v-if="summary && summary.total > 0"
		class="rounded-lg border border-gray-200 bg-white p-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm"
	>
		<span class="font-semibold text-gray-900">{{ __("Cash drawer") }}</span>
		<span class="text-gray-700">{{ __("Openings: {0}", [summary.total]) }}</span>
		<span :class="summary.without_sale ? 'font-semibold text-orange-700' : 'text-gray-700'">
			{{ __("Without a sale: {0}", [summary.without_sale]) }}
		</span>
		<span v-if="summary.not_opened" class="text-red-700">
			{{ __("Not opened: {0}", [summary.not_opened]) }}
		</span>
	</div>
</template>

<script setup>
import { call } from "frappe-ui";
import { ref, watch } from "vue";

const props = defineProps({
	openingShift: { type: String, default: "" },
});

const summary = ref(null);

watch(
	() => props.openingShift,
	async (shift) => {
		summary.value = null;
		if (!shift) return;
		try {
			summary.value = await call("cloudprnt.drawer.shift_summary", {
				pos_opening_shift: shift,
			});
		} catch {
			summary.value = null;
		}
	},
	{ immediate: true }
);
</script>
