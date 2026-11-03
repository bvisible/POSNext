<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The families of the open card as buttons (NeoResto lot 1, product owner, 03.11.2026: « aligner les boutons des familles avec le bouton du -->
	<!-- //// dessus des cartes… c'est un petit peu petit, on ne les voit pas très bien »). They were 10-12 px chips, 24 px high, under card buttons of 34 px: they now wear the same size, -->
	<!-- //// the same corner and the same border as a card button (RestaurantCardTabs.vue), so that the two rows read as one family of buttons. One component for both levels: the categories, -->
	<!-- //// then the sub-categories of the category chosen (`level="sub"`, which keeps its colour dot). -->
	<div
		class="px-1.5 sm:px-3 py-1.5 bg-white border-b border-gray-200"
		:data-card-chips="level"
		v-bind="level === 'sub' ? { 'data-card-subchips': '' } : {}"
	>
		<div class="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
			<button
				type="button"
				data-chip="all"
				:aria-pressed="!selected"
				class="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-neo-sm px-2 py-1.5 text-[10px] font-medium transition-[background-color,border-color] duration-75 touch-manipulation sm:px-3 sm:py-2 sm:text-xs"
				:class="!selected ? ON : OFF"
				@click="emit('select', null)"
			>
				{{ __("All") }}
			</button>
			<button
				v-for="chip in chips"
				:key="chip.label"
				type="button"
				data-chip="family"
				:aria-pressed="selected === chip.label"
				class="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-neo-sm px-2 py-1.5 text-[10px] font-medium transition-[background-color,border-color] duration-75 touch-manipulation sm:px-3 sm:py-2 sm:text-xs"
				:class="selected === chip.label ? ON : OFF"
				:style="chip.color && selected === chip.label ? { borderColor: chip.color } : null"
				@click="emit('select', chip.label)"
			>
				<span
					v-if="chip.color"
					class="h-2.5 w-2.5 flex-shrink-0 rounded-full"
					:style="{ backgroundColor: chip.color }"
				/>
				{{ chip.label }}
			</button>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";

/**
 * The families of the card: their labels (or `{ label, color }` for a family with a colour), and the one chosen (null = all). It says which one was picked
 * (`select`, with null for « All »). `level` is « top » for the categories, « sub » for the sub-categories of the one chosen.
 */
const props = defineProps({
	families: { type: Array, default: () => [] },
	selected: { type: String, default: null },
	level: { type: String, default: "top" },
});
const emit = defineEmits(["select"]);

// The two looks of a card button of RestaurantCardTabs: the one chosen (2 px border) and the others (1 px)
const ON = "border-2 border-amber-500 bg-amber-100 text-amber-800 shadow-neo";
const OFF = "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100";

const chips = computed(() =>
	props.families.map((family) =>
		typeof family === "string" ? { label: family, color: null } : family
	)
);
</script>
