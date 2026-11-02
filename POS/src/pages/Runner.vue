<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Runner display: what is -->
	<!-- //// ready and to which table it goes, by area or by station, with delivery -->
	<!-- //// arrows on the floor plan. It closes the preparation workflow the KDS opens, -->
	<!-- //// and it renders an explicit disabled state instead of an empty screen when -->
	<!-- //// the runner step is off in the settings (d59036f1 2026-03-23 "preparation -->
	<!-- //// workflows, runner display, and workflow APIs"; 784f82bd + a17f7297 + -->
	<!-- //// 20be8d0f 2026-03-23; 4637f08d + 059127f1 2026-03-24 the disabled state). -->
	<!-- Runner disabled message -->
	<div v-if="!runnerEnabled" class="flex flex-col h-screen bg-gray-100 dark:bg-gray-900 items-center justify-center">
		<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
		</svg>
		<!-- //// Neoffice — dark mode (task 46): the till's dark remap of `.text-gray-500` is `!important` (index.css) and reads 4.35:1 on the screen's ground, so a plain `dark:` colour never reached it; `[&&]` doubles the selector so that this variant outranks it. -->
		<h2 class="text-xl font-medium text-gray-500 dark:[&&]:!text-gray-400">{{ __("Runner is disabled") }}</h2>
		<p class="text-sm text-gray-400 mt-1">{{ __("Enable it in Restaurant Settings to use the Runner display.") }}</p>
		<!-- A tablet signed in with its own account has no till to go back to -->
		<button v-if="deskSession" @click="$router.push('/')" class="mt-4 px-4 py-2 bg-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-300">
			{{ __("Back to POS") }}
		</button>
	</div>

	<!-- //// Neoffice — the text size is a set of CSS variables on the root, as on the kitchen screen (task 38a-2): the cards read them. And the dynamic viewport height, as the kitchen's root has it (ruling 72): a tablet browser's toolbar must not cut the foot of the screen. -->
	<!-- //// Neoffice — the phone (NeoResto lot 1, smoke-test fix): below 768 px the root never widens the page (`max-md:overflow-x-hidden`): the bar's controls used to push it to 797 px at 390 px, and a page wider than the phone widens the layout viewport of a mobile browser, which stretched the full-screen ticket past the screen. The bar wraps now (ServiceTopBar); this keeps it so whatever a screen adds later. -->
	<div v-else class="flex flex-col h-screen supports-[height:100dvh]:h-dvh bg-gray-100 dark:bg-gray-900 max-md:overflow-x-hidden" :style="textSizeStyle" :data-text-size="textSize" data-test="runner-screen">
		<!-- //// Neoffice — ONE top bar instead of a header of two lines and a line of chips, the same as the kitchen's (task 38a-2, rulings 129 and 130). Row 1: « Runner » -->
		<!-- //// (and the room when one is chosen) with the count of what is ready on the same line, the display modes of the screen, and at the right the actions. -->
		<!-- //// Row 2, the rooms and the stations, is drawn only when there is something to choose. -->
		<ServiceTopBar
			:title="pageTitle"
			:count="readyCountLabel"
			:dot-color="READY_GREEN"
			:dot-color-on-dark="READY_GREEN_ON_DARK"
			v-model:completed="showDelivered"
			:text-size="textSize"
			:text-size-label="textSizeLabel"
			:desk-session="deskSession"
			@cycle-size="cycleTextSize"
			@refresh="loadOrders"
			@back="$router.push('/')"
		>
			<!-- //// Neoffice — the switch between the restaurant's screens (task 38a-2, ruling 132), with the filters that are on: the restaurant of the address, the station, the room -->
			<template #switch>
				<RestaurantScreenSwitch
					:current="SCREEN_RUNNER"
					:desk-session="deskSession"
					:filters="{ restaurant: urlRestaurant, station: selectedStation, room: activeArea }"
				/>
			</template>
			<!-- //// Neoffice — the theme button of the screen (task 38a-2, ruling 131): these screens have no user menu to change the colour mode from. A desk user's choice is kept on the account too, as the till's menu keeps it; a tablet's stays on the device -->
			<template #theme>
				<ThemeButton :persist-desk-theme="deskSession" />
			</template>
			<!-- //// Neoffice — the awake settings of THIS device, beside the size of the text (task 47): keep the screen on, rest after N minutes, wake on a new ticket, let the tablet sleep -->
			<template #screen>
				<ScreenAwakeSettings :settings="awakeSettings" :wake-lock-supported="wakeLockSupported" @change="setAwakeSetting" />
				<!-- //// Neoffice — the choices of the printer button of the tickets (task 44): the button (off on the runner screen unless chosen), what prints, the COPY mark. Drawn where a station has a printer -->
				<PrintCopySettings v-if="hasCopyPrinters" screen="Runner" :settings="copySettings" @change="setCopySetting" />
			</template>
			<!-- //// Neoffice — a sound is on but the browser has not been touched yet: it can make none before (NeoResto lot 1, Daniel, 01.11) -->
			<template #chip>
				<SoundUnlockChip :enabled="runnerSoundOn" />
			</template>
			<template #view>
				<!-- //// Neoffice — the display modes of THIS screen, named as such (task 38a-2, ruling 132): « By table », « By station », « On the plan ». The last one was « Plan de salle »,
				     the very word of a destination, next to a switch that now has a real « Plan de salle ». -->
				<SegmentedControl v-model="viewMode" small name="view" :label="__('Display')" :options="viewModes" />
			</template>
			<template #filters>
				<!-- The rooms and the stations are ONE line, the same on the kitchen screen. The plan view has no station to choose -->
				<RoomStationFilterLine
					:rooms="chipRooms"
					:selected-room="activeArea"
					:stations="chipStations"
					:selected-station="selectedStation"
					:all-count="filteredByAreaOrders.length"
					@update:selected-room="selectArea"
					@update:selected-station="selectedStation = $event"
				>
					<!-- The runner counts what is READY, and says it in green (the colour of its Ready badges) on a room, and with a
					     pill of the station's own colour and a tick on a station. Nothing when no dish is ready. The kitchen screen
					     counts its open tickets, and gives its counts no such meaning -->
					<template #room-count="{ room }">
						<!-- //// Neoffice — dark mode (task 46): white on `green-500` is 2.6:1; in dark the count is ink on the dark ramp's success green -->
						<span v-if="room.count > 0" data-test="room-count"
							class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-green-500 dark:bg-ds-success dark:text-ds-ink rounded-full">{{ room.count }}</span>
					</template>
					<template #station-count="{ station, selected }">
						<!-- //// Neoffice — dark mode (task 46): a station's count is written in the station's own colour on a tint of it (a blue station 1.9:1 on a dark chip). The colour moves from the inline style to a variable the class reads, so that in dark it can be the same colour lightened (`onDark`). A chosen chip keeps the text colour of the chip and its white wash (now a class, `bg-[rgba(255,255,255,0.3)]`, the very value it was inline: the till's dark remap of `bg-white/30` is `!important` and would flatten that class), and on a chip whose text is white the wash is black in dark, so that the count reads (white on the white wash was 3.7:1). -->
						<span v-if="station.count > 0" data-test="station-count"
							class="text-xs font-bold px-1.5 py-0.5 rounded"
							:class="selected
								? ['bg-[rgba(255,255,255,0.3)]', inkOn(station.color) === '#FFFFFF' ? 'dark:bg-black/25' : '']
								: 'text-[color:var(--station-color)] dark:text-[color:var(--station-on-dark)]'"
							:style="selected
								? {}
								: { backgroundColor: station.color + '20', '--station-color': station.color, '--station-on-dark': onDark(station.color) }">{{ station.count }}✓</span>
					</template>
				</RoomStationFilterLine>
			</template>
		</ServiceTopBar>

		<!-- Main content: Cards view -->
		<!-- //// Neoffice — the tickets are STACKED (task 38a-2, ruling 130): a short ticket stands under the one before it in the same column, a long one keeps a column, oldest first, top to bottom and on to the next column; the area scrolls sideways. Each card is as wide as the text size says. The setting « stack short tickets » (on by default) turns it back into one ticket per column. -->
		<main v-if="viewMode !== 'plan'" :class="RUNNER_AREA" data-test="ticket-area">
			<div v-if="loading || waitingForRooms" class="flex justify-center items-center h-full">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
			</div>

			<!-- //// Neoffice — dark mode (task 46): the till's dark remap of `.text-gray-500` is `!important` (index.css) and reads 4.35:1 on the screen's ground, so a plain `dark:` colour never reached it; `[&&]` doubles the selector so that this variant outranks it. -->
			<div v-else-if="groupedCards.length === 0" class="flex flex-col justify-center items-center h-full text-gray-500 dark:[&&]:!text-gray-400">
				<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
				</svg>
				<h2 class="text-xl font-medium">{{ __("No Items Ready") }}</h2>
				<p>{{ __("All items are either being prepared or have been delivered.") }}</p>
			</div>

			<!-- //// Neoffice — a ticket with many dishes is TWO widths wide where the screen holds at least three columns (task 38a-3, ruling 107: the wide card). `data-wide` says it. -->
			<div v-else ref="flowEl" :class="stackShortTickets ? TICKET_STACK : TICKET_ROW" :data-stacked="stackShortTickets ? 'true' : 'false'" data-test="ticket-flow">
				<RunnerOrderCard
					v-for="card in groupedCards"
					:key="card.key"
					:class="isWideCard(card) ? TICKET_CARD_WIDE : TICKET_CARD"
					:data-wide="isWideCard(card) ? 'true' : undefined"
					:card="card"
					:view-mode="viewMode"
					:show-station="!selectedStation"
					:allergy-words="allergyWords"
					:can-print="printCopy.canPrint(card)"
					:print-state="printCopy.stateOf(card)"
					@print="printCopy.print($event)"
					@delivered="loadOrders"
				/>
			</div>
		</main>

		<!-- Plan view -->
		<!-- //// Neoffice — dark mode (task 46): the floor plan's canvas was a fixed light colour and light dots in an inline style, a bright sheet on a dark screen under table names written in light text (1.2:1). The colour and the dots move to classes: the same light ones (`#f8fafc`, `#cbd5e1`), and in dark the ground the till's dark remap gives `bg-gray-50` and faint white dots. Only the size stays inline. -->
		<main v-else class="flex-1 overflow-auto relative bg-[#f8fafc] dark:bg-[#181b21] [--plan-dot:#cbd5e1] dark:[--plan-dot:rgba(255,255,255,0.1)] bg-[radial-gradient(circle,var(--plan-dot)_1px,transparent_1px)]"
			:style="{ backgroundSize: '25px 25px' }">

			<!-- Plan area tabs (if not already filtered by area tabs above) -->
			<div v-if="!activeArea && areas.length > 1" class="sticky top-0 z-10 bg-white/90 backdrop-blur px-4 py-2 flex gap-1 border-b">
				<button v-for="a in areas" :key="'plan-' + a.name"
					@click="planArea = a.name"
					class="px-3 py-1 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
					:class="planArea === a.name ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
				>{{ a.area_name }}</button>
			</div>

			<div v-if="planViewTables.length === 0" class="flex flex-col items-center justify-center h-full text-gray-400">
				<p class="text-lg font-medium">{{ __("No tables in this area") }}</p>
			</div>

			<!-- Tables on plan -->
			<div v-else class="relative" style="min-height: 700px;">
				<!-- Stations -->
				<div v-for="station in planViewStations" :key="'ps-' + station.name"
					class="absolute flex flex-col items-center justify-center rounded-lg border-2"
					:style="{
						left: (station.pos_x || 0) + 'px', top: (station.pos_y || 0) + 'px',
						width: (station.width || 120) + 'px', height: (station.height || 60) + 'px',
						backgroundColor: (station.color || '#6B7280') + '15',
						borderColor: station.color || '#6B7280'
					}">
					<!-- //// Neoffice — dark mode (task 46): the station's name in its own colour on the plan, lightened for a dark canvas (a clay name on a light canvas was 2.5:1, a blue one on a dark one 2.0:1); see the runner card. -->
					<span class="text-xs font-bold text-[color:var(--station-color)] dark:text-[color:var(--station-on-dark)]" :style="{ '--station-color': station.color, '--station-on-dark': onDark(station.color || '#6B7280') }">{{ station.station_name }}</span>
				</div>

				<!-- Tables -->
				<div v-for="table in planViewTables" :key="'pt-' + table.name"
					class="absolute flex flex-col items-center justify-center select-none transition-all"
					:class="[
						table.shape === 'Round' ? 'rounded-full' : 'rounded-lg',
						getTableReadyCount(table) > 0
							? 'bg-green-100 border-2 border-green-500 shadow-lg cursor-pointer hover:shadow-xl'
							: 'bg-gray-100 border border-gray-300 opacity-40'
					]"
					:style="{
						left: (table.pos_x || 0) + 'px', top: (table.pos_y || 0) + 'px',
						width: (table.width || 100) + 'px', height: (table.height || 100) + 'px'
					}"
					@click="getTableReadyCount(table) > 0 && (selectedPlanTable = selectedPlanTable === table.name ? null : table.name)">
					<span class="font-bold text-sm" :class="getTableReadyCount(table) > 0 ? 'text-gray-900' : 'text-gray-400'">
						{{ table.table_name }}
					</span>
					<!-- //// Neoffice — dark mode (task 46): a pale mint badge fading to 50 % over a dark plan was 2.0:1 at its dimmest; in dark it is a green tint with pale text and swells instead of fading (`ready-pulse`, tailwind.config.js). -->
					<span v-if="getTableReadyCount(table) > 0"
						class="text-[10px] font-bold text-green-700 bg-green-200 dark:bg-ds-success/25 dark:text-ds-success-soft px-1.5 py-0.5 rounded-full mt-0.5 animate-pulse dark:animate-ready-pulse">
						{{ getTableReadyCount(table) }}✓
					</span>
				</div>

				<!-- Detail panel for selected table -->
				<div v-if="selectedPlanTable && selectedPlanTableOrder"
					class="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 z-30 w-[90%] max-w-md">
					<div class="flex justify-between items-center mb-3">
						<h3 class="font-bold text-lg">{{ selectedPlanTableOrder.table_display_name }}</h3>
						<button @click="selectedPlanTable = null" class="text-gray-400 hover:text-gray-600">&times;</button>
					</div>
					<div v-for="item in selectedPlanTableOrder.items" :key="item.name" class="flex items-center gap-2 py-1.5 border-t border-gray-100">
						<!-- //// Neoffice — dark mode (task 46): the text on a station's colour is white or ink, whichever reads (white on clay is 2.8:1); light mode keeps `text-white`. -->
						<span v-if="item.preparation_station"
							class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full text-white dark:text-[color:var(--station-ink)] flex-shrink-0"
							:style="{ backgroundColor: item.station_color || '#6B7280', '--station-ink': inkOn(item.station_color || '#6B7280') }">
							{{ item.station_name || item.preparation_station }}
						</span>
						<span class="flex-1 text-sm font-medium">{{ item.item_name }}</span>
						<span class="font-bold text-sm bg-gray-100 dark:bg-gray-700 w-7 h-7 flex items-center justify-center rounded">{{ item.qty }}</span>
					</div>
					<!-- //// Neoffice — dark mode (task 46): the Button's own ink fill turns to bright paper in dark and `text-white` was forced on it (see RunnerOrderCard) -->
					<Button variant="solid"
						class="w-full mt-3 h-10 text-sm font-bold bg-emerald-500 hover:bg-emerald-600 text-white dark:enabled:text-ink-white"
						@click="markTableDelivered(selectedPlanTableOrder)"
						:loading="deliverLoading">
						{{ __("Mark Delivered") }}
					</Button>
				</div>
			</div>
		</main>

		<!-- //// Neoffice — five seconds to take back a « Deliver » (task 38a-2, ruling 112): the toast is the page's, the ticket's card is gone when it is pressed. Undone, the page reads its tickets again. -->
		<UndoToast @undone="loadOrders" />

		<!-- //// Neoffice — the layer of a screen at REST (task 47): near-black, a small clock and how many dishes are ready. A web page cannot switch the screen off nor dim it, so it is drawn; the wake lock and the live updates run on under it. -->
		<ScreenRestLayer :resting="resting" :label="readyCountLabel" :blank="awakeSettings.rest_style === 'black'" />
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue"
import { Button } from "frappe-ui"
import RunnerOrderCard from "@/components/invoices/RunnerOrderCard.vue"
import RoomStationFilterLine from "@/components/restaurant/RoomStationFilterLine.vue"
//// Neoffice — the one top bar of the service screens, the tab's title and the size of the text (task 38a-2, rulings 109, 128, 129)
import ServiceTopBar from "@/components/restaurant/ServiceTopBar.vue"
import ThemeButton from "@/components/restaurant/ThemeButton.vue"
import UndoToast from "@/components/restaurant/UndoToast.vue"
import RestaurantScreenSwitch from "@/components/restaurant/RestaurantScreenSwitch.vue"
import SegmentedControl from "@/components/restaurant/SegmentedControl.vue"
import { SCREEN_RUNNER } from "@/utils/restaurantScreens"
import { useDocumentTitle } from "@/composables/useDocumentTitle"
import { useKitchenTextSize } from "@/composables/useKitchenTextSize"
//// Neoffice — keep the screen on, and let it rest on purpose (NeoResto lot 1, task 47)
import ScreenAwakeSettings from "@/components/restaurant/ScreenAwakeSettings.vue"
import ScreenRestLayer from "@/components/restaurant/ScreenRestLayer.vue"
import { useScreenAwake } from "@/composables/useScreenAwake"
//// Neoffice — the printer button of the tickets: a copy of the ticket for the pass, printed by the server (NeoResto lot 1, task 44)
import PrintCopySettings from "@/components/restaurant/PrintCopySettings.vue"
import { usePrintCopy } from "@/composables/usePrintCopy"
import { ticketCounts } from "@/utils/screenAwake"
import { countDishes, countDishesByStation, countDishesOfRoom } from "@/utils/kitchenRunner"
import { formatTicketNo } from "@/utils/ticketNumber"
import { RUNNER_AREA, TICKET_CARD, TICKET_CARD_WIDE, TICKET_ROW, TICKET_STACK } from "@/utils/ticketLayout"
//// Neoffice — the wide card of a long ticket (task 38a-3, ruling 107): how many tickets fit the flow, and whether a card has the dishes for two widths
import { useColumnsThatFit } from "@/composables/useColumnsThatFit"
import { isWideTicket, runnerLineCount } from "@/utils/wideTicket"
import { useStackShortTickets } from "@/composables/useStackShortTickets"
import { allergyWordsOf } from "@/utils/kitchenTextKinds"
//// Neoffice — the order of the runner's tickets (see groupByTable)
import { byArrival } from "@/utils/kitchenBands"
//// Neoffice — what to write on a station's colour, and the colour lightened for a dark screen (task 46)
import { inkOn, onDark } from "@/utils/stationColors"
import { call } from "@/utils/apiWrapper"
//// Neoffice — the runner's sound when dishes come up ready is the till's setting (POS Settings, "Kitchen alerts"), played by the shared alert-sound player (NeoResto lot 1, Daniel, 01.11)
import SoundUnlockChip from "@/components/restaurant/SoundUnlockChip.vue"
import { useKitchenAlertSettings } from "@/composables/useKitchenAlertSettings"
import { playAlertSound } from "@/utils/alertSoundPlayer"
import { useToast } from "@/composables/useToast"
import { useRestaurantStore } from "@/stores/restaurant"
import { initSocket } from "@/socket"
//// Neoffice — the screen reads again when its connection comes back and when it is looked at again, and often while the connection is down (Daniel, 01.11: ten seconds between ordering the next course and the kitchen)
import { followLiveReading } from "@/utils/followLiveReading"
import { isDeskSession, leaveWhenSignedOut } from "@/utils/tabletSession"

