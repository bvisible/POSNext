<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Cash in and cash out from the till: -->
	<!-- //// the cashier picks an erpnextswiss Journal Entry Template and the movement is booked -->
	<!-- //// and submitted immediately, so the closing report and the expected cash stay true. -->
	<!-- //// Upstream POSNext has no cash movement at all — the drawer silently drifts from the -->
	<!-- //// ledger. (6c598630, 2026-03-28 "cash in/out from POS using Journal Entry Templates"; -->
	<!-- //// 2e2ef1a0 adapts to the ERPNext Swiss template structure (totalization and -->
	<!-- //// counterparty), ee6587a0 reads template_title, dd53c641 adds the search filter, -->
	<!-- //// 82b2493a the POS Profile template filter.) -->
	<Dialog
		v-model="open"
		:options="{ title: __('Cash In/Out'), size: '3xl' }"
	>
		<template #body-content>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Left: Template selection + form -->
				<div class="space-y-4">
					<!-- Loading state -->
					<div v-if="loadingTemplates" class="flex items-center justify-center py-8">
						<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
					</div>

					<!-- No templates -->
					<div v-else-if="!templates.length" class="text-center py-8 text-gray-500 text-sm">
						{{ __('No Journal Entry Templates found for this company.') }}
					</div>

					<template v-else>
						<!-- Form at top when template selected -->
						<div v-if="selectedTemplate" class="space-y-3 p-4 rounded-lg border-2"
							:class="getDirection(selectedTemplate) === 'out'
								? 'border-red-200 bg-red-50'
								: 'border-green-200 bg-green-50'"
						>
							<!-- Selected template header -->
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
									:class="getDirection(selectedTemplate) === 'out'
										? 'bg-red-200 text-red-700'
										: 'bg-green-200 text-green-700'"
								>
									<FeatherIcon
										:name="getDirection(selectedTemplate) === 'out' ? 'arrow-up-circle' : 'arrow-down-circle'"
										class="w-4 h-4"
									/>
								</div>
								<div class="flex-1 min-w-0">
									<div class="font-semibold text-sm text-gray-900 truncate">
										{{ selectedTemplate.template_title || selectedTemplate.name }}
									</div>
								</div>
								<button class="text-gray-400 hover:text-gray-600" @click="selectedTemplate = null">
									<FeatherIcon name="x" class="w-4 h-4" />
								</button>
							</div>

							<!-- Amount -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">{{ __('Amount') }}</label>
								<input
									ref="amountInput"
									v-model.number="amount"
									type="number"
									min="0"
									step="0.01"
									class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
									:placeholder="__('Enter amount')"
									@keyup.enter="submitEntry"
								/>
							</div>

							<!-- Note -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">{{ __('Note') }} <span class="text-gray-400">({{ __('optional') }})</span></label>
								<input
									v-model="note"
									type="text"
									class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
									:placeholder="__('e.g. Bank deposit ref #123')"
									@keyup.enter="submitEntry"
								/>
							</div>

							<!-- Submit button -->
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

						<!-- Search + template list -->
						<div class="space-y-2">
							<h3 v-if="!selectedTemplate" class="text-sm font-semibold text-gray-700">{{ __('Select Operation') }}</h3>

							<!-- Search -->
							<div class="relative">
								<FeatherIcon name="search" class="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
								<input
									v-model="searchQuery"
									type="text"
									class="w-full ps-9 pe-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
									:placeholder="__('Search templates...')"
								/>
							</div>

							<!-- No results -->
							<div v-if="!filteredTemplates.length" class="text-center py-4 text-gray-400 text-sm">
								{{ __('No templates match your search.') }}
							</div>

							<!-- Template cards -->
							<button
								v-for="t in filteredTemplates"
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
										{{ t.template_title || t.name }}
									</div>
									<div class="text-xs text-gray-500 truncate">
										{{ t.counterparty?.[0]?.account || t.totalization?.[0]?.account || '' }}
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
					</template>
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
const searchQuery = ref("")
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

const filteredTemplates = computed(() => {
	const q = searchQuery.value.trim().toLowerCase()
	if (!q) return templates.value
	return templates.value.filter((t) => {
		const title = (t.template_title || t.name || "").toLowerCase()
		const account = (
			t.counterparty?.[0]?.account ||
			t.totalization?.[0]?.account ||
			""
		).toLowerCase()
		return title.includes(q) || account.includes(q)
	})
})

// Methods
function getDirection(template) {
	const totAccount = template.totalization?.[0]?.account || ""
	const cashKeywords = ["caisse", "cash", "kasse"]
	const isCashSource = cashKeywords.some((kw) =>
		totAccount.toLowerCase().includes(kw),
	)
	return isCashSource || !totAccount ? "out" : "in"
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
			{ company: props.company, pos_profile: props.posProfile || undefined },
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
		searchQuery.value = ""
	}
})
</script>
