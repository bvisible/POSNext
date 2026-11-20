//// Neoffice — added file (no upstream equivalent). A date typed by hand in the agenda's day field (neoffice-maintenance#3164, the audit of 19.11): the field says « change » at every value it passes through
//// (« 0002-11-29 » on the way to « 2026-11-29 », the day typed by its first digit), and each one asked for a reading. One reading is asked, for the date left alone for a moment, confirmed by Enter, or
//// kept by leaving the field; and none for a date that is not whole.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const ui = vi.hoisted(() => ({ isDesktop: true }))
const network = vi.hoisted(() => ({ isOffline: false, listeners: [], subscribe(listener) { network.listeners.push(listener); return () => {} } }))
const load = vi.hoisted(() => vi.fn())

vi.mock("@/stores/posUI", () => ({ usePOSUIStore: () => ui }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A" }) }))
const loadWeek = vi.hoisted(() => vi.fn(async () => null))
const checkMove = vi.hoisted(() => vi.fn(async () => ({ ok: true, why: "" })))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => ({ loadDay: load, loadWeek, checkMove }) }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))

const { useAppointmentsStore } = await import("@/stores/appointments")
const { default: SalonAgenda } = await import("../SalonAgenda.vue")

describe("a date typed in the agenda's day field", () => {
	let store
	let wrapper
	const field = () => wrapper.get("[data-test='agenda-date']")
	// what the browser does as a date is typed: the field takes the value, and says « change » at every one that is a date
	const typed = async (value) => {
		await field().setValue(value)
		await field().trigger("change")
	}
	const asked = () => load.mock.calls.map(([day]) => day)

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
		vi.setSystemTime(new Date(2026, 10, 10, 10, 0))
		setActivePinia(createPinia())
		network.isOffline = false
		load.mockReset()
		load.mockImplementation(async (day) => ({
			available: true,
			date: day,
			appointments: [{ key: `BKG-${day}`, booking: `BKG-${day}`, starts_at: `${day} 15:00:00`, ends_at: `${day} 15:30:00`, steps: [], state: "booked" }],
			people: [],
			capabilities: {},
		}))
		store = useAppointmentsStore()
		store.day = "2026-11-10"
		store.loaded = true
		store.available = true
		wrapper = mount(SalonAgenda, { global: { mocks: { __: globalThis.__ } } })
		load.mockClear()
	})
	afterEach(() => {
		wrapper.unmount()
		vi.useRealTimers()
	})

	it("is read once, for the date it ends on, whatever it passed through", async () => {
		for (const value of ["0002-11-29", "0020-11-29", "0202-11-29", "2026-11-02", "2026-11-29"]) {
			await typed(value)
			vi.advanceTimersByTime(80)
		}
		expect(load).not.toHaveBeenCalled()

		vi.advanceTimersByTime(600)
		await flushPromises()

		expect(asked()).toEqual(["2026-11-29"])
		expect(store.date).toBe("2026-11-29")
		// the grid draws the day of the header
		expect(store.appointments.map((each) => each.key)).toEqual(["BKG-2026-11-29"])
	})

	it("is never read while it is not a whole date, however long the field waits", async () => {
		await typed("0002-11-29")
		await typed("")
		vi.advanceTimersByTime(5000)
		await flushPromises()

		expect(load).not.toHaveBeenCalled()
		expect(store.date).toBe("2026-11-10")
	})

	it("is read at once when the cashier confirms it with Enter or leaves the field", async () => {
		await typed("2026-11-24")
		await field().trigger("keydown.enter")
		await flushPromises()
		expect(asked()).toEqual(["2026-11-24"])

		await typed("2026-11-25")
		await field().trigger("blur")
		await flushPromises()
		expect(asked()).toEqual(["2026-11-24", "2026-11-25"])

		// and the pause that was waiting for the first one asks nothing more
		vi.advanceTimersByTime(5000)
		await flushPromises()
		expect(asked()).toEqual(["2026-11-24", "2026-11-25"])
	})

	it("reads nothing again for the day already shown", async () => {
		await typed("2026-11-10")
		vi.advanceTimersByTime(5000)
		await flushPromises()

		expect(load).not.toHaveBeenCalled()
	})

	it("is not read after the agenda is left", async () => {
		await typed("2026-11-27")
		wrapper.unmount()
		vi.advanceTimersByTime(5000)
		await flushPromises()
		wrapper = mount(SalonAgenda, { global: { mocks: { __: globalThis.__ } } })

		expect(asked()).not.toContain("2026-11-27")
	})
})
