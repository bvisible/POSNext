<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Preparation display (KDS): -->
	<!-- //// the screen in the kitchen and at the bar showing what to cook, per station, -->
	<!-- //// as a post-it grid with per-item status and a timer. A retail POS has nothing -->
	<!-- //// between the cart and the receipt, so upstream has no such screen (458d81a9 -->
	<!-- //// 2026-03-20 added it; e005b94b 2026-03-21 split it per station; 0e226900 -->
	<!-- //// 2026-03-22 made it a grid; f3e620c2 / db5f4ead / 97cf5339 2026-03-22 fixed -->
	<!-- //// the per-item status and the socket — it rides window.frappe.realtime rather -->
	<!-- //// than opening its own namespace, which failed with "Invalid namespace"). -->
	<!-- //// Neoffice — the dynamic viewport height, the height the browser really leaves, so that the foot of the screen never -->
	<!-- //// sits under a tablet browser's toolbar (fix round 1, ruling 72). `h-screen` is the fallback of a browser that does not -->
	<!-- //// know the unit. Not a bare `h-dvh` beside it: Tailwind writes `.h-dvh` BEFORE `.h-screen` in the stylesheet (measured -->
	<!-- //// in a browser), so `h-screen` would win everywhere; a `supports-` variant is written after the plain utilities. -->
	<!-- //// Neoffice — the text size is a set of CSS variables on the root (task 38a-1, ruling 109): the cards read them, whatever the band they are in -->
	<div class="flex flex-col h-screen supports-[height:100dvh]:h-dvh bg-gray-100 dark:bg-gray-900" :style="textSizeStyle" :data-text-size="textSize" data-test="kitchen-screen">
		<!-- //// Neoffice — ONE top bar instead of a header of two lines and a line of chips (task 38a-2, rulings 128 and 129). Row 1: the title names the -->
		<!-- //// station the screen is opened on (« Bar », « Cuisine », « Toutes les préparations »), the count on the same line, and at the right the chip of what -->
		<!-- //// waits at the pass (ruling 112), « show completed », the size of the text, the refresh and the exit. Row 2, the rooms and the stations, is drawn only -->
		<!-- //// when there is something to choose: one room has no chip, nor has a screen bound to its station (a paired tablet). -->
		<ServiceTopBar
			:title="pageTitle"
			:count="commandCountLabel"
			:dot-color="titleStation?.color || ''"
			:dot-color-on-dark="titleStation?.color ? onDark(titleStation.color) : ''"
			v-model:completed="showDelivered"
			:text-size="textSize"
			:text-size-label="textSizeLabel"
			:desk-session="deskSession"
			@cycle-size="cycleTextSize"
			@refresh="loadOrders"
			@back="$router.push('/')"
		>
			<template #chip>
				<!-- The switch of the layout moves up to row 1 when row 2 has no chip left to hold it: a screen bound to its station must not pay a row for it -->
				<KitchenLayoutSwitch v-if="canSplit && !filtersShown" :layout="layout" @update:layout="chooseLayout" />
				<!-- //// Neoffice — the chip "to deliver (N)" of what waits at the pass (task 38a-1, ruling 112): a dish that is ready leaves the kitchen screen when its station has a runner, and the chip keeps its count in view. It opens the list of those dishes. It moved from the filter line to row 1 (task 38a-2, ruling 129). -->
				<button
					v-if="hasRunnerStation"
					type="button"
					data-test="ready-chip"
					:aria-pressed="readyListShown"
					class="inline-flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-green-500 px-3.5 text-sm font-medium touch-manipulation transition-colors max-[1024px]:px-2.5"
					:class="readyListShown ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'"
					@click="showReady = !showReady"
				>
					{{ kitchenStatusLabel("Ready") }}
					<span data-test="ready-count" class="rounded-full bg-green-500 px-2 text-xs font-bold leading-5 text-gray-900">{{ readyCount }}</span>
				</button>
			</template>
			<template #filters>
				<!-- The rooms and the stations are ONE line, the same on the runner screen -->
				<RoomStationFilterLine
					:rooms="chipRooms"
					:selected-room="activeArea"
					:stations="chipStations"
					:selected-station="selectedStation"
					:all-count="allOrdersOfTheRoom.length"
					@update:selected-room="selectArea"
					@update:selected-station="selectedStation = $event"
				>
					<!-- //// Neoffice — the switch of the layout (bands one above the other, or side by side) ends the filter line, -->
					<!-- //// on the line it already has (NeoRestau lot 1, task 23). Offered only where two ticket columns fit. -->
					<template v-if="canSplit && filtersShown" #end>
						<KitchenLayoutSwitch :layout="layout" @update:layout="chooseLayout" />
					</template>
				</RoomStationFilterLine>
			</template>
		</ServiceTopBar>

		<!-- //// Neoffice — was ONE grid of tickets, oldest first, with "No Active Orders" in place of it when there was none. -->
		<!-- //// The product owner asked for what is waiting apart from what is in preparation (task 23): two bands, always on -->
		<!-- //// the screen, an empty one keeping its header and one short line, so that a ticket that arrives or leaves never -->
		<!-- //// moves the other band. How they are laid out is the cook's choice, kept on the device (useKitchenLayout). -->
		<main :class="TICKET_AREA" data-test="ticket-area">
			<div v-if="loading || waitingForRooms" class="flex justify-center items-center h-full">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
			</div>

			<!-- //// Neoffice — what waits at the pass (task 38a-1, ruling 112): the ready dishes of the stations that have a runner, ticket by ticket, -->
			<!-- //// with a call-back to preparation. It replaces the bands while the chip is pressed. -->
			<section v-else-if="readyListShown" data-test="ready-list" aria-labelledby="ready-list-title">
				<h2 id="ready-list-title" class="px-1 pb-1 text-lg font-bold text-gray-900 dark:text-white">
					{{ kitchenStatusLabel("Ready") }}
					<span data-test="ready-list-count" class="font-medium text-gray-500 dark:[&&]:!text-gray-400">({{ readyCount }})</span>
				</h2>
				<p v-if="!readyOrders.length" data-test="ready-list-empty" class="px-1 py-1 text-base text-gray-500 dark:[&&]:!text-gray-400">{{ __("No dishes to deliver") }}</p>
				<div v-else :class="[TICKET_GRID, 'content-start']">
					<div v-for="order in readyOrders" :key="order.name" data-test="ready-cell" class="flex min-w-0 flex-col">
						<KDSOrderCard
							:order="order"
							:stations="stations"
							:show-station-badge="!selectedStation"
							:station="selectedStation"
							:refresh="loadOrders"
							:room-name="roomNameOf(order)"
							mode="ready-list"
						/>
					</div>
				</div>
			</section>

			<div v-else :class="bandsClass" :data-layout="layout" data-test="bands">
				<KitchenBand
					band="waiting"
					:mode="bandMode"
					:label="kitchenStatusLabel('Pending')"
					:empty-text="__('No pending orders')"
					:orders="bands.waiting"
					:stations="stations"
					:show-station-badge="!selectedStation"
					:station="selectedStation"
					:rooms="areas"
					:runner-enabled="runnerOn"
					@status-updated="loadOrders"
				/>
				<KitchenBand
					band="production"
					:mode="bandMode"
					:label="kitchenStatusLabel('Preparing')"
					:empty-text="__('No orders in preparation')"
					:orders="bands.production"
					:stations="stations"
					:show-station-badge="!selectedStation"
					:station="selectedStation"
					:rooms="areas"
					:runner-enabled="runnerOn"
					@status-updated="loadOrders"
				/>
			</div>
		</main>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from "vue"
