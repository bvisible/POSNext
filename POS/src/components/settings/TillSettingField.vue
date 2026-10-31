<!-- //// Neoffice — added file (no upstream equivalent). One setting of the till's settings screen, drawn from -->
<!-- //// its entry in the list the server sends (NeoRestau lot 1, task 13): a box to tick, a number, a choice of a -->
<!-- //// few options in one line, a link chosen in a short list or searched, a list of links, lines of a table, a -->
<!-- //// text. Every setting carries its help behind the lightbulb; a setting whose condition is off stays visible, -->
<!-- //// greyed and closed (product owner, 30.10.2026); a setting the user may not change is shown closed. -->
<template>
	<div
		class="till-setting min-w-0"
		:class="[
			setting.indent ? 'ml-[9px] border-l-2 border-pos-line pl-[19px]' : '',
			greyed ? 'opacity-[0.42]' : '',
		]"
		:data-setting="setting.key"
		:data-greyed="greyed ? 'true' : 'false'"
		:data-locked="locked ? 'true' : 'false'"
	>
		<!-- A box to tick: the label beside it -->
		<div v-if="setting.widget === 'check'" class="flex min-h-[30px] items-center gap-2.5">
			<input
				:id="inputId"
				type="checkbox"
				class="h-[18px] w-[18px] flex-none cursor-pointer rounded-[5px] accent-pos-ink text-pos-ink disabled:cursor-default"
				:checked="Boolean(modelValue)"
				:disabled="closed"
				@change="emit('update:modelValue', $event.target.checked ? 1 : 0)"
			/>
			<label :for="inputId" class="min-w-0 text-[13.5px] leading-snug text-pos-ink">{{ setting.label }}</label>
			<HelpBulb v-if="setting.help" v-model:open="helpOpen" :text="setting.help" />
		</div>

		<template v-else>
			<div class="mb-[5px] flex flex-wrap items-center gap-1.5 text-[12.5px] text-pos-muted">
				<label :for="inputId">{{ setting.label }}</label>
				<HelpBulb v-if="setting.help" v-model:open="helpOpen" :text="setting.help" />
			</div>

			<!-- A number -->
			<div
				v-if="isNumber"
				class="flex h-9 min-w-0 items-center gap-2 rounded-[10px] border bg-white px-3"
				:class="invalid ? 'border-pos-danger' : 'border-pos-line'"
			>
				<input
					:id="inputId"
					type="number"
					class="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[14px] text-pos-ink placeholder:text-pos-muted focus:outline-none focus:ring-0"
					:value="numberShown"
					:min="setting.min ?? undefined"
					:max="setting.max ?? undefined"
					:step="setting.widget === 'int' ? 1 : 'any'"
					:placeholder="setting.placeholder || undefined"
					:disabled="closed"
					:aria-invalid="invalid ? 'true' : 'false'"
					@input="onNumber($event.target.value)"
				/>
				<span v-if="setting.widget === 'percent'" class="text-[12px] text-pos-muted">%</span>
			</div>

			<!-- A length of time: hours and minutes -->
			<div v-else-if="setting.widget === 'duration'" class="flex items-center gap-2">
				<div class="flex h-9 w-24 items-center gap-1.5 rounded-[10px] border border-pos-line bg-white px-3">
					<input
						:id="inputId"
						type="number"
						min="0"
						step="1"
						class="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[14px] text-pos-ink focus:outline-none focus:ring-0"
						:value="durationHours"
						:disabled="closed"
						:aria-label="__('Hours')"
						@input="onDuration($event.target.value, durationMinutes)"
					/>
					<span class="text-[12px] text-pos-muted">{{ __("h") }}</span>
				</div>
				<div class="flex h-9 w-24 items-center gap-1.5 rounded-[10px] border border-pos-line bg-white px-3">
					<input
						type="number"
						min="0"
						max="59"
						step="5"
						class="h-full w-full min-w-0 border-0 bg-transparent p-0 text-[14px] text-pos-ink focus:outline-none focus:ring-0"
						:value="durationMinutes"
						:disabled="closed"
						:aria-label="__('Minutes')"
						@input="onDuration(durationHours, $event.target.value)"
					/>
					<span class="text-[12px] text-pos-muted">{{ __("min") }}</span>
				</div>
			</div>

			<!-- A few options, in one line -->
			<div
				v-else-if="setting.widget === 'segmented'"
				class="flex gap-1.5"
				role="radiogroup"
				:aria-label="setting.label"
			>
				<button
					v-for="option in setting.options"
					:key="option.value"
					type="button"
					role="radio"
					class="h-9 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-[10px] bg-white text-[13px] disabled:cursor-default"
					:class="[
						optionWidth(option),
						String(modelValue ?? '') === option.value
							? 'border-2 border-pos-ink font-bold text-pos-ink'
							: 'border border-pos-line text-pos-muted',
					]"
					:aria-checked="String(modelValue ?? '') === option.value ? 'true' : 'false'"
					:disabled="closed"
					:title="option.label"
					@click="emit('update:modelValue', option.value)"
				>
					{{ option.label }}
				</button>
			</div>

			<!-- A choice in a short list -->
			<select
				v-else-if="setting.widget === 'select' || (setting.widget === 'link' && !setting.search)"
				:id="inputId"
				class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 py-0 text-[14px] text-pos-ink disabled:cursor-default"
				:value="modelValue || ''"
				:disabled="closed"
				@change="emit('update:modelValue', $event.target.value)"
			>
				<option v-if="!setting.required" value="">{{ setting.placeholder || "" }}</option>
				<option v-for="choice in shownChoices" :key="choice.value" :value="choice.value">
					{{ choice.label }}
				</option>
			</select>

			<!-- A link searched among many records -->
			<div v-else-if="setting.widget === 'link'" class="relative">
				<input
					:id="inputId"
					type="text"
					autocomplete="off"
					class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 text-[14px] text-pos-ink placeholder:text-pos-muted disabled:cursor-default"
					:value="searchText"
					:placeholder="__('Search')"
					:disabled="closed"
					role="combobox"
					:aria-expanded="results.length ? 'true' : 'false'"
					@input="onSearch($event.target.value)"
					@blur="onSearchBlur"
				/>
				<ul
					v-if="results.length"
					role="listbox"
					class="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-[10px] border border-pos-line bg-white py-1 shadow-lg"
				>
					<li
						v-for="result in results"
						:key="result.value"
						role="option"
						class="cursor-pointer px-3 py-1.5 text-[13px] text-pos-ink hover:bg-pos-panel"
						@mousedown.prevent="pick(result)"
					>
						{{ result.label || result.value }}
						<span v-if="result.description" class="ms-1 text-[12px] text-pos-muted">{{
							result.description
						}}</span>
					</li>
				</ul>
			</div>

			<!-- A list of links -->
			<div
				v-else-if="setting.widget === 'multiselect'"
				class="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] border border-pos-line bg-white px-2 py-1"
			>
				<span
					v-for="value in listValue"
					:key="value"
					class="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-pos-line bg-pos-panel px-2 py-0.5 text-[12px] text-pos-ink"
				>
					<span class="truncate">{{ labelOf(value) }}</span>
					<button
						v-if="!closed"
						type="button"
						class="text-pos-muted hover:text-pos-ink"
						:aria-label="__('Remove {0}', [labelOf(value)])"
						@click="emit('update:modelValue', listValue.filter((item) => item !== value))"
					>
						×
					</button>
				</span>
				<select
					v-if="!closed && remainingChoices.length"
					:id="inputId"
					class="h-7 min-w-[7rem] flex-1 border-0 bg-transparent p-0 text-[13px] text-pos-muted focus:ring-0"
					:aria-label="__('Add')"
					@change="onAdd($event)"
				>
					<option value="">{{ listValue.length ? "+" : setting.placeholder || __("All") }}</option>
					<option v-for="choice in remainingChoices" :key="choice.value" :value="choice.value">
						{{ choice.label }}
					</option>
				</select>
				<span v-else-if="!listValue.length" class="text-[13px] text-pos-muted">{{
					setting.placeholder || __("All")
				}}</span>
			</div>

			<!-- The lines of a table -->
			<div v-else-if="setting.widget === 'table'" class="flex flex-col gap-1.5">
				<div v-for="(row, index) in rowsValue" :key="index" class="flex items-center gap-2">
					<template v-for="column in setting.columns || []" :key="column.fieldname">
						<label
							v-if="column.fieldtype === 'Check'"
							class="flex flex-none items-center gap-1.5 text-[12.5px] text-pos-muted"
						>
							<input
								type="checkbox"
								class="h-4 w-4 accent-pos-ink text-pos-ink"
								:checked="Boolean(row[column.fieldname])"
								:disabled="closed"
								@change="onCell(index, column.fieldname, $event.target.checked ? 1 : 0)"
							/>
							{{ column.label }}
						</label>
						<input
							v-else
							type="text"
							class="h-9 min-w-0 flex-1 rounded-[10px] border border-pos-line bg-white px-3 text-[14px] text-pos-ink"
							:value="row[column.fieldname] || ''"
							:aria-label="column.label"
							:disabled="closed"
							@input="onCell(index, column.fieldname, $event.target.value)"
						/>
					</template>
					<button
						v-if="!closed"
						type="button"
						class="flex-none px-1 text-[16px] text-pos-muted hover:text-pos-ink"
						:aria-label="__('Remove the line')"
						@click="emit('update:modelValue', rowsValue.filter((_row, at) => at !== index))"
					>
						×
					</button>
				</div>
				<p v-if="!rowsValue.length" class="text-[12.5px] text-pos-muted">{{ __("No line") }}</p>
				<button
					v-if="!closed"
					type="button"
					class="self-start text-[12.5px] font-bold text-blue-700 hover:underline"
					@click="onAddRow"
				>
					{{ __("Add a line") }}
				</button>
			</div>

			<!-- Lines of text, one per line -->
			<textarea
				v-else-if="setting.widget === 'lines'"
				:id="inputId"
				rows="3"
				class="w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 py-2 text-[14px] leading-snug text-pos-ink"
				:value="modelValue || ''"
				:disabled="closed"
				@input="emit('update:modelValue', $event.target.value)"
			/>

			<!-- A text, an e-mail address -->
			<input
				v-else
				:id="inputId"
				:type="setting.widget === 'email' ? 'email' : 'text'"
				class="h-9 w-full min-w-0 rounded-[10px] border border-pos-line bg-white px-3 text-[14px] text-pos-ink placeholder:text-pos-muted"
				:value="modelValue || ''"
				:placeholder="setting.placeholder || undefined"
				:disabled="closed"
				@input="emit('update:modelValue', $event.target.value)"
			/>
		</template>

		<p
			v-if="helpOpen && setting.help"
			class="till-setting-help mb-1 mt-1.5 rounded-lg border-l-[3px] border-blue-400 bg-pos-action-soft px-2.5 py-2 text-[12.5px] leading-[1.45] text-pos-ink"
			:class="setting.widget === 'check' ? 'ml-7' : ''"
		>
			{{ setting.help }}
		</p>
	</div>