const restaurantStore = useRestaurantStore()
const runnerEnabled = computed(() => restaurantStore.runnerEnabled)
// A runner tablet runs on an account of its own (paired by a QR code at the till), with no till behind it
const deskSession = isDeskSession()
// The restaurant whose orders this screen shows: the one in the address (a pass tablet has no till of its own), else
// the till's restaurant, else the server picks the user's open till, else the default restaurant.
const urlParams = new URLSearchParams(window.location.search)
const urlRestaurant = urlParams.get("restaurant")
//// Neoffice — the station in the address filters the runner as it filters the kitchen (task 38a-2, ruling 132): going from « Bar » to « Runner » shows the runner of the bar
const urlStation = urlParams.get("station")
const ofTheRestaurant = () => ({
	restaurant: urlRestaurant || restaurantStore.tillRestaurant,
})
//// Neoffice — the sound of the dishes that come up ready and its volume, as the till set them for this restaurant (default: the beep this screen has always made, at the volume it always had)
const { settings: alertSettings } = useKitchenAlertSettings({ restaurant: ofTheRestaurant })
const runnerSoundOn = computed(() => alertSettings.value.runnerSound !== "none")
const { showError } = useToast()
const orders = ref([])
const showDelivered = ref(
	localStorage.getItem("pos_runner_show_delivered") === "true",
)
const areas = ref([])
const areasRead = ref(false)
const allTables = ref([])
const allFloorStations = ref([])
const loading = ref(true)
const deliverLoading = ref(false)
//// Neoffice — the setting « stack short tickets » of the runner (task 38a-2, ruling 130), on by default, kept on the device
const { stack: stackShortTickets } = useStackShortTickets()
//// Neoffice — the restaurant's own list of allergy words, else the default (task 38a-1, ruling 123): a ticket's remark is an allergy when it holds one
const allergyWords = computed(() => allergyWordsOf(restaurantStore.restaurantSettings))
const viewMode = ref("table")
const viewModes = computed(() => [
	{ id: "table", label: __("By Table") },
	{ id: "station", label: __("By Station") },
	{ id: "plan", label: __("On the plan") },
])
//// Neoffice — the room in the address wins over the one the device remembers (task 38a-2, ruling 132): a switch from another screen carries it
const urlRoom = urlParams.get("room")
const selectedArea = ref(urlRoom || localStorage.getItem("pos_runner_area") || "")
const selectedStation = ref(urlStation || null)
const planArea = ref("")
const selectedPlanTable = ref(null)
let socket = null
let previousCount = 0