import RoomStationFilterLine from "@/components/restaurant/RoomStationFilterLine.vue"
//// Neoffice — the one top bar of the service screens, and the tab's title (task 38a-2, rulings 128 and 129)
import ServiceTopBar from "@/components/restaurant/ServiceTopBar.vue"
import { useDocumentTitle } from "@/composables/useDocumentTitle"
import { onDark } from "@/utils/stationColors"
//// Neoffice — the two bands, their layouts and their switch (NeoRestau lot 1, task 23); the ticket card is drawn by the band
import KitchenBand from "@/components/restaurant/KitchenBand.vue"
import KDSOrderCard from "@/components/invoices/KDSOrderCard.vue"
import KitchenLayoutSwitch from "@/components/restaurant/KitchenLayoutSwitch.vue"
import { useKitchenLayout } from "@/composables/useKitchenLayout"
import { useKitchenTextSize } from "@/composables/useKitchenTextSize"
import { splitIntoBands } from "@/utils/kitchenBands"
//// Neoffice — the kitchen's last action follows the station's runner setting (task 38a-1, ruling 112)
import {
	countDishes,
	kitchenView,
	readyForTheRunner,
	stationUsesRunner,
} from "@/utils/kitchenRunner"
import { LAYOUT_COLUMNS } from "@/utils/kitchenLayout"
import { kitchenStatusLabel } from "@/utils/kitchenStatus"
import { TICKET_AREA, TICKET_GRID } from "@/utils/ticketLayout"
import { call } from "@/utils/apiWrapper"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { initSocket } from "@/socket"
import { isDeskSession, leaveWhenSignedOut } from "@/utils/tabletSession"

