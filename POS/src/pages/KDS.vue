<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Preparation display (KDS): -->
	<!-- //// the screen in the kitchen and at the bar showing what to cook, per station, -->
	<!-- //// as a post-it grid with per-item status and a timer. A retail POS has nothing -->
	<!-- //// between the cart and the receipt, so upstream has no such screen (458d81a9 -->
	<!-- //// 2026-03-20 added it; e005b94b 2026-03-21 split it per station; 0e226900 -->
	<!-- //// 2026-03-22 made it a grid; f3e620c2 / db5f4ead / 97cf5339 2026-03-22 fixed -->
	<!-- //// the per-item status and the socket — it rides window.frappe.realtime rather -->
	<!-- //// than opening its own namespace, which failed with "Invalid namespace"). -->
	<div class="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
		<!-- Header -->
		<header class="bg-white dark:bg-gray-800 shadow-sm z-10 p-4 flex justify-between items-center">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ __("Preparation Display") }}</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400">{{ __("Active Orders") }}: {{ ordersOfTheRoom.length }}</p>
			</div>
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
					<input type="checkbox" v-model="showDelivered" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
					{{ __("Show completed") }}
				</label>
				<Button @click="loadOrders" icon="refresh-cw">
					{{ __("Refresh") }}
				</Button>
				<Button @click="$router.push('/')" variant="subtle">
					{{ __("Back to POS") }}
				</Button>
			</div>
		</header>

		<!-- The rooms and the stations are ONE line, the same on the runner screen -->
		<RoomStationFilterLine
			:rooms="filterRooms"
			:selected-room="activeArea"
			:stations="filterStations"
			:selected-station="selectedStation"
			:all-count="allOrdersOfTheRoom.length"
			@update:selected-room="selectArea"
			@update:selected-station="selectedStation = $event"
		/>

		<!-- Orders Grid -->
		<main :class="TICKET_AREA" data-test="ticket-area">
			<div v-if="loading || waitingForRooms" class="flex justify-center items-center h-full">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
			</div>

			<div v-else-if="ordersOfTheRoom.length === 0" class="flex flex-col justify-center items-center h-full text-gray-500">
				<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
				<h2 class="text-xl font-medium">{{ __("No Active Orders") }}</h2>
				<p>{{ __("Kitchen is clear.") }}</p>
			</div>

			<div v-else :class="TICKET_GRID" data-test="ticket-grid">
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
import RoomStationFilterLine from "@/components/restaurant/RoomStationFilterLine.vue"
import { TICKET_AREA, TICKET_GRID } from "@/utils/ticketLayout"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { initSocket } from "@/socket"

const { showError } = useToast()
const restaurantStore = useRestaurantStore()
// The restaurant whose orders this screen shows: the one in the address (a kitchen tablet has no till of its own),
// else the one of the station in the address (a bookmark made before a site could hold several restaurants names a
// station alone), else the till's restaurant. With none of them the server picks the user's open till, else the default.
const urlParams = new URLSearchParams(window.location.search)
const urlStation = urlParams.get("station")
let screenRestaurant = urlParams.get("restaurant")
const ofTheRestaurant = () => ({
	restaurant:
		screenRestaurant ||
		(urlStation ? undefined : restaurantStore.tillRestaurant),
})
const orders = ref([])
const loading = ref(true)
const stations = ref([])
const selectedStation = ref(null)
const allOrders = ref([]) // Unfiltered orders for counting
const showDelivered = ref(
	localStorage.getItem("pos_kds_show_delivered") === "true",
)
// The rooms of the restaurant, read where the runner reads its own (get_tables), and the room chosen. An order says the
// room of its table (`area`); a takeaway order sits at no table, so it has none and shows under "all rooms" only.
const areas = ref([])
const areasRead = ref(false)
const selectedArea = ref(localStorage.getItem("pos_kds_area") || "")
let socket = null
let autoRefreshInterval = null

watch(showDelivered, (val) => {
	localStorage.setItem("pos_kds_show_delivered", val ? "true" : "false")
})

