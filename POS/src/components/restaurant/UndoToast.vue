<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The banner that offers « Undo » for five seconds after a ticket was marked ready or delivered (NeoResto lot 1, task 38a-2, -->
	<!-- //// ruling 112). It says what just happened (« Table 22 · To deliver »), has one big white button, and a bar that runs out with the time left. It is drawn by the page, not by -->
	<!-- //// the card: the ticket leaves the card's band the moment it is pressed. SOLID RED, on purpose (product owner, 02.11.2026: « quelque chose de pétant en rouge, beaucoup plus visuel -->
	<!-- //// pour qu'on le voie bien », after the first version, ink on paper like the « +N lines » hint, went unseen in a busy kitchen). Same look in light and dark: a red this strong -->
	<!-- //// reads on both grounds. The white of the button is `ds-paper`, not `white`: the till's dark remap (index.css) turns every `bg-white` into a grey. -->
	<div aria-live="polite" role="status" class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
		<div v-if="offer" :key="offer.id" data-test="undo-toast"
			class="undo-toast pointer-events-auto relative flex w-full max-w-xl items-center gap-4 overflow-hidden rounded-xl bg-ds-red-600 py-2 pl-5 pr-2 text-lg font-bold text-ds-paper shadow-2xl">
			<span data-test="undo-message" class="min-w-0 flex-1 truncate">{{ offer.message }}</span>
			<button type="button" data-test="undo-button"
				class="inline-flex h-14 flex-none touch-manipulation items-center rounded-lg bg-ds-paper px-6 text-base font-extrabold uppercase tracking-wide text-ds-red-700 active:bg-ds-danger-soft"
				@click="undo">
				{{ __("Undo") }}
			</button>
			<span data-test="undo-bar" aria-hidden="true"
				class="absolute inset-x-0 bottom-0 h-1.5 origin-left bg-ds-paper/80"
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

<style scoped>
/* //// Neoffice — the banner rises in and sends two red rings out, once, so that the eye is drawn to it; nothing moves for a person who asked for less motion */
@media (prefers-reduced-motion: no-preference) {
	.undo-toast {
		animation:
			undo-in 220ms ease-out,
			undo-halo 900ms ease-out 220ms 2;
	}
}

@keyframes undo-in {
	from {
		opacity: 0;
		transform: translateY(1.5rem);
	}
	to {
		opacity: 1;
		transform: none;
	}
}

@keyframes undo-halo {
	from {
		box-shadow: 0 0 0 0 rgba(193, 55, 44, 0.6);
	}
	to {
		box-shadow: 0 0 0 20px rgba(193, 55, 44, 0);
	}
}
</style>
