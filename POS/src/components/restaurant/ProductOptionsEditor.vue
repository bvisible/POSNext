<template>
	<Dialog :options="{ title: __('Product Options'), size: 'xl' }" :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)">
		<template #body-content>
			<div class="p-4 max-h-[70vh] overflow-y-auto">
				<div class="flex flex-col items-center justify-center py-12 text-gray-400">
					<svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
					</svg>
					<p class="text-lg font-medium">{{ __("Coming Soon") }}</p>
					<p class="text-sm">{{ __("Product options editor will be available here.") }}</p>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Dialog } from "frappe-ui"

defineProps({ modelValue: Boolean })
defineEmits(["update:modelValue"])
</script>
