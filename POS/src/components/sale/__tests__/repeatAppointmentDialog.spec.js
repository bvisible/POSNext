//// Neoffice — added file (no upstream equivalent). « Repeat this appointment » at the till (NeoSalon, lot G14; product owner, 10.11.2026).
// Every so many weeks, so many times (or until a day); each date is checked one by one by the reservation (free, moved to the nearest free hour, skipped, beyond
// the booking horizon) a moment after the last change and said before the button is pressed; a date can be changed by hand; the booking says what was booked
// and what was skipped.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const lane = vi.hoisted(() => ({ repeat: vi.fn(async () => null), loadDay: vi.fn(async () => null) }))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A" }) }))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => lane }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }))

const { useAppointmentsStore } = await import("@/stores/appointments")
const { default: RepeatAppointmentDialog } = await import("../RepeatAppointmentDialog.vue")

const appointment = (extra = {}) => ({
	key: "BKG-1",
	booking: "BKG-1",
	customer_name: "Camille R.",
	starts_at: "2026-11-18 10:30:00",
	ends_at: "2026-11-18 11:30:00",
	steps: [{ label: "Coloration racines", item_code: "RACINES", sales_person: "Sonia", sales_person_name: "Sonia" }],
	...extra,
})
const preview = (dates) => ({ mode: "preview", every_weeks: 6, max: 12, dates })
const free = (index, date, hour = "10:30") => ({ index, date, starts_at: `${date} ${hour}`, was: null, state: "free", why: null })
const dates = [
	free(1, "2026-12-30"),
	{ index: 2, date: "2027-02-10", starts_at: "2027-02-10 11:00", was: "10:30", state: "shifted", why: "10:30 is taken: the nearest free hour that day." },
	{ index: 3, date: "2027-03-24", starts_at: null, was: null, state: "skipped", why: "Sonia is away that day." },
	{ index: 4, date: "2027-05-05", starts_at: null, was: null, state: "beyond", why: null },
]
const mountIt = (props = {}) => mount(RepeatAppointmentDialog, { props: { modelValue: true, appointment: appointment(), ...props }, global: { mocks: { __: globalThis.__ } } })
const settle = async () => {
	await vi.advanceTimersByTimeAsync(350)
	await flushPromises()
}

let store
beforeEach(() => {
	vi.useFakeTimers()
	setActivePinia(createPinia())
	lane.repeat.mockReset()
	lane.repeat.mockResolvedValue(preview(dates))
	store = useAppointmentsStore()
	store.day = "2026-11-18"
	vi.spyOn(store, "refresh").mockResolvedValue()
})
afterEach(() => vi.useRealTimers())

