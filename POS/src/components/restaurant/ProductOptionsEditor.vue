<template>
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="handleClose">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
					<div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-teal-50 to-cyan-50">
						<h2 class="text-xl font-bold text-gray-800">{{ __('Product Options') }}</h2>
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

				<!-- Option group cards -->
				<div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div v-for="group in groups" :key="group.name"
						class="border rounded-xl p-4 transition-all"
						:class="editingGroup === group.name ? 'border-teal-400 shadow-md' : 'border-gray-200 hover:border-gray-300'">

						<!-- Group header -->
						<div class="flex justify-between items-start mb-2">
							<div>
								<h3 class="font-bold text-base">{{ group.group_name }}</h3>
								<div class="flex gap-1.5 mt-1">
									<span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
										:class="group.selection_type === 'Single' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'">
										{{ group.selection_type === 'Single' ? __('Single choice') : __('Multiple choices') }}
									</span>
									<span v-if="group.required" class="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700">
										{{ __('Required') }}
									</span>
								</div>
							</div>
							<div class="flex gap-1">
								<button @click="editingGroup = editingGroup === group.name ? null : group.name"
									class="text-xs px-2 py-1 rounded hover:bg-gray-100 text-gray-600">
									{{ editingGroup === group.name ? __("Done") : __("Edit") }}
								</button>
								<button @click="deleteGroup(group)" class="text-xs px-2 py-1 rounded hover:bg-red-50 text-red-600">
									{{ __("Delete") }}
								</button>
							</div>
						</div>

						<!-- Options list (view mode) -->
						<div v-if="editingGroup !== group.name" class="space-y-1">
							<div v-for="opt in group.options" :key="opt.option_name"
								class="flex justify-between items-center px-2 py-1 rounded hover:bg-gray-50 text-sm">
								<div class="flex items-center gap-2">
									<span v-if="group.selection_type === 'Single'" class="w-3 h-3 rounded-full border-2 border-gray-300"></span>
									<span v-else class="w-3 h-3 rounded border border-gray-300"></span>
									<span>{{ opt.option_name }}</span>
									<span v-if="opt.is_default" class="text-[9px] text-blue-500 font-bold">{{ __("default") }}</span>
								</div>
								<span v-if="opt.price_adjustment" class="text-xs font-medium"
									:class="opt.price_adjustment > 0 ? 'text-green-600' : 'text-red-600'">
									{{ opt.price_adjustment > 0 ? '+' : '' }}{{ opt.price_adjustment.toFixed(2) }}
								</span>
							</div>
						</div>

						<!-- Edit mode -->
						<div v-else class="mt-3 space-y-3 border-t pt-3">
							<!-- Group settings -->
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="text-[10px] font-medium text-gray-500 uppercase">{{ __("Name") }}</label>
									<input v-model="group.group_name" class="w-full px-2 py-1 border rounded text-sm" />
								</div>
								<div>
									<label class="text-[10px] font-medium text-gray-500 uppercase">{{ __("Type") }}</label>
									<div class="flex gap-1 mt-0.5">
										<button @click="group.selection_type = 'Single'"
											class="flex-1 py-1 text-xs font-medium rounded border transition-colors"
											:class="group.selection_type === 'Single' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'">
											{{ __("Single") }}
										</button>
										<button @click="group.selection_type = 'Multiple'"
											class="flex-1 py-1 text-xs font-medium rounded border transition-colors"
											:class="group.selection_type === 'Multiple' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200'">
											{{ __("Multiple") }}
										</button>
									</div>
								</div>
							</div>

							<label class="flex items-center gap-2 text-sm cursor-pointer">
								<input type="checkbox" v-model="group.required" class="rounded" />
								{{ __("Required (must choose)") }}
							</label>

							<!-- Options editing -->
							<div>
								<label class="text-[10px] font-medium text-gray-500 uppercase mb-1 block">{{ __("Options") }}</label>
								<div v-for="(opt, idx) in group.options" :key="idx" class="flex items-center gap-2 mb-1">
									<input v-model="opt.option_name" class="flex-1 px-2 py-1 border rounded text-sm" :placeholder="__('Option name')" />
									<input v-model.number="opt.price_adjustment" type="number" step="0.01" class="w-20 px-2 py-1 border rounded text-sm text-right" placeholder="0.00" />
									<button @click="group.options.splice(idx, 1)" class="text-red-400 hover:text-red-600">
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>
								<button @click="group.options.push({ option_name: '', price_adjustment: 0, is_default: 0 })"
									class="text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 mt-1">
									<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
									</svg>
									{{ __("Add Option") }}
								</button>
							</div>

							<!-- Applicable Item Groups -->
							<div>
								<label class="text-[10px] font-medium text-gray-500 uppercase mb-1 block">{{ __("Applies to item groups") }}</label>
								<div class="flex flex-wrap gap-1 mb-1">
									<span v-for="(ig, idx) in (group.applicable_item_groups || [])" :key="'ig-'+idx"
										class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
										{{ ig }}
										<button @click="group.applicable_item_groups.splice(idx, 1)" class="text-purple-400 hover:text-red-500">&times;</button>
									</span>
								</div>
								<div class="flex gap-1">
									<input v-model="groupSearchInput" class="flex-1 px-2 py-1 border rounded text-xs"
										:placeholder="__('Search item group...')" @input="searchItemGroups" />
								</div>
								<div v-if="groupSearchResults.length" class="mt-1 border rounded max-h-24 overflow-y-auto">
									<div v-for="ig in groupSearchResults" :key="ig.name"
										@click="addItemGroupToGroup(group, ig)"
										class="px-2 py-1 text-xs hover:bg-purple-50 cursor-pointer">
										{{ ig.name }}
									</div>
								</div>
							</div>

							<!-- Applicable Individual Items -->
							<div>
								<label class="text-[10px] font-medium text-gray-500 uppercase mb-1 block">{{ __("Or specific items") }}</label>
								<div class="flex flex-wrap gap-1 mb-1">
									<span v-for="(item, idx) in (group.applicable_items || [])" :key="'it-'+idx"
										class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
										{{ item }}
										<button @click="group.applicable_items.splice(idx, 1)" class="text-blue-400 hover:text-red-500">&times;</button>
									</span>
								</div>
								<div class="flex gap-1">
									<input v-model="itemSearchInput" class="flex-1 px-2 py-1 border rounded text-xs"
										:placeholder="__('Search item to add...')" @input="searchItemsForGroup" />
								</div>
								<div v-if="itemSearchResults.length" class="mt-1 border rounded max-h-24 overflow-y-auto">
									<div v-for="item in itemSearchResults" :key="item.name"
										@click="addItemToGroup(group, item)"
										class="px-2 py-1 text-xs hover:bg-blue-50 cursor-pointer">
										{{ item.item_name }}
									</div>
								</div>
							</div>

							<div class="flex justify-end">
								<Button variant="solid" size="sm" @click="saveGroup(group)" :loading="saving">
									{{ __("Save") }}
								</Button>
							</div>
						</div>

						<!-- Applicable items (compact) -->
						<div v-if="editingGroup !== group.name && group.applicable_items?.length"
							class="mt-2 pt-2 border-t border-gray-100">
							<span class="text-[10px] text-gray-400">
								{{ __("Applies to") }}: {{ group.applicable_items.slice(0, 3).join(', ') }}
								<span v-if="group.applicable_items.length > 3">+{{ group.applicable_items.length - 3 }}</span>
							</span>
						</div>
					</div>

					<!-- Add new group -->
					<div class="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-gray-400 transition-colors flex items-center justify-center min-h-[120px]">
						<div v-if="!showNewForm" class="text-center">
							<button @click="showNewForm = true" class="text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
								</svg>
								{{ __("New Option Group") }}
							</button>
						</div>
						<div v-else class="space-y-3 w-full">
							<input v-model="newGroupName" class="w-full px-3 py-2 border rounded-lg text-sm" :placeholder="__('Group name (e.g. Sauce, Cooking)')" />
							<div class="flex gap-2">
								<Button variant="subtle" size="sm" @click="showNewForm = false; newGroupName = ''">{{ __("Cancel") }}</Button>
								<Button variant="solid" size="sm" @click="createGroup" :disabled="!newGroupName">{{ __("Create") }}</Button>
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
const groups = ref([])
const loading = ref(true)
const saving = ref(false)
const editingGroup = ref(null)
const showNewForm = ref(false)
const newGroupName = ref("")

