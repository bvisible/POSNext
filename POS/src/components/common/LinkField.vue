<!--
  LinkField — a lightweight Link autocomplete for the POS, backed by Frappe's
  own `frappe.desk.search.search_link` (same endpoint the desk link fields use,
  so it respects each doctype's search settings). Session-authenticated.
-->
<template>
	<div class="relative" ref="rootRef">
		<input
			:value="query"
			@input="onInput"
			@focus="onFocus"
			@blur="onBlur"
			@keydown.down.prevent="move(1)"
			@keydown.up.prevent="move(-1)"
			@keydown.enter.prevent="chooseHighlighted"
			@keydown.esc="onBlur"
			type="text"
			:placeholder="placeholder"
			:disabled="disabled"
			autocomplete="off"
			class="w-full px-3 py-2 pe-8 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
		/>
		<button
			v-if="query && !disabled"
			type="button"
			@mousedown.prevent="clearValue"
			class="absolute inset-y-0 end-2 flex items-center text-gray-400 hover:text-gray-600"
			:aria-label="__('Clear')"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
		<!-- Chevron affordance (shown when empty) — signals a picker, not free text -->
		<div v-else class="absolute inset-y-0 end-2 flex items-center pointer-events-none text-gray-400">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
			</svg>
		</div>

		<div
			v-if="open && (results.length || loading)"
			class="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
		>
			<div v-if="loading" class="px-3 py-2 text-xs text-gray-400">{{ __('Searching…') }}</div>
			<button
				v-for="(r, idx) in results"
				:key="r.value"
				type="button"
				@mousedown.prevent="select(r)"
				:class="[
					'w-full text-start px-3 py-2 border-b border-gray-100 last:border-0',
					idx === highlighted ? 'bg-blue-100' : 'hover:bg-blue-50',
				]"
			>
				<span class="block text-sm font-medium text-gray-900 truncate">{{ r.value }}</span>
				<span v-if="r.description" class="block text-xs text-gray-500 truncate">{{ r.description }}</span>
			</button>
		</div>
	</div>
</template>

<script setup>
import { call } from "frappe-ui"
import { onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps({
	modelValue: { type: [String, null], default: "" },
	doctype: { type: String, required: true },
	placeholder: { type: String, default: "" },
	disabled: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue"])

const rootRef = ref(null)
const query = ref(props.modelValue || "")
const results = ref([])
const open = ref(false)
const loading = ref(false)
const highlighted = ref(-1)
let debounceTimer = null

watch(
	() => props.modelValue,
	(val) => {
		// Keep the visible text in sync when the parent changes the value.
		if (val !== query.value) query.value = val || ""
	},
)

async function search(txt) {
	loading.value = true
	try {
		const response = await call("frappe.desk.search.search_link", {
			doctype: props.doctype,
			txt: txt || "",
			page_length: 10,
		})
		results.value = response || []
		highlighted.value = -1
	} catch (error) {
		console.error("LinkField search failed", error)
		results.value = []
	} finally {
		loading.value = false
	}
}

function onInput(event) {
	query.value = event.target.value
	open.value = true
	if (debounceTimer) clearTimeout(debounceTimer)
	debounceTimer = setTimeout(() => search(query.value), 200)
}

function onFocus() {
	open.value = true
	if (!results.value.length) search(query.value)
}

// Enforce that the value comes from the linked doctype: on blur, any free-typed
// text that wasn't picked is discarded. If it happens to exactly match a result
// (user typed the full valid name), auto-select it; otherwise revert to the last
// valid value. This prevents cashiers from saving garbage into a Link field.
function onBlur() {
	setTimeout(() => {
		open.value = false
		if (query.value === (props.modelValue || "")) return
		const exact = results.value.find((r) => r.value === query.value)
		if (exact) {
			select(exact)
		} else {
			query.value = props.modelValue || ""
		}
	}, 150)
}

function select(result) {
	query.value = result.value
	emit("update:modelValue", result.value)
	open.value = false
}

function clearValue() {
	query.value = ""
	emit("update:modelValue", "")
	results.value = []
}

function move(delta) {
	if (!open.value) {
		open.value = true
		return
	}
	const count = results.value.length
	if (!count) return
	highlighted.value = (highlighted.value + delta + count) % count
}

function chooseHighlighted() {
	if (open.value && highlighted.value >= 0 && results.value[highlighted.value]) {
		select(results.value[highlighted.value])
	}
}

function onClickOutside(event) {
	if (rootRef.value && !rootRef.value.contains(event.target)) {
		open.value = false
	}
}

onMounted(() => document.addEventListener("mousedown", onClickOutside))
onBeforeUnmount(() => {
	document.removeEventListener("mousedown", onClickOutside)
	if (debounceTimer) clearTimeout(debounceTimer)
})
</script>
