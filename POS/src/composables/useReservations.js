/**
 * Reservation management composable.
 *
 * Provides reactive reservation data, CRUD operations, and real-time updates.
 * Used by ReservationDialog and badge overlay on the floor plan.
 */

import { ref, computed, onMounted, onUnmounted } from "vue"

const reservations = ref([])
const loading = ref(false)
const currentDate = ref(new Date().toISOString().slice(0, 10))

// Auto-refresh interval (every 2 minutes)
let refreshTimer = null
const REFRESH_INTERVAL = 2 * 60 * 1000

/**
 * Map of table_name → next upcoming reservation (for badge display)
 */
const upcomingByTable = computed(() => {
	const now = new Date()
	const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`
	const map = {}

	// Only show upcoming or current reservations (not past/completed/cancelled)
	const active = reservations.value.filter(
		(r) =>
			["Pending", "Confirmed", "Seated"].includes(r.status) &&
			(r.end_time ? r.end_time >= currentTime : true),
	)

	for (const res of active) {
		for (const t of res.tables || []) {
			const key = t.restaurant_table
			// Keep the earliest upcoming reservation per table
			if (!map[key] || res.reservation_time < map[key].reservation_time) {
				map[key] = res
			}
		}
	}
	return map
})

async function fetchReservations(date, filters = {}) {
	loading.value = true
	try {
		const args = { date: date || currentDate.value }
		if (filters.status) args.status = JSON.stringify(filters.status)
		if (filters.area) args.area = filters.area

		const response = await window.frappe.call({
			method: "pos_next.api.reservations.get_reservations",
			args,
		})
		reservations.value = response.message || []
	} catch (error) {
		console.error("[Reservations] Fetch failed:", error)
	} finally {
		loading.value = false
	}
}

async function createReservation(data) {
	try {
		const response = await window.frappe.call({
			method: "pos_next.api.reservations.create_reservation",
			args: data,
		})
		const result = response.message
		if (result?.status === "conflict") {
			return result
		}
		// Refresh list after creation
		await fetchReservations(data.reservation_date || currentDate.value)
		return result
	} catch (error) {
		console.error("[Reservations] Create failed:", error)
		throw error
	}
}

async function updateStatus(name, status, force = false) {
	try {
		const response = await window.frappe.call({
			method: "pos_next.api.reservations.update_reservation_status",
			args: { name, status, force },
		})
		// Refresh list after status change
		await fetchReservations(currentDate.value)
		return response.message
	} catch (error) {
		console.error("[Reservations] Status update failed:", error)
		throw error
	}
}

async function checkAvailability(tables, date, time, duration, exclude = null) {
	try {
		const response = await window.frappe.call({
			method: "pos_next.api.reservations.check_table_availability",
			args: { tables: JSON.stringify(tables), date, time, duration, exclude },
		})
		return response.message
	} catch (error) {
		console.error("[Reservations] Availability check failed:", error)
		throw error
	}
}

async function getStats(fromDate, toDate) {
	try {
		const response = await window.frappe.call({
			method: "pos_next.api.reservations.get_reservation_stats",
			args: { from_date: fromDate, to_date: toDate },
		})
		return response.message
	} catch (error) {
		console.error("[Reservations] Stats fetch failed:", error)
		throw error
	}
}

function startAutoRefresh() {
	stopAutoRefresh()
	refreshTimer = setInterval(() => {
		fetchReservations(currentDate.value)
	}, REFRESH_INTERVAL)
}

function stopAutoRefresh() {
	if (refreshTimer) {
		clearInterval(refreshTimer)
		refreshTimer = null
	}
}

function setupRealtimeListener() {
	if (window.frappe?.realtime) {
		window.frappe.realtime.on("reservation_update", () => {
			fetchReservations(currentDate.value)
		})
	}
}

function teardownRealtimeListener() {
	if (window.frappe?.realtime) {
		window.frappe.realtime.off("reservation_update")
	}
}

export function useReservations() {
	onMounted(() => {
		setupRealtimeListener()
		startAutoRefresh()
	})

	onUnmounted(() => {
		teardownRealtimeListener()
		stopAutoRefresh()
	})

	return {
		reservations,
		loading,
		currentDate,
		upcomingByTable,
		fetchReservations,
		createReservation,
		updateStatus,
		checkAvailability,
		getStats,
		startAutoRefresh,
		stopAutoRefresh,
	}
}