const doctype = ref("Product Option Group")
const itemSearchInput = ref("")
const itemSearchResults = ref([])
const groupSearchInput = ref("")
const groupSearchResults = ref([])

let searchTimeout = null
function searchItemsForGroup() {
	clearTimeout(searchTimeout)
	searchTimeout = setTimeout(async () => {
		if (!itemSearchInput.value || itemSearchInput.value.length < 2) {
			itemSearchResults.value = []
			return
		}
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item",
				filters: [["item_name", "like", `%${itemSearchInput.value}%`]],
				fields: ["name", "item_name"],
				limit_page_length: 8
			})
			itemSearchResults.value = res || []
		} catch {
			itemSearchResults.value = []
		}
	}, 300)
}

let groupSearchTimeout = null
function searchItemGroups() {
	clearTimeout(groupSearchTimeout)
	groupSearchTimeout = setTimeout(async () => {
		if (!groupSearchInput.value || groupSearchInput.value.length < 1) {
			groupSearchResults.value = []
			return
		}
		try {
			const res = await call("frappe.client.get_list", {
				doctype: "Item Group",
				filters: [["name", "like", `%${groupSearchInput.value}%`]],
				fields: ["name"],
				limit_page_length: 10
			})
			groupSearchResults.value = res || []
		} catch {
			groupSearchResults.value = []
		}
	}, 300)
}