</template>

<script setup>
import { computed, ref, watch } from "vue"
import { call } from "frappe-ui"
import HelpBulb from "./HelpBulb.vue"
import { withinBounds } from "./tillSettingsForm"

const props = defineProps({
	// The setting's entry in the list (pos_next.till_settings.registry.serialize, plus `editable`)
	setting: { type: Object, required: true },
	modelValue: { type: [String, Number, Array, Boolean, null], default: null },
	// The choices of a short link, worked out by the server for this till
	choices: { type: Array, default: () => [] },
	// Its condition is off: shown greyed and closed
	greyed: { type: Boolean, default: false },
	// The user may not change it
	locked: { type: Boolean, default: false },
})

const emit = defineEmits(["update:modelValue"])

const helpOpen = ref(false)
const inputId = computed(() => `till-setting-${props.setting.key}`)
const closed = computed(() => props.greyed || props.locked)

// ---- numbers
const isNumber = computed(() => ["int", "float", "percent"].includes(props.setting.widget))
// A zero that means "as the theme" (a placeholder says so) shows as an empty field
const numberShown = computed(() => {
	const value = props.modelValue
	if (props.setting.placeholder && (value === 0 || value === null || value === "")) return ""
	return value ?? ""
})
const invalid = computed(
	() => isNumber.value && numberShown.value !== "" && !withinBounds(props.setting, props.modelValue)
)

