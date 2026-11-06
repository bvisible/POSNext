<template>
	<div class="flex-shrink-0 bg-[#FAF3EA] dark:bg-[#181b21]" :style="LIST_FONT">
		<!-- //// Neoffice — dark mode (NeoResto lot 1, smoke-test fix): the strip under the ink bar, which holds the switch, was cream in the dark mode of the till; it is the ground of the list and of the plan beside it. The ink bar itself is dark in both modes. -->
		<!-- //// Neoffice — added file (no upstream equivalent). The top of the till's tables on a phone, as the waiter mockup
		     //// draws it (NeoResto lot 1, task 26): « Tables » in Forum on the ink bar, the till user's first name and the
		     //// time on the right, then the switch « List | Floor plan ». What comes under it (the filters and the list, or
		     //// the rooms and the plan) is the floor plan's (FloorPlanEditor.vue). No Runner pill in the bar any more (product owner, 06.11.2026: « sur le côté serveur sur
		     //// l'app mobile, il ne faut pas les boutons d'accès runner et cuisine, ça amène trop de problème »): it took the waiter's phone to the runner's screen (fix round 1,
		     //// ruling 98), a screen made for a tablet at the pass, and the way back from it was the trouble. The dishes ready at the pass stay on the table's tile, where the waiter sees them. -->
		<div data-test="phone-top-bar" class="flex items-center justify-between gap-3 px-4 py-[14px] bg-[#141414] text-[#FFFDF8]">
			<h2 data-test="phone-top-title" class="font-display text-[24px] leading-none font-normal">{{ __("Tables") }}</h2>
			<div class="flex items-center gap-2 min-w-0">
				<span data-test="phone-top-user" class="text-[13px] text-[#DCD4C7] truncate">{{ who }}</span>
			</div>
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