const totalReadyItems = computed(() => {
	return filteredOrders.value.reduce(
		(sum, order) => sum + (order.items?.length || 0),
		0,
	)
})

// The room that cuts the list: the one remembered, as long as the restaurant still has it. A room that was deleted, or
// that belongs to another restaurant (the address names one), or rooms that cannot be read, fall back to "all rooms": a
// pass screen must never show nothing with no chip left to say why.
const activeArea = computed(() =>
	areasRead.value && areas.value.some((a) => a.name === selectedArea.value)
		? selectedArea.value
		: "",
)
// A room is remembered but the restaurant's rooms are not known yet: wait, rather than flash every room's cards
const waitingForRooms = computed(() => !!selectedArea.value && !areasRead.value)

// The room is cut client side (filteredByAreaOrders): choosing one needs no new read of the orders
function selectArea(area) {
	selectedArea.value = area
	localStorage.setItem("pos_runner_area", area)
	if (area) planArea.value = area
}

//// Neoffice — a chip counts dishes by quantity, as the page's own count does (« 23 items ready »): it counted lines, so a room said 21 beside a
//// page that said 23, two plates on one line being one for the chip and two for the page.
function getAreaReadyCount(areaName) {
	return countDishesOfRoom(orders.value, areaName)
}

// Stations extracted from loaded orders with ready counts
const orderStations = computed(() => {
	const map = {}
	for (const order of filteredByAreaOrders.value) {
		for (const item of order.items || []) {
			const sid = item.preparation_station
			if (!sid) continue
			if (!map[sid])
				map[sid] = {
					name: sid,
					// A station is shown by its label, never by its name
					label: item.station_name || sid,
					color: item.station_color || "#6B7280",
					count: 0,
				}
		}
	}
	//// Neoffice — by quantity, as the room's chip and the page's count (see getAreaReadyCount)
	const quantities = countDishesByStation(filteredByAreaOrders.value)
	for (const sid of Object.keys(map)) map[sid].count = quantities[sid] || 0
	return Object.values(map).sort((a, b) => a.label.localeCompare(b.label))
})

