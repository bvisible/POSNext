<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The small toast that offers « Undo » for five seconds after a ticket was marked ready or delivered (NeoRestau lot 1, task 38a-2, -->
	<!-- //// ruling 112). It says what just happened (« Table 22 · To deliver »), has one button of 44 px, and a thin bar that runs out with the time left. It is drawn by the page, not by -->
	<!-- //// the card: the ticket leaves the card's band the moment it is pressed. Ink on paper like the « +N lines » hint, so it is not taken for a status colour. -->
	<div aria-live="polite" role="status" class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
		<div v-if="offer" :key="offer.id" data-test="undo-toast"
			class="pointer-events-auto relative flex max-w-full items-center gap-3 overflow-hidden rounded-xl bg-gray-800 py-1.5 pl-4 pr-1.5 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-gray-800">
			<span data-test="undo-message" class="min-w-0 truncate">{{ offer.message }}</span>
			<button type="button" data-test="undo-button"
				class="inline-flex h-11 flex-none touch-manipulation items-center rounded-lg border border-white/40 px-4 text-sm font-bold text-white active:bg-white/20 dark:border-gray-800/40 dark:text-gray-800 dark:active:bg-gray-800/10"
				@click="undo">
				{{ __("Undo") }}
			</button>
			<span data-test="undo-bar" aria-hidden="true"
				class="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-white/60 dark:bg-gray-800/50"
				:style="{ width: bar, transition: `width ${UNDO_MS}ms linear` }"></span>
		</div>
	</div>
</template>

<script setup>
import { nextTick, ref, watch } from "vue"
import { UNDO_MS, useUndoToast } from "@/composables/useUndoToast"

/** The toast of the screen. It says `undone` once the move is put back, so that the screen reads its tickets again. */
const emit = defineEmits(["undone"])
const { offer, undoNow } = useUndoToast()

// The bar starts full and runs out over the five seconds: set to full, then to nothing on the next frame so that the transition runs
const bar = ref("100%")
watch(
	() => offer.value?.id,
	async (id) => {
		if (id == null) return
		bar.value = "100%"
		await nextTick()
		requestAnimationFrame(() => {
			bar.value = "0%"
		})
	},
	{ immediate: true },
)

async function undo() {
	if (await undoNow()) emit("undone")
}
</script>
