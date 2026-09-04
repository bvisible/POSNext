<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Swiss address autocomplete for the -->
	<!-- //// POS customer forms: queries the Federal Geoportal (GeoAdmin) as the cashier types, -->
	<!-- //// then fills street, number, postcode, city and country. Upstream POSNext has no -->
	<!-- //// address lookup at all, and typing a Swiss address by hand is how a delivery goes -->
	<!-- //// nowhere. (6ed1256d, 2026-04-02 "add Swiss address autocomplete to customer creation -->
	<!-- //// forms"; b2559631 teleports the dropdown to body so it escapes the dialog overflow, -->
	<!-- //// b544e6e9 restores pointer-events on it, ac7ae319 keeps the Radix dialog open when a -->
	<!-- //// suggestion is clicked.) -->
	<div ref="wrapperRef">
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

		<!-- Teleported dropdown to avoid overflow clipping from parent containers -->
		<Teleport to="body">
			<!--
				@pointerdown.stop: this dropdown is teleported to <body>, i.e. OUTSIDE
				the Radix Dialog content subtree. Radix's DismissableLayer listens for
				`pointerdown` on document (bubble phase) and closes the dialog whenever
				the event target is not contained in the dialog. Selecting a suggestion
				would therefore close the whole CreateCustomer dialog. Stopping the
				pointerdown here keeps it from reaching that document listener so the
				dialog stays open while the address fields are filled.
			-->
			<div
				v-if="open && suggestions.length > 0"
				ref="dropdownRef"
				class="fixed bg-white border border-gray-200 rounded-neo-sm shadow-lg max-h-60 overflow-y-auto"
				:style="dropdownStyle"
				@pointerdown.stop
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
		</Teleport>
	</div>
</template>

<script setup>
import { useAddressAutocomplete } from "@/composables/useAddressAutocomplete"
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"

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
const dropdownRef = ref(null)
const dropdownPos = ref({ top: 0, left: 0, width: 0 })

const dropdownStyle = computed(() => ({
	top: `${dropdownPos.value.top}px`,
	left: `${dropdownPos.value.left}px`,
	width: `${dropdownPos.value.width}px`,
	zIndex: 99999,
	// Required companion to @pointerdown.stop on this element (see template).
	// Inside a modal Radix Dialog, Radix sets `body { pointer-events: none }`.
	// As this dropdown is teleported to <body> it inherits that, so the
	// suggestion buttons receive no pointer events and clicks fall through to
	// whatever is behind them (the city/postal inputs), never triggering
	// selectSuggestion(). pointer-events:auto makes the dropdown clickable;
	// @pointerdown.stop then keeps that click from closing the dialog. Both
	// are needed: auto alone closes the dialog, stop alone is inert.
	pointerEvents: "auto",
}))

function updateDropdownPosition() {
	if (!inputRef.value) return
	const rect = inputRef.value.getBoundingClientRect()
	dropdownPos.value = {
		top: rect.bottom + 4,
		left: rect.left,
		width: rect.width,
	}
}

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
		updateDropdownPosition()
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
	if (
		wrapperRef.value && !wrapperRef.value.contains(e.target) &&
		dropdownRef.value && !dropdownRef.value.contains(e.target)
	) {
		close()
	}
}

// Reposition dropdown when suggestions appear
watch(suggestions, async (val) => {
	if (val.length > 0) {
		updateDropdownPosition()
		await nextTick()
		open.value = true
	}
})

document.addEventListener("click", onClickOutside)
onBeforeUnmount(() => {
	document.removeEventListener("click", onClickOutside)
})
</script>