function addItemGroupToGroup(group, ig) {
	if (!group.applicable_item_groups) group.applicable_item_groups = []
	if (!group.applicable_item_groups.includes(ig.name)) {
		group.applicable_item_groups.push(ig.name)
	}
	groupSearchInput.value = ""
	groupSearchResults.value = []
}

function addItemToGroup(group, item) {
	if (!group.applicable_items) group.applicable_items = []
	if (!group.applicable_items.includes(item.name)) {
		group.applicable_items.push(item.name)
	}
	itemSearchInput.value = ""
	itemSearchResults.value = []
}

async function loadGroups() {
	try {
		const res = await call("pos_next.api.restaurant.get_all_product_option_groups")
		if (res) groups.value = res
	} catch (error) {
		console.error("Failed to load:", error)
		showError(__("Failed to load product options"))
	} finally {
		loading.value = false
	}
}

async function saveGroup(group) {
	saving.value = true
	try {
		await call("pos_next.api.restaurant.save_product_option_group", {
			name: group.name,
			group_name: group.group_name,
			selection_type: group.selection_type,
			required: group.required ? 1 : 0,
			options: JSON.stringify(group.options.filter(o => o.option_name)),
			applicable_items: JSON.stringify(group.applicable_items || []),
			applicable_item_groups: JSON.stringify(group.applicable_item_groups || [])
		})
		showSuccess(__("Options saved"))
		editingGroup.value = null
		loadGroups()
	} catch (error) {
		showError(__("Failed to save options"))
	} finally {
		saving.value = false
	}
}

async function createGroup() {
	try {
		await call("pos_next.api.restaurant.create_product_option_group", {
			group_name: newGroupName.value
		})
		showSuccess(__("Option group created"))
		showNewForm.value = false
		newGroupName.value = ""
		loadGroups()
	} catch (error) {
		showError(__("Failed to create option group"))
	}
}

async function deleteGroup(group) {
	try {
		await call("pos_next.api.restaurant.delete_product_option_group", { name: group.name })
		showSuccess(__("Option group deleted"))
		loadGroups()
	} catch (error) {
		showError(__("Failed to delete option group"))
	}
}

onMounted(loadGroups)
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
