<template>
	<Dialog
		v-model="open"
		:options="{ title: __('Cash In/Out'), size: '3xl' }"
	>
		<template #body-content>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Left: Template selection + form -->
				<div class="space-y-4">
					<h3 class="text-sm font-semibold text-gray-700">{{ __('Select Operation') }}</h3>

					<!-- Loading state -->
					<div v-if="loadingTemplates" class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
					</div>

					<!-- No templates -->
					<div v-else-if="!templates.length" class="text-center py-8 text-gray-500 text-sm">
						{{ __('No Journal Entry Templates found for this company.') }}
					</div>

					<!-- Template cards -->
					<div v-else class="space-y-2">
						<button
							v-for="t in templates"
							:key="t.name"
							class="w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-start"
							:class="selectedTemplate?.name === t.name
								? (getDirection(t) === 'out'
									? 'border-red-300 bg-red-50'
									: 'border-green-300 bg-green-50')
								: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
							@click="selectTemplate(t)"
						>
							<div
								class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
								:class="getDirection(t) === 'out'
									? 'bg-red-100 text-red-600'
									: 'bg-green-100 text-green-600'"
							>
								<FeatherIcon
									:name="getDirection(t) === 'out' ? 'arrow-up-circle' : 'arrow-down-circle'"
									class="w-5 h-5"
								/>
							</div>
							<div class="flex-1 min-w-0">
								<div class="font-medium text-sm text-gray-900 truncate">
									{{ t.title || t.name }}
								</div>
								<div class="text-xs text-gray-500 truncate">
									{{ t.accounts?.[0]?.account || '' }}
								</div>
							</div>
							<span
								class="text-xs font-medium px-2 py-0.5 rounded-full"
								:class="getDirection(t) === 'out'
									? 'bg-red-100 text-red-700'
									: 'bg-green-100 text-green-700'"
							>
								{{ getDirection(t) === 'out' ? __('Out') : __('In') }}
							</span>
						</button>
					</div>

					<!-- Amount & Note form (visible when template selected) -->
					<div v-if="selectedTemplate" class="space-y-3 pt-2 border-t border-gray-200">
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __('Amount') }}</label>
							<input
								ref="amountInput"
								v-model.number="amount"
								type="number"
								min="0"
								step="0.01"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
								:placeholder="__('Enter amount')"
								@keyup.enter="submitEntry"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">{{ __('Note') }} <span class="text-gray-400">({{ __('optional') }})</span></label>
							<input
								v-model="note"
								type="text"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
								:placeholder="__('e.g. Bank deposit ref #123')"
								@keyup.enter="submitEntry"
							/>
						</div>
						<Button
							class="w-full"
							variant="solid"
							:theme="getDirection(selectedTemplate) === 'out' ? 'red' : 'green'"
							:loading="submitting"
							:disabled="!amount || amount <= 0"
							@click="submitEntry"
						>
							<template #prefix>
								<FeatherIcon
									:name="getDirection(selectedTemplate) === 'out' ? 'arrow-up-circle' : 'arrow-down-circle'"
									class="w-4 h-4"
								/>
							</template>
							{{ getDirection(selectedTemplate) === 'out'
								? __('Record Cash Out')
								: __('Record Cash In') }}
						</Button>
					</div>
				</div>

				<!-- Right: Shift history -->
				<div class="space-y-3">
					<h3 class="text-sm font-semibold text-gray-700">{{ __('Shift History') }}</h3>

					<!-- Loading -->
					<div v-if="loadingEntries" class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
					</div>

					<!-- Empty -->
					<div v-else-if="!entries.length" class="text-center py-8 text-gray-400 text-sm">
						{{ __('No cash entries for this shift yet.') }}
					</div>

					<!-- Entries list -->
					<div v-else class="space-y-2">
						<!-- Totals summary -->
						<div class="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
							<div v-if="totalIn > 0" class="text-green-700 font-medium">
								{{ __('In') }}: +{{ formatAmount(totalIn) }}
							</div>
							<div v-if="totalOut > 0" class="text-red-700 font-medium">
								{{ __('Out') }}: -{{ formatAmount(totalOut) }}
							</div>
							<div class="text-gray-700 font-semibold">
								{{ __('Net') }}: {{ formatAmount(totalIn - totalOut) }}
							</div>
						</div>

						<!-- Entry rows -->
						<div
							v-for="entry in entries"
							:key="entry.name"
							class="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
						>
							<div
								class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
								:class="entry.direction === 'out'
									? 'bg-red-100 text-red-600'
									: 'bg-green-100 text-green-600'"
							>
								<FeatherIcon
									:name="entry.direction === 'out' ? 'arrow-up' : 'arrow-down'"
									class="w-4 h-4"
								/>
							</div>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-gray-900 truncate">{{ entry.template }}</div>
								<div v-if="entry.note" class="text-xs text-gray-500 truncate">{{ entry.note }}</div>
							</div>
							<div
								class="text-sm font-semibold flex-shrink-0"
								:class="entry.direction === 'out' ? 'text-red-700' : 'text-green-700'"
							>
								{{ entry.direction === 'out' ? '-' : '+' }}{{ formatAmount(entry.amount) }}
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from "vue"
import { Dialog, Button, FeatherIcon, call } from "frappe-ui"
import { useToast } from "@/composables/useToast"

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	posProfile: { type: String, default: "" },
	company: { type: String, default: "" },
	posOpeningShift: { type: String, default: "" },
	currency: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue"])

