<template>
	<div class="flex flex-col h-screen bg-gray-50">
		<!-- Header -->
		<div class="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
				</svg>
				<h1 class="text-lg font-bold text-gray-900">{{ __("Takeaway Orders") }}</h1>
				<span v-if="orders.length" class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">
					{{ readyCount }}/{{ orders.length }}
				</span>
			</div>
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
					<input type="checkbox" v-model="showDelivered" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
					{{ __("Show completed") }}
				</label>
				<button @click="loadOrders" class="p-2 rounded-lg hover:bg-gray-100 text-gray-500" :title="__('Refresh')">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</button>
				<a href="/pos/" class="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
					{{ __("Back to POS") }}
				</a>
			</div>
		</div>

		<!-- Status filter tabs -->
		<div class="bg-white border-b border-gray-200 px-4 py-2 flex gap-2">
			<button
				v-for="tab in statusTabs"
				:key="tab.value"
				@click="selectedStatus = tab.value"
				:class="[
					'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
					selectedStatus === tab.value
						? 'bg-blue-100 text-blue-700'
						: 'text-gray-500 hover:bg-gray-100'
				]"
			>
				{{ __(tab.label) }}
				<span v-if="tab.count > 0" class="ml-1 bg-white/50 px-1.5 py-0.5 rounded text-[10px]">{{ tab.count }}</span>
			</button>
		</div>

		<!-- Orders grid -->
		<div class="flex-1 overflow-y-auto p-4">
			<div v-if="loading" class="flex justify-center items-center py-12">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>

			<div v-else-if="filteredOrders.length === 0" class="text-center py-12">
				<svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
				</svg>
				<p class="text-gray-400 text-sm">{{ __("No takeaway orders") }}</p>
			</div>

			<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
				<div
					v-for="order in filteredOrders"
					:key="order.name"
					class="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
				>
					<!-- Order header -->
					<div class="px-4 py-3 flex items-center justify-between"
						:class="getStatusHeaderClass(order.kds_status)">
						<div>
							<span class="font-bold text-sm">{{ order.takeaway_number || order.name }}</span>
							<span v-if="order.customer_name" class="ml-2 text-xs opacity-75">{{ order.customer_name }}</span>
						</div>
						<span class="text-xs font-medium px-2 py-0.5 rounded-full"
							:class="getStatusBadgeClass(order.kds_status)">
							{{ __(order.kds_status || 'Pending') }}
						</span>
					</div>

					<!-- Items list -->
					<div class="px-4 py-2 space-y-1 border-b border-gray-100">
						<div v-for="item in order.items" :key="item.item_code" class="flex justify-between text-sm">
							<span class="text-gray-700">{{ item.qty }}x {{ item.item_name }}</span>
							<span class="text-gray-400">{{ formatCurrency(item.amount) }}</span>
						</div>
					</div>

					<!-- Order footer with actions -->
					<div class="px-4 py-2 flex items-center justify-between">
						<span class="text-xs text-gray-400">{{ formatTime(order.creation) }}</span>
						<div class="flex gap-1.5">
							<button
								v-if="order.kds_status !== 'Ready' && order.kds_status !== 'Delivered'"
								@click="markReady(order)"
								class="px-2.5 py-1 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition-colors"
							>
								{{ __("Ready") }}
							</button>
							<button
								v-if="order.kds_status === 'Ready'"
								@click="markDelivered(order)"
								class="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
							>
								{{ __("Picked Up") }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { call } from "@/utils/apiWrapper"
import { initSocket } from "@/socket"

const orders = ref([])
const loading = ref(true)
const selectedStatus = ref("")

const readyCount = computed(() => orders.value.filter(o => o.kds_status === "Ready").length)

const statusTabs = computed(() => [
	{ value: "", label: "All", count: orders.value.length },
	{ value: "Pending", label: "Pending", count: orders.value.filter(o => !o.kds_status || o.kds_status === "Pending").length },
	{ value: "Preparing", label: "Preparing", count: orders.value.filter(o => o.kds_status === "Preparing").length },
	{ value: "Ready", label: "Ready", count: readyCount.value },
])

const filteredOrders = computed(() => {
	if (!selectedStatus.value) return orders.value
	return orders.value.filter(o => (o.kds_status || "Pending") === selectedStatus.value)
})

async function loadOrders() {
	try {
		const res = await call("pos_next.api.restaurant.get_takeaway_orders", { _: Date.now() })
		orders.value = res || []
	} catch (err) {
		console.error("Failed to load takeaway orders:", err)
	} finally {
		loading.value = false
	}
}

async function markReady(order) {
	await call("pos_next.api.restaurant.update_takeaway_status", {
		invoice_name: order.name,
		status: "Ready",
	})
	loadOrders()
}

async function markDelivered(order) {
	await call("pos_next.api.restaurant.update_takeaway_status", {
		invoice_name: order.name,
		status: "Delivered",
	})
	loadOrders()
}

function getStatusHeaderClass(status) {
	switch (status) {
		case "Ready": return "bg-green-50"
		case "Preparing": return "bg-amber-50"
		case "Delivered": return "bg-gray-50"
		default: return "bg-blue-50"
	}
}

function getStatusBadgeClass(status) {
	switch (status) {
		case "Ready": return "bg-green-100 text-green-700"
		case "Preparing": return "bg-amber-100 text-amber-700"
		case "Delivered": return "bg-gray-100 text-gray-500"
		default: return "bg-blue-100 text-blue-700"
	}
}

function formatCurrency(amount) {
	return new Intl.NumberFormat("fr-CH", { style: "decimal", minimumFractionDigits: 2 }).format(amount || 0)
}

function formatTime(creation) {
	if (!creation) return ""
	const d = new Date(creation)
	return d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })
}

// Realtime updates
let socket = null
let pollInterval = null

onMounted(() => {
	loadOrders()
	socket = window.frappe?.realtime || initSocket()
	if (socket) {
		socket.on("takeaway_update", loadOrders)
		socket.on("kds_update", loadOrders)
	}
	// Fallback polling every 30s
	pollInterval = setInterval(loadOrders, 30000)
})

onUnmounted(() => {
	if (socket) {
		socket.off("takeaway_update", loadOrders)
		socket.off("kds_update", loadOrders)
	}
	if (pollInterval) clearInterval(pollInterval)
})
</script>
