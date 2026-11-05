<template>
	<!-- //// Neoffice — added file (no upstream equivalent). « Name of the group » (NeoResto lot 1, notes): the optional name of a group seated at the table (« Dupont », « the two couples »), shown beside its rank (« .2 Dupont ») in the
	     header, on the kitchen's and the pass's tickets and found by the search of the list of tables. The field starts at the name the group has; emptying it takes the name off. « Save » is the ink button of the neighbouring dialogs
	     (CoversDialog); « Cancel », Escape and a tap beside the dialog change nothing. -->
	<div
		data-test="note-name-dialog"
		role="dialog"
		aria-modal="true"
		:aria-label="__('Name of the group')"
		class="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 p-3 sm:items-center"
		@click.self="emit('cancel')"
		@keydown.esc.stop="emit('cancel')"
	>
		<div class="w-full max-w-[380px] rounded-[16px] bg-[#FFFDF8] p-4 shadow-xl">
			<p data-test="note-name-title" class="m-0 text-[16px] font-bold leading-snug text-[#141414]">{{ title }}</p>
			<input
				ref="field"
				v-model="text"
				type="text"
				data-test="note-name-input"
				:maxlength="NOTE_NAME_MAX"
				:disabled="busy"
				autocomplete="off"
				:aria-label="__('Name of the group')"
				:placeholder="__('Leave empty for no name')"
				class="mt-3 h-[48px] w-full min-w-0 rounded-[12px] border border-[#DCD4C7] bg-white px-3 text-[16px] text-[#141414] placeholder:text-[#6F665A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414]"
				@keydown.enter.prevent="save"
			/>
			<div class="mt-4 flex gap-2.5">
				<button
					type="button"
					data-test="note-name-cancel"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] border border-[#DCD4C7] bg-[#FFFDF8] px-3 text-[16px] font-bold text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="emit('cancel')"
				>
					{{ __("Cancel") }}
				</button>
				<button
					type="button"
					data-test="note-name-save"
					:disabled="busy"
					class="min-h-[48px] flex-1 rounded-[12px] bg-[#141414] px-3 text-[16px] font-bold text-[#FFFDF8] active:bg-[#000000] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#141414] disabled:opacity-50"
					@click="save"
				>
					{{ __("Save") }}
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue"
import { NOTE_NAME_MAX } from "@/utils/tableNotes"

/**
 * label:   the group's rank as the waiter says it (« .2 »)
 * current: the name the group has now, "" for none
 * busy:    the name is being saved: the field and the buttons wait for the answer
 */
const props = defineProps({
	label: { type: String, default: "" },
	current: { type: String, default: "" },
	busy: { type: Boolean, default: false },
})
const emit = defineEmits(["save", "cancel"])

const text = ref(props.current || "")
const field = ref(null)
const title = computed(() => __("Name of the group {0}", [props.label]))

function save() {
	if (props.busy) return
	emit("save", text.value)
}

// The field is the one focused: the waiter types the name at once
onMounted(() =>
	nextTick(() => {
		field.value?.focus?.()
		field.value?.select?.()
	}),
)
</script>
