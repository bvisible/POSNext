<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « How many people? » (NeoResto lot 1, covers): the number of people seated at the table, asked by itself the first time a table is opened empty and from the header's
	     pastille afterwards. Big − / + buttons and a number field from 1 to 99, starting at the people already counted, else at the table's seats. The primary action is the ink button « Confirm » of the neighbouring dialogs
	     (LeaveTableDialog); the other one is « Later » when the question came by itself (it leaves the number unset: ordering is never blocked) and « Cancel » when it was asked from the header. The design system's ink and paper. -->
	<div
		data-test="covers-dialog"
		role="dialog"
		aria-modal="true"
		:aria-label="__('How many people?')"
		class="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center"
		@click.self="dismiss"
		@keydown.esc.stop="dismiss"
	>
		<div class="w-full max-w-[380px] rounded-[16px] bg-[#FFFDF8] p-4 shadow-xl">
			<!-- The table the question is about (product owner, 05.11.2026: on a phone the table behind the dialog is hidden by the scrim: « je ne sais pas quelle table j'ouvre ») -->
			<p v-if="table" data-test="covers-table" class="m-0 mb-0.5 text-[13px] font-bold uppercase leading-snug tracking-wide text-[#524B41]">{{ table }}</p>
			<p data-test="covers-title" class="m-0 text-[16px] font-bold leading-snug text-[#141414]">{{ __("How many people?") }}</p>
			<p v-if="seatsHint" data-test="covers-seats" class="m-0 mt-0.5 text-[14px] leading-snug text-[#524B41]">{{ seatsHint }}</p>

			<div class="mt-3 flex items-center justify-center gap-3" role="group" :aria-label="__('How many people?')">
				<button
					type="button"
					data-test="covers-less"
					:disabled="busy || !canStepDown"
					:aria-label="__('One less')"
					:title="__('One less')"
					class="h-[56px] w-[56px] flex-none touch-manipulation rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] text-[28px] font-bold leading-none text-[#141414] active:bg-[#ECE7DE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-40"
					@click="step(-1)"
				>
					−
				</button>
				<input
					ref="field"
					v-model="text"
					type="number"
					inputmode="numeric"
					data-test="covers-input"
					:min="COVERS_MIN"
					:max="COVERS_MAX"
					step="1"
					:disabled="busy"
					:aria-label="__('Number of people')"
					class="h-[56px] w-[96px] min-w-0 rounded-[12px] border border-[#DCD4C7] bg-white text-center text-[28px] font-bold tabular-nums text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
					@focus="$event.target.select()"
					@blur="tidy"
					@keydown.enter.prevent="confirm"
				/>
				<button
					type="button"
					data-test="covers-more"
					:disabled="busy || !canStepUp"
					:aria-label="__('One more')"
					:title="__('One more')"
					class="h-[56px] w-[56px] flex-none touch-manipulation rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] text-[28px] font-bold leading-none text-[#141414] active:bg-[#ECE7DE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-40"
					@click="step(1)"
				>
					+
				</button>
			</div>

			<div class="mt-4 flex gap-2.5">
				<button
					v-if="mode === 'open'"
					type="button"
					data-test="covers-later"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('later')"
				>
					{{ __("Later") }}
				</button>
				<button
					v-else
					type="button"
					data-test="covers-cancel"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('cancel')"
				>
					{{ __("Cancel") }}
				</button>
				<button
					ref="confirmButton"
					type="button"
					data-test="covers-confirm"
					:disabled="busy || value === null"
					class="min-h-[48px] flex-1 rounded-[12px] bg-[#141414] px-3 text-[16px] font-bold text-[#FFFDF8] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="confirm"
				>
					{{ __("Confirm") }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue"
import {
	COVERS_MAX,
	COVERS_MIN,
	clampCovers,
	normalizeCovers,
} from "@/utils/coverCounts"

/**
 * mode:    "open" when the question came by itself on a first opening (it offers « Later »), "change" when it was asked from the header (it offers « Cancel »)
 * seats:   the seats of the table (its capacity), 0 or null when unknown: the number the field starts at when nobody is counted yet, and the hint under the title
 * current: the people already counted, null when none
 * busy:    the number is being saved: the buttons wait for the answer
 */
const props = defineProps({
	// The table the question is about, as its header says it (« Table 5 », « Table 5.2 · Dupont »): nothing is written when none is given
	table: { type: String, default: "" },
	mode: { type: String, default: "change" },
	seats: { type: Number, default: null },
	current: { type: Number, default: null },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["confirm", "later", "cancel"])

const knownSeats = computed(() =>
	props.seats > 0 ? clampCovers(props.seats) : null,
)
// The people already counted, else the seats of the table, else a couple
const start = normalizeCovers(props.current) ?? knownSeats.value ?? 2

const text = ref(String(start))
const field = ref(null)
const confirmButton = ref(null)

// The number in the field, null while it is no valid one (empty, a fraction, out of bounds)
const value = computed(() => normalizeCovers(text.value))
const canStepDown = computed(
	() => value.value === null || value.value > COVERS_MIN,
)
const canStepUp = computed(
	() => value.value === null || value.value < COVERS_MAX,
)

const seatsHint = computed(() => {
	if (knownSeats.value === null) return ""
	return knownSeats.value === 1
		? __("1 seat")
		: __("{0} seats", [knownSeats.value])
})

function step(delta) {
	const from = value.value ?? clampCovers(text.value, start)
	text.value = String(clampCovers(from + delta))
}

// A field left empty or out of bounds comes back to the nearest valid number
function tidy() {
	text.value = String(clampCovers(text.value, start))
}

// A tap beside the dialog and Escape are the other answer of the mode: « Later » on a first opening, « Cancel » from the header
function dismiss() {
	emit(props.mode === "open" ? "later" : "cancel")
}

function confirm() {
	if (props.busy || value.value === null) return
	emit("confirm", value.value)
}

// The ink button is the one focused, as in the neighbouring dialogs: Enter confirms, and a soft keyboard is not raised under the waiter's finger
onMounted(() => nextTick(() => confirmButton.value?.focus?.()))
</script>
