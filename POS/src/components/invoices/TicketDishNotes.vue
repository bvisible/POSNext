<template>
	<!-- //// Neoffice — added file (no upstream equivalent). What a ticket says under a dish (NeoResto lot 1, task 38a-2, ruling 130: one card anatomy for the kitchen and the runner). -->
	<!-- //// The kitchen card drew THREE KINDS of text itself (task 38a-1, ruling 123); the runner's card now draws the same three, and a second copy of that markup would drift, so it is -->
	<!-- //// written once, here. The OPTIONS are ink with an arrow; a REMARK or instruction is the accent, medium, with the « i »; an ALLERGY is the one red, bold, in a tinted strip of its -->
	<!-- //// own with a warning mark, so that it cannot be taken for a remark. All three are the size of the dish's own text. Options and a plain remark share a line while they fit. -->
	<!-- //// The component has two roots on purpose: they are children of the dish's grid (the quantity column, then the name), exactly where the card had them. -->
	<div v-if="options.length || (remark && !allergy)" data-test="ticket-sub"
		class="col-start-2 mt-0.5 leading-tight text-[length:var(--kds-fs-sub,12px)]">
		<span v-if="options.length" data-test="ticket-options" class="font-normal text-gray-900 dark:text-gray-100">
			<span aria-hidden="true">→</span> {{ options.join(', ') }}
		</span>
		<span v-if="remark && !allergy" data-test="ticket-remark" class="font-medium text-blue-700"
			:class="{ 'ml-2': options.length }">
			<svg data-icon="info" class="inline-block h-[1em] w-[1em] align-[-0.14em]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
			{{ remark }}
		</span>
	</div>
	<!-- //// Neoffice — dark mode (task 46): the allergy's pale red text is the dark ramp's soft red -->
	<div v-if="remark && allergy" data-test="ticket-allergy"
		class="col-span-full mt-0.5 flex items-start gap-1 rounded-md border-l-4 border-red-500 bg-red-50 px-1.5 py-0.5 font-bold leading-tight text-red-700 text-[length:var(--kds-fs-sub,12px)] dark:text-ds-danger-soft">
		<svg data-icon="warning" class="mt-[0.15em] h-[1em] w-[1em] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></svg>
		<span>{{ remark }}</span>
	</div>
</template>

<script setup>
import { computed } from "vue"
import { DEFAULT_ALLERGY_WORDS, isAllergy } from "@/utils/kitchenTextKinds"

/**
 * item:         a dish of a ticket: `posa_special_instructions` (its remark) and `posa_item_modifiers` (its options, JSON groups)
 * allergyWords: the words that make a remark an allergy (the restaurant's own list, or the default)
 */
const props = defineProps({
	item: { type: Object, required: true },
	allergyWords: { type: Array, default: () => DEFAULT_ALLERGY_WORDS },
})

const remark = computed(() => String(props.item.posa_special_instructions || "").trim())
const allergy = computed(() => isAllergy(remark.value, props.allergyWords))

// The options are the names of the choices in the groups the server keeps as JSON; what cannot be read says nothing
const options = computed(() => {
	if (!props.item.posa_item_modifiers) return []
	try {
		const groups = JSON.parse(props.item.posa_item_modifiers)
		return groups.flatMap((group) =>
			(group.options || []).map((option) => option.name || option.option_name || String(option)),
		)
	} catch {
		return []
	}
})
</script>