const { showError } = useToast()
const restaurantStore = useRestaurantStore()
// A kitchen tablet runs on an account of its own (paired by a QR code at the till), with no till behind it
const deskSession = isDeskSession()
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
const stationsRead = ref(false)
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

//// Neoffice — was `sortedOrders`: one list, the delivered orders hidden unless asked for, oldest `creation` first. The split
//// into the two bands, and the order in each, are utils/kitchenBands: a ticket is waiting while no dish has begun, and
//// it goes by the time it was last SENT (`modified`), not by the time its table was opened (`creation`), which for a table
//// served in rounds is the time of its starters. The delivered orders still wait for "Show completed".
//// Neoffice — the dishes a runner carries are not the kitchen's any more (task 38a-1, ruling 112): a dish that is Ready at a station with a
//// runner leaves the tickets of this screen and waits in the list behind the chip "to deliver"; a station without a runner keeps its dishes
//// here until the cook delivers them. The restaurant's own runner switch overrides the stations: with no runner at all the kitchen delivers.
const runnerOn = computed(() => restaurantStore.runnerEnabled !== false)
const kitchenOrders = computed(() =>
	kitchenView(ordersOfTheRoom.value, {
		stations: stations.value,
		runnerEnabled: runnerOn.value,
	}),
)
const readyOrders = computed(() =>
	readyForTheRunner(ordersOfTheRoom.value, {
		stations: stations.value,
		runnerEnabled: runnerOn.value,
	}),
)
const readyCount = computed(() => countDishes(readyOrders.value))
// The chip exists where some station hands its dishes to a runner; none of them, nothing waits at a pass
const hasRunnerStation = computed(
	() =>
		runnerOn.value &&
		(stations.value.length === 0 || stations.value.some(stationUsesRunner)),
)
const showReady = ref(false)
const readyListShown = computed(() => showReady.value && hasRunnerStation.value)
// The room of an order as its card shows it (the short code of its name): the order carries the link, the screen knows the rooms
const roomNameOf = (order) =>
	areas.value.find((area) => area.name === order.area)?.area_name || ""

const bands = computed(() =>
	splitIntoBands(kitchenOrders.value, { includeDelivered: showDelivered.value }),
)

