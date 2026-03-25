<template>
	<Dialog v-model="show" :options="{ title: __('Create New Item'), size: 'md' }">
		<template #body-content>
			<div v-if="loadingDefaults" class="flex items-center justify-center py-8">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
			<div v-else class="flex flex-col gap-4 max-h-[65vh] overflow-y-auto pr-1">
				<!-- Item Name -->
				<div>
					<label class="block text-start text-sm font-medium text-gray-700 mb-1">
						{{ __("Item Name") }} <span class="text-red-500">*</span>
					</label>
					<Input
						v-model="itemData.item_name"
						type="text"
						:placeholder="__('e.g. Pizza 4 fromages')"
					/>
				</div>

				<!-- Item Code -->
				<div>
					<label class="block text-start text-sm font-medium text-gray-700 mb-1">
						{{ __("Item Code") }} <span class="text-red-500">*</span>
					</label>
					<Input
						v-model="itemData.item_code"
						type="text"
						:placeholder="__('Auto-generated from name')"
						@input="manualCodeEdit = true"
					/>
				</div>

				<!-- Item Group + UOM row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Item Group") }} <span class="text-red-500">*</span>
						</label>
						<select
							v-model="itemData.item_group"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
						>
							<option value="" disabled>{{ __("Select...") }}</option>
							<option v-for="group in defaults.item_groups" :key="group" :value="group">
								{{ group }}
							</option>
						</select>
					</div>
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Unit of Measure") }} <span class="text-red-500">*</span>
						</label>
						<select
							v-model="itemData.stock_uom"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
						>
							<option value="" disabled>{{ __("Select...") }}</option>
							<option v-for="uom in defaults.uoms" :key="uom" :value="uom">
								{{ uom }}
							</option>
						</select>
					</div>
				</div>

				<!-- Selling Rate + Buying Rate row -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Selling Rate") }}
						</label>
						<Input
							v-model="itemData.standard_selling_rate"
							type="number"
							step="0.01"
							placeholder="0.00"
						/>
					</div>
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Buying Rate") }}
						</label>
						<Input
							v-model="itemData.standard_buying_rate"
							type="number"
							step="0.01"
							placeholder="0.00"
						/>
					</div>
				</div>

				<!-- Maintain Stock -->
				<div class="flex items-center gap-2 pt-1">
					<input
						type="checkbox"
						v-model="itemData.is_stock_item"
						id="maintain-stock"
						class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<label for="maintain-stock" class="text-sm font-medium text-gray-700 cursor-pointer">
						{{ __("Maintain Stock") }}
					</label>
				</div>

				<!-- Stock fields (conditional) -->
				<div v-if="itemData.is_stock_item" class="grid grid-cols-2 gap-3 pl-4 border-l-2 border-blue-200">
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Opening Stock") }}
						</label>
						<Input
							v-model="itemData.opening_stock"
							type="number"
							step="0.001"
							placeholder="0"
						/>
					</div>
					<div>
						<label class="block text-start text-sm font-medium text-gray-700 mb-1">
							{{ __("Warehouse") }} <span class="text-red-500">*</span>
						</label>
						<select
							v-model="itemData.warehouse"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
						>
							<option value="" disabled>{{ __("Select...") }}</option>
							<option v-for="wh in defaults.warehouses" :key="wh" :value="wh">
								{{ wh }}
							</option>
						</select>
					</div>
				</div>

				<!-- Display Color -->
			<div>
				<label class="block text-start text-sm font-medium text-gray-700 mb-1.5">
					{{ __("Display Color") }}
				</label>
				<div class="flex flex-wrap gap-2">
					<button
						v-for="c in colorPalette"
						:key="c.hex"
						@click="itemData.color = (itemData.color === c.hex ? '' : c.hex)"
						:class="[
							'w-8 h-8 rounded-full border-2 transition-all duration-100',
							itemData.color === c.hex
								? 'border-gray-900 scale-110 ring-2 ring-offset-1 ring-gray-400'
								: 'border-transparent hover:scale-105'
						]"
						:style="{ backgroundColor: c.hex }"
						:title="__(c.name)"
						type="button"
					/>
					<button
						v-if="itemData.color"
						@click="itemData.color = ''"
						class="w-8 h-8 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-gray-600"
						:title="__('Clear color')"
						type="button"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Image -->
			<div>
				<label class="block text-start text-sm font-medium text-gray-700 mb-1.5">
					{{ __("Image") }}
				</label>
				<div v-if="itemData.image" class="relative inline-block">
					<img :src="itemData.image" class="w-20 h-20 rounded-lg object-cover border border-gray-200" />
					<button @click="itemData.image = ''"
						class="absolute -top-1.5 -right-1.5 p-0.5 bg-white rounded-full shadow border border-gray-200 hover:bg-red-50"
						type="button">
						<svg class="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div v-else class="flex gap-2">
					<!-- Upload image -->
					<label class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
						{{ __("Upload") }}
						<input type="file" accept="image/*" class="hidden" @change="handleImageUpload" />
					</label>
					<!-- Search Pexels -->
					<button
						v-if="defaults.has_image_search"
						@click="showImageSearch = true"
						class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
						type="button"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
						{{ __("Search") }}
					</button>
				</div>
			</div>

			<!-- Image Search Dialog -->
			<ImageSearchDialog
				v-model="showImageSearch"
				:initial-query="itemData.item_name"
				@image-selected="onImageSelected"
			/>

			<!-- Product Options -->
			<div v-if="restaurantStore.isEnabled && modifierGroups.length">
				<label class="block text-start text-sm font-medium text-gray-700 mb-1.5">
					{{ __("Product Options") }}
				</label>
				<div class="flex flex-wrap gap-2">
					<button
						v-for="g in modifierGroups"
						:key="g.name"
						@click="toggleOptionGroup(g.name)"
						:class="[
							'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
							itemData.option_groups.includes(g.name)
								? 'bg-blue-50 border-blue-400 text-blue-700'
								: 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
						]"
						type="button"
					>
						{{ g.group_name }}
						<span v-if="g.required" class="text-red-400 ml-0.5">*</span>
					</button>
				</div>
			</div>

			<!-- Permission warning -->
				<div v-if="!hasPermission" class="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
					<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
					{{ __("You don't have permission to create items") }}
				</div>

				<!-- Error message -->
				<div v-if="errorMessage" class="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
					{{ errorMessage }}
				</div>
			</div>
		</template>
		<template #actions>
			<div class="flex gap-2">
				<Button variant="subtle" @click="show = false" :disabled="creating">
					{{ __("Cancel") }}
				</Button>
				<Button
					variant="solid"
					theme="blue"
					:disabled="!canCreate || creating"
					:loading="creating"
					@click="handleCreate"
				>
					{{ __("Create Item") }}
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed, watch } from "vue"
import { Button, Dialog, Input } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { usePermissions } from "@/composables/usePermissions"
import { usePOSShiftStore } from "@/stores/posShift"
import { ITEM_COLOR_PALETTE } from "@/utils/itemColors"
import { useRestaurantStore } from "@/stores/restaurant"
import ImageSearchDialog from "./ImageSearchDialog.vue"

