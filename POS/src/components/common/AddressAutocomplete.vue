<template>
	<div class="relative" ref="wrapperRef">
		<input
			ref="inputRef"
			:value="modelValue"
			type="text"
			:placeholder="placeholder"
			:disabled="disabled"
			:class="inputClass"
			@input="onInput"
			@keydown.escape="close"
			@keydown.down.prevent="moveHighlight(1)"
			@keydown.up.prevent="moveHighlight(-1)"
			@keydown.enter.prevent="selectHighlighted"
			@focus="onFocus"
		/>

		<!-- Suggestions dropdown -->
		<div
			v-if="open && suggestions.length > 0"
			class="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-neo-sm shadow-lg max-h-60 overflow-y-auto z-50"
		>
			<button
				v-for="(item, idx) in suggestions"
				:key="idx"
				type="button"
				class="w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-0 cursor-pointer transition-colors"
				:class="idx === highlightedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'"
				@mousedown.prevent="selectSuggestion(item)"
				@mouseenter="highlightedIndex = idx"
			>
				<span v-html="item.label" />
			</button>
		</div>
	</div>
</template>

<script setup>
import { useAddressAutocomplete } from "@/composables/useAddressAutocomplete"
import { onBeforeUnmount, ref, watch } from "vue"

const props = defineProps({
	modelValue: { type: String, default: "" },
	placeholder: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
	inputClass: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue", "address-selected"])

const { suggestions, search, clear } = useAddressAutocomplete()
const open = ref(false)
const highlightedIndex = ref(-1)
const wrapperRef = ref(null)
const inputRef = ref(null)

function onInput(e) {
	const val = e.target.value
	emit("update:modelValue", val)
	if (val.length >= 3) {
		search(val)
		open.value = true
		highlightedIndex.value = -1
	} else {
		close()
	}
}

function onFocus() {
	if (suggestions.value.length > 0) {
		open.value = true
	}
}

function selectSuggestion(item) {
	emit("update:modelValue", item.parsed.address_line1)
	emit("address-selected", item.parsed)
	close()
}

function moveHighlight(delta) {
	if (!open.value || suggestions.value.length === 0) return
	highlightedIndex.value = Math.max(
		0,
		Math.min(suggestions.value.length - 1, highlightedIndex.value + delta),
	)
}

function selectHighlighted() {
	if (highlightedIndex.value >= 0 && highlightedIndex.value < suggestions.value.length) {
		selectSuggestion(suggestions.value[highlightedIndex.value])
	}
}

function close() {
	open.value = false
	highlightedIndex.value = -1
	clear()
}

function onClickOutside(e) {
	if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
		close()
	}
}

// Reset dropdown when suggestions change
watch(suggestions, (val) => {
	if (val.length > 0) open.value = true
})

document.addEventListener("click", onClickOutside)
onBeforeUnmount(() => {
	document.removeEventListener("click", onClickOutside)
})
</script>
