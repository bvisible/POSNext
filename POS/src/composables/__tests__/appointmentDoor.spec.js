//// Neoffice — added file (no upstream equivalent). The door of an appointment: `/pos?appointment=<booking>&date=<day>` (NeoSalon, voie 4, 19.11.2026).
// It waits for the agenda to answer, goes to the day asked, presses the appointment, says so when it is not there, and does it once.
// @vitest-environment jsdom
import { nextTick, reactive, ref } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const toast = vi.hoisted(() => ({ showWarning: vi.fn() }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))

const { addressWithoutTheDoor, readTheDoor, useAppointmentDoor } = await import("../useAppointmentDoor")

const fakeStore = (extra = {}) => {
	const store = {
		loaded: false,
		available: false,
		date: "2026-11-19",
		appointments: [{ key: "BKG-7", booking: "BKG-7" }],
		select: vi.fn(),
		setDay: vi.fn(async (day) => {
			store.date = day
		}),
		...extra,
	}
	return store
}

describe("what the address asks for", () => {
	it("is a booking and, when given, a day", () => {
		expect(readTheDoor("?appointment=BKG-7&date=2026-11-20")).toEqual({ booking: "BKG-7", date: "2026-11-20" })
		expect(readTheDoor("?appointment=BKG-7")).toEqual({ booking: "BKG-7", date: "" })
		expect(readTheDoor("?other=1&appointment=BKG-2026-00042&date=nonsense")).toEqual({ booking: "BKG-2026-00042", date: "" })
	})

	it("is nothing for an address that names no booking, or a name that is not one", () => {
		for (const search of ["", "?date=2026-11-20", "?appointment=", "?appointment=../../etc", "?appointment=%3Cscript%3E", `?appointment=${"x".repeat(141)}`, undefined]) {
			expect(readTheDoor(search)).toBeNull()
		}
	})

	it("is left out of the address once used, with the rest of it kept", () => {
		expect(addressWithoutTheDoor("?appointment=BKG-7&date=2026-11-20")).toBe("")
		expect(addressWithoutTheDoor("?a=1&appointment=BKG-7&date=2026-11-20&b=2")).toBe("?a=1&b=2")
	})
})

describe("the door of an appointment", () => {
	let show
	let offered
	beforeEach(() => {
		toast.showWarning.mockClear()
		show = ref(false)
		offered = ref(true)
		globalThis.history.replaceState(null, "", "/pos?appointment=BKG-7&date=2026-11-20#x")
	})

	it("does nothing for an address that names no appointment", async () => {
		const store = fakeStore({ loaded: true, available: true })
		useAppointmentDoor({ store, offered, show, search: "" })
		await nextTick()

		expect(show.value).toBe(false)
		expect(store.select).not.toHaveBeenCalled()
	})

	it("waits for the agenda to answer, then opens the appointment", async () => {
		const live = reactive(fakeStore())
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-7" })
		await nextTick()
		expect(show.value).toBe(false)
		expect(live.select).not.toHaveBeenCalled()

		live.loaded = true
		await nextTick()
		expect(show.value).toBe(false)

		live.available = true
		await vi.waitFor(() => expect(live.select).toHaveBeenCalledWith("BKG-7"))
		expect(show.value).toBe(true)
	})

	it("opens the agenda on the day asked and presses the appointment, once, and takes the door out of the address", async () => {
		const store = fakeStore({ loaded: true, available: true })
		const live = reactive(store)
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-7&date=2026-11-20" })
		await vi.waitFor(() => expect(live.select).toHaveBeenCalledWith("BKG-7"))

		expect(show.value).toBe(true)
		expect(live.setDay).toHaveBeenCalledWith("2026-11-20")
		expect(toast.showWarning).not.toHaveBeenCalled()
		expect(globalThis.location.search).toBe("")
		expect(globalThis.location.hash).toBe("#x")

		// a refresh of the agenda does not open it again
		live.loaded = false
		live.loaded = true
		await nextTick()
		expect(live.select).toHaveBeenCalledTimes(1)
	})

	it("opens it once even when the agenda changes while the day is being read", async () => {
		let release
		const live = reactive(fakeStore())
		live.setDay = vi.fn(
			() =>
				new Promise((resolve) => {
					release = () => {
						live.date = "2026-11-20"
						resolve()
					}
				}),
		)
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-7&date=2026-11-20" })
		await nextTick()
		live.loaded = true
		live.available = true
		await nextTick()
		expect(live.setDay).toHaveBeenCalledTimes(1)

		live.available = false
		await nextTick()
		live.available = true
		await nextTick()
		release()
		await vi.waitFor(() => expect(live.select).toHaveBeenCalled())

		expect(live.setDay).toHaveBeenCalledTimes(1)
		expect(live.select).toHaveBeenCalledTimes(1)
	})

	it("stays on the day shown when the address gives none", async () => {
		const live = reactive(fakeStore({ loaded: true, available: true }))
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-7" })
		await vi.waitFor(() => expect(live.select).toHaveBeenCalled())

		expect(live.setDay).not.toHaveBeenCalled()
	})

	it("says so when the appointment is not on that day's agenda, and opens no other", async () => {
		const live = reactive(fakeStore({ loaded: true, available: true }))
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-404&date=2026-11-20" })
		await vi.waitFor(() => expect(toast.showWarning).toHaveBeenCalled())

		expect(toast.showWarning).toHaveBeenCalledWith("The appointment BKG-404 is not on the agenda of 2026-11-20.")
		expect(live.select).not.toHaveBeenCalled()
	})

	it("does not open the agenda where the till does not offer it", async () => {
		const live = reactive(fakeStore({ loaded: true, available: true }))
		offered.value = false
		useAppointmentDoor({ store: live, offered, show, search: "?appointment=BKG-7" })
		await nextTick()

		expect(show.value).toBe(false)
		expect(live.select).not.toHaveBeenCalled()
	})
})
