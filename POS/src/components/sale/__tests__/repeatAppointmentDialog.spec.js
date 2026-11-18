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
const lane = vi.hoisted(() => ({ repeat: vi.fn(async () => null), loadDay: vi.fn(async () => null), refusal: { value: "" } }))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A" }) }))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => lane }))
const network = vi.hoisted(() => ({ isOffline: false, listeners: [], subscribe(listener) { network.listeners.push(listener); return () => {} } }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))

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
	// the windows of the tests before are not unmounted: their listeners of the network are not heard again
	network.listeners.length = 0
	vi.useFakeTimers()
	setActivePinia(createPinia())
	lane.repeat.mockReset()
	lane.repeat.mockResolvedValue(preview(dates))
	lane.refusal.value = ""
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

		expect(wrapper.get("[data-test='repeat-state-1']").text()).toBe("Free date")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("10:30 · Sonia")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("Same hour, same person")
		expect(wrapper.get("[data-test='repeat-state-2']").text()).toBe("Moved")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("11:00 · Sonia")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("10:30 is taken")
		expect(wrapper.get("[data-test='repeat-state-3']").text()).toBe("Skipped")
		expect(wrapper.get("[data-test='repeat-date-3']").text()).toContain("Sonia is away that day.")
		expect(wrapper.get("[data-test='repeat-date-3']").text()).toContain("This date is skipped.")
		expect(wrapper.get("[data-test='repeat-state-4']").text()).toBe("Too far")
		expect(wrapper.get("[data-test='repeat-date-4']").text()).toContain("Beyond the booking horizon")
		expect(wrapper.get("[data-test='repeat-date-4']").text()).toContain("This date is not proposed.")
	})

	it("books the free and the moved dates only, and says how many on the button", async () => {
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-confirm']").text()).toBe("Book 2 appointments")
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeUndefined()
	})

	it("says « Book 1 appointment » and « 1 appointment booked » in the singular", async () => {
		lane.repeat.mockResolvedValue(preview([free(1, "2026-12-23"), dates[3]]))
		const wrapper = mountIt()
		await settle()
		expect(wrapper.get("[data-test='repeat-confirm']").text()).toBe("Book 1 appointment")

		lane.repeat.mockResolvedValue({ mode: "booked", series: "BSR-1", booked: [{ index: 1, booking: "BKG-2", starts_at: "2026-12-23 11:00", state: "free" }], skipped: [] })
		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()
		expect(wrapper.get("[data-test='repeat-done']").text()).toContain("1 appointment booked.")
		expect(wrapper.find("[data-test='repeat-skipped']").exists()).toBe(false)
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

	it("takes another rhythm by number, and says when it is not a whole number of weeks from 1 to 52, asking nothing", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-every-other']").trigger("click")
		for (const typed of [90, 0, -3, 1.5, "abc", ""]) {
			await wrapper.get("[data-test='repeat-every-number']").setValue(typed)
			await settle()
			expect(wrapper.get("[data-test='repeat-every-problem']").text()).toBe("Choose a whole number of weeks, from 1 to 52.")
		}
		expect(lane.repeat).not.toHaveBeenCalled()
		// what was typed stays in the field: nothing is corrected behind the cashier's back
		await wrapper.get("[data-test='repeat-every-number']").setValue(90)
		expect(wrapper.get("[data-test='repeat-every-number']").element.value).toBe("90")

		await wrapper.get("[data-test='repeat-every-number']").setValue(12)
		await settle()
		expect(wrapper.find("[data-test='repeat-every-problem']").exists()).toBe(false)
		expect(lane.repeat.mock.calls.at(-1)[1].everyWeeks).toBe(12)
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

	// //// Neoffice — the audit of 18.11 (NeoSalon lots G14, voie 4)
	it("puts the dates changed by hand back when the rhythm, the number or the last day changes, and says so", async () => {
		const wrapper = mountIt()
		await settle()
		await wrapper.get("[data-test='repeat-edit-open-2']").trigger("click")
		await wrapper.get("[data-test='repeat-edit-2']").setValue("2027-02-10T14:00")
		await wrapper.get("[data-test='repeat-edit-ok-2']").trigger("click")
		await settle()
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("Changed by hand")
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-every-8']").trigger("click")
		await settle()

		expect(lane.repeat).toHaveBeenCalledTimes(1)
		expect(lane.repeat).toHaveBeenCalledWith("BKG-1", { everyWeeks: 8, count: 4, until: null, changes: {}, confirm: false })
		expect(wrapper.get("[data-test='repeat-date-2']").text()).not.toContain("Changed by hand")
		expect(wrapper.get("[data-test='repeat-changes-reset']").text()).toContain("changed by hand")

		// the same for the number of times
		await wrapper.get("[data-test='repeat-edit-open-2']").trigger("click")
		await wrapper.get("[data-test='repeat-edit-2']").setValue("2027-02-10T14:00")
		await wrapper.get("[data-test='repeat-edit-ok-2']").trigger("click")
		await settle()
		lane.repeat.mockClear()
		await wrapper.get("[data-test='repeat-count-6']").trigger("click")
		await settle()
		expect(lane.repeat.mock.calls.at(-1)[1].changes).toEqual({})
	})

	it("says a moved date by what happened to it when the reservation gave no reason, never « same hour »", async () => {
		lane.repeat.mockResolvedValue(preview([{ index: 1, date: "2026-12-30", starts_at: "2026-12-30 11:00", was: "10:30", state: "shifted", why: null }]))
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("The nearest free hour that day.")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).not.toContain("Same hour, same person")
	})

	it("says what is missing for « Until… »: the day, then a day after the appointment, asking nothing meanwhile", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-count-until']").trigger("click")
		await settle()
		expect(wrapper.get("[data-test='repeat-until-hint']").text()).toBe("Choose the last day.")

		await wrapper.get("[data-test='repeat-until']").setValue("2026-11-10")
		await settle()
		expect(wrapper.get("[data-test='repeat-until-problem']").text()).toBe("The last day must come after the appointment.")
		expect(lane.repeat).not.toHaveBeenCalled()

		await wrapper.get("[data-test='repeat-until']").setValue("2027-06-30")
		await settle()
		expect(wrapper.find("[data-test='repeat-until-problem']").exists()).toBe(false)
		expect(lane.repeat).toHaveBeenCalledTimes(1)
	})

	it("refuses a date changed by hand that is not a whole moment after the appointment, and keeps the field open with the reason", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockClear()

		await wrapper.get("[data-test='repeat-edit-open-2']").trigger("click")
		for (const typed of ["", "2027-02-10", "2026-11-17T09:00"]) {
			await wrapper.get("[data-test='repeat-edit-2']").setValue(typed)
			await wrapper.get("[data-test='repeat-edit-ok-2']").trigger("click")
			expect(wrapper.find("[data-test='repeat-edit-2']").exists()).toBe(true)
			expect(wrapper.get("[data-test='repeat-edit-problem']").text()).toMatch(/^Choose a (day and an hour|moment after the appointment)\.$/)
		}
		await settle()
		expect(lane.repeat).not.toHaveBeenCalled()
		expect(wrapper.get("[data-test='repeat-date-2']").text()).not.toContain("Changed by hand")
	})

	it("says why the reservation refused the dates, in its own words", async () => {
		lane.repeat.mockImplementation(async () => {
			lane.refusal.value = "This appointment is already part of a series."
			return null
		})
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-failed']").text()).toBe("This appointment is already part of a series.")
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeDefined()
	})

	it("reads the agenda again and says so when the booking got no answer, instead of closing on nothing", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockResolvedValue(null)
		store.refresh.mockClear()

		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()

		expect(store.refresh).toHaveBeenCalledTimes(1)
		expect(wrapper.get("[data-test='repeat-submit-problem']").text()).toContain("No answer came")
		expect(wrapper.get("[data-test='repeat-confirm']").attributes("disabled")).toBeUndefined()
		expect(wrapper.find("[data-test='repeat-done']").exists()).toBe(false)
	})

	it("says the reason of a refused booking instead of the general words", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockImplementation(async () => {
			lane.refusal.value = "Sonia is away on every date."
			return null
		})

		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test='repeat-submit-problem']").text()).toBe("Sonia is away on every date.")
	})

	it("keeps a date beyond the booking horizon apart from the skipped ones in the report", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockResolvedValue({
			mode: "booked",
			series: "BSR-1",
			booked: [{ index: 1, booking: "BKG-2", starts_at: "2026-12-30 10:30", state: "free" }],
			skipped: [
				{ index: 3, date: "2027-03-24", why: "Sonia is away that day." },
				{ index: 4, date: "2027-05-05", why: "" },
			],
		})

		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test='repeat-skipped']").text()).toContain("Sonia is away that day.")
		expect(wrapper.get("[data-test='repeat-skipped']").text()).not.toContain("05")
		expect(wrapper.get("[data-test='repeat-beyond']").text()).toContain("Not proposed, beyond the booking horizon:")
		expect(wrapper.get("[data-test='repeat-beyond']").text()).toContain("05")
	})

	it("writes every date the same way, the year included", async () => {
		const wrapper = mountIt()
		await settle()

		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("2026")
		expect(wrapper.get("[data-test='repeat-date-2']").text()).toContain("2027")
	})

	// //// Neoffice — the third passage of the audit (18.11, voie 4)
	it("says there is nothing to propose when the reservation answers no date, and says why for a last day too early", async () => {
		lane.repeat.mockResolvedValue(preview([]))
		const wrapper = mountIt()
		expect(wrapper.find("[data-test='repeat-no-dates']").exists()).toBe(false)
		await settle()
		expect(wrapper.get("[data-test='repeat-no-dates']").text()).toBe("No date to propose.")

		await wrapper.get("[data-test='repeat-count-until']").trigger("click")
		await wrapper.get("[data-test='repeat-until']").setValue("2026-11-25")
		await settle()
		expect(wrapper.get("[data-test='repeat-no-dates']").text()).toBe("No repetition falls on or before that day.")
	})

	it("says a date chosen by hand is the moment chosen, never « same hour, same person »", async () => {
		const wrapper = mountIt()
		await settle()
		await wrapper.get("[data-test='repeat-edit-open-1']").trigger("click")
		await wrapper.get("[data-test='repeat-edit-1']").setValue("2026-12-30T14:00")
		await wrapper.get("[data-test='repeat-edit-ok-1']").trigger("click")
		await settle()

		expect(wrapper.get("[data-test='repeat-date-1']").text()).toContain("The moment you chose.")
		expect(wrapper.get("[data-test='repeat-date-1']").text()).not.toContain("Same hour, same person")
	})

	it("names nobody when the appointment has nobody: no dangling dot, « same hour » only", async () => {
		const wrapper = mountIt({ appointment: appointment({ steps: [{ label: "Coloration racines", item_code: "RACINES" }] }) })
		await settle()

		const text = wrapper.get("[data-test='repeat-date-1']").text()
		expect(text).toContain("Same hour")
		expect(text).not.toContain("same person")
		expect(text).not.toMatch(/10:30\s*·\s*Same/)
	})

	it("draws the day as weekday, day, then month and year, on lines that do not break", async () => {
		const wrapper = mountIt()
		await settle()

		const lines = wrapper.get("[data-test='repeat-date-1'] div.rounded-xl").findAll("div")
		expect(lines.map((line) => line.text())).toEqual(["Wed", "30", "Dec 2026"])
		expect(lines[0].classes()).toContain("whitespace-nowrap")
		expect(lines[2].classes()).toContain("whitespace-nowrap")
	})

	it("asks again by a button when the dates could not be read, and by itself when the network comes back", async () => {
		lane.repeat.mockResolvedValue(null)
		const wrapper = mountIt()
		await settle()
		expect(wrapper.get("[data-test='repeat-failed']").exists()).toBe(true)
		lane.repeat.mockClear()
		lane.repeat.mockResolvedValue(preview(dates))

		await wrapper.get("[data-test='repeat-retry']").trigger("click")
		await flushPromises()
		expect(lane.repeat).toHaveBeenCalledTimes(1)
		expect(wrapper.find("[data-test='repeat-failed']").exists()).toBe(false)

		// the network comes back on a window that failed
		lane.repeat.mockResolvedValue(null)
		await wrapper.get("[data-test='repeat-every-4']").trigger("click")
		await settle()
		expect(wrapper.find("[data-test='repeat-failed']").exists()).toBe(true)
		lane.repeat.mockClear()
		lane.repeat.mockResolvedValue(preview(dates))
		for (const listener of network.listeners) listener({ isOffline: false, transition: "went-online" })
		await flushPromises()
		expect(lane.repeat).toHaveBeenCalledTimes(1)
	})

	it("marks the dates the reservation moved in the report", async () => {
		const wrapper = mountIt()
		await settle()
		lane.repeat.mockResolvedValue({
			mode: "booked",
			series: "BSR-1",
			booked: [
				{ index: 1, booking: "BKG-2", starts_at: "2026-12-30 10:30", state: "free" },
				{ index: 2, booking: "BKG-3", starts_at: "2027-02-10 11:00", state: "shifted" },
			],
			skipped: [],
		})

		await wrapper.get("[data-test='repeat-confirm']").trigger("click")
		await flushPromises()

		const rows = wrapper.get("[data-test='repeat-done']").findAll("li").map((row) => row.text())
		expect(rows[0]).not.toContain("Moved")
		expect(rows[1]).toContain("Moved")
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