const colorPalette = ITEM_COLOR_PALETTE
const restaurantStore = useRestaurantStore()
const modifierGroups = computed(() => restaurantStore.modifierGroups || [])

const props = defineProps({
	initialName: { type: String, default: "" },
})

const show = defineModel({ type: Boolean, default: false })
const emit = defineEmits(["item-created"])

const { showSuccess, showError } = useToast()
const { checkPermission } = usePermissions()
const shiftStore = usePOSShiftStore()

const showImageSearch = ref(false)
const loadingDefaults = ref(false)
const creating = ref(false)
const errorMessage = ref("")
const hasPermission = ref(true)
const manualCodeEdit = ref(false)

const defaults = ref({
	item_groups: [],
	uoms: [],
	default_uom: "Nos",
	default_item_group: "",
	default_warehouse: "",
	warehouses: [],
})

const itemData = ref({
	item_name: "",
	item_code: "",
	item_group: "",
	stock_uom: "",
	standard_selling_rate: 0,
	standard_buying_rate: 0,
	is_stock_item: false,
	opening_stock: 0,
	warehouse: "",
	color: "",
	image: "",
	option_groups: [],
})

const canCreate = computed(() => {
	return (
		hasPermission.value &&
		itemData.value.item_name &&
		itemData.value.item_code &&
		itemData.value.item_group &&
		itemData.value.stock_uom &&
		(!itemData.value.is_stock_item || itemData.value.warehouse)
	)
})

