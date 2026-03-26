<template>
	<Dialog v-model="show" :options="{ title: __('Apply Changes'), size: 'sm' }">
		<template #body-content>
			<div class="space-y-3">
				<p class="text-sm text-gray-600">
					{{ __("You changed the price or availability of this item. How should this be applied?") }}
				</p>

				<div class="space-y-2">
					<!-- This card only -->
					<button
						@click="$emit('confirm', 'local')"
						class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-amber-400 hover:bg-amber-50 text-left"
						:class="'border-gray-200'"
					>
						<div class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
							</svg>
						</div>
						<div>
							<span class="font-medium text-sm text-gray-800">{{ __("This card only") }}</span>
							<p class="text-xs text-gray-500 mt-0.5">
								{{ __("Price override for '{0}' only. Other cards keep their own prices.", [cardName]) }}
							</p>
						</div>
					</button>

					<!-- All cards / global -->
					<button
						@click="$emit('confirm', 'global')"
						class="w-full flex items-start gap-3 p-3 rounded-lg border-2 transition-all hover:border-blue-400 hover:bg-blue-50 text-left"
						:class="'border-gray-200'"
					>
						<div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<div>
							<span class="font-medium text-sm text-gray-800">{{ __("All cards (global)") }}</span>
							<p class="text-xs text-gray-500 mt-0.5">
								{{ __("Update the price list and sync across all cards that use this item.") }}
							</p>
						</div>
					</button>
				</div>
			</div>
		</template>
		<template #actions>
			<Button variant="subtle" @click="show = false">{{ __("Cancel") }}</Button>
		</template>
	</Dialog>
</template>

<script setup>
import { computed } from "vue"
import { Button, Dialog } from "frappe-ui"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	cardName: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue", "confirm"])

const show = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
})
</script>
