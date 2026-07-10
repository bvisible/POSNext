<!--
  EditCustomerDialog — full, meta-driven Customer edit inside the POS.

  Opens the real Customer doctype (fields + custom fields) grouped by its own
  tabs/sections, rendered as a touch-friendly dialog so the cashier never has
  to leave the POS (important for the PWA / tablet use case). Child tables,
  attachments and other non-editable field types are omitted server-side.
-->
<template>
	<Dialog v-model="show" :options="{ title: __('Edit Customer'), size: '3xl' }">
		<template #body-content>
			<div v-if="loading" class="py-12 text-center">
				<div class="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
				<p class="mt-3 text-sm text-gray-500">{{ __('Loading customer…') }}</p>
			</div>

			<div v-else-if="tabs.length" class="flex flex-col gap-3">
				<!-- Tab bar -->
				<div v-if="tabs.length > 1" class="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
					<button
						v-for="(tab, idx) in tabs"
						:key="idx"
						type="button"
						@click="activeTab = idx"
						:class="[
							'px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors',
							activeTab === idx ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100',
						]"
					>
						{{ tab.label || __('Details') }}
					</button>
				</div>

				<!-- Active tab -->
				<div class="flex flex-col gap-4">
					<div v-for="(section, sIdx) in tabs[activeTab].sections" :key="sIdx">
						<h4 v-if="section.label" class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
							{{ section.label }}
						</h4>
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
							<template v-for="field in section.fields" :key="field.fieldname">
								<div v-if="isVisible(field)" :class="isWide(field) ? 'sm:col-span-2' : ''">
									<label class="block text-xs font-medium text-gray-600 mb-1">
										{{ field.label }}
										<span v-if="field.reqd" class="text-red-500">*</span>
									</label>

									<!-- Checkbox -->
									<label v-if="field.fieldtype === 'Check'" class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											:checked="!!values[field.fieldname]"
											@change="(e) => (values[field.fieldname] = e.target.checked ? 1 : 0)"
											:disabled="field.read_only"
											class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
										/>
										<span class="text-sm text-gray-700">{{ field.description || __('Yes') }}</span>
									</label>

									<!-- Read only -->
									<div v-else-if="field.read_only || field.fieldtype === 'Read Only'"
										class="px-3 py-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg min-h-[38px] whitespace-pre-line">
										{{ readOnlyDisplay(values[field.fieldname]) }}
									</div>

									<!-- Select -->
									<select
										v-else-if="field.fieldtype === 'Select'"
										:value="values[field.fieldname]"
										@change="(e) => (values[field.fieldname] = e.target.value)"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									>
										<option v-for="opt in selectOptions(field)" :key="opt" :value="opt">{{ opt || '—' }}</option>
									</select>

									<!-- Link -->
									<LinkField
										v-else-if="field.fieldtype === 'Link'"
										:model-value="values[field.fieldname]"
										@update:model-value="(v) => (values[field.fieldname] = v)"
										:doctype="field.options"
										:placeholder="field.label"
										:disabled="field.read_only"
									/>

									<!-- Multi-line text -->
									<textarea
										v-else-if="['Text', 'Small Text', 'Long Text', 'Text Editor'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										rows="2"
										:placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									></textarea>

									<!-- Numbers -->
									<input
										v-else-if="['Int', 'Float', 'Currency', 'Percent'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										type="number"
										:step="field.fieldtype === 'Int' ? '1' : '0.01'"
										:placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>

									<!-- Date / Datetime -->
									<input
										v-else-if="['Date', 'Datetime'].includes(field.fieldtype)"
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										:type="field.fieldtype === 'Date' ? 'date' : 'datetime-local'"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>

									<!-- Data / Phone / fallback -->
									<input
										v-else
										:value="values[field.fieldname]"
										@input="(e) => (values[field.fieldname] = e.target.value)"
										:type="field.fieldtype === 'Phone' ? 'tel' : 'text'"
										:placeholder="field.label"
										class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</template>
						</div>
					</div>
				</div>
			</div>

			<div v-else class="py-8 text-center text-sm text-gray-500">
				{{ __('Could not load the customer form.') }}
			</div>
		</template>

		<template #actions>
			<div class="flex justify-end gap-2">
				<Button variant="subtle" @click="show = false">{{ __('Cancel') }}</Button>
				<Button variant="solid" theme="blue" :loading="saving" :disabled="loading || saving" @click="save">
					{{ __('Save Changes') }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { Button, Dialog, createResource } from "frappe-ui"
import { computed, ref, watch } from "vue"
import { useToast } from "@/composables/useToast"
import LinkField from "@/components/common/LinkField.vue"

const props = defineProps({
	modelValue: { type: Boolean, required: true },
	customer: { type: [String, Object], default: null },
})

const emit = defineEmits(["update:modelValue", "customer-updated"])

const { showError } = useToast()

const show = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

const tabs = ref([])
const values = ref({})
const activeTab = ref(0)
const saving = ref(false)

const customerName = computed(() =>
	typeof props.customer === "string" ? props.customer : props.customer?.name,
)

const formResource = createResource({
	url: "pos_next.api.customers.get_customer_form",
	auto: false,
})

const loading = computed(() => formResource.loading)

const saveResource = createResource({
	url: "pos_next.api.customers.save_customer_form",
	auto: false,
})

async function load() {
	tabs.value = []
	values.value = {}
	activeTab.value = 0
	if (!customerName.value) return
	try {
		const data = await formResource.submit({ customer: customerName.value })
		tabs.value = data.tabs || []
		values.value = { ...(data.values || {}) }
	} catch (error) {
		showError(error.message || __("Failed to load customer"))
	}
}

function selectOptions(field) {
	return (field.options || "").split("\n")
}

// Read-only fields like `primary_address` store HTML — show it as clean text.
function readOnlyDisplay(value) {
	if (value === null || value === undefined || value === "") return "—"
	const text = String(value)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/\n{2,}/g, "\n")
		.replace(/^\s+|\s+$/g, "")
	return text || "—"
}

// Full-width fields for readability (multi-line + address-ish data).
function isWide(field) {
	return ["Text", "Small Text", "Long Text", "Text Editor"].includes(field.fieldtype)
}

// Honour the doctype's own depends_on so conditionally-irrelevant fields hide
// (e.g. Company Name only for company customers). Guarded — defaults to visible.
function isVisible(field) {
	const cond = field.depends_on
	if (!cond) return true
	try {
		let expr = cond.trim()
		if (expr.startsWith("eval:")) {
			expr = expr.slice(5)
		} else {
			expr = `doc["${expr}"]`
		}
		// eslint-disable-next-line no-new-func
		const fn = new Function("doc", `return (${expr})`)
		return !!fn(values.value)
	} catch {
		return true
	}
}

async function save() {
	if (!customerName.value) return
	saving.value = true
	try {
		const data = await saveResource.submit({
			customer: customerName.value,
			values: JSON.stringify(values.value),
		})
		// The parent (handleCustomerUpdated) shows the success toast + refreshes
		// the cart customer and cache, so we only emit here.
		emit("customer-updated", data)
		show.value = false
	} catch (error) {
		showError(error.message || __("Failed to update customer"))
	} finally {
		saving.value = false
	}
}

watch(show, (isOpen) => {
	if (isOpen) load()
})
</script>
