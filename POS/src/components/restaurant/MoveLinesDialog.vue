<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Move the 3 new lines to .2? » (NeoResto lot 1, notes): asked when the waiter taps another group of the table while the cart holds lines not sent to the kitchen yet. The
	     lines already sent never move; these ones follow him if he says so. « Move them » is the ink button of the neighbouring dialogs (CoversDialog, LeaveTableDialog); « Keep them on .1 » is the other answer, and so are Escape and a tap
	     beside the dialog: nothing changes. Two buttons of 48 px, so that 1366 x 768 and a phone show it whole. -->
	<div
		data-test="move-lines-dialog"
		role="alertdialog"
		aria-modal="true"
		:aria-label="question"
		class="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center"
		@click.self="emit('keep')"
		@keydown.esc.stop="emit('keep')"
	>
		<div class="w-full max-w-[380px] rounded-[16px] bg-[#FFFDF8] p-4 shadow-xl">
			<p data-test="move-lines-question" class="m-0 text-[16px] font-bold leading-snug text-[#141414]">{{ question }}</p>
			<div class="mt-4 flex gap-2.5">
				<button
					type="button"
					data-test="move-lines-keep"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('keep')"
				>
					{{ keepText }}
				</button>
				<button
					ref="moveButton"
					type="button"
					data-test="move-lines-move"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] bg-[#141414] px-3 text-[16px] font-bold text-[#FFFDF8] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('move')"
				>
					{{ moveText }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue"

/**
 * count: how many lines not sent yet the cart holds
 * from:  the group the waiter is on and the lines are on (« .1 »)
 * to:    the group he tapped (« .2 »)
 * busy:  the other group is being opened: the buttons wait for the answer
 */
const props = defineProps({
	count: { type: Number, default: 1 },
	from: { type: String, default: "" },
	to: { type: String, default: "" },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["move", "keep"])

const moveButton = ref(null)
const one = computed(() => props.count === 1)

// The words in singular and in plural: « Move the new line to .2? », « Move the 3 new lines to .2? »
const question = computed(() =>
	one.value
		? __("Move the new line to {0}?", [props.to])
		: __("Move the {0} new lines to {1}?", [props.count, props.to]),
)
const moveText = computed(() => (one.value ? __("Move it") : __("Move them")))
const keepText = computed(() =>
	one.value ? __("Keep it on {0}", [props.from]) : __("Keep them on {0}", [props.from]),
)

// The ink button is the one focused, as in the neighbouring dialogs: Enter moves the lines
onMounted(() => nextTick(() => moveButton.value?.focus?.()))
</script>
