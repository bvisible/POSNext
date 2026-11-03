<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The question « Back » asks when a dish that had left for the kitchen was taken off the order (NeoResto lot 1, product owner, 03.11.2026: the removal was dropped
	     without a word and the kitchen cooked the dish). Three answers that say what they do; staying is the one focused, as in the phone's own question about lines not sent (Ruling 90). The design system's ink and paper. -->
	<div
		data-test="leave-table-dialog"
		role="alertdialog"
		aria-modal="true"
		:aria-label="title"
		class="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center"
		@click.self="emit('stay')"
		@keydown.esc.stop="emit('stay')"
	>
		<div class="w-full max-w-[440px] rounded-[16px] bg-[#FFFDF8] p-4 shadow-xl">
			<p data-test="leave-title" class="m-0 text-[16px] font-bold leading-snug text-[#141414]">{{ title }}</p>
			<ul class="m-0 mt-3 list-none space-y-1 p-0">
				<li
					v-for="dish in removed"
					:key="`${dish.item_code}-${dish.uom}`"
					data-test="leave-removed-line"
					class="text-[15px] text-[#141414]"
				>
					{{ formatQuantity(dish.quantity) }}× {{ dish.item_name }}
				</li>
			</ul>
			<div class="mt-4 flex flex-col gap-2">
				<button
					type="button"
					data-test="leave-send"
					:disabled="busy"
					class="min-h-[48px] rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('send')"
				>
					{{ __("Send the cancellation to the kitchen") }}
				</button>
				<button
					v-if="canPutBack"
					type="button"
					data-test="leave-put-back"
					:disabled="busy"
					class="min-h-[48px] rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('put-back')"
				>
					{{ __("Put the order back as it was") }}
				</button>
				<button
					ref="stayButton"
					type="button"
					data-test="leave-stay"
					class="min-h-[48px] rounded-[12px] bg-[#141414] px-3 text-[16px] font-bold text-[#FFFDF8] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
					@click="emit('stay')"
				>
					{{ __("Stay") }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue"

/**
 * removed:    the dishes taken off, `{ item_code, item_name, quantity }` each
 * canPutBack: whether the order can be read again (a table's, not a takeaway's)
 * busy:       the cancellation is on its way: the two buttons that act wait for it
 */
const props = defineProps({
	removed: { type: Array, default: () => [] },
	canPutBack: { type: Boolean, default: true },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["send", "put-back", "stay"])

const stayButton = ref(null)
onMounted(() => nextTick(() => stayButton.value?.focus?.()))

const title = computed(() =>
	props.removed.length === 1
		? __("A dish already sent to the kitchen was removed.")
		: __("{0} dishes already sent to the kitchen were removed.", [props.removed.length])
)

// 2 and not 2.0, 1.5 as it is
const formatQuantity = (quantity) => String(Math.round((Number(quantity) || 0) * 100) / 100)
</script>
