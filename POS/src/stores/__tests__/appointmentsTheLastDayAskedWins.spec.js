//// Neoffice — added file (no upstream equivalent). The agenda shows the day that was asked for last (neoffice-maintenance#3164, the audit of 19.11): a day typed by hand, or two clicks on the band, ask for another day while the first read is
//// still on its way. The old guard dropped the second read, then the first answer took the place of the day shown: the header said the 29th while the grid drew another day.
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
const agenda = (date) => ({
	available: true,
	date,
	appointments: [row(`BKG-${date}`, `${date} 15:00:00`)],
	people: [{ sales_person: "Sonia", name: "Sonia" }],
	capabilities: {},
})
/** A read the test answers when it wants: `answer(value)`. */
const aRead = () => {
	let answer
	const promise = new Promise((resolve) => {
		answer = resolve
	})
	return { promise, answer }
}

let store
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] })
	vi.setSystemTime(new Date(2026, 10, 18, 10, 0))
	localStorage.clear()
	setActivePinia(createPinia())
	network.isOffline = false
	lane.loadDay.mockReset()
	lane.loadWeek.mockReset()
	lane.loadWeek.mockResolvedValue(null)
	store = useAppointmentsStore()
})
afterEach(() => vi.useRealTimers())

describe("the day the agenda shows is the day asked for last", () => {
	it("draws the day asked for last when the answer of the first read arrives after it", async () => {
		const first = aRead()
		const second = aRead()
		lane.loadDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

		const readOfThe27th = store.setDay("2026-11-27")
		const readOfThe29th = store.setDay("2026-11-29")
		second.answer(agenda("2026-11-29"))
		await readOfThe29th
		first.answer(agenda("2026-11-27"))
		await readOfThe27th

		expect(store.date).toBe("2026-11-29")
		expect(store.appointments.map((each) => each.key)).toEqual(["BKG-2026-11-29"])
		expect(store.loading).toBe(false)
	})

	it("draws the day asked for last when the answers arrive in the order of the reads", async () => {
		const first = aRead()
		const second = aRead()
		lane.loadDay.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

		const readOfThe27th = store.setDay("2026-11-27")
		const readOfThe29th = store.setDay("2026-11-29")
		first.answer(agenda("2026-11-27"))
		await readOfThe27th
		// the first answer is of a day nobody asks for any more: the grid does not take it, and the second read is still on its way
		expect(store.appointments).toEqual([])
		expect(store.loading).toBe(true)
		second.answer(agenda("2026-11-29"))
		await readOfThe29th

		expect(store.appointments.map((each) => each.key)).toEqual(["BKG-2026-11-29"])
		expect(store.loading).toBe(false)
	})

	it("reads the day asked for even when another read is on its way", async () => {
		lane.loadDay.mockReturnValue(new Promise(() => {}))

		store.setDay("2026-11-27")
		store.setDay("2026-11-29")

		expect(lane.loadDay.mock.calls.map(([day]) => day)).toEqual(["2026-11-27", "2026-11-29"])
	})

	it("does not read the same day twice while it is being read (the minute's read, the button)", async () => {
		lane.loadDay.mockReturnValue(new Promise(() => {}))

		store.refresh()
		store.refresh()
		store.refresh()

		expect(lane.loadDay).toHaveBeenCalledTimes(1)
	})

	it("reads nothing for what is not a whole date", async () => {
		for (const typed of ["0002-11-29", "0202-11-29", "2026-02-30", "2026-13-01", "2026-11", "", null, undefined]) {
			await store.setDay(typed)
		}

		expect(lane.loadDay).not.toHaveBeenCalled()
		expect(store.date).toBe("2026-11-18")
	})

	it("takes nothing of a read that was on its way when the till changed", async () => {
		const first = aRead()
		lane.loadDay.mockReturnValueOnce(first.promise)
		const read = store.refresh()

		store.reset()
		first.answer(agenda("2026-11-18"))
		await read

		expect(store.appointments).toEqual([])
		expect(store.loaded).toBe(false)
	})

	it("does not show the band of a week the day has left while it was being read", async () => {
		lane.loadDay.mockResolvedValue(agenda("2026-11-18"))
		const bandOfThisWeek = aRead()
		lane.loadWeek.mockReturnValueOnce(bandOfThisWeek.promise)
		const reading = store.refreshWeek()

		store.day = "2026-12-03"
		bandOfThisWeek.answer({ available: true, days: [{ date: "2026-11-16" }] })
		await reading

		expect(store.week).toEqual([])
		// and the band of the week now shown is read again, not taken for the one that was dropped
		lane.loadWeek.mockResolvedValueOnce({ available: true, days: [{ date: "2026-11-30" }] })
		await store.refreshWeek()
		expect(store.week).toEqual([{ date: "2026-11-30" }])
	})
})
