<template>
	<Dialog
		v-model="show"
		:options="{
			title: dialogTitle,
			size: 'lg',
		}"
	>
		<template #body-content>
			<div class="p-4 space-y-3">
				<!-- Toolbar -->
				<div class="flex justify-between items-center">
					<p class="text-sm text-gray-600">{{ __("Select items to send to kitchen") }}</p>
					<div class="flex gap-2">
						<button
							@click="selectAll"
							class="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
						>
							{{ __("Select All") }}
						</button>
						<button
							@click="deselectAll"
							class="px-3 py-1 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
						>
							{{ __("Deselect All") }}
						</button>
					</div>
				</div>

				<!-- Items List -->
				<div class="space-y-1.5 max-h-[60vh] overflow-y-auto">
					<div
						v-for="(item, index) in dialogItems"
						:key="index"
						class="flex items-center gap-3 p-3 rounded-lg border transition-all"
						:class="itemRowClass(item)"
					>
						<!-- Checkbox -->
						<input
							v-if="isSendable(item)"
							type="checkbox"
							v-model="item.selected"
							class="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer flex-shrink-0"
						/>
						<div v-else class="w-5 h-5 flex-shrink-0" />

						<!-- Item Image -->
						<div class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
							:style="item.image ? {} : item.custom_color ? { backgroundColor: item.custom_color } : { backgroundColor: '#F3F4F6' }">
							<img
								v-if="item.image"
								:src="item.image"
								:alt="item.item_name"
								class="w-full h-full object-cover"
							/>
							<span v-else class="text-[7px] font-bold leading-tight text-center px-0.5"
								:class="item.custom_color && !isLightColor(item.custom_color) ? 'text-white' : 'text-gray-400'">
								{{ (item.item_name || '').substring(0, 6) }}
							</span>
						</div>

						<!-- Item Info -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm text-gray-900 truncate">{{ item.item_name }}</span>
								<span class="text-xs text-gray-500">x{{ item.quantity || item.qty }}</span>
							</div>
							<div v-if="item.posa_special_instructions" class="text-xs text-blue-600 mt-0.5 truncate">
								{{ item.posa_special_instructions }}
							</div>
						</div>

						<!-- Status Badge (for already-sent items) -->
						<span
							v-if="!isSendable(item) && item.kds_status"
							class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
							:class="statusBadgeClass(item.kds_status)"
						>
							{{ __(item.kds_status) }}
						</span>
					</div>

					<div v-if="dialogItems.length === 0" class="text-center py-8 text-gray-400 text-sm">
						{{ __("No items in cart") }}
					</div>
				</div>
			</div>
		</template>

		<template #actions>
			<div class="flex justify-end gap-2 w-full mt-2">
				<Button @click="show = false" variant="subtle">
					{{ __("Cancel") }}
				</Button>
				<Button
					@click="sendSelected"
					variant="solid"
					theme="blue"
					:disabled="selectedCount === 0"
				>
					<template #prefix>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
					</template>
					{{ sendButtonLabel }} ({{ selectedCount }})
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed } from "vue"
import { Dialog, Button } from "frappe-ui"
import { usePOSCartStore } from "@/stores/posCart"
import { useRestaurantStore } from "@/stores/restaurant"
import { isLightColor } from "@/utils/itemColors"

const emit = defineEmits(["items-sent"])

const show = ref(false)
const dialogItems = ref([])
const cartStore = usePOSCartStore()
const restaurantStore = useRestaurantStore()

const selectedCount = computed(() => dialogItems.value.filter(i => i.selected).length)

// Resolve station name for an item (individual item > item group fallback)
function getStationName(item) {
	if (item.preparation_station) return item.preparation_station
	const stationInfo = restaurantStore.getStationForItem(item.item_code, item.item_group)
	return stationInfo?.station_name || ""
}

// Dynamic title and button label based on selected items' stations
const selectedStationNames = computed(() => {
	const selected = dialogItems.value.filter(i => i.selected)
	const names = new Set()
	for (const item of selected) {
		const name = getStationName(item)
		if (name) names.add(name)
	}
	return [...names]
})

const dialogTitle = computed(() => {
	const stations = selectedStationNames.value
	if (stations.length === 1) return __("Send to {0}", [stations[0]])
	if (stations.length > 1) return __("Send to Preparation Stations")
	return __("Send to Preparation")
})

const sendButtonLabel = computed(() => {
	const stations = selectedStationNames.value
	if (stations.length === 1) return __("Send to {0}", [stations[0]])
	if (stations.length > 1) return __("Send to Preparation")
	return __("Send to Preparation")
})

function isSendable(item) {
	// Can send items that are new (no kds_status) or Waiting
	return !item.kds_status || item.kds_status === "Waiting"
}

function shouldDefaultCheck(item) {
	// New items (no status) are checked by default
	// Previously Waiting items are NOT checked (they were explicitly held back)
	return !item.kds_status
}

function open() {
	dialogItems.value = cartStore.invoiceItems
		.filter(item => !item.is_free_item)
		.map(item => ({
			...item,
			selected: isSendable(item) ? shouldDefaultCheck(item) : false,
		}))
	show.value = true
}

function selectAll() {
	dialogItems.value.forEach(i => {
		if (isSendable(i)) i.selected = true
	})
}

function deselectAll() {
	dialogItems.value.forEach(i => {
		i.selected = false
	})
}

function sendSelected() {
	const selectedItems = dialogItems.value.filter(i => i.selected)
	const waitingItems = dialogItems.value.filter(i => isSendable(i) && !i.selected)

	// Update statuses and resolve stations in cart store
	for (const di of selectedItems) {
		const cartItem = cartStore.invoiceItems.find(
			ci => ci.item_code === di.item_code && (ci.uom || "") === (di.uom || "")
		)
		if (cartItem) {
			cartItem.kds_status = "Pending"
			// Ensure preparation_station is set (individual item > item group fallback)
			if (!cartItem.preparation_station) {
				const stationInfo = restaurantStore.getStationForItem(cartItem.item_code, cartItem.item_group)
				if (stationInfo) {
					cartItem.preparation_station = stationInfo.station
				}
			}
		}
	}

	for (const di of waitingItems) {
		const cartItem = cartStore.invoiceItems.find(
			ci => ci.item_code === di.item_code && (ci.uom || "") === (di.uom || "")
		)
		if (cartItem && !cartItem.kds_status) {
			cartItem.kds_status = "Waiting"
		}
	}

	show.value = false
	emit("items-sent")
}

function itemRowClass(item) {
	if (!isSendable(item)) {
		return "bg-gray-50 border-gray-200 opacity-60"
	}
	if (item.selected) {
		return "bg-purple-50 border-purple-300"
	}
	return "bg-white border-gray-200 hover:border-gray-300"
}

function statusBadgeClass(status) {
	if (status === "Waiting") return "bg-gray-100 text-gray-600"
	if (status === "Pending") return "bg-yellow-100 text-yellow-700"
	if (status === "Preparing") return "bg-blue-100 text-blue-700"
	if (status === "Ready") return "bg-green-100 text-green-700"
	if (status === "Delivered") return "bg-gray-200 text-gray-500"
	return "bg-indigo-100 text-indigo-700"
}

defineExpose({ open })
</script>
