<template>
	<div class="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
		<!-- Header -->
		<header class="bg-white dark:bg-gray-800 shadow-sm z-10 p-4 flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ __("Runner Display") }}</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400">
					{{ __("Ready Items") }}: {{ totalReadyItems }}
				</p>
			</div>
			<div class="flex gap-2 items-center">
				<!-- Area filter -->
				<select
					v-if="areas.length > 1"
					v-model="selectedArea"
					@change="onAreaChange"
					class="h-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm px-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<option value="">{{ __("All Areas") }}</option>
					<option v-for="a in areas" :key="a.name" :value="a.name">{{ a.area_name }}</option>
				</select>

				<!-- View mode toggle -->
				<div class="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
					<button
						@click="viewMode = 'table'"
						class="px-3 py-1.5 text-sm font-medium transition-colors"
						:class="viewMode === 'table'
							? 'bg-blue-600 text-white'
							: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'"
					>
						{{ __("By Table") }}
					</button>
					<button
						@click="viewMode = 'station'"
						class="px-3 py-1.5 text-sm font-medium transition-colors"
						:class="viewMode === 'station'
							? 'bg-blue-600 text-white'
							: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'"
					>
						{{ __("By Station") }}
					</button>
				</div>
				<Button @click="loadOrders" icon="refresh-cw">
					{{ __("Refresh") }}
				</Button>
				<Button @click="$router.push('/')" variant="subtle">
					{{ __("Back to POS") }}
				</Button>
			</div>
		</header>

		<!-- Main content -->
		<main class="flex-1 overflow-y-auto p-6">
			<div v-if="loading" class="flex justify-center items-center h-full">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
			</div>

			<div v-else-if="groupedCards.length === 0" class="flex flex-col justify-center items-center h-full text-gray-500">
				<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
				</svg>
				<h2 class="text-xl font-medium">{{ __("No Items Ready") }}</h2>
				<p>{{ __("All items are either being prepared or have been delivered.") }}</p>
			</div>

			<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				<RunnerOrderCard
					v-for="card in groupedCards"
					:key="card.key"
					:card="card"
					:view-mode="viewMode"
					@delivered="loadOrders"
				/>
			</div>
		</main>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue"
import { Button } from "frappe-ui"
import RunnerOrderCard from "@/components/invoices/RunnerOrderCard.vue"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { initSocket } from "@/socket"

const { showError } = useToast()
const orders = ref([])
const areas = ref([])
const loading = ref(true)
const viewMode = ref("table")
const selectedArea = ref(localStorage.getItem("pos_runner_area") || "")
let socket = null
let previousCount = 0

const totalReadyItems = computed(() => {
	return orders.value.reduce((sum, order) => sum + (order.items?.length || 0), 0)
})

function onAreaChange() {
	localStorage.setItem("pos_runner_area", selectedArea.value)
	loadOrders()
}

// Group orders by table or by station
const groupedCards = computed(() => {
	if (viewMode.value === "table") {
		return groupByTable()
	} else {
		return groupByStation()
	}
})

function groupByTable() {
	return orders.value
		.map(order => ({
			key: order.name,
			title: order.table_display_name || order.restaurant_table,
			subtitle: `#${order.name.substring(0, 8)}`,
			invoiceName: order.name,
			creation: order.creation,
			modified: order.modified,
			items: order.items || [],
			stationGroups: groupItemsByStation(order.items || [])
		}))
		.sort((a, b) => new Date(a.modified) - new Date(b.modified))
}

function groupByStation() {
	const stationMap = {}
	for (const order of orders.value) {
		for (const item of (order.items || [])) {
			const stationId = item.preparation_station || "__general__"
			const stationName = stationId === "__general__" ? __("General") : (getStationDisplayName(stationId) || stationId)
			const stationColor = item.station_color || "#6B7280"

			if (!stationMap[stationId]) {
				stationMap[stationId] = {
					key: stationId,
					title: stationName,
					subtitle: "",
					stationColor: stationColor,
					creation: order.creation,
					modified: order.modified,
					items: [],
					tableGroups: {}
				}
			}

			const enrichedItem = {
				...item,
				_invoiceName: order.name,
				_tableName: order.table_display_name || order.restaurant_table
			}
			stationMap[stationId].items.push(enrichedItem)

			const tableKey = order.restaurant_table
			if (!stationMap[stationId].tableGroups[tableKey]) {
				stationMap[stationId].tableGroups[tableKey] = {
					tableName: order.table_display_name || order.restaurant_table,
					invoiceName: order.name,
					items: []
				}
			}
			stationMap[stationId].tableGroups[tableKey].items.push(enrichedItem)
		}
	}

	return Object.values(stationMap)
		.map(s => ({
			...s,
			subtitle: `${s.items.length} ${s.items.length === 1 ? __("item") : __("items")}`,
			tableGroups: Object.values(s.tableGroups)
		}))
		.sort((a, b) => a.title.localeCompare(b.title))
}

function groupItemsByStation(items) {
	const groups = {}
	for (const item of items) {
		const stationId = item.preparation_station || "__general__"
		if (!groups[stationId]) {
			groups[stationId] = {
				stationName: stationId === "__general__" ? __("General") : (getStationDisplayName(stationId) || stationId),
				stationColor: item.station_color || "#6B7280",
				items: []
			}
		}
		groups[stationId].items.push(item)
	}
	return Object.values(groups)
}

const stationNames = ref({})
function getStationDisplayName(stationId) {
	return stationNames.value[stationId] || stationId
}

async function loadAreas() {
	try {
		const res = await call("pos_next.api.restaurant.get_tables", { _: Date.now() })
		if (res?.areas) {
			areas.value = res.areas
		}
	} catch (error) {
		console.error("Failed to load areas:", error)
	}
}

async function loadOrders() {
	try {
		const params = { _: Date.now() }
		if (selectedArea.value) {
			params.area = selectedArea.value
		}
		const res = await call("pos_next.api.restaurant.get_runner_orders", params)
		if (res) {
			orders.value = res

			for (const order of res) {
				for (const item of (order.items || [])) {
					if (item.preparation_station) {
						stationNames.value[item.preparation_station] = item.preparation_station
					}
				}
			}

			// Audio notification on new items
			const newCount = totalReadyItems.value
			if (newCount > previousCount && previousCount > 0) {
				playNotificationSound()
			}
			previousCount = newCount
		}
	} catch (error) {
		console.error("Failed to load runner orders:", error)
		showError(__("Failed to load orders."))
	} finally {
		loading.value = false
	}
}

function playNotificationSound() {
	try {
		const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
		const oscillator = audioCtx.createOscillator()
		const gainNode = audioCtx.createGain()
		oscillator.connect(gainNode)
		gainNode.connect(audioCtx.destination)
		oscillator.frequency.value = 880
		oscillator.type = "sine"
		gainNode.gain.value = 0.3
		oscillator.start()
		gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
		oscillator.stop(audioCtx.currentTime + 0.3)
	} catch {
		// Audio not available
	}
}

onMounted(() => {
	loadAreas()
	loadOrders()

	socket = initSocket()
	if (socket) {
		if (socket.disconnected) {
			socket.connect()
		}
		socket.on("kds_update", () => {
			console.log("Realtime Runner Update Received")
			loadOrders()
		})
	}
})

onUnmounted(() => {
	if (socket) {
		socket.off("kds_update")
	}
})
</script>