// What the shared line of filters shows: each room with the dishes that are ready in it (the count of EVERY room, whichever
// room is chosen), each station with the dishes that are ready at it. The plan view has no station to choose.
const filterRooms = computed(() =>
	areas.value.map((area) => ({
		name: area.name,
		label: area.area_name,
		count: getAreaReadyCount(area.name),
	})),
)
const filterStations = computed(() =>
	viewMode.value === "plan" ? [] : orderStations.value,
)

//// Neoffice — the page's one line (task 38a-2, rulings 128, 129, 130): « Runner », and the room when one is chosen, with the dishes that are ready on
//// the same line, by quantity (two plates on one line are two plates to carry), as the kitchen's chip counts them. The count of the beep stays the
//// lines' (a dish added to a line is no new ticket). The tab's title is the page's.
const READY_GREEN = "#22C55E"
const READY_GREEN_ON_DARK = "#3DBE74"
const pageTitle = computed(() => {
	const room = areas.value.find((area) => area.name === activeArea.value)
	return room ? `${__("Runner")} · ${room.area_name}` : __("Runner")
})
const readyDishCount = computed(() => countDishes(filteredOrders.value))
const readyCountLabel = computed(() =>
	readyDishCount.value === 1
		? __("{0} item ready", [readyDishCount.value])
		: __("{0} items ready", [readyDishCount.value]),
)
useDocumentTitle(pageTitle)