// The room that filters the tickets: the one remembered, as long as the restaurant still has it. A room that is gone, or
// rooms that cannot be read, must never hide the tickets with no chip left to show why.
const activeArea = computed(() =>
	areasRead.value && areas.value.some((a) => a.name === selectedArea.value)
		? selectedArea.value
		: "",
)
// A room is remembered but the restaurant's rooms are not known yet: wait, rather than flash every room's tickets
const waitingForRooms = computed(() => !!selectedArea.value && !areasRead.value)
const inTheRoom = (order) =>
	!activeArea.value || order.area === activeArea.value
const ordersOfTheRoom = computed(() => orders.value.filter(inTheRoom))
const allOrdersOfTheRoom = computed(() => allOrders.value.filter(inTheRoom))

const sortedOrders = computed(() => {
	let filtered = ordersOfTheRoom.value
	if (!showDelivered.value) {
		filtered = filtered.filter((o) => o.kds_status !== "Delivered")
	}
	return [...filtered].sort(
		(a, b) => new Date(a.creation) - new Date(b.creation),
	)
})

// Count orders from ALL orders (not filtered by station) of the room chosen that have items for a station
function getStationOrderCount(stationName) {
	return allOrdersOfTheRoom.value.filter(
		(o) =>
			o.items && o.items.some((i) => i.preparation_station === stationName),
	).length
}

// What the shared line of filters shows: each room with its tickets (the count of EVERY room, whichever room is chosen),
// each station with the tickets of the room chosen that have a dish for it
const filterRooms = computed(() =>
	areas.value.map((area) => ({
		name: area.name,
		label: area.area_name,
		count: allOrders.value.filter((o) => o.area === area.name).length,
	})),
)
const filterStations = computed(() =>
	stations.value.map((station) => ({
		name: station.name,
		label: station.station_name,
		color: station.color || "#d68a59",
		count: getStationOrderCount(station.name),
	})),
)

function selectArea(area) {
	selectedArea.value = area
	localStorage.setItem("pos_kds_area", area)
}

async function loadAreas() {
	try {
		const res = await call("pos_next.api.restaurant.get_tables", {
			_: Date.now(),
			...ofTheRestaurant(),
		})
		if (res?.areas) areas.value = res.areas
	} catch (error) {
		console.error("Failed to load areas:", error)
	} finally {
		areasRead.value = true
	}
}

async function loadOrders() {
	try {
		// Always load all orders for counting
		const allRes = await call("pos_next.api.restaurant.get_kds_orders", {
			_: Date.now(),
			...ofTheRestaurant(),
		})
		if (allRes) allOrders.value = allRes

		// Load filtered orders for display
		if (selectedStation.value) {
			const filteredRes = await call("pos_next.api.restaurant.get_kds_orders", {
				station: selectedStation.value,
				_: Date.now(),
				...ofTheRestaurant(),
			})
			if (filteredRes) orders.value = filteredRes
		} else {
			orders.value = allOrders.value
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
		// Load preparation stations (those of the restaurant of the station in the address, when only it is named)
		const stationsRes = await call(
			"pos_next.api.restaurant.get_preparation_stations",
			{ ...ofTheRestaurant(), ...(urlStation ? { station: urlStation } : {}) },
		)
		if (stationsRes) {
			stations.value = stationsRes
			// The server answered for the station's restaurant: the orders of this screen are that restaurant's too
			if (!screenRestaurant && urlStation) {
				screenRestaurant = stationsRes[0]?.restaurant || null
			}
		}

		// Check URL query param for pre-selection
		if (urlStation) selectedStation.value = urlStation
	} catch (error) {
		console.error("Failed to load stations:", error)
	}

	// After the stations: a bookmark that names a station alone only knows its restaurant once they have answered
	loadAreas()
	loadOrders()

	// Use the existing frappe.realtime socket (already initialized by main app)
	socket = window.frappe?.realtime || initSocket()
	if (socket) {
		if (socket.disconnected) socket.connect()
		socket.on("kds_update", () => {
			loadOrders()
		})
		socket.on("table_update", () => {
			loadOrders()
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
