//// Neoffice — added file (no upstream equivalent). The agenda of a salon, kept for the till (NeoSalon, step 2, lot G4; product owner, 10.11.2026): the agenda in
//// the middle column (components/sale/SalonAgenda.vue), the sheet of an appointment and the badge of the rail read the same copy, read again every minute while the
//// till is open and by the button. The last agenda read is kept in the browser: a till that has lost its network still shows it (« encaisser tout connement »).
import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { useAppointment } from "@/composables/useAppointment"
import { usePOSShiftStore } from "@/stores/posShift"
import {
	appointmentsOf,
	columnsOf,
	dayMoved,
	dayRange,
	toCollectCount as countToCollect,
} from "@/utils/appointments"
import { offlineState } from "@/utils/offline/offlineState"

// The agenda moves while the cashier works
export const REFRESH_EVERY_MS = 60 * 1000
const CACHE_KEY = "pos_next_salon_agenda"

const todayOf = () => {
	const now = new Date()
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}
const minutesNow = () => {
	const now = new Date()
	return now.getHours() * 60 + now.getMinutes()
}

function readCache(profile) {
	try {
		const kept = JSON.parse(
			globalThis.localStorage?.getItem(CACHE_KEY) || "null",
		)
		return kept?.profile === profile ? kept : null
	} catch {
		return null
	}
}

function writeCache(profile, answer) {
	try {
		globalThis.localStorage?.setItem(
			CACHE_KEY,
			JSON.stringify({ profile, savedAt: Date.now(), answer }),
		)
	} catch {
		// A full or blocked storage: the agenda is then simply not kept
	}
}

export const useAppointmentsStore = defineStore("appointments", () => {
	// The day asked for, `YYYY-MM-DD` ("" = today)
	const day = ref("")
	const visibility = ref("all")
	const capabilities = ref({})
	// How the salon stands on the day shown: `{ state: "open"|"closed"|"special", reason, label, periods }`, or null when the site does not say
	const salon = ref(null)
	const mine = ref([])
	const people = ref([])
	const appointments = ref([])
	const loading = ref(false)
	const loaded = ref(false)
	const failed = ref(false)
	const available = ref(false)
	// The agenda shown is the one kept in the browser (the till has no network), and since when
	const fromCache = ref(false)
	const cachedAt = ref(null)
	// The appointment whose sheet is open (its key: its booking)
	const selectedKey = ref(null)
	// Only the cashier's own column (the « Me only » switch)
	const onlyMine = ref(false)
	const now = ref(minutesNow())
	let timer = null

	const date = computed(() => day.value || todayOf())
	const isToday = computed(() => date.value === todayOf())
	const selected = computed(
		() =>
			appointments.value.find((row) => row.key === selectedKey.value) || null,
	)
	const shownPeople = computed(() => {
		if (!onlyMine.value || !mine.value.length) return people.value
		return people.value.filter((person) =>
			mine.value.includes(person.sales_person),
		)
	})
	const shownAppointments = computed(() => {
		if (!onlyMine.value || !mine.value.length) return appointments.value
		return appointments.value.filter((row) =>
			mine.value.some((person) => appointmentsOf([row], person).length),
		)
	})
	const columns = computed(() =>
		columnsOf(shownPeople.value, shownAppointments.value),
	)
	const range = computed(() =>
		dayRange(shownPeople.value, shownAppointments.value),
	)
	const closed = computed(() => salon.value?.state === "closed")
	// The appointments booked before the salon was closed that day, which nobody has begun: the cashier moves or cancels them
	const toHandleCount = computed(
		() => appointments.value.filter((row) => row.to_handle).length,
	)
	// …of them, those whose person is away (leave, holiday) on a day the salon is open
	const awayCount = computed(
		() => appointments.value.filter((row) => row.to_handle === "away").length,
	)
	// What waits for its payment: only today's count (the other days' are not the cashier's concern now)
	const toCollectCount = computed(() =>
		isToday.value ? countToCollect(appointments.value, now.value) : 0,
	)

	function take(answer, { cached = false, savedAt = null } = {}) {
		available.value = Boolean(answer?.available)
		visibility.value = answer?.visibility === "own" ? "own" : "all"
		capabilities.value = answer?.capabilities || {}
		salon.value = answer?.salon || null
		mine.value = answer?.mine || []
		people.value = answer?.people || []
		appointments.value = answer?.appointments || []
		fromCache.value = cached
		cachedAt.value = savedAt
		loaded.value = true
		failed.value = false
		if (
			selectedKey.value &&
			!appointments.value.some((row) => row.key === selectedKey.value)
		)
			selectedKey.value = null
	}

	/** Read the agenda of the day shown (the network's, or the one kept when there is none). */
	async function refresh() {
		if (loading.value) return
		const shift = usePOSShiftStore()
		now.value = minutesNow()
		if (offlineState.isOffline) {
			const kept = readCache(shift.profileName)
			if (kept && kept.answer?.date === date.value)
				take(kept.answer, { cached: true, savedAt: kept.savedAt })
			else failed.value = !loaded.value
			return
		}
		loading.value = true
		const answer = await useAppointment().loadDay(date.value)
		loading.value = false
		if (!answer) {
			failed.value = true
			return
		}
		take(answer)
		if (answer.available && isToday.value) writeCache(shift.profileName, answer)
	}

	function select(key) {
		selectedKey.value = key
	}

	function setDay(next) {
		day.value = next === todayOf() ? "" : next
		selectedKey.value = null
		return refresh()
	}

	const goToday = () => setDay(todayOf())
	const moveDay = (days) => setDay(dayMoved(date.value, days))

	/** Read the agenda now and every minute from now on (a second call changes nothing). */
	function start() {
		if (timer) return
		refresh()
		timer = setInterval(refresh, REFRESH_EVERY_MS)
	}

	function stop() {
		clearInterval(timer)
		timer = null
	}

	/** Sign-out or a change of till: nothing of the day before stays. */
	function reset() {
		stop()
		day.value = ""
		available.value = false
		visibility.value = "all"
		capabilities.value = {}
		salon.value = null
		mine.value = []
		people.value = []
		appointments.value = []
		loading.value = false
		loaded.value = false
		failed.value = false
		fromCache.value = false
		cachedAt.value = null
		selectedKey.value = null
		onlyMine.value = false
	}

	return {
		day,
		date,
		isToday,
		visibility,
		capabilities,
		salon,
		closed,
		toHandleCount,
		awayCount,
		mine,
		people,
		appointments,
		loading,
		loaded,
		failed,
		available,
		fromCache,
		cachedAt,
		selectedKey,
		selected,
		onlyMine,
		now,
		columns,
		range,
		toCollectCount,
		refresh,
		select,
		setDay,
		goToday,
		moveDay,
		start,
		stop,
		reset,
	}
})