//// Neoffice — keep the screen on, and let it rest on purpose (task 47), as the kitchen's screen does: the Screen Wake Lock keeps the tablet from falling asleep, and after N minutes without a touch the page DRAWS a near-black layer (a web page cannot switch the screen off nor dim it) while the lock and the refresh run on. A touch wakes it, and so does a dish that comes up ready: a pass must never miss one. The runner's orders hold only the dishes that are ready, so every line counts.
const {
	resting,
	settings: awakeSettings,
	wakeLockSupported,
	setSetting: setAwakeSetting,
	noteTickets,
} = useScreenAwake("runner")
//// Neoffice — the printer button of the tickets (task 44): off on this screen until it is chosen (the carrier has a hand free less than the cook), it prints on the printer of the station the screen is opened on, and is drawn where the setting is on and that station has a printer (the server says which have one). A card of the view by station holds many tables, not one order: it has no button.
const printCopy = usePrintCopy("Runner", { station: selectedStation, restaurant: ofTheRestaurant })
const { settings: copySettings, hasPrinters: hasCopyPrinters, setSetting: setCopySetting } = printCopy
//// Neoffice — the size of the text, the same pick as the kitchen's, kept on the device (task 38a-2, ruling 109)
const {
	size: textSize,
	style: textSizeStyle,
	cycle: cycleTextSize,
	label: textSizeLabel,
} = useKitchenTextSize()
//// Neoffice — a ticket of more than `WIDE_TICKET_LINES` dishes is two widths wide where the flow holds at least three columns (task 38a-3, ruling 107); nothing is wide until the flow has been
//// measured, and it is measured again when the text size, so the width of a ticket, changes
const flowEl = ref(null)
const { columns: flowColumns } = useColumnsThatFit(flowEl, textSize)
const isWideCard = (card) => isWideTicket(runnerLineCount(card), flowColumns.value)

