<template>
	<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-l-4 flex flex-col"
		:class="borderColorClass">

		<!-- Header -->
		<div class="p-3 border-b border-gray-100 dark:border-gray-700">
			<div class="flex justify-between items-start">
				<h3 class="font-bold text-lg leading-tight text-gray-900 dark:text-white">
					{{ order.restaurant_table }}
				</h3>
				<span class="font-mono text-base font-bold tabular-nums" :class="timeColorClass">
					{{ elapsedTime }}
				</span>
			</div>
			<div class="flex justify-between items-center mt-1">
				<span class="text-xs text-gray-400 font-mono">#{{ order.name.substring(0, 8) }}</span>
				<span class="text-[10px] uppercase font-bold tracking-wider rounded-full px-2 py-0.5"
					:class="statusBadgeClass">
					{{ __(order.kds_status) }}
				</span>
			</div>
		</div>

		<!-- Items -->
		<div class="p-3 flex-1">
			<div v-for="(item, idx) in order.items" :key="idx"
				class="py-1.5 relative"
				:class="[
					{ 'border-t border-gray-50 dark:border-gray-700': idx > 0 },
					item.kds_status === 'Delivered' ? 'opacity-40 line-through' : ''
				]">
				<!-- Item line: qty x name + item status badge (clickable) -->
				<div class="flex justify-between items-start gap-1 cursor-pointer rounded px-1 -mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
					@click.stop="toggleItemMenu(idx)">
					<span class="text-sm text-gray-900 dark:text-gray-100 leading-tight">
						<span class="font-bold">{{ item.qty }}x</span> {{ item.item_name }}
					</span>
					<span v-if="item.kds_status"
						class="text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 cursor-pointer"
						:class="itemStatusClass(item.kds_status)">
						{{ __(item.kds_status) }}
					</span>
				</div>
				<!-- Item context menu -->
				<div v-if="activeItemMenu === idx"
					class="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-20 py-1 min-w-[140px]">
					<button v-if="item.kds_status !== 'Preparing'"
						@click.stop="updateItemStatus(item, 'Preparing')"
						class="w-full text-left px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2">
						<span class="w-2 h-2 rounded-full bg-blue-400"></span>
						{{ __("Preparing") }}
					</button>
					<button v-if="item.kds_status !== 'Ready'"
						@click.stop="updateItemStatus(item, 'Ready')"
						class="w-full text-left px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center gap-2">
						<span class="w-2 h-2 rounded-full bg-green-500"></span>
						{{ __("Ready") }}
					</button>
					<button v-if="item.kds_status !== 'Delivered'"
						@click.stop="updateItemStatus(item, 'Delivered')"
						class="w-full text-left px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2">
						<span class="w-2 h-2 rounded-full bg-gray-400"></span>
						{{ __("Delivered") }}
					</button>
				</div>
				<!-- Modifiers -->
				<div v-if="item.posa_item_modifiers && parseModifiers(item.posa_item_modifiers).length"
					class="text-xs text-gray-400 mt-0.5 pl-4">
					→ {{ parseModifiers(item.posa_item_modifiers).join(', ') }}
				</div>
				<!-- Special instructions -->
				<div v-if="item.posa_special_instructions"
					class="text-xs text-blue-500 mt-0.5 pl-4">
					ℹ {{ item.posa_special_instructions }}
				</div>
				<!-- Station badge -->
				<span v-if="showStationBadge && item.preparation_station"
					class="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white mt-0.5 ml-4 inline-block"
					:style="{ backgroundColor: getStationColor(item.preparation_station) }">
					{{ item.preparation_station }}
				</span>
			</div>
		</div>

		<!-- Action Button -->
		<div class="p-3 border-t border-gray-100 dark:border-gray-700">
			<Button
				v-if="order.kds_status === 'Pending'"
				variant="solid"
				class="w-full h-10 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white"
				@click="updateStatus('Preparing')"
				:loading="loading"
			>
				{{ __("Start") }}
			</Button>

			<Button
				v-if="order.kds_status === 'Preparing'"
				variant="solid"
				class="w-full h-10 text-sm font-bold bg-green-500 hover:bg-green-600 text-white"
				@click="updateStatus('Ready')"
				:loading="loading"
			>
				{{ __("Ready") }}
			</Button>

			<Button
				v-if="order.kds_status === 'Ready'"
				variant="outline"
				class="w-full h-10 text-sm font-bold border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
				@click="updateStatus('Delivered')"
				:loading="loading"
			>
				{{ __("Delivered") }}
			</Button>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { Button } from "frappe-ui"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"

// Strip HTML tags from a string
function stripHtml(html) {
	if (!html) return ""
	return html.replace(/<[^>]*>/g, "").trim()
}

