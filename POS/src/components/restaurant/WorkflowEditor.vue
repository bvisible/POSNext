<template>
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
					<div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-cyan-50 to-blue-50">
						<h2 class="text-xl font-bold text-gray-800">{{ __('Preparation Workflows') }}</h2>
						<button @click="handleClose" class="text-gray-400 hover:text-gray-600">
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
					<div class="flex-1 overflow-y-auto p-6">
						<div class="space-y-4">
				<!-- Loading -->
				<div v-if="loading" class="flex justify-center py-8">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
				</div>

				<!-- Workflow cards -->
				<div v-else class="space-y-4">
					<div v-for="wf in workflows" :key="wf.name"
						class="border rounded-xl p-4 transition-all"
						:class="editingWorkflow === wf.name ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300'">

						<!-- Workflow header -->
						<div class="flex justify-between items-center mb-3">
							<div class="flex items-center gap-2">
								<h3 class="font-bold text-base">{{ wf.workflow_name }}</h3>
								<span v-if="wf.is_default" class="text-[10px] font-bold uppercase px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
									{{ __("Default") }}
								</span>
							</div>
							<div class="flex gap-1">
								<button v-if="!wf.is_default" @click="setDefault(wf)" class="text-xs px-2 py-1 rounded hover:bg-blue-50 text-blue-600">
									{{ __("Set as default") }}
								</button>
								<button @click="editingWorkflow = editingWorkflow === wf.name ? null : wf.name"
									class="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600">
									{{ editingWorkflow === wf.name ? __("Done") : __("Edit") }}
								</button>
								<button v-if="!wf.is_default" @click="deleteWorkflow(wf)" class="text-xs px-2 py-1 rounded hover:bg-red-50 text-red-600">
									{{ __("Delete") }}
								</button>
							</div>
						</div>

						<!-- Steps flow (visual) -->
						<div class="flex items-center gap-1 flex-wrap">
							<div v-for="(step, idx) in wf.steps" :key="idx"
								class="flex items-center gap-1">
								<span class="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
									:style="{ backgroundColor: step.color || '#6B7280' }">
									{{ step.step_name }}
								</span>
								<svg v-if="idx < wf.steps.length - 1" class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							</div>
							<span class="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 bg-gray-100 border border-dashed border-gray-300">
								{{ __("Delivered") }}
							</span>
						</div>

						<!-- Edit mode -->
						<div v-if="editingWorkflow === wf.name" class="mt-4 space-y-3 border-t pt-4">
							<div v-for="(step, idx) in wf.steps" :key="idx" class="flex items-center gap-2">
								<span class="text-xs text-gray-400 w-4">{{ idx + 1 }}</span>
								<input v-model="step.step_name" class="flex-1 px-2 py-1 border rounded text-sm" :placeholder="__('Step name')" />
								<input v-model="step.color" type="color" class="w-8 h-8 rounded border cursor-pointer" />
								<button @click="wf.steps.splice(idx, 1)" class="text-red-400 hover:text-red-600 p-1">
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
							<button @click="wf.steps.push({ step_name: '', color: '#6B7280', allow_edit: 0 })"
								class="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								{{ __("Add Step") }}
							</button>
							<!-- Applicable Products -->
							<div class="mt-3 pt-3 border-t">
								<label class="text-[10px] font-medium text-gray-500 uppercase mb-1 block">{{ __("Always use this workflow for") }}</label>
								<div class="flex flex-wrap gap-1 mb-1">
									<span v-for="(item, idx) in (wf.applicable_items || [])" :key="idx"
										class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
										{{ item }}
										<button @click="wf.applicable_items.splice(idx, 1)" class="text-cyan-400 hover:text-red-500">&times;</button>
									</span>
								</div>
								<input v-model="wfItemSearch" class="w-full px-2 py-1 border rounded text-xs"
									:placeholder="__('Search product to add...')" @input="searchWfItems" />
								<div v-if="wfItemResults.length" class="mt-1 border rounded max-h-24 overflow-y-auto">
									<div v-for="item in wfItemResults" :key="item.name"
										@click="addWfItem(wf, item)"
										class="px-2 py-1 text-xs hover:bg-cyan-50 cursor-pointer">
										{{ item.item_name }}
									</div>
								</div>
							</div>

							<div class="flex justify-end mt-3">
								<Button variant="solid" size="sm" @click="saveWorkflow(wf)" :loading="saving">
									{{ __("Save") }}
								</Button>
							</div>
						</div>
					</div>

					<!-- Add new workflow -->
					<div class="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-gray-400 transition-colors">
						<div v-if="!showNewForm" class="text-center">
							<button @click="showNewForm = true" class="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2 mx-auto">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								{{ __("New Workflow") }}
							</button>
						</div>
						<div v-else class="space-y-3">
							<input v-model="newWorkflowName" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('Workflow name (e.g. Fast Bar)')" />
							<div class="flex gap-2">
								<Button variant="subtle" size="sm" @click="showNewForm = false; newWorkflowName = ''">{{ __("Cancel") }}</Button>
								<Button variant="solid" size="sm" @click="createWorkflow" :disabled="!newWorkflowName">{{ __("Create") }}</Button>
							</div>
						</div>
					</div>
				</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(["update:modelValue"])

