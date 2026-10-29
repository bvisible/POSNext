<!-- //// Neoffice — added file (no upstream equivalent). The keyboard shortcuts the till answers to, -->
<!-- //// opened from the user menu: the three that need no function key, written for the keyboard in -->
<!-- //// use (Cmd on a Mac, Ctrl elsewhere), then the F-keys for a PC keyboard. A Mac sends the F-keys -->
<!-- //// to the system and some till keyboards have no fn key at all; upstream has only the F-keys. -->
<template>
	<Dialog v-model="open" :options="{ title: __('Keyboard shortcuts'), size: 'sm' }">
		<template #body-content>
			<div class="flex flex-col gap-4">
				<ul class="flex flex-col divide-y divide-gray-100">
					<li
						v-for="row in rows"
						:key="row.label"
						class="flex items-center justify-between gap-4 py-2"
					>
						<span class="text-sm text-gray-700">{{ row.label }}</span>
						<kbd :class="keyClass" dir="ltr">{{ row.keys }}</kbd>
					</li>
				</ul>
				<div>
					<p class="mb-1 text-xs font-medium text-gray-500">
						{{ __("Function keys (PC keyboards)") }}
					</p>
					<ul class="flex flex-col divide-y divide-gray-100">
						<li
							v-for="row in rows"
							:key="row.label"
							class="flex items-center justify-between gap-4 py-2"
						>
							<span class="text-sm text-gray-700">{{ row.label }}</span>
							<kbd :class="keyClass" dir="ltr">{{ row.fKey }}</kbd>
						</li>
					</ul>
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex justify-end">
				<Button @click="open = false">{{ __("Close") }}</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { shortcutLabel } from "@/utils/shortcutKeys";
import { Button, Dialog } from "frappe-ui";
import { computed } from "vue";

const props = defineProps({
	modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue"]);

const open = computed({
	get: () => props.modelValue,
	set: (value) => emit("update:modelValue", value),
});

// The keycap look of the hint in the item search bar, a size up so that ⌘ and ↵ stay readable
const keyClass =
	"min-w-[2rem] px-2 py-0.5 text-center rounded border border-gray-300 bg-white text-sm font-medium text-gray-600 tabular-nums";

// The keys are the handlers keys POSSale gives useGlobalShortcuts, written for this keyboard
const rows = [
	{ label: __("Search items"), keys: shortcutLabel("/"), fKey: "F4" },
	{ label: __("Search customers"), keys: shortcutLabel("Mod+k"), fKey: "F8" },
	{ label: __("Proceed to payment"), keys: shortcutLabel("Mod+Enter"), fKey: "F9" },
];
</script>
