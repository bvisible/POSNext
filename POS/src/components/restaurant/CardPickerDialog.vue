<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The dialog the floor plan's « ⋯ » menu opens with its entry -->
	<!-- //// « Open another card » (NeoResto lot 1, task 25): the same list as the « ⋯ » of the order screen's card row, -->
	<!-- //// the same pick, through the same authorization gate. The card picked joins the row of this till until it is -->
	<!-- //// closed or the shift is, so that the next table opened shows it. -->
	<div
		v-if="picker.state.open"
		data-test="card-picker-dialog"
		role="dialog"
		aria-modal="true"
		:aria-label="__('Open another card')"
		class="fixed inset-0 z-[var(--z-dialog-content,500)] flex items-center justify-center bg-black/40 p-4"
		@click.self="picker.closeDialog()"
	>
		<div
			ref="panel"
			data-test="card-picker-panel"
			class="w-full max-w-sm rounded-xl bg-white dark:bg-gray-800 shadow-xl"
		>
			<div class="border-b border-gray-200 px-4 py-4 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
					{{ __("Open another card") }}
				</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
					{{ __("A card opened here stays on this till until you close it or the shift ends.") }}
				</p>
			</div>
			<div class="max-h-[60vh] overflow-y-auto">
				<CardPickerList :cards="cards" :busy="picker.state.busy" @pick="onPick" />
			</div>
			<div class="flex justify-end border-t border-gray-200 px-4 py-3 dark:border-gray-700">
				<button
					type="button"
					data-test="card-picker-close"
					class="rounded-lg px-4 py-2 min-h-target text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 touch-manipulation"
					@click="picker.closeDialog()"
				>
					{{ __("Close") }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import { useCardPicker } from "@/composables/useCardPicker"
import CardPickerList from "./CardPickerList.vue"

const picker = useCardPicker()
const { cards } = picker
const panel = ref(null)

// The dialog closes before the card is opened: the approval of a manager, if a rule asks for it, is the only thing on
// screen
async function onPick(card) {
	picker.closeDialog()
	await picker.pick(card)
}

function onKeyDown(event) {
	if (event.key === "Escape") picker.closeDialog()
}

// Heard on the whole page while it is open and not a moment longer
watch(
	() => picker.state.open,
	async (open) => {
		if (!open) return document.removeEventListener("keydown", onKeyDown)
		document.addEventListener("keydown", onKeyDown)
		await nextTick()
		panel.value?.querySelector('[data-test="card-option"]')?.focus()
	},
)
// Nothing left to pick, nothing to show
watch(
	() => cards.value.length,
	(count) => {
		if (!count) picker.closeDialog()
	},
)
onBeforeUnmount(() => document.removeEventListener("keydown", onKeyDown))
</script>
