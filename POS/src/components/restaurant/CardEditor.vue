<template>
	<Dialog :options="{ title: __('Restaurant Cards'), size: 'xl' }" :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)">
		<template #body-content>
			<div class="p-4 max-h-[70vh] overflow-y-auto">
				<div class="flex flex-col items-center justify-center py-12 text-gray-400">
					<svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
					</svg>
					<p class="text-lg font-medium">{{ __("Coming Soon") }}</p>
					<p class="text-sm">{{ __("Restaurant card editor will be available here.") }}</p>
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
