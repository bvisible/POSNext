<template>
	<Dialog
		v-model="show"
		:options="{
			title: __('Send to Kitchen'),
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
						<div class="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
							<img
								v-if="item.image"
								:src="item.image"
								:alt="item.item_name"
								class="w-full h-full object-cover"
							/>
							<svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
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
					{{ __("Send to Kitchen") }} ({{ selectedCount }})
				</Button>
			</div>
		</template>
	</Dialog>
</template>

<script setup>
import { ref, computed } from "vue"
import { Dialog, Button } from "frappe-ui"
import { usePOSCartStore } from "@/stores/posCart"

const emit = defineEmits(["items-sent"])

const show = ref(false)
const dialogItems = ref([])
const cartStore = usePOSCartStore()

const selectedCount = computed(() => dialogItems.value.filter(i => i.selected).length)

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

	// Update statuses in cart store
	for (const di of selectedItems) {
		const cartItem = cartStore.invoiceItems.find(
			ci => ci.item_code === di.item_code && (ci.uom || "") === (di.uom || "")
		)
		if (cartItem) {
			cartItem.kds_status = "Pending"
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