const show = computed({
	get: () => props.modelValue,
	set: (v) => emit("update:modelValue", v),
})

function handleClose() {
	show.value = false
}

const { showSuccess, showError } = useToast()
const workflows = ref([])
const loading = ref(true)
const saving = ref(false)
const editingWorkflow = ref(null)
const showNewForm = ref(false)
const newWorkflowName = ref("")
const wfItemSearch = ref("")
const wfItemResults = ref([])

let wfSearchTimeout = null
function searchWfItems() {
	clearTimeout(wfSearchTimeout)
	wfSearchTimeout = setTimeout(async () => {
		if (!wfItemSearch.value || wfItemSearch.value.length < 2) { wfItemResults.value = []; return }
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item", filters: [["item_name", "like", `%${wfItemSearch.value}%`]],
				fields: ["name", "item_name"], limit_page_length: 8
			})
			wfItemResults.value = res || []
		} catch { wfItemResults.value = [] }
	}, 300)
}

function addWfItem(wf, item) {
	if (!wf.applicable_items) wf.applicable_items = []
	if (!wf.applicable_items.includes(item.name)) wf.applicable_items.push(item.name)
	wfItemSearch.value = ""
	wfItemResults.value = []
}

async function loadWorkflows() {
	try {
		const res = await call("pos_next.api.restaurant.get_preparation_workflows")
		if (res) workflows.value = res
	} catch (error) {
		console.error("Failed to load workflows:", error)
		showError(__("Failed to load workflows"))
	} finally {
		loading.value = false
	}
}

async function saveWorkflow(wf) {
	saving.value = true
	try {
		await call("pos_next.api.restaurant.save_preparation_workflow", {
			name: wf.name,
			workflow_name: wf.workflow_name,
			steps: JSON.stringify(wf.steps.filter(s => s.step_name)),
			applicable_items: JSON.stringify(wf.applicable_items || [])
		})
		showSuccess(__("Workflow saved"))
		editingWorkflow.value = null
		loadWorkflows()
	} catch (error) {
		showError(__("Failed to save workflow"))
	} finally {
		saving.value = false
	}
}

async function createWorkflow() {
	try {
		await call("pos_next.api.restaurant.create_preparation_workflow", {
			workflow_name: newWorkflowName.value
		})
		showSuccess(__("Workflow created"))
		showNewForm.value = false
		newWorkflowName.value = ""
		loadWorkflows()
	} catch (error) {
		showError(__("Failed to create workflow"))
	}
}

async function deleteWorkflow(wf) {
	try {
		await call("pos_next.api.restaurant.delete_preparation_workflow", { name: wf.name })
		showSuccess(__("Workflow deleted"))
		loadWorkflows()
	} catch (error) {
		showError(__("Failed to delete workflow"))
	}
}

async function setDefault(wf) {
	try {
		// Unset current default
		for (const w of workflows.value) {
			if (w.is_default) {
				await call("pos_next.api.restaurant.save_preparation_workflow", {
						name: w.name, is_default: 0
					})
			}
		}
		await call("pos_next.api.restaurant.save_preparation_workflow", {
			name: wf.name, is_default: 1
		})
		showSuccess(__("Default workflow updated"))
		loadWorkflows()
	} catch (error) {
		showError(__("Failed to update default"))
	}
}

onMounted(loadWorkflows)
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