//// Neoffice — row 2 of the bar is drawn only when there is something to choose (task 38a-2, ruling 129), as on the kitchen screen: one room has no
//// room chips, one station has no station chips, a screen bound to its station has none. The stations the restaurant HAS are asked for (the stations
//// with a dish ready are only those on the screen: a second station with nothing ready yet would make the row come and go).
const stations = ref([])
const boundToItsStation = !deskSession && !!urlStation
const chipRooms = computed(() => (filterRooms.value.length > 1 ? filterRooms.value : []))
const chipStations = computed(() =>
	Math.max(stations.value.length, filterStations.value.length) > 1 &&
	!boundToItsStation
		? filterStations.value
		: [],
)

watch(showDelivered, (val) => {
	localStorage.setItem("pos_runner_show_delivered", val ? "true" : "false")
})

const filteredByAreaOrders = computed(() => {
	let result = orders.value
	if (!showDelivered.value) {
		result = result.filter((o) => {
			const allDelivered = o.items?.every((i) => i.kds_status === "Delivered")
			return !allDelivered
		})
	}
	if (activeArea.value) {
		result = result.filter((o) => o.area === activeArea.value)
	}
	return result
})

const filteredOrders = computed(() => {
	let result = filteredByAreaOrders.value
	if (selectedStation.value) {
		result = result
			.map((o) => ({
				...o,
				items: (o.items || []).filter(
					(i) => i.preparation_station === selectedStation.value,
				),
			}))
			.filter((o) => o.items.length > 0)
	}
	return result
})

