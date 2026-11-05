<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The counter under the header of an open table (NeoResto lot 1, covers): how many portions the waiter has put per course against the number of people seated
	     (« Starters 3/3 ✓ · Mains 2/3 »), so that nobody is forgotten. Compact chips, one per course that has a line, in the order of the meal. Grey while it is only a count, amber while a course is short of the
	     guests, green with a check when every guest has one, and a « +N » when there are more portions than guests: no state relies on colour alone. The page hands it the chips only while the covers are set. -->
	<ul
		v-if="chips.length > 0"
		data-test="cover-counter"
		class="m-0 flex list-none flex-wrap items-center gap-1.5 p-0"
	>
		<li
			v-for="chip in chips"
			:key="chip.family"
			data-test="cover-chip"
			:data-family="chip.family"
			:data-state="chip.state"
			:class="[CHIP, TONES[chip.state]]"
		>
			<!-- The words keep a real space between them (the gap only draws it): read aloud or copied, « Starters 3/3 » stays three words and a number -->
			<span data-test="cover-chip-label">{{ `${chip.label} ` }}</span>
			<span data-test="cover-chip-count" class="font-bold tabular-nums">{{ `${chip.covers ? `${chip.count}/${chip.covers}` : chip.count} ` }}</span>
			<svg
				v-if="chip.state === 'done'"
				data-test="cover-chip-check"
				class="h-3.5 w-3.5 flex-none"
				fill="none"
				stroke="currentColor"
				stroke-width="3"
				stroke-linecap="round"
				stroke-linejoin="round"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path d="M20 6 9 17l-5-5" />
			</svg>
			<span v-else-if="chip.state === 'over'" data-test="cover-chip-over" class="font-bold tabular-nums text-[#9C2920] dark:text-ds-danger">+{{ chip.count - chip.covers }}</span>
		</li>
	</ul>
</template>

<script setup>
/**
 * chips: what utils/coverCounts `courseChips` answers (`family`, `label`, `count`, `covers`, `state`); the page hands over none while the covers are not set, and the counter is then not drawn
 */
defineProps({
	chips: { type: Array, default: () => [] },
})

// The design system's status tones (tokens/colors.css: sand, amber-50/100/700, green-50/100/700, red-700) with the dark counterparts the list of tables wears
const CHIP =
	"inline-flex items-center gap-1 whitespace-nowrap rounded-[8px] border px-2 py-[3px] text-[12px] font-semibold leading-none"
const TONES = {
	none: "border-[#DCD4C7] bg-[#F6F3ED] text-[#524B41] dark:border-transparent dark:bg-[rgba(255,251,245,0.10)] dark:text-ds-paper",
	short:
		"border-[#F8E2B4] bg-[#FCF2DD] text-[#92610C] dark:border-transparent dark:bg-ds-warning/20 dark:text-ds-warning",
	done: "border-[#CBEDD7] bg-[#E9F7EE] text-[#11663A] dark:border-transparent dark:bg-ds-success/20 dark:text-ds-success-soft",
	over: "border-dashed border-[#9C2920]/60 bg-[#F6F3ED] text-[#141414] dark:bg-[rgba(255,251,245,0.10)] dark:text-ds-paper",
}
</script>