function onNumber(text) {
	if (text === "") {
		emit("update:modelValue", 0)
		return
	}
	const number = props.setting.widget === "int" ? Number.parseInt(text, 10) : Number.parseFloat(text)
	emit("update:modelValue", Number.isFinite(number) ? number : text)
}

// ---- a length of time, kept in seconds
const durationHours = computed(() => Math.floor((Number(props.modelValue) || 0) / 3600))
const durationMinutes = computed(() => Math.floor(((Number(props.modelValue) || 0) % 3600) / 60))

function onDuration(hours, minutes) {
	const seconds = (Number.parseInt(hours, 10) || 0) * 3600 + (Number.parseInt(minutes, 10) || 0) * 60
	emit("update:modelValue", Math.max(0, seconds))
}

// ---- a few options in one line: a number shares the room left, a word keeps its own width
const hasShortOptions = computed(() => (props.setting.options || []).some((option) => option.label.length <= 2))

function optionWidth(option) {
	if (option.label.length <= 2) return "min-w-[1.75rem] flex-1 px-1"
	return hasShortOptions.value ? "flex-none px-2.5" : "flex-auto px-2"
}

// ---- short lists
const shownChoices = computed(() => {
	if (props.setting.widget === "select") {
		return (props.setting.options || []).map((option) => ({ value: option.value, label: option.label }))
	}
	return props.choices
})

