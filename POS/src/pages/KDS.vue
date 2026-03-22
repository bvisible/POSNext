<template>
	<div class="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
		<!-- Header -->
		<header class="bg-white dark:bg-gray-800 shadow-sm z-10 p-4 flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ __("Preparation Display") }}</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400">{{ __("Active Orders") }}: {{ orders.length }}</p>
			</div>
			<div class="flex gap-2">
				<Button @click="loadOrders" icon="refresh-cw">
					{{ __("Refresh") }}
				</Button>
				<Button @click="$router.push('/')" variant="subtle">
					{{ __("Back to POS") }}
				</Button>
			</div>
		</header>

		<!-- Station Filter Bar -->
		<div v-if="stations.length > 0" class="bg-white dark:bg-gray-800 border-b px-4 py-2 flex items-center gap-2 overflow-x-auto">
			<button
				@click="selectedStation = null; loadOrders()"
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
				:class="!selectedStation ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
			>
				{{ __("All") }} ({{ orders.length }})
			</button>
			<button
				v-for="station in stations"
				:key="station.name"
				@click="selectedStation = station.name; loadOrders()"
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
				:class="selectedStation === station.name ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
				:style="selectedStation === station.name ? { backgroundColor: station.color || '#3B82F6' } : {}"
			>
				<span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: station.color || '#3B82F6' }"></span>
				{{ station.station_name }} ({{ getStationOrderCount(station.name) }})
			</button>
		</div>

		<!-- Orders Grid -->
		<main class="flex-1 overflow-y-auto">
			<div v-if="loading" class="flex justify-center items-center h-full">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
			</div>

			<div v-else-if="orders.length === 0" class="flex flex-col justify-center items-center h-full text-gray-500">
				<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
				<h2 class="text-xl font-medium">{{ __("No Active Orders") }}</h2>
				<p>{{ __("Kitchen is clear.") }}</p>
			</div>

			<div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
				<KDSOrderCard
					v-for="order in sortedOrders"
					:key="order.name"
					:order="order"
					:stations="stations"
					:show-station-badge="!selectedStation"
					@status-updated="loadOrders"
				/>
			</div>
		</main>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue"
import { Button } from "frappe-ui"
import KDSOrderCard from "@/components/invoices/KDSOrderCard.vue"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { initSocket } from "@/socket"

const { showError } = useToast()
const orders = ref([])
const loading = ref(true)
const stations = ref([])
const selectedStation = ref(null)
let socket = null
let autoRefreshInterval = null

const sortedOrders = computed(() => {
	return [...orders.value].sort((a, b) => new Date(a.creation) - new Date(b.creation))
})

// Count orders that have at least one item assigned to a given station
function getStationOrderCount(stationName) {
	return orders.value.filter(o =>
		o.items && o.items.some(i => i.preparation_station === stationName)
	).length
}

async function loadOrders() {
	try {
		const params = { _: Date.now() }
		if (selectedStation.value) params.station = selectedStation.value
		const res = await call("pos_next.api.restaurant.get_kds_orders", params)

		if (res) {
			orders.value = res
		}
	} catch (error) {
		console.error("Failed to load KDS orders:", error)
		showError(__("Failed to load orders from server."))
	} finally {
		loading.value = false
	}
}

onMounted(async () => {
	try {
		// Load preparation stations
		const stationsRes = await call("pos_next.api.restaurant.get_preparation_stations")
		if (stationsRes) stations.value = stationsRes

		// Check URL query param for pre-selection
		const urlParams = new URLSearchParams(window.location.search)
		const stationParam = urlParams.get('station')
		if (stationParam) selectedStation.value = stationParam
	} catch (error) {
		console.error("Failed to load stations:", error)
	}

	loadOrders()

	socket = initSocket()
	console.log("[KDS] Socket initialized:", socket ? "OK" : "FAILED")
	if (socket) {
		if (socket.disconnected) {
			console.log("[KDS] Socket disconnected, connecting...")
			socket.connect()
		}
		console.log("[KDS] Socket state:", socket.connected ? "connected" : "connecting")
		socket.on("kds_update", () => {
			console.log("[KDS] Realtime kds_update received")
			loadOrders()
		})
		socket.on("table_update", () => {
			console.log("[KDS] Realtime table_update received")
			loadOrders()
		})
		socket.on("connect", () => {
			console.log("[KDS] Socket connected")
		})
		socket.on("disconnect", () => {
			console.log("[KDS] Socket disconnected")
		})
	}

	// Fallback auto-refresh every 15s in case socket is not connected
	autoRefreshInterval = setInterval(() => {
		loadOrders()
	}, 15000)
})

watch(selectedStation, () => {
	loadOrders()
})

onUnmounted(() => {
	if (socket) {
		socket.off("kds_update")
	}
	if (autoRefreshInterval) {
		clearInterval(autoRefreshInterval)
	}
})
</script>
