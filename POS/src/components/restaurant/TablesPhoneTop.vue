<template>
	<div class="flex-shrink-0 bg-[#FAF3EA] dark:bg-[#181b21]" :style="LIST_FONT">
		<!-- //// Neoffice — dark mode (NeoResto lot 1, smoke-test fix): the strip under the ink bar, which holds the switch, was cream in the dark mode of the till; it is the ground of the list and of the plan beside it. The ink bar itself is dark in both modes. -->
		<!-- //// Neoffice — added file (no upstream equivalent). The top of the till's tables on a phone, as the waiter mockup
		     //// draws it (NeoResto lot 1, task 26): « Tables » in Forum on the ink bar, the till user's first name and the
		     //// time on the right, then the switch « List | Floor plan ». What comes under it (the filters and the list, or
		     //// the rooms and the plan) is the floor plan's (FloorPlanEditor.vue). The runner sits in the bar (fix round 1,
		     //// ruling 98): where the waiter carries the dishes, the dishes ready at the pass are his to deliver, and the
		     //// runner's screen is where they are marked delivered; the tablet's line has its Runner pill. -->
		<div data-test="phone-top-bar" class="flex items-center justify-between gap-3 px-4 py-[14px] bg-[#141414] text-[#FFFDF8]">
			<h2 data-test="phone-top-title" class="font-display text-[24px] leading-none font-normal">{{ __("Tables") }}</h2>
			<div class="flex items-center gap-2 min-w-0">
				<!-- 44 px to the finger, drawn as a 28 px pill: the bar keeps the mockup's height -->
				<button
					v-if="runner != null"
					type="button"
					data-test="phone-runner"
					class="-my-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 touch-manipulation"
					:aria-label="__('Runner · {0} ready at the pass', [runner])"
					:title="__('Runner · {0} ready at the pass', [runner])"
					@click="$emit('open-runner')"
				>
					<span class="inline-flex items-center gap-1.5 h-7 ps-2.5 pe-1 rounded-full border border-[#524B41] text-[13px] font-semibold text-[#FFFDF8]">
						{{ __("Runner") }}
						<span
							data-test="phone-runner-count"
							class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[12px] font-bold"
							:class="runner > 0 ? 'bg-[#D68A59] text-[#141414]' : 'bg-[#3A342C] text-[#DCD4C7]'"
						>{{ runner }}</span>
					</span>
				</button>
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
	// The lines waiting at the pass, where the restaurant has a runner; null where it has none (no entry)
	runner: { type: Number, default: null },
})
defineEmits(["update:view", "open-runner"])

const who = computed(() => {
	const first = String(props.userName || "")
		.trim()
		.split(/\s+/)[0]
	return [first, props.time].filter(Boolean).join(" · ")
})
</script>