describe("the repeat dialog", () => {
	it("says which appointment it repeats and asks the reservation for the dates of every 6 weeks, 4 times, a moment after it opens", async () => {
		const wrapper = mountIt()
		expect(lane.repeat).not.toHaveBeenCalled()
		await settle()

		expect(wrapper.get("[data-test='repeat-subject']").text()).toContain("Camille R. · Coloration racines")
		expect(wrapper.text()).toContain("Sonia")
		expect(lane.repeat).toHaveBeenCalledTimes(1)
		expect(lane.repeat).toHaveBeenCalledWith("BKG-1", { everyWeeks: 6, count: 4, until: null, changes: {}, confirm: false })
	})

	it("draws each date with where it stands: free, moved with the old hour struck, skipped and why, too far", async () => {
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-state-1']").text()).toBe("Free")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("10:30 · Sonia")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("Same hour, same person")
		expect(wrapper.get("[data-test='repeat-state-2']").text()).toBe("Moved")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("11:00 · Sonia")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("10:30 is taken")
		expect(wrapper.get("[data-test='repeat-state-3']").text()).toBe("Skipped")
		expect(wrapper.get("[data-test='repeat-date-3']").text()).toContain("Sonia is away that day.")
		expect(wrapper.get("[data-test='repeat-state-4']").text()).toBe("Too far")
		expect(wrapper.get("[data-test='repeat-date-4']").text()).toContain("Beyond what the salon takes bookings for")
	})

	it("books the free and the moved dates only, and says how many on the button", async () => {
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-confirm']").text()).toBe("Book 2 appointments")
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeUndefined()
	})

	it("asks again when the rhythm or the number changes, once, after the last change", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-every-4']").trigger("click")
		await wrapper.get("[data-test='repeat-count-6']").trigger("click")
		await settle()

		expect(lane.repeat).toHaveBeenCalledTimes(1)
		expect(lane.repeat).toHaveBeenCalledWith("BKG-1", { everyWeeks: 4, count: 6, until: null, changes: {}, confirm: false })
	})

	it("takes another rhythm by number, kept between 1 and 52 weeks", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-every-other']").trigger("click")
		await wrapper.get("[data-test='repeat-every-number']").setValue(90)
		await settle()

		expect(lane.repeat.mock.calls.at(-1)[1].everyWeeks).toBe(52)
	})

	it("asks until a day instead of how many times", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-count-until']").trigger("click")
		await settle()
		// Nothing is asked until the day is given
		expect(lane.repeat).not.toHaveBeenCalled()
		await wrapper.get("[data-test='repeat-until']").setValue("2027-06-30")
		await settle()

		expect(lane.repeat).toHaveBeenCalledWith("BKG-1", { everyWeeks: 6, count: null, until: "2027-06-30", changes: {}, confirm: false })
	})

	it("changes a date by hand: the reservation checks it as it is written, and the date says it was changed", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-edit-open-2']").trigger("click")
		await wrapper.get("[data-test='repeat-edit-2']").setValue("2027-02-10T14:00")
		await wrapper.get("[data-test='repeat-edit-ok-2']").trigger("click")
		await settle()

		expect(lane.repeat).toHaveBeenCalledWith("BKG-1", { everyWeeks: 6, count: 4, until: null, changes: { 2: "2027-02-10 14:00" }, confirm: false })
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("14:00 · Sonia")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("Changed by hand")
	})

	it("books the series and says what was booked and what was skipped, then reads the agenda again", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockResolvedValue({
			mode: "booked",
			series: "BSR-1",
			booked: [
				{ index: 1, booking: "BKG-2", starts_at: "2026-12-30 10:30", state: "free" },
				{ index: 2, booking: "BKG-3", starts_at: "2027-02-10 11:00", state: "shifted" },
			],
			skipped: [{ index: 3, date: "2027-03-24", why: "Sonia is away that day." }],
		})

		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()

		expect(lane.repeat).toHaveBeenLastCalledWith("BKG-1", { everyWeeks: 6, count: 4, until: null, changes: {}, confirm: true })
		expect(wrapper.get("[data-test='repeat-done']").text()).toContain("2 appointments booked.")
		expect(wrapper.get("[data-test='repeat-skipped']").text()).toContain("Sonia is away that day.")
		expect(store.refresh).toHaveBeenCalled()
		expect(wrapper.emitted("booked")[0][0].series).toBe("BSR-1")

		await wrapper.get("[data-test='repeat-close']").trigger("click")
		expect(wrapper.emitted("update:modelValue")[0]).toEqual([false])
	})

	it("books nothing when no date is free, and says so on the button", async () => {
		lane.repeat.mockResolvedValue(preview([dates[2], dates[3]]))
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-confirm']").text()).toBe("Nothing to book")
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeDefined()
	})

	it("says the dates could not be read when the reservation refuses, and books nothing", async () => {
		lane.repeat.mockResolvedValue(null)
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-failed']").exists()).toBe(true)
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeDefined()
	})

	it("keeps the dates of the last question when an older answer comes late", async () => {
		let release
		lane.repeat.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		const wrapper = mountIt()
		await vi.advanceTimersByTimeAsync(350)
		lane.repeat.mockResolvedValue(preview([free(1, "2026-12-16")]))
		await wrapper.get("[data-test='repeat-every-2']").trigger("click")
		await settle()
		release(preview([free(1, "2099-01-01")]))
		await flushPromises()

		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("16")
		expect(wrapper.text()).not.toContain("2099")
	})

	it("starts again from the usual rhythm each time it opens, and forgets what was booked", async () => {
		const wrapper = mountIt()
		await settle()
		await wrapper.get("[data-test='repeat-every-4']").trigger("click")
		await wrapper.setProps({ modelValue: false })
		await wrapper.setProps({ modelValue: true })
		await settle()

		expect(lane.repeat.mock.calls.at(-1)[1].everyWeeks).toBe(6)
		expect(wrapper.find("[data-test='repeat-done']").exists()).toBe(false)
	})
})
