<!--
  //// Neoffice — upstream's settings dialog wrote each field by hand in tabs of its own (stock, sales; ours added a
  //// restaurant tab and a printing tab) and saved them in three ways. The till's settings are now ONE screen drawn
  //// from one list of settings (NeoRestau lot 1, task 13; product owner, 30.10.2026: « the till manager does not
  //// leave the till »): TillSettingsScreen.vue, ours, with its eleven tabs, its lightbulbs and its one Save. This
  //// file keeps upstream's name and props, so that the till opens the screen as it always opened the dialog.
  //// Earlier Neoffice history of the dialog: the Restaurant tab (32f2415d, 9ae00441, 823cd5d8, 860a115b, 68786b21,
  //// 6b38498b), the cash withdrawal at closing (5783eb27), the end-of-day report (neoffice-maintenance#1235), the
  //// Printing tab (maintenance#1935), and Biome (458d81a9, 3e25c3b6).
-->
<template>
	<!-- //// Neoffice — the till's settings screen (TillSettingsScreen.vue): see the note above. -->
	<TillSettingsScreen
		:model-value="modelValue"
		:pos-profile="posProfile"
		:current-warehouse="currentWarehouse"
		:initial-tab="initialTab"
		@update:model-value="emit('update:modelValue', $event)"
	/>
</template>

<script setup>
//// Neoffice — the screen itself is ours (see the note at the top); upstream's props are kept as they were.
import TillSettingsScreen from "@/components/settings/TillSettingsScreen.vue"

defineProps({
	modelValue: Boolean,
	posProfile: String,
	currentWarehouse: String,
	//// Neoffice — opens the screen on one tab: the card editor's « edit the schedule » opens the hours (6b38498b).
	initialTab: { type: String, default: "" },
})

//// Neoffice — upstream's v-model, passed through.
const emit = defineEmits(["update:modelValue"])
</script>
