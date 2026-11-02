<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The four service families of a line (Drink, Starter, Main, Dessert)
	     as four large buttons, one of them chosen (NeoResto lot 1). Used where the waiter gives a line its family: the line's
	     edit dialogs and the chip on the line. A line's family decides when the kitchen is sent it; « served with the mains » is
	     simply the family Main given to a starter. -->
	<div class="space-y-1.5">
		<div
			role="radiogroup"
			:aria-label="label"
			class="grid gap-2"
			:class="columns === 2 ? 'grid-cols-2' : 'grid-cols-4'"
		>
			<button
				v-for="family in SERVICE_FAMILIES"
				:key="family"
				type="button"
				role="radio"
				:data-family="family"
				:aria-checked="modelValue === family ? 'true' : 'false'"
				:disabled="disabled"
				class="min-h-[44px] px-2 rounded-lg border-2 text-sm font-medium transition-all touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
				:class="
					modelValue === family
						? 'border-blue-500 bg-blue-50 text-blue-700'
						: 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
				"
				@click.stop="$emit('update:modelValue', family)"
			>
				{{ familyLabel(family) }}
			</button>
		</div>
		<p v-if="hint" class="text-xs text-gray-500">{{ servedWithTheMainsHint() }}</p>
	</div>
</template>

<script setup>
import { computed } from "vue"
import {
	SERVICE_FAMILIES,
	familyLabel,
	servedWithTheMainsHint,
	serviceLabel,
} from "@/utils/serviceFamilies"

defineProps({
	// The family chosen ("" for a line that has none)
	modelValue: { type: String, default: "" },
	// Four in a row (a dialog) or two by two (the chip's small menu)
	columns: { type: Number, default: 4 },
	// The line has left for the kitchen: it keeps the family it was sent under
	disabled: { type: Boolean, default: false },
	// The short help that tells how to serve a starter with the mains
	hint: { type: Boolean, default: true },
})
defineEmits(["update:modelValue"])

const label = computed(() => serviceLabel())
</script>
