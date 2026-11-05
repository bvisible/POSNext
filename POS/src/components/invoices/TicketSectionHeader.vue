<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The label that opens a section of a kitchen or runner ticket (NeoResto lot 1, Daniel's request of 01.11: « un petit liséré, un tiret qui montre la séparation »):
	     the course in capitals, tiny and muted at the left, a thin dashed rule after it. It is drawn INSIDE the wrapper of the first dish of its section, so that in the full-screen columns it is never left alone at the foot
	     of a column. The rule is dashed like the « Send N » separator of the kitchen's card, in grey so that the two cannot be taken for one another. The size follows the text size the screen chose (`--kds-fs-ref`). -->
	<!-- //// Neoffice — a section of the KITCHEN's ticket can be pressed to take all its dishes at once (Daniel, 01.11), and a section that waits for the course before it is muted: `selectable` and `held`, both off for the runner's card -->
	<div class="flex items-center gap-1.5 px-1 pb-0.5 pt-1.5 break-inside-avoid break-after-avoid"
		:class="[selectable ? 'min-h-[40px] cursor-pointer touch-manipulation rounded active:bg-gray-100 dark:active:bg-gray-700' : '', held ? 'opacity-50' : '']"
		:role="selectable ? 'button' : undefined" :tabindex="selectable ? 0 : undefined"
		:data-selectable="selectable ? 'true' : undefined" :data-held="held ? 'true' : undefined"
		data-test="ticket-section" :data-family="family">
		<!-- //// Neoffice — the colours are the screen's own greys, measured on the card in light and dark (the till's dark remap gives `text-gray-700` a light grey): 4.5:1 or more on both -->
		<span class="whitespace-nowrap text-[length:var(--kds-fs-ref,10px)] font-bold uppercase leading-none tracking-wider text-gray-700">{{ label }}</span>
		<!-- //// Neoffice — how many portions of this course the order holds against the people seated (NeoResto lot 1, covers): « MAINS 2/3 ». The count is the server's, over all the lines of the order; amber while short of the people, green with a check when every one has a portion, a « +N » when there are more. It never relies on colour alone. -->
		<span
			v-if="tally"
			data-test="ticket-section-tally"
			:data-state="tally.state"
			class="inline-flex items-center gap-0.5 whitespace-nowrap text-[length:var(--kds-fs-ref,10px)] font-bold leading-none tabular-nums"
			:class="TALLY_TEXT[tally.state]"
		>
			<!-- A real space before the count (the gap only draws it): read aloud or copied, « Mains 2/3 » stays a word and a number -->
			{{ ` ${tallyText(tally)}` }}
			<svg v-if="tally.state === 'done'" data-test="ticket-section-tally-check" class="h-[1.1em] w-[1.1em] flex-none" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			<template v-else-if="tally.state === 'over'">{{ ` +${tally.count - tally.covers}` }}</template>
		</span>
		<span class="flex-1 border-t border-dashed border-gray-500 dark:border-gray-600" aria-hidden="true"></span>
		<!-- //// Neoffice — the number of dishes the section takes at once, when it can be pressed -->
		<span v-if="selectable && count > 1" data-test="ticket-section-count" class="text-[length:var(--kds-fs-ref,10px)] font-bold leading-none text-gray-700">{{ count }}</span>
	</div>
</template>

<script setup>
//// Neoffice — the count of a course against the people seated, and its colour (NeoResto lot 1, covers)
import { TALLY_TEXT, tallyText } from "@/utils/coverCounts"

/**
 * label:  the course's name, as the restaurant's language writes it (utils/ticketFamilies: `sectionLabel`)
 * family: the family it stands for (Drink, Starter, Main, Dessert), for the tests and the styles that read it
 */
defineProps({
	//// Neoffice — `{ count, covers, state }` of utils/coverCounts `ticketTally`: null (the default) for a drink, an order with no covers, or a course the server did not count
	tally: { type: Object, default: null },
	label: { type: String, required: true },
	family: { type: String, default: "" },
	//// Neoffice — the section can be pressed (the kitchen's card), how many dishes it holds, and whether it waits for the course before it
	selectable: { type: Boolean, default: false },
	count: { type: Number, default: 0 },
	held: { type: Boolean, default: false },
})
</script>
