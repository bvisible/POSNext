//// Neoffice — added file (no upstream equivalent). The agenda of the till without the network (maintenance#2929, the audit of 18.11): the agenda kept in the browser is shown for ITS day only, and a held agenda
//// of another day is never left under the date shown. The audit saw appointments of another day under today's date on an appointment's sheet, offline.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const lane = vi.hoisted(() => ({ loadDay: vi.fn(), loadWeek: vi.fn(async () => null) }))
const network = vi.hoisted(() => ({ isOffline: false }))

vi.hoisted(() => {
	globalThis.__ = (text) => text
})
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => lane }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A" }) }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))

const { useAppointmentsStore } = await import("../appointments")

const row = (key, startsAt) => ({ key, booking: key, starts_at: startsAt, ends_at: startsAt, steps: [{ sales_person: "Sonia" }], state: "booked" })
const agenda = (date, rows) => ({ available: true, date, appointments: rows, people: [{ sales_person: "Sonia", name: "Sonia" }], capabilities: {} })

let store
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(new Date(2026, 10, 18, 10, 0))
	localStorage.clear()
	setActivePinia(createPinia())
	network.isOffline = false
	lane.loadDay.mockReset()
	store = useAppointmentsStore()
})
afterEach(() => vi.useRealTimers())

describe("the agenda of the till without the network", () => {
	it("shows the agenda kept for today, when it is today's", async () => {
		lane.loadDay.mockResolvedValue(agenda("2026-11-18", [row("BKG-1", "2026-11-18 15:00:00")]))
		await store.refresh()
		network.isOffline = true

		await store.refresh()

		expect(store.fromCache).toBe(true)
		expect(store.appointments.map((each) => each.key)).toEqual(["BKG-1"])
	})

	it("leaves nothing of another day under the date shown when the day shown has no agenda kept", async () => {
		lane.loadDay.mockResolvedValue(agenda("2026-11-18", [row("BKG-1", "2026-11-18 15:00:00")]))
		await store.refresh()
		network.isOffline = true

		await store.setDay("2026-11-19")

		expect(store.date).toBe("2026-11-19")
		expect(store.appointments).toEqual([])
		expect(store.fromCache).toBe(false)
		expect(store.columns).toEqual([])
		expect(store.selected).toBeNull()
	})

	it("keeps the day it has read online when the network goes: the same day, so nothing is hidden", async () => {
		lane.loadDay.mockResolvedValue(agenda("2026-11-19", [row("BKG-9", "2026-11-19 11:00:00")]))
		await store.setDay("2026-11-19")
		network.isOffline = true

		await store.refresh()

		expect(store.appointments.map((each) => each.key)).toEqual(["BKG-9"])
	})
})