//// Neoffice — a dish that comes up ready wakes the screen at rest (task 47); the first reading after the orders are loaded is only what the next ones are compared with
watch(filteredOrders, (held) => {
	if (!loading.value) noteTickets(ticketCounts(held, { live: () => true }))
})

// The "new ready dishes" beep compares the dishes on the screen with the number the last read left there: the same scope.
// Choosing another room or station, or showing the delivered dishes, changes the scope without any new dish, so the count
// of the new scope is the new baseline, not something the count of the old scope is compared with.
watch([activeArea, selectedStation, showDelivered], () => {
	previousCount = totalReadyItems.value
})

const groupedCards = computed(() => {
	if (viewMode.value === "table") return groupByTable()
	if (viewMode.value === "station") return groupByStation()
	return []
})

function groupByTable() {
	return filteredOrders.value
		.map((order) => ({
			key: order.name,
			title: order.table_display_name || order.restaurant_table,
			subtitle: `#${order.name}`,
			invoiceName: order.name,
			creation: order.creation,
			modified: order.modified,
			items: order.items || [],
			stationGroups: groupItemsByStation(order.items || []),
			//// Neoffice — what the header's one line shows beside the table (task 38a-2, ruling 130): the room's name (the card derives its short code), the ticket's number
			//// when the order carries one, and whether it is a takeaway (handed over, not delivered to a table)
			roomName: areas.value.find((area) => area.name === order.area)?.area_name || "",
			//// Neoffice — the whole number and the digits the server tells, written (0007) by `formatTicketNo` (task 38b); a takeaway with none has the number it has had until now
			ticketNo:
				formatTicketNo(order.ticket_no, order.ticket_digits) ||
				(order.is_takeaway ? order.takeaway_number || "" : ""),
			//// Neoffice — the code of the room the server tells (the one typed on the room, else made from its name), before the one the card derives (task 38b)
			roomCode: order.area_code || "",
			takeaway: !!order.is_takeaway,
		}))
		//// Neoffice — the oldest first by the SAME time the card's timer counts from (utils/kitchenBands: the course at the kitchen), so the biggest timer is at the left on the runner too
		.sort(byArrival)
}

function groupByStation() {
	const stationMap = {}
	for (const order of filteredOrders.value) {
		for (const item of order.items || []) {
			const stationId = item.preparation_station || "__general__"
			const stationName =
				stationId === "__general__"
					? __("General")
					: item.station_name || stationId
			if (!stationMap[stationId]) {
				stationMap[stationId] = {
					key: stationId,
					title: stationName,
					subtitle: "",
					stationColor: item.station_color || "#6B7280",
					creation: order.creation,
					modified: order.modified,
					items: [],
					tableGroups: {},
				}
			}
			const enrichedItem = {
				...item,
				_invoiceName: order.name,
				_tableName: order.table_display_name || order.restaurant_table,
			}
			stationMap[stationId].items.push(enrichedItem)
			const tableKey = order.restaurant_table
			if (!stationMap[stationId].tableGroups[tableKey]) {
				stationMap[stationId].tableGroups[tableKey] = {
					tableName: order.table_display_name || order.restaurant_table,
					invoiceName: order.name,
					items: [],
				}
			}
			stationMap[stationId].tableGroups[tableKey].items.push(enrichedItem)
		}
	}
	return Object.values(stationMap)
		.map((s) => ({
			...s,
			subtitle: `${s.items.length} ${s.items.length === 1 ? __("item") : __("items")}`,
			tableGroups: Object.values(s.tableGroups),
		}))
		.sort((a, b) => a.title.localeCompare(b.title))
}

function groupItemsByStation(items) {
	const groups = {}
	for (const item of items) {
		const sid = item.preparation_station || "__general__"
		if (!groups[sid])
			groups[sid] = {
				stationName:
					sid === "__general__" ? __("General") : item.station_name || sid,
				stationColor: item.station_color || "#6B7280",
				items: [],
			}
		groups[sid].items.push(item)
	}
	return Object.values(groups)
}