// Auto-generate item_code from item_name
watch(() => itemData.value.item_name, (name) => {
	if (!manualCodeEdit.value) {
		itemData.value.item_code = name
	}
})

// Load defaults when dialog opens
watch(show, async (val) => {
	if (val) {
		errorMessage.value = ""
		manualCodeEdit.value = false

		// Pre-fill from search query
		itemData.value.item_name = props.initialName || ""
		itemData.value.item_code = props.initialName || ""
		itemData.value.item_group = ""
		itemData.value.standard_selling_rate = 0
		itemData.value.standard_buying_rate = 0
		itemData.value.is_stock_item = false
		itemData.value.opening_stock = 0
		itemData.value.color = ""
		itemData.value.image = ""
		itemData.value.option_groups = []

		// Check permission
		hasPermission.value = await checkPermission("Item", "create")

		// Load dropdown data
		await loadDefaults()
	}
})

async function loadDefaults() {
	loadingDefaults.value = true
	try {
		const res = await call("pos_next.api.restaurant.get_item_creation_defaults", {
			pos_profile: shiftStore.profileName,
		})
		defaults.value = res

		// Apply defaults
		itemData.value.item_group = res.default_item_group || ""
		itemData.value.stock_uom = res.default_uom || (res.uoms.length ? res.uoms[0] : "")
		itemData.value.warehouse = res.default_warehouse || ""
	} catch (err) {
		console.error("Failed to load item creation defaults:", err)
	} finally {
		loadingDefaults.value = false
	}
}

function toggleOptionGroup(name) {
	const idx = itemData.value.option_groups.indexOf(name)
	if (idx >= 0) itemData.value.option_groups.splice(idx, 1)
	else itemData.value.option_groups.push(name)
}

function onImageSelected(imageUrl) {
	itemData.value.image = imageUrl
}

async function handleImageUpload(event) {
	const file = event.target.files?.[0]
	if (!file) return
	try {
		const formData = new FormData()
		formData.append("file", file)
		formData.append("is_private", "0")
		formData.append("doctype", "Item")
		const res = await fetch("/api/method/upload_file", {
			method: "POST",
			body: formData,
			headers: {
				"X-Frappe-CSRF-Token": window.csrf_token,
			},
		})
		const data = await res.json()
		if (data.message?.file_url) {
			itemData.value.image = data.message.file_url
		}
	} catch (err) {
		showError(__("Failed to upload image"))
	}
	event.target.value = ""
}

async function handleCreate() {
	if (!canCreate.value) return

	creating.value = true
	errorMessage.value = ""

	try {
		const result = await call("pos_next.api.restaurant.create_item", {
			item_name: itemData.value.item_name,
			item_code: itemData.value.item_code,
			item_group: itemData.value.item_group,
			stock_uom: itemData.value.stock_uom,
			is_stock_item: itemData.value.is_stock_item ? 1 : 0,
			standard_selling_rate: itemData.value.standard_selling_rate || 0,
			standard_buying_rate: itemData.value.standard_buying_rate || 0,
			opening_stock: itemData.value.opening_stock || 0,
			warehouse: itemData.value.warehouse || "",
			pos_profile: shiftStore.profileName,
			image: itemData.value.image || "",
			color: itemData.value.color || "",
			option_groups: JSON.stringify(itemData.value.option_groups),
		})

		showSuccess(__("Item '{0}' created successfully", [result.item_name]))
		emit("item-created", result)
		show.value = false
	} catch (err) {
		const msg = err?.message || err?.exc || __("Failed to create item")
		errorMessage.value = msg
		showError(__("Failed to create item"))
	} finally {
		creating.value = false
	}
}
</script>
