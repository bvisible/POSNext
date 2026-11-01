<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The label that opens a section of a kitchen or runner ticket (NeoRestau lot 1, Daniel's request of 01.11: « un petit liséré, un tiret qui montre la séparation »):
	     the course in capitals, tiny and muted at the left, a thin dashed rule after it. It is drawn INSIDE the wrapper of the first dish of its section, so that in the full-screen columns it is never left alone at the foot
	     of a column. The rule is dashed like the « Send N » separator of the kitchen's card, in grey so that the two cannot be taken for one another. The size follows the text size the screen chose (`--kds-fs-ref`). -->
	<div class="flex items-center gap-1.5 px-1 pb-0.5 pt-1.5 break-inside-avoid break-after-avoid"
		data-test="ticket-section" :data-family="family">
		<!-- //// Neoffice — the colours are the screen's own greys, measured on the card in light and dark (the till's dark remap gives `text-gray-700` a light grey): 4.5:1 or more on both -->
		<span class="whitespace-nowrap text-[length:var(--kds-fs-ref,10px)] font-bold uppercase leading-none tracking-wider text-gray-700">{{ label }}</span>
		<span class="flex-1 border-t border-dashed border-gray-500 dark:border-gray-600" aria-hidden="true"></span>
	</div>
</template>

<script setup>
/**
 * label:  the course's name, as the restaurant's language writes it (utils/ticketFamilies: `sectionLabel`)
 * family: the family it stands for (Drink, Starter, Main, Dessert), for the tests and the styles that read it
 */
defineProps({
	label: { type: String, required: true },
	family: { type: String, default: "" },
})
</script>