// ─── Plan view ───────────────────────────────────────────────────────────────
const activePlanArea = computed(
	() =>
		activeArea.value ||
		planArea.value ||
		(areas.value.length ? areas.value[0].name : ""),
)

const planViewTables = computed(() => {
	if (!activePlanArea.value) return allTables.value
	return allTables.value.filter((t) => t.area === activePlanArea.value)
})

const planViewStations = computed(() => {
	if (!activePlanArea.value) return allFloorStations.value
	return allFloorStations.value.filter((s) => s.area === activePlanArea.value)
})

function getTableReadyCount(table) {
	const order = orders.value.find((o) => o.restaurant_table === table.name)
	return order ? (order.items || []).length : 0
}

const selectedPlanTableOrder = computed(() => {
	if (!selectedPlanTable.value) return null
	return (
		orders.value.find((o) => o.restaurant_table === selectedPlanTable.value) ||
		null
	)
})

async function markTableDelivered(order) {
	deliverLoading.value = true
	try {
		const itemNames = (order.items || []).map((i) => i.name)
		await call("pos_next.api.restaurant.mark_items_delivered", {
			invoice_name: order.name,
			item_names: JSON.stringify(itemNames),
		})
		selectedPlanTable.value = null
		loadOrders()
	} catch (error) {
		showError(__("Failed to mark items as delivered."))
	} finally {
		deliverLoading.value = false
	}
}

// ─── Data loading ────────────────────────────────────────────────────────────
async function loadAreas() {
	try {
		const res = await call("pos_next.api.restaurant.get_tables", {
			_: Date.now(),
			...ofTheRestaurant(),
		})
		if (res?.areas) areas.value = res.areas
		if (res?.tables) allTables.value = res.tables
		if (res?.stations) allFloorStations.value = res.stations
		if (!planArea.value && areas.value.length)
			planArea.value = areas.value[0].name
	} catch (error) {
		console.error("Failed to load areas:", error)
	} finally {
		areasRead.value = true
	}
}

async function loadStations() {
	try {
		const res = await call("pos_next.api.restaurant.get_preparation_stations", {
			...ofTheRestaurant(),
		})
		if (Array.isArray(res)) stations.value = res
	} catch (error) {
		console.error("Failed to load stations:", error)
	}
}

async function loadOrders() {
	try {
		// Every ready order of the restaurant, not just the room chosen: the screen cuts the list to the room itself
		// (filteredByAreaOrders), and the line of filters counts what is ready in EVERY room
		const params = { _: Date.now(), ...ofTheRestaurant() }
		const res = await call("pos_next.api.restaurant.get_runner_orders", params)
		if (res) {
			orders.value = res
			const newCount = totalReadyItems.value
			if (newCount > previousCount && previousCount > 0) playNotificationSound()
			previousCount = newCount
		}
	} catch (error) {
		// A tablet disconnected at the till, or whose session ended: it is shown how to pair it again
		if (leaveWhenSignedOut()) return
		console.error("Failed to load runner orders:", error)
		showError(__("Failed to load orders."))
	} finally {
		loading.value = false
	}
}

//// Neoffice — was a beep of 880 Hz on an AudioContext opened for each beep. It is now the sound the till chose for the runner, at the volume it chose, on the one shared context (utils/alertSoundPlayer): the default is that same beep at that same volume. A page nobody has touched plays nothing (a browser's rule); the chip in the bar says so.
function playNotificationSound() {
	playAlertSound(alertSettings.value.runnerSound, alertSettings.value.volume)
}

let stopFollowing = null

onMounted(async () => {
	// Load restaurant settings to check if runner is enabled
	await restaurantStore.fetchRestaurantSettings(urlRestaurant)
	if (!runnerEnabled.value) return // Don't load data if runner is disabled
	loadAreas()
	loadStations()
	loadOrders()
	//// Neoffice — which stations have a printer, for the printer button of the tickets (task 44)
	printCopy.refreshPrinters({ force: true })
	// Use frappe.realtime (receives frappe.publish_realtime events) with fallback to custom socket
	socket = window.frappe?.realtime || initSocket()
	if (socket?.disconnected) socket.connect()
	//// Neoffice — was: one listener and a timer of 30 seconds in case the socket is unreliable; a signal sent while the connection is down was only found at the next timed reading (utils/followLiveReading)
	stopFollowing = followLiveReading({
		socket,
		events: ["kds_update"],
		read: () => {
			loadOrders()
			// Asked again once a minute at most (a printer is plugged in or out while the screen is open)
			printCopy.refreshPrinters()
		},
		everyMs: 30000,
	})
})

onUnmounted(() => {
	if (stopFollowing) stopFollowing()
})
</script>
