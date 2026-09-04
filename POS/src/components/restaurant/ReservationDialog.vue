<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The reservation desk inside the POS: -->
	<!-- //// list, form, floor-plan picker and statistics over the Restaurant Reservation doctype -->
	<!-- //// (Pending, Confirmed, Seated, Completed, Cancelled, No Show). Upstream POSNext has no -->
	<!-- //// booking of any kind. (ebc3ecc5, 2026-03-29 "restaurant reservation system with POS -->
	<!-- //// dialog, online booking, and email notifications"; 6f17f723 adds the service -->
	<!-- //// selector, area tabs and floor-plan toggle, 5cec738c uses apiWrapper call() instead -->
	<!-- //// of window.frappe.call.) -->
	<Transition name="fade">
		<div v-if="show" class="fixed inset-0 bg-black bg-opacity-50 z-[300]" @click.self="$emit('close')">
			<div class="fixed inset-0 flex items-center justify-center p-4">
				<div class="w-full h-full max-w-[95vw] max-h-[95vh] bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
					<!-- Header -->
					<div class="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
						<div class="flex items-center gap-4">
							<h2 class="text-xl font-bold text-gray-800">{{ __("Reservations") }}</h2>
							<span v-if="!loading" class="text-sm font-semibold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
								{{ todayCount }} {{ __("today") }}
							</span>
						</div>
						<div class="flex items-center gap-2">
							<!-- Tab buttons -->
							<div class="flex bg-gray-100 rounded-lg p-0.5">
								<button
									v-for="tab in tabs"
									:key="tab.key"
									class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
									:class="activeTab === tab.key
										? 'bg-white text-blue-700 shadow-sm'
										: 'text-gray-500 hover:text-gray-700'"
									@click="activeTab = tab.key"
								>
									{{ __(tab.label) }}
								</button>
							</div>
							<!-- Close button -->
							<button class="text-gray-400 hover:text-gray-600 ml-2" @click="$emit('close')">
								<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Content -->
					<div class="flex-1 overflow-hidden p-4">
						<!-- List tab -->
						<ReservationList
							v-if="activeTab === 'list'"
							:reservations="reservations"
							:loading="loading"
							:current-date="currentDate"
							:selected-area="selectedArea"
							:selected-status="selectedStatus"
							:areas="areas"
							@date-change="onDateChange"
							@area-change="selectedArea = $event"
							@status-change="selectedStatus = $event"
							@select="onSelectReservation"
							@check-in="onCheckIn"
							@confirm="onConfirm"
							@cancel="onCancel"
							@no-show="onNoShow"
						/>

						<!-- New reservation tab -->
						<ReservationForm
							v-if="activeTab === 'new'"
							:tables="allTables"
							:default-duration="defaultDuration"
							:channels="channels"
							:reservation="editingReservation"
							:opening-hours="openingHours"
							@saved="onSaved"
							@cancel="activeTab = 'list'"
						/>

						<!-- Stats tab -->
						<ReservationStats
							v-if="activeTab === 'stats'"
						/>
					</div>
				</div>
			</div>
		</div>
	</Transition>
</template>

<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { call } from "@/utils/apiWrapper"
import { useReservations } from "@/composables/useReservations"
import { useToast } from "@/composables/useToast"
import ReservationList from "./ReservationList.vue"
import ReservationForm from "./ReservationForm.vue"
import ReservationStats from "./ReservationStats.vue"

const props = defineProps({
	show: { type: Boolean, default: false },
})

defineEmits(["close"])

const { reservations, loading, currentDate, fetchReservations, updateStatus } =
	useReservations()
const { showSuccess, showError } = useToast()

const activeTab = ref("list")
const selectedArea = ref("")
const selectedStatus = ref("")
const editingReservation = ref(null)
const allTables = ref([])
const defaultDuration = ref("01:30:00")
const channels = ref(["Phone", "Walk-in", "Internet"])
const openingHours = ref([])

const tabs = [
	{ key: "list", label: "List" },
	{ key: "new", label: "New" },
	{ key: "stats", label: "Stats" },
]

const todayCount = computed(() => {
	return reservations.value.filter(
		(r) => !["Cancelled", "No Show", "Completed"].includes(r.status),
	).length
})

const areas = computed(() => {
	const areaSet = new Set()
	for (const res of reservations.value) {
		for (const t of res.tables || []) {
			if (t.area) areaSet.add(t.area)
		}
	}
	return Array.from(areaSet).sort()
})

async function loadSettings() {
	try {
		const settings = await call("frappe.client.get", {
			doctype: "Restaurant Settings",
			name: "Restaurant Settings",
		})
		if (settings) {
			const dur = settings.default_reservation_duration || 5400
			// Convert seconds to HH:MM:SS
			const h = String(Math.floor(dur / 3600)).padStart(2, "0")
			const m = String(Math.floor((dur % 3600) / 60)).padStart(2, "0")
			defaultDuration.value = `${h}:${m}:00`
			if (settings.reservation_channels) {
				channels.value = settings.reservation_channels
					.split("\n")
					.map((c) => c.trim())
					.filter(Boolean)
			}
			// Extract opening hours for service selector
			openingHours.value = settings.opening_hours || []
		}
	} catch {
		// Use defaults
	}
}

async function loadTables() {
	try {
		const response = await call("frappe.client.get_list", {
			doctype: "Restaurant Table",
			fields: [
				"name",
				"table_name",
				"area",
				"capacity",
				"status",
				"pos_x",
				"pos_y",
				"width",
				"height",
				"shape",
			],
			order_by: "area asc, table_name asc",
			limit_page_length: 0,
		})
		allTables.value = response || []
	} catch {
		allTables.value = []
	}
}

function onDateChange(date) {
	currentDate.value = date
	fetchReservations(date)
}

function onSelectReservation(res) {
	editingReservation.value = res
	activeTab.value = "new"
}

async function onCheckIn(res) {
	try {
		await updateStatus(res.name, "Seated")
		showSuccess(__("Guest seated"))
	} catch {
		showError(__("Failed to update status"))
	}
}

async function onConfirm(res) {
	try {
		await updateStatus(res.name, "Confirmed")
		showSuccess(__("Reservation confirmed"))
	} catch {
		showError(__("Failed to confirm"))
	}
}

async function onCancel(res) {
	try {
		await updateStatus(res.name, "Cancelled")
		showSuccess(__("Reservation cancelled"))
	} catch {
		showError(__("Failed to cancel"))
	}
}

async function onNoShow(res) {
	try {
		await updateStatus(res.name, "No Show")
		showSuccess(__("Marked as No Show"))
	} catch {
		showError(__("Failed to update"))
	}
}

function onSaved() {
	editingReservation.value = null
	activeTab.value = "list"
}

// Load data when dialog opens
watch(
	() => props.show,
	(val) => {
		if (val) {
			fetchReservations(currentDate.value)
			loadTables()
			loadSettings()
			activeTab.value = "list"
			editingReservation.value = null
		}
	},
)
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
