<template>
	<!-- //// Neoffice — the phone (NeoRestau lot 1, smoke-test fix): below 768 px the buttons are 40 px high, the touch minimum (38 px and 32 px from 768 px, as they were). -->
	<!-- //// Neoffice — added file (no upstream equivalent). The segmented control of the restaurant's service screens (NeoRestau lot 1, task 38a-2, rulings 129 and 132): a row -->
	<!-- //// of buttons in one outline, the chosen one lit in the clay of the design system. The same piece draws the SWITCH BETWEEN THE SCREENS (Preparation, Runner, -->
	<!-- //// Floor plan: where the user goes, `navigation`, the current one marked `aria-current`) and the DISPLAY MODES of a screen (by table, by station, on the plan: -->
	<!-- //// how one screen shows, `aria-pressed`), so that the two never look like each other's twin without being the same widget. `small` is the 32 px one. -->
	<div
		role="group"
		:data-test="`${name}-switch`"
		:aria-label="label"
		class="inline-flex flex-none gap-0.5 rounded-[10px] border border-gray-300 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800"
	>
		<button
			v-for="option in options"
			:key="option.id"
			type="button"
			:data-test="`${name}-${option.id}`"
			:aria-current="navigation && option.id === modelValue ? 'page' : undefined"
			:aria-pressed="navigation ? undefined : option.id === modelValue ? 'true' : 'false'"
			class="inline-flex touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-lg border font-medium transition-colors"
			:class="[
				small
					? 'h-8 px-2.5 text-[13px] max-[1024px]:px-2 max-md:h-10'
					: 'h-[38px] px-3.5 text-[13.5px] max-[1024px]:px-2.5 max-[1024px]:text-[13px] max-md:h-10',
				option.id === modelValue ? ON : OFF,
			]"
			@click="emit('update:modelValue', option.id)"
		>
			{{ option.label }}
		</button>
	</div>
</template>

<script setup>
/**
 * options:    [{ id, label }]
 * modelValue: the id lit
 * name:       the prefix of each button's `data-test` (`screen-runner`, `view-table`)
 * label:      what a screen reader calls the group
 * navigation: the buttons lead to other screens (the current one is `aria-current`), instead of choosing how this one shows
 * small:      the 32 px high one, for the display modes
 *
 * Controlled: it draws and says what was pressed. A press on the one lit is heard too (a screen that is already there simply does nothing).
 */
defineProps({
	options: { type: Array, required: true },
	modelValue: { type: String, default: "" },
	name: { type: String, default: "segment" },
	label: { type: String, default: "" },
	navigation: { type: Boolean, default: false },
	small: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue"])

// The lit one is the clay's tint with its own edge and the dark clay for the words (the design system's signal tints), the others are plain and secondary
const ON = "border-blue-400 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-400/20 dark:text-blue-100"
const OFF = "border-transparent text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
</script>