const { showSuccess, showError } = useToast()

const open = computed({
	get: () => props.modelValue,
	set: (val) => emit("update:modelValue", val),
})

// State
const templates = ref([])
const entries = ref([])
const selectedTemplate = ref(null)
const amount = ref(null)
const note = ref("")
const loadingTemplates = ref(false)
const loadingEntries = ref(false)
const submitting = ref(false)
const amountInput = ref(null)

// Computed
const totalIn = computed(() =>
	entries.value
		.filter((e) => e.direction === "in")
		.reduce((sum, e) => sum + (e.amount || 0), 0),
)

const totalOut = computed(() =>
	entries.value
		.filter((e) => e.direction === "out")
		.reduce((sum, e) => sum + (e.amount || 0), 0),
)

// Methods
function getDirection(template) {
	const firstAccount = template.accounts?.[0]
	if (!firstAccount) return "out"
	return (firstAccount.debit || 0) > 0 ? "out" : "in"
}

function selectTemplate(template) {
	selectedTemplate.value = template
	amount.value = null
	note.value = ""
	nextTick(() => {
		amountInput.value?.focus()
	})
}

function formatAmount(val) {
	return Number.parseFloat(val || 0).toFixed(2)
}

async function loadTemplates() {
	if (!props.company) return
	loadingTemplates.value = true
	try {
		templates.value = await call(
			"pos_next.api.cash_entry.get_cash_entry_templates",
			{ company: props.company },
		)
	} catch (e) {
		showError(__("Failed to load templates"))
	} finally {
		loadingTemplates.value = false
	}
}

async function loadEntries() {
	if (!props.posOpeningShift) return
	loadingEntries.value = true
	try {
		entries.value = await call("pos_next.api.cash_entry.get_cash_entries", {
			pos_opening_shift: props.posOpeningShift,
		})
	} catch (e) {
		showError(__("Failed to load cash entries"))
	} finally {
		loadingEntries.value = false
	}
}

async function submitEntry() {
	if (!selectedTemplate.value || !amount.value || amount.value <= 0) return
	if (submitting.value) return

	submitting.value = true
	try {
		const result = await call("pos_next.api.cash_entry.create_cash_entry", {
			pos_opening_shift: props.posOpeningShift,
			template_name: selectedTemplate.value.name,
			amount: amount.value,
			remark: note.value || undefined,
		})

		const dirLabel = result.direction === "out" ? __("Cash Out") : __("Cash In")
		showSuccess(
			__("{0}: {1} recorded ({2})", [
				dirLabel,
				formatAmount(result.amount),
				result.name,
			]),
		)

		// Reset form and reload entries
		selectedTemplate.value = null
		amount.value = null
		note.value = ""
		await loadEntries()
	} catch (e) {
		showError(e.messages?.[0] || __("Failed to create cash entry"))
	} finally {
		submitting.value = false
	}
}

// Load data when dialog opens
watch(open, (val) => {
	if (val) {
		loadTemplates()
		loadEntries()
		selectedTemplate.value = null
		amount.value = null
		note.value = ""
	}
})
</script>