const props = defineProps({
	order: {
		type: Object,
		required: true
	},
	stations: {
		type: Array,
		default: () => []
	},
	showStationBadge: {
		type: Boolean,
		default: true
	}
})

const emit = defineEmits(["status-updated"])
const { showError } = useToast()
const loading = ref(false)
const activeItemMenu = ref(null)

function toggleItemMenu(idx) {
	activeItemMenu.value = activeItemMenu.value === idx ? null : idx
}

// Update individual item KDS status (optimistic UI)
async function updateItemStatus(item, newStatus) {
	activeItemMenu.value = null
	// Optimistic: update all items with same item_code instantly
	const oldStatuses = []
	props.order.items.forEach(i => {
		if (i.item_code === item.item_code) {
			oldStatuses.push(i.kds_status)
			i.kds_status = newStatus
		}
	})
	try {
		await call("pos_next.api.restaurant.update_item_kds_status", {
			invoice_name: props.order.name,
			item_code: item.item_code,
			status: newStatus
		})
		emit("status-updated")
	} catch (error) {
		// Rollback on error
		let idx = 0
		props.order.items.forEach(i => {
			if (i.item_code === item.item_code) {
				i.kds_status = oldStatuses[idx++]
			}
		})
		showError(__("Failed to update item status"))
	}
}

// Close menu when clicking outside
function handleDocClick() {
	activeItemMenu.value = null
}

// Timer: update every second
const now = ref(new Date())
let timerInterval = null

onMounted(() => {
	timerInterval = setInterval(() => {
		now.value = new Date()
	}, 1000)
	document.addEventListener("click", handleDocClick)
})

onUnmounted(() => {
	if (timerInterval) clearInterval(timerInterval)
	document.removeEventListener("click", handleDocClick)
})

const orderTime = computed(() => new Date(props.order.modified || props.order.creation))
const elapsedMinutes = computed(() => Math.floor((now.value - orderTime.value) / 60000))
const elapsedSeconds = computed(() => Math.floor(((now.value - orderTime.value) % 60000) / 1000))

const elapsedTime = computed(() => {
	const min = elapsedMinutes.value.toString().padStart(2, '0')
	const sec = elapsedSeconds.value.toString().padStart(2, '0')
	return `${min}:${sec}`
})

// Timer color: red+pulse >15min, orange >10min, green if ready
const timeColorClass = computed(() => {
	if (props.order.kds_status === 'Ready') return 'text-green-600'
	if (elapsedMinutes.value > 15) return 'text-red-600 animate-pulse'
	if (elapsedMinutes.value > 10) return 'text-orange-500'
	return 'text-gray-800 dark:text-gray-200'
})

// Left border color based on order status
const borderColorClass = computed(() => {
	switch (props.order.kds_status) {
		case 'Pending': return 'border-yellow-400'
		case 'Preparing': return 'border-blue-400'
		case 'Ready': return 'border-green-500'
		default: return 'border-gray-300'
	}
})

// Status badge styling for the order header
const statusBadgeClass = computed(() => {
	switch (props.order.kds_status) {
		case 'Pending': return 'bg-yellow-200 text-yellow-800'
		case 'Preparing': return 'bg-blue-200 text-blue-800'
		case 'Ready': return 'bg-green-200 text-green-800'
		default: return 'bg-gray-200 text-gray-800'
	}
})

// Status badge styling for individual items
function itemStatusClass(status) {
	switch (status) {
		case 'Pending': return 'bg-yellow-100 text-yellow-800'
		case 'Preparing': return 'bg-blue-100 text-blue-800'
		case 'Ready': return 'bg-green-100 text-green-800'
		case 'Delivered': return 'bg-gray-100 text-gray-800'
		default: return 'bg-gray-100 text-gray-600'
	}
}

// Look up station color from stations array prop
function getStationColor(stationName) {
	const station = props.stations.find(s => s.name === stationName)
	return station?.color || '#6B7280'
}

// Parse modifier JSON into a flat list of modifier option names
function parseModifiers(json) {
	try {
		const mods = JSON.parse(json)
		return mods.flatMap(m => m.options.map(o => o.name))
	} catch { return [] }
}

// Update order KDS status via API
// Update order-level KDS status (optimistic UI)
async function updateStatus(newStatus) {
	loading.value = true
	const oldStatus = props.order.kds_status
	// Optimistic: update instantly
	props.order.kds_status = newStatus
	try {
		await call("pos_next.api.restaurant.update_kds_status", {
			invoice_name: props.order.name,
			status: newStatus
		})
		emit("status-updated")
	} catch (error) {
		// Rollback on error
		props.order.kds_status = oldStatus
		showError(__("Failed to update KDS order status."))
	} finally {
		loading.value = false
	}
}
</script>