const listValue = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const remainingChoices = computed(() => props.choices.filter((choice) => !listValue.value.includes(choice.value)))

function labelOf(value) {
	return props.choices.find((choice) => choice.value === value)?.label || value
}

function onAdd(event) {
	const value = event.target.value
	event.target.value = ""
	if (value) emit("update:modelValue", [...listValue.value, value])
}

// ---- the lines of a table
const rowsValue = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))

function onCell(index, fieldname, value) {
	emit(
		"update:modelValue",
		rowsValue.value.map((row, at) => (at === index ? { ...row, [fieldname]: value } : row))
	)
}

function onAddRow() {
	const row = Object.fromEntries(
		(props.setting.columns || []).map((column) => [column.fieldname, column.fieldtype === "Check" ? 0 : ""])
	)
	emit("update:modelValue", [...rowsValue.value, row])
}

// ---- a link searched among many records (Frappe's own link search, with the user's rights)
const searchText = ref(props.modelValue || "")
const results = ref([])
let searchTimer = null

watch(
	() => props.modelValue,
	(value) => {
		searchText.value = value || ""
	}
)

function onSearch(text) {
	searchText.value = text
	if (!text.trim()) {
		results.value = []
		emit("update:modelValue", "")
		return
	}
	clearTimeout(searchTimer)
	searchTimer = setTimeout(async () => {
		try {
			const found = await call("frappe.desk.search.search_link", {
				doctype: props.setting.search,
				txt: text,
				page_length: 8,
			})
			results.value = Array.isArray(found) ? found : found?.results || []
		} catch {
			results.value = []
		}
	}, 200)
}

function pick(result) {
	results.value = []
	searchText.value = result.value
	emit("update:modelValue", result.value)
}

function onSearchBlur() {
	// What was typed and not picked is not a value: the field shows the value again
	setTimeout(() => {
		results.value = []
		searchText.value = props.modelValue || ""
	}, 150)
}
</script>
