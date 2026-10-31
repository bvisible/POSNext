<template>
	<div class="flex-shrink-0 bg-[#FAF3EA]" :style="LIST_FONT">
		<!-- //// Neoffice — added file (no upstream equivalent). The top of the till's tables on a phone, as the waiter mockup
		     //// draws it (NeoRestau lot 1, task 26): « Tables » in Forum on the ink bar, the till user's first name and the
		     //// time on the right, then the switch « List | Floor plan ». What comes under it (the filters and the list, or
		     //// the rooms and the plan) is the floor plan's (FloorPlanEditor.vue). -->
		<div data-test="phone-top-bar" class="flex items-center justify-between gap-3 px-4 py-[14px] bg-[#141414] text-[#FFFDF8]">
			<h2 data-test="phone-top-title" class="font-display text-[24px] leading-none font-normal">{{ __("Tables") }}</h2>
			<span data-test="phone-top-user" class="text-[13px] text-[#DCD4C7] truncate">{{ who }}</span>
		</div>
		<div class="px-4 pt-3 pb-1.5">
			<TablesViewSwitch size="phone" :view="view" @update:view="(next) => $emit('update:view', next)" />
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue"
import TablesViewSwitch from "@/components/restaurant/TablesViewSwitch.vue"
import { LIST_FONT } from "@/components/restaurant/tablesListLook"

const props = defineProps({
	view: { type: String, required: true },
	// The till user's name (the header's): the bar says the first name, as the mockup
	userName: { type: String, default: "" },
	// The time of the till, as the till writes it (24 h)
	time: { type: String, default: "" },
})
defineEmits(["update:view"])

const who = computed(() => {
	const first = String(props.userName || "")
		.trim()
		.split(/\s+/)[0]
	return [first, props.time].filter(Boolean).join(" · ")
})
</script>