//// Neoffice — the page's one line (task 38a-2, ruling 128): its title names the STATION the screen is opened on (the one in the address or the
//// one chosen on the chips), with its colour as a dot; « all the preparations » when none is. The word « preparation » stays the name of a state
//// (« In preparation »). The count follows the filters and says how many tickets the screen holds in hand: the two bands together, the delivered ones
//// not counted. The tab's title is the page's.
const titleStation = computed(
	() => stations.value.find((station) => station.name === selectedStation.value) || null,
)
const pageTitle = computed(() => {
	if (!selectedStation.value) return __("All preparations")
	// A station named in the address whose name is not known yet: nothing, rather than its technical name for a moment
	return (
		titleStation.value?.station_name ||
		(stationsRead.value ? selectedStation.value : "")
	)
})
const commandCount = computed(() => {
	const held = splitIntoBands(kitchenOrders.value)
	return held.waiting.length + held.production.length
})
const commandCountLabel = computed(() =>
	commandCount.value === 1
		? __("{0} order", [commandCount.value])
		: __("{0} orders", [commandCount.value]),
)
useDocumentTitle(pageTitle)

//// Neoffice — row 2 of the bar is drawn only when there is something to choose (task 38a-2, ruling 129): a restaurant with one room has no room
//// chips (« all rooms » alone would be a chip that does nothing), one with a single station has no station chips, and a screen BOUND to its station
//// (a tablet paired for it, which has no till and no other station to go to) has none either. A desk user who opens a station's address keeps them.
const boundToItsStation = !deskSession && !!urlStation
const chipRooms = computed(() => (filterRooms.value.length > 1 ? filterRooms.value : []))
const chipStations = computed(() =>
	filterStations.value.length > 1 && !boundToItsStation ? filterStations.value : [],
)
const filtersShown = computed(
	() => chipRooms.value.length > 0 || chipStations.value.length > 0,
)

//// Neoffice — the size of the text, the cook's pick kept on the device; Compact until he asks for more (task 38a-1, ruling 109)
const {
	size: textSize,
	style: textSizeStyle,
	cycle: cycleTextSize,
	label: textSizeLabel,
} = useKitchenTextSize()

//// Neoffice — how the bands are laid out: the cook's pick, or by the way the tablet is held (task 23)
const { layout, canSplit, choose: chooseLayout } = useKitchenLayout()
const bandMode = computed(() => (layout.value === LAYOUT_COLUMNS ? "column" : "lane"))
// Side by side, the wrapper is the shared grid of tickets with one row as tall as the screen leaves it; one above the other,
// it is a column of two bands whose heights are shares of the screen (utils/ticketLayout). The floor under it (the two
// bands' floors, their headers and the gap) makes a short screen scroll the page instead of crushing a band.
const bandsClass = computed(() =>
	layout.value === LAYOUT_COLUMNS
		? `${TICKET_GRID} h-full min-h-[20rem] grid-rows-[minmax(0,1fr)]`
		: "flex h-full min-h-[34rem] flex-col gap-2",
)

// Count orders from ALL orders (not filtered by station) of the room chosen that have items for a station
function getStationOrderCount(stationName) {
	return allOrdersOfTheRoom.value.filter(
		(o) =>
			o.items && o.items.some((i) => i.preparation_station === stationName),
	).length
}

// What the shared line of filters shows, each count as plain text in parentheses: on this screen green means "Ready", and
// a count of open tickets must not wear it. A room: its tickets in the station filter that is on (the count of EVERY
// room, whichever room is chosen, so that the line says where the tickets are); a station: the tickets of the room
// chosen that have a dish for it
const filterRooms = computed(() =>
	areas.value.map((area) => ({
		name: area.name,
		label: area.area_name,
		count: orders.value.filter((o) => o.area === area.name).length,
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
		// A tablet disconnected at the till, or whose session ended: it is shown how to pair it again
		if (leaveWhenSignedOut()) return
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
	} finally {
		stationsRead.value = true
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
