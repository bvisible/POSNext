//// Neoffice — added file (no upstream equivalent). The dialogs of the gestures of a salon (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// Move: prefilled, the planning lane says whether it fits before the button is pressed, the customer is warned (box ticked). Cancel: the reason, the box ticked only for a
// customer who cancels, what she paid is said. New: the customer, the services with their options, a free slot the reservation offers, then the booking.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const lane = vi.hoisted(() => ({
	checkMove: vi.fn(async () => ({ ok: true, why: "" })),
	move: vi.fn(async () => ({ booking: "BKG-1" })),
	cancel: vi.fn(async () => ({ booking: "BKG-1", state: "cancelled", refunded: 0, to_refund: 0 })),
	services: vi.fn(async () => []),
	slots: vi.fn(async () => []),
	calendarOf: vi.fn(async () => null),
	book: vi.fn(async () => ({ booking: "BKG-9" })),
	loadDay: vi.fn(async () => null),
	call: vi.fn(async () => []),
	addToCache: vi.fn(async () => undefined),
	toast: { showInfo: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A", profileCurrency: "CHF" }) }))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => lane }))
vi.mock("@/composables/useToast", () => ({ useToast: () => lane.toast }))
vi.mock("@/stores/customerSearch", () => ({ useCustomerSearchStore: () => ({ addCustomerToCache: lane.addToCache }) }))
// The till's customer form is tested by its own specs: here it is a stand-in that shows what it was opened with and hands back a customer
vi.mock("../CustomerFormDialog.vue", () => ({
	default: {
		name: "CustomerFormDialog",
		props: ["modelValue", "posProfile", "initialName", "customer"],
		emits: ["update:modelValue", "customer-created"],
		template: '<div v-if="modelValue" data-test="customer-form"><span data-test="customer-form-name">{{ initialName }}</span><span data-test="customer-form-till">{{ posProfile }}</span></div>',
	},
}))
vi.mock("@/utils/apiWrapper", () => ({ call: lane.call }))
// The day « today » is the 10th of November 2026 for these specs (the days of the strip that are gone are not offered, neoffice-maintenance#3160): the real clock would move them
const clock = vi.hoisted(() => ({ today: "2026-11-10" }))
vi.mock("@/utils/appointments", async (original) => ({ ...(await original()), todayOf: () => clock.today }))
const network = vi.hoisted(() => ({ isOffline: false }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))
vi.mock("@/utils/currency", () => ({ formatCurrency: (amount) => `CHF ${Number(amount).toFixed(2)}` }))

const { useAppointmentsStore } = await import("@/stores/appointments")
const { default: MoveAppointmentDialog } = await import("../MoveAppointmentDialog.vue")
const { default: CancelAppointmentDialog } = await import("../CancelAppointmentDialog.vue")
const { default: NewAppointmentDialog } = await import("../NewAppointmentDialog.vue")

const appointment = (extra = {}) => ({
	key: "BKG-1",
	booking: "BKG-1",
	customer: "CUST-1",
	customer_name: "Mme Roch",
	starts_at: "2026-11-10 14:00:00",
	ends_at: "2026-11-10 15:30:00",
	steps: [{ label: "Balayage", item_code: "BALAYAGE", sales_person: "Maya", sales_person_name: "Maya" }],
	paid_amount: 0,
	...extra,
})
const person = (name, extra = {}) => ({ key: name, sales_person: name, sales_person_name: name, status: "present", periods: [["09:00", "17:00"]], ...extra })
const mountWith = (component, props) => mount(component, { props, global: { mocks: { __: globalThis.__ } } })

let store
beforeEach(() => {
	clock.today = "2026-11-10"
	setActivePinia(createPinia())
	Object.values(lane).forEach((fn) => fn.mockClear?.())
	Object.values(lane.toast).forEach((fn) => fn.mockClear())
	lane.checkMove.mockResolvedValue({ ok: true, why: "" })
	lane.move.mockResolvedValue({ booking: "BKG-1" })
	lane.cancel.mockResolvedValue({ booking: "BKG-1", state: "cancelled", refunded: 0, to_refund: 0 })
	store = useAppointmentsStore()
	store.day = "2026-11-10"
	store.capabilities = { check_move: true, move: true, cancel: true, book: true }
	store.people = [person("Luc"), person("Maya"), person("Camille"), person("Sonia", { status: "on_leave" })]
	vi.spyOn(store, "refresh").mockResolvedValue()
})
afterEach(() => vi.useRealTimers())

describe("the move dialog", () => {
	const open = () => mountWith(MoveAppointmentDialog, { modelValue: true, appointment: appointment() })

	it("opens on the appointment's own person, day and hour, with the customer to be warned", () => {
		const wrapper = open()

		expect(wrapper.get("[data-test='move-person']").element.value).toBe("Maya")
		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-10")
		expect(wrapper.get("[data-test='move-time']").element.value).toBe("14:00")
		expect(wrapper.get("[data-test='move-notify']").element.checked).toBe(true)
	})

	// NeoSalon B', 16.11: an appointment dropped on another person or hour in the agenda opens this window on what the drop proposes
	it("opens on the person and the hour a drop in the agenda proposes, and asks whether it fits", async () => {
		vi.useFakeTimers()
		const wrapper = mountWith(MoveAppointmentDialog, {
			modelValue: true,
			appointment: appointment(),
			proposal: { person: "Camille", day: "2026-11-10", time: "16:30" },
		})
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-person']").element.value).toBe("Camille")
		expect(wrapper.get("[data-test='move-time']").element.value).toBe("16:30")
		expect(lane.checkMove).toHaveBeenCalledWith("BKG-1", "2026-11-10 16:30:00", "Camille")
	})

	it("offers the people who work that day, and not the one who is on leave", () => {
		const options = open().findAll("[data-test='move-person'] option").map((node) => node.text())

		expect(options).toEqual(["Luc", "Maya", "Camille"])
	})

	it("asks the planning lane whether the new hour fits, a moment after the last change, and says so", async () => {
		vi.useFakeTimers()
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:30")
		await wrapper.get("[data-test='move-person']").setValue("Camille")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(lane.checkMove).toHaveBeenCalledTimes(1)
		expect(lane.checkMove).toHaveBeenCalledWith("BKG-1", "2026-11-10 16:30:00", "Camille")
		expect(wrapper.get("[data-test='move-verdict']").text()).toContain("This hour is free.")
	})

	it("says why an hour is not possible and does not let it be sent", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({ ok: false, why: "Camille has Mme Vial at 16:00." })
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:00")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toContain("Camille has Mme Vial at 16:00.")
		expect(wrapper.get("[data-test='move-confirm']").attributes("disabled")).toBeDefined()
	})

	// 16.11: the till showed the general sentence and the lane's reason glued together with no space, saying the same thing twice
	it("says the lane's reason alone, without the general sentence beside it", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({ ok: false, why: "That time slot is no longer available." })
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:00")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("That time slot is no longer available.")
	})

	// //// Neoffice — what the move does to the cabin (NeoSalon, cabins level 2, 16.11.2026): said before the button
	it("says the cabin it goes to when the hour takes it out of the one it is in", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({
			ok: true,
			why: "",
			cabin: { from: { name: "CAB-1", label: "Cabin 1", color: null }, to: { name: "CAB-2", label: "Cabin 2", color: null }, changed: true },
		})
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:30")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toContain("This hour is free.")
		expect(wrapper.get("[data-test='move-cabin']").text()).toBe("Cabin 2 instead of Cabin 1.")
	})

	it("names the cabin of an appointment that had none, and says nothing when the cabin is kept or the service asks for none", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({ ok: true, why: "", cabin: { from: null, to: { name: "CAB-2", label: "Cabin 2", color: null }, changed: true } })
		const wrapper = open()
		await wrapper.get("[data-test='move-time']").setValue("16:30")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()
		expect(wrapper.get("[data-test='move-cabin']").text()).toBe("It goes in Cabin 2.")

		lane.checkMove.mockResolvedValue({ ok: true, why: "", cabin: { from: { name: "CAB-1", label: "Cabin 1", color: null }, to: { name: "CAB-1", label: "Cabin 1", color: null }, changed: false } })
		await wrapper.get("[data-test='move-time']").setValue("17:00")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()
		expect(wrapper.find("[data-test='move-cabin']").exists()).toBe(false)

		lane.checkMove.mockResolvedValue({ ok: true, why: "" })
		await wrapper.get("[data-test='move-time']").setValue("17:30")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()
		expect(wrapper.find("[data-test='move-cabin']").exists()).toBe(false)
	})

	it("does not announce a cabin for an hour that is refused", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({
			ok: false,
			why: "No cabin is free at that hour.",
			cabin: { from: { name: "CAB-1", label: "Cabin 1", color: null }, to: null, changed: true },
		})
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:30")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("No cabin is free at that hour.")
		expect(wrapper.find("[data-test='move-cabin']").exists()).toBe(false)
	})

	it("says the general sentence when the lane gives no reason", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({ ok: false, why: "" })
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:00")
		await vi.advanceTimersByTimeAsync(350)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("This hour is not possible.")
	})

	it("moves the appointment keeping the person when she did not change, reads the agenda again and closes", async () => {
		const wrapper = open()

		await wrapper.get("[data-test='move-time']").setValue("16:30")
		await wrapper.get("[data-test='move-confirm']").trigger("click")
		await flushPromises()

		expect(lane.move).toHaveBeenCalledWith("BKG-1", "2026-11-10 16:30:00", { salesPerson: null, notify: true })
		expect(store.refresh).toHaveBeenCalled()
		expect(wrapper.emitted("update:modelValue")[0]).toEqual([false])
		expect(wrapper.emitted("moved")).toHaveLength(1)
	})

	it("hands the appointment over to another person, and does not warn the customer when the box is unticked", async () => {
		const wrapper = open()

		await wrapper.get("[data-test='move-person']").setValue("Luc")
		await wrapper.get("[data-test='move-notify']").setValue(false)
		await wrapper.get("[data-test='move-confirm']").trigger("click")
		await flushPromises()

		expect(lane.move).toHaveBeenCalledWith("BKG-1", "2026-11-10 14:00:00", { salesPerson: "Luc", notify: false })
	})

	it("stays open when the lane refuses", async () => {
		lane.move.mockResolvedValue(null)
		const wrapper = open()

		await wrapper.get("[data-test='move-confirm']").trigger("click")
		await flushPromises()

		expect(wrapper.emitted("update:modelValue")).toBeUndefined()
		expect(store.refresh).not.toHaveBeenCalled()
	})
})

describe("the days of the business in the move dialog", () => {
	const open = (extra = {}) => mountWith(MoveAppointmentDialog, { modelValue: true, appointment: appointment(), ...extra })
	const calendar = {
		available: true,
		days: [
			{ day: "2026-11-11", state: "closed", reason: "holiday", label: "Public holiday of the canton", periods: [] },
			{ day: "2026-11-12", state: "special", reason: "special_hours", label: null, periods: [["10:00", "14:00"]] },
		],
		absences: [
			{ sales_person: "Maya", sales_person_name: "Maya", from: "2026-11-13", to: "2026-11-14", kind: "leave", reason: "Annual leave" },
			{ sales_person: "Luc", sales_person_name: "Luc", from: "2026-11-15", to: "2026-11-15", kind: "leave", reason: null },
		],
	}

	beforeEach(() => {
		store.capabilities = { ...store.capabilities, calendar: true }
		lane.calendarOf.mockReset()
		lane.calendarOf.mockResolvedValue(calendar)
	})

	it("shows fourteen days from the appointment's own, asked once for that period", async () => {
		const wrapper = open()
		await flushPromises()

		expect(lane.calendarOf).toHaveBeenCalledWith("2026-11-10", "2026-11-23")
		const days = wrapper.findAll("[data-test^='move-day-']").map((node) => node.attributes("data-test"))
		expect(days).toHaveLength(14)
		expect(days[0]).toBe("move-day-2026-11-10")
		expect(days[13]).toBe("move-day-2026-11-23")
		expect(wrapper.get("[data-test='move-day-2026-11-10']").attributes("aria-pressed")).toBe("true")
	})

	it("cannot press a day the business is closed, and says why", async () => {
		const wrapper = open()
		await flushPromises()

		const closed = wrapper.get("[data-test='move-day-2026-11-11']")
		expect(closed.attributes("disabled")).toBeDefined()
		expect(closed.attributes("title")).toBe("Closed that day · Public holiday of the canton")
		await closed.trigger("click")
		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-10")
	})

	it("marks a day with other hours and says the hours", async () => {
		const wrapper = open()
		await flushPromises()

		const special = wrapper.get("[data-test='move-day-2026-11-12']")
		expect(special.attributes("disabled")).toBeUndefined()
		// the reason is not said twice when the day has no note of its own (« Special hours · 10:00–14:00 · Special hours », neoffice-maintenance#3160)
		expect(special.attributes("title")).toBe("Special hours · 10:00–14:00")
		expect(special.classes().join(" ")).toContain("border-dashed")
	})

	it("marks the days the person of the appointment is away, and no other person's", async () => {
		const wrapper = open()
		await flushPromises()

		expect(wrapper.find("[data-test='move-away-2026-11-13']").exists()).toBe(true)
		expect(wrapper.find("[data-test='move-away-2026-11-14']").exists()).toBe(true)
		expect(wrapper.find("[data-test='move-away-2026-11-15']").exists()).toBe(false)
		expect(wrapper.get("[data-test='move-day-2026-11-13']").attributes("title")).toContain("Maya is away")
	})

	it("follows the person chosen: another person's absence is the one marked", async () => {
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='move-person']").setValue("Luc")

		expect(wrapper.find("[data-test='move-away-2026-11-15']").exists()).toBe(true)
		expect(wrapper.find("[data-test='move-away-2026-11-13']").exists()).toBe(false)
	})

	it("takes the day pressed as the day of the move and asks whether it fits", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()

		await wrapper.get("[data-test='move-day-2026-11-16']").trigger("click")
		await vi.advanceTimersByTimeAsync(350)

		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-16")
		expect(lane.checkMove).toHaveBeenLastCalledWith("BKG-1", "2026-11-16 14:00:00", "Maya")
	})

	it("moves a week at a time, and asks the calendar again for the days it shows", async () => {
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='move-strip-next']").trigger("click")
		await flushPromises()
		expect(lane.calendarOf).toHaveBeenLastCalledWith("2026-11-17", "2026-11-30")
		expect(wrapper.findAll("[data-test^='move-day-']")[0].attributes("data-test")).toBe("move-day-2026-11-17")

		await wrapper.get("[data-test='move-strip-back']").trigger("click")
		await flushPromises()
		expect(lane.calendarOf).toHaveBeenLastCalledWith("2026-11-10", "2026-11-23")
	})

	it("keeps a note of its own on a day with other hours", async () => {
		lane.calendarOf.mockResolvedValue({ ...calendar, days: [{ day: "2026-11-12", state: "special", reason: "special_hours", label: "Late opening", periods: [["10:00", "14:00"]] }] })
		const wrapper = open()
		await flushPromises()

		expect(wrapper.get("[data-test='move-day-2026-11-12']").attributes("title")).toBe("Special hours · 10:00–14:00 · Late opening")
	})

	it("has arrows as wide as a touch target, 44 px", async () => {
		const wrapper = open()
		await flushPromises()

		for (const arrow of ["move-strip-back", "move-strip-next"]) {
			expect(wrapper.get(`[data-test='${arrow}']`).classes()).toContain("w-11")
			expect(wrapper.get(`[data-test='${arrow}']`).classes()).not.toContain("w-8")
		}
	})

	it("brings the strip to a day typed in the field when it is out of its range", async () => {
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='move-day']").setValue("2026-12-20")
		await flushPromises()

		expect(lane.calendarOf).toHaveBeenLastCalledWith("2026-12-20", "2027-01-02")
	})

	it("shows no strip and asks nothing where the site has no calendar, or the calendar could not be read", async () => {
		store.capabilities = { ...store.capabilities, calendar: false }
		const without = open()
		await flushPromises()
		expect(lane.calendarOf).not.toHaveBeenCalled()
		expect(without.find("[data-test='move-strip']").exists()).toBe(false)

		store.capabilities = { ...store.capabilities, calendar: true }
		lane.calendarOf.mockResolvedValue(null)
		const unreadable = open()
		await flushPromises()
		expect(unreadable.find("[data-test='move-strip']").exists()).toBe(false)
		lane.calendarOf.mockResolvedValue({ available: false, days: [], absences: [] })
		const unavailable = open()
		await flushPromises()
		expect(unavailable.find("[data-test='move-strip']").exists()).toBe(false)
	})

	it("ignores an answer that comes after the strip moved again", async () => {
		const wrapper = open()
		await flushPromises()
		let release
		lane.calendarOf.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		await wrapper.get("[data-test='move-strip-next']").trigger("click")
		lane.calendarOf.mockResolvedValue({ available: true, days: [{ day: "2026-11-12", state: "closed", reason: null, label: "Right window", periods: [] }], absences: [] })
		await wrapper.get("[data-test='move-strip-back']").trigger("click")
		await flushPromises()
		release({ available: true, days: [{ day: "2026-11-12", state: "closed", reason: null, label: "Stale window", periods: [] }], absences: [] })
		await flushPromises()

		expect(wrapper.findAll("[data-test^='move-day-']")[0].attributes("data-test")).toBe("move-day-2026-11-10")
		expect(wrapper.get("[data-test='move-day-2026-11-12']").attributes("title")).toContain("Right window")
		expect(wrapper.get("[data-test='move-day-2026-11-12']").attributes("title")).not.toContain("Stale")
	})
})

describe("what the move dialog says of the day chosen (neoffice-maintenance#3160)", () => {
	const open = (extra = {}) => mountWith(MoveAppointmentDialog, { modelValue: true, appointment: appointment(), ...extra })
	const calendar = {
		available: true,
		days: [
			{ day: "2026-11-11", state: "closed", reason: "closure", label: null, periods: [] },
			{ day: "2026-11-12", state: "special", reason: "special_hours", label: null, periods: [["09:00", "12:00"]] },
			{ day: "2026-11-13", state: "closed", reason: "holiday", label: null, periods: [] },
			{ day: "2026-11-14", state: "closed", reason: "weekly_off", label: null, periods: [] },
		],
		absences: [],
	}
	const choose = async (wrapper, dayText, timeText) => {
		await wrapper.get("[data-test='move-day']").setValue(dayText)
		if (timeText) await wrapper.get("[data-test='move-time']").setValue(timeText)
		await flushPromises()
	}

	beforeEach(() => {
		store.capabilities = { ...store.capabilities, calendar: true }
		lane.calendarOf.mockReset()
		lane.calendarOf.mockResolvedValue(calendar)
		// the lane's own phrase when it refuses: the one that said nothing of the reason
		lane.checkMove.mockResolvedValue({ ok: false, why: "That time slot is no longer available." })
	})

	it("says a closed day is closed, and why, not the lane's phrase, and the button cannot be pressed", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()

		await wrapper.get("[data-test='move-day']").setValue("2026-11-11")
		await vi.advanceTimersByTimeAsync(400)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("Closed that day · Closure")
		expect(wrapper.get("[data-test='move-confirm']").attributes("disabled")).toBeDefined()
	})

	it("says it for a public holiday and for a weekly day off", async () => {
		const wrapper = open()
		await flushPromises()

		await choose(wrapper, "2026-11-13")
		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("Closed that day · Public holiday")
		await choose(wrapper, "2026-11-14")
		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("Closed that day · Weekly day off")
	})

	it("says the other hours of the day when the hour chosen is outside them, and says nothing of them when it is inside", async () => {
		vi.useFakeTimers()
		lane.checkMove.mockResolvedValue({ ok: true, why: "" })
		const wrapper = open()
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()

		await wrapper.get("[data-test='move-day']").setValue("2026-11-12")
		await wrapper.get("[data-test='move-time']").setValue("14:00")
		await vi.advanceTimersByTimeAsync(400)
		await flushPromises()
		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("Special hours · 09:00–12:00")
		expect(wrapper.get("[data-test='move-confirm']").attributes("disabled")).toBeDefined()

		await wrapper.get("[data-test='move-time']").setValue("10:30")
		await vi.advanceTimersByTimeAsync(400)
		await flushPromises()
		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("This hour is free.")
		expect(wrapper.get("[data-test='move-confirm']").attributes("disabled")).toBeUndefined()
	})

	it("leaves the lane's own words to an open day it refuses", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await vi.advanceTimersByTimeAsync(0)
		await flushPromises()

		await wrapper.get("[data-test='move-time']").setValue("16:00")
		await vi.advanceTimersByTimeAsync(400)
		await flushPromises()

		expect(wrapper.get("[data-test='move-verdict']").text()).toBe("That time slot is no longer available.")
	})

	it("keeps a closed day typed in the field struck and ringed, not plain black", async () => {
		const wrapper = open()
		await flushPromises()

		await choose(wrapper, "2026-11-11")

		const chosen = wrapper.get("[data-test='move-day-2026-11-11']")
		expect(chosen.attributes("aria-pressed")).toBe("true")
		expect(chosen.classes()).toContain("line-through")
		expect(chosen.classes()).toContain("ring-red-600")
		const open_ = wrapper.get("[data-test='move-day-2026-11-15']")
		expect(open_.classes()).not.toContain("line-through")
	})

	it("does not offer the days already gone: greyed, cannot be pressed, and says it", async () => {
		clock.today = "2026-11-12"
		const wrapper = open()
		await flushPromises()

		for (const gone of ["2026-11-10", "2026-11-11"]) {
			const button = wrapper.get(`[data-test='move-day-${gone}']`)
			expect(button.attributes("disabled")).toBeDefined()
			expect(button.attributes("title")).toContain("Past day")
		}
		const today = wrapper.get("[data-test='move-day-2026-11-12']")
		expect(today.attributes("disabled")).toBeUndefined()
		expect(today.attributes("title") || "").not.toContain("Past day")
		await wrapper.get("[data-test='move-day-2026-11-11']").trigger("click")
		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-10")
		await wrapper.get("[data-test='move-day-2026-11-15']").trigger("click")
		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-15")
	})
})

describe("the strip goes to the day chosen (neoffice-maintenance#3160)", () => {
	const open = () => mountWith(MoveAppointmentDialog, { modelValue: true, appointment: appointment(), attachTo: document.body })
	const prototype = HTMLElement.prototype
	let scrolled
	let scrollLeft

	beforeEach(() => {
		store.capabilities = { ...store.capabilities, calendar: true }
		lane.calendarOf.mockReset()
		lane.calendarOf.mockResolvedValue({ available: true, days: [], absences: [] })
		scrolled = vi.fn()
		scrollLeft = 0
		// jsdom lays nothing out: a box 300 px wide, days 48 px wide and 52 px apart, the first one of the strip at 0
		Object.defineProperty(prototype, "offsetLeft", {
			configurable: true,
			get() {
				return /^move-day-\d{4}-\d{2}-\d{2}$/.test(this.dataset?.test || "") ? Array.from(this.parentElement.children).indexOf(this) * 52 : 0
			},
		})
		Object.defineProperty(prototype, "offsetWidth", { configurable: true, get: () => 48 })
		Object.defineProperty(prototype, "clientWidth", { configurable: true, get: () => 300 })
		Object.defineProperty(prototype, "scrollLeft", { configurable: true, get: () => scrollLeft, set(value) { scrollLeft = value } })
		prototype.scrollTo = scrolled
	})
	afterEach(() => {
		for (const name of ["offsetLeft", "offsetWidth", "clientWidth", "scrollLeft", "scrollTo"]) Reflect.deleteProperty(prototype, name)
		document.body.innerHTML = ""
	})

	it("brings a day typed in the field into view when it is in the strip but out of sight", async () => {
		const wrapper = open()
		await flushPromises()
		scrolled.mockClear()

		await wrapper.get("[data-test='move-day']").setValue("2026-11-20")
		await flushPromises()

		// the 20th is the eleventh day of a strip that starts on the 10th: 10 * 52 = 520, centred in a box of 300 (520 - (300 - 48) / 2)
		expect(scrolled).toHaveBeenLastCalledWith({ left: 520 - 126 })
	})

	it("does not move a strip whose chosen day is already in view", async () => {
		const wrapper = open()
		await flushPromises()
		scrolled.mockClear()

		await wrapper.get("[data-test='move-day-2026-11-11']").trigger("click")
		await flushPromises()

		expect(wrapper.get("[data-test='move-day']").element.value).toBe("2026-11-11")
		expect(scrolled).not.toHaveBeenCalled()
	})

	it("shows the day typed far away at the start of the strip it is read again from, whatever the strip was scrolled to", async () => {
		const wrapper = open()
		await flushPromises()
		scrollLeft = 400
		scrolled.mockClear()

		await wrapper.get("[data-test='move-day']").setValue("2026-12-20")
		await flushPromises()

		// the strip starts on the day chosen, now at 0: out of the box that was scrolled to [400, 700]
		expect(scrolled).toHaveBeenLastCalledWith({ left: 0 })
	})

	it("an arrow shows the first day of the week it moves to, not where the strip was scrolled", async () => {
		const wrapper = open()
		await flushPromises()
		scrollLeft = 400
		scrolled.mockClear()

		await wrapper.get("[data-test='move-strip-next']").trigger("click")
		await flushPromises()

		expect(scrolled).toHaveBeenCalledWith({ left: 0 })
	})
})

describe("the cancel dialog", () => {
	const open = (extra = {}) => mountWith(CancelAppointmentDialog, { modelValue: true, appointment: appointment(extra) })

	it("opens on a customer who cancels, to be warned", () => {
		const wrapper = open()

		expect(wrapper.get("[data-test='cancel-cancelled']").element.checked).toBe(true)
		expect(wrapper.get("[data-test='cancel-notify']").element.checked).toBe(true)
		expect(wrapper.get("[data-test='cancel-confirm']").text()).toBe("Cancel the appointment")
	})

	it("does not warn a customer who did not come, and marks the customer absent", async () => {
		const wrapper = open()

		await wrapper.get("[data-test='cancel-no_show']").setValue(true)

		expect(wrapper.find("[data-test='cancel-notify']").exists()).toBe(false)
		expect(wrapper.get("[data-test='cancel-no-message']").text()).toBe("No message is sent for an absence.")
		expect(wrapper.text()).not.toContain("The slot is free again")
		expect(wrapper.get("[data-test='cancel-confirm']").text()).toBe("Mark absent")
		await wrapper.get("[data-test='cancel-confirm']").trigger("click")
		await flushPromises()
		expect(lane.cancel).toHaveBeenCalledWith("BKG-1", { reason: "no_show", notify: false })
	})

	it("says what was paid online and that it is refunded automatically", () => {
		const wrapper = open({ paid_amount: 40 })

		expect(wrapper.get("[data-test='cancel-refund']").text()).toContain("CHF 40.00 was paid online.")
		expect(wrapper.get("[data-test='cancel-refund']").text()).toContain("refunded automatically, by the same means of payment")
		expect(open().find("[data-test='cancel-refund']").exists()).toBe(false)
	})

	it("says before marking the customer absent what the absence keeps and what is refunded by the same means of payment", async () => {
		const wrapper = open({ paid_amount: 40, absent_kept: 16, absent_refund: 24 })

		await wrapper.get("[data-test='cancel-no_show']").setValue(true)

		const said = wrapper.get("[data-test='cancel-refund']").text()
		expect(said).toContain("CHF 40.00 was paid online.")
		expect(said).toContain("CHF 16.00 is kept for the absence and CHF 24.00 is refunded by the same means of payment")
		expect(said).not.toContain("refunded automatically, by the same means of payment")
	})

	it("says that an absence the scale keeps whole gives nothing back", async () => {
		const wrapper = open({ paid_amount: 40, absent_kept: 40, absent_refund: 0 })

		await wrapper.get("[data-test='cancel-no_show']").setValue(true)

		expect(wrapper.get("[data-test='cancel-refund']").text()).toContain("all of it is kept for the absence: nothing goes back")
	})

	it("names no amount for an absence when the reservation app does not say what it keeps", async () => {
		const wrapper = open({ paid_amount: 40 })

		await wrapper.get("[data-test='cancel-no_show']").setValue(true)

		const said = wrapper.get("[data-test='cancel-refund']").text()
		expect(said).toContain("what the scale asks for an absence is kept and the rest is refunded by the same means of payment")
		expect(said).not.toContain("nothing goes back")
	})

	it("says what a late cancellation keeps and what is refunded by the same means of payment", () => {
		const wrapper = open({ paid_amount: 32.5, cancel_kept: 26, cancel_refund: 6.5 })

		const said = wrapper.get("[data-test='cancel-refund']").text()
		expect(said).toContain("CHF 26.00 is kept by the cancellation scale and CHF 6.50 is refunded by the same means of payment")
		expect(said).not.toContain("refunded automatically, by the same means of payment")
	})

	it("says that a cancellation whose scale keeps it all gives nothing back, and that one keeping nothing is refunded", () => {
		expect(open({ paid_amount: 32.5, cancel_kept: 32.5, cancel_refund: 0 }).get("[data-test='cancel-refund']").text()).toContain(
			"all of it is kept by the cancellation scale: nothing goes back",
		)
		expect(open({ paid_amount: 32.5, cancel_kept: 0, cancel_refund: 32.5 }).get("[data-test='cancel-refund']").text()).toContain(
			"refunded automatically, by the same means of payment",
		)
	})

	it("cancels, says what was refunded and what is still to give back, reads the agenda again and closes", async () => {
		lane.cancel.mockResolvedValue({ booking: "BKG-1", state: "cancelled", refunded: 30, to_refund: 10 })
		const wrapper = open({ paid_amount: 40 })

		await wrapper.get("[data-test='cancel-confirm']").trigger("click")
		await flushPromises()

		expect(lane.cancel).toHaveBeenCalledWith("BKG-1", { reason: "cancelled", notify: true })
		expect(lane.toast.showInfo).toHaveBeenCalledWith("CHF 30.00 refunded to the customer.")
		expect(lane.toast.showWarning).toHaveBeenCalledWith("CHF 10.00 is still to be refunded to the customer.")
		expect(store.refresh).toHaveBeenCalled()
		expect(wrapper.emitted("cancelled")).toHaveLength(1)
	})

	it("keeps the appointment when asked to", async () => {
		const wrapper = open()

		await wrapper.get("[data-test='cancel-keep']").trigger("click")

		expect(wrapper.emitted("update:modelValue")[0]).toEqual([false])
		expect(lane.cancel).not.toHaveBeenCalled()
	})
})

describe("the new appointment dialog", () => {
	const services = [
		{
			item_code: "COUPE",
			label: "Coupe femme",
			price: 65,
			options: [{ group: "Length", required: false, choices: [{ item: "OPT-MID", label: "Mid", price_delta: 15 }, { item: "OPT-LONG", label: "Long", price_delta: 25 }] }],
			people: [{ sales_person: "Luc" }, { sales_person: "Maya" }],
		},
		{ item_code: "BRUSHING", label: "Brushing", price: 45, options: [], people: [{ sales_person: "Maya" }] },
	]
	const open = (start = { person: person("Luc"), from: 15 * 60 + 30 }) => mountWith(NewAppointmentDialog, { modelValue: true, start })

	beforeEach(() => {
		lane.services.mockResolvedValue(services)
		lane.slots.mockResolvedValue([
			{ starts_at: "2026-11-10 15:30:00", sales_person: "Luc", sales_person_name: "Luc" },
			{ starts_at: "2026-11-10 17:00:00", sales_person: "Maya", sales_person_name: "Maya" },
		])
		lane.call.mockResolvedValue({ message: [{ name: "CUST-2", customer_name: "Mme Perret", mobile_no: "079 000 33 44" }] })
	})

	it("lists what can be booked and starts on the person of the free hour pressed", async () => {
		const wrapper = open()
		await flushPromises()

		expect(wrapper.findAll("[data-test^='new-service-']").map((node) => node.attributes("data-test"))).toEqual(["new-service-COUPE", "new-service-BRUSHING"])
		expect(lane.services).toHaveBeenCalledTimes(1)
		expect(wrapper.get("[data-test='new-day']").element.value).toBe("2026-11-10")
	})

	it("says that nothing can be booked when the reservation offers nothing", async () => {
		lane.services.mockResolvedValue([])
		const wrapper = open()
		await flushPromises()

		expect(wrapper.find("[data-test='new-no-services']").exists()).toBe(true)
	})

	it("books the customer, the service with its option, the person and the slot the reservation offers, and warns her", async () => {
		vi.useFakeTimers()
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='new-customer-search']").setValue("Perr")
		await vi.advanceTimersByTimeAsync(300)
		await flushPromises()
		await wrapper.get("[data-test='new-customer-CUST-2']").trigger("click")
		await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
		await wrapper.get("[data-test='new-option-COUPE-Mid']").trigger("click")
		await flushPromises()

		// The choice goes back by the article that sells it (what the reservation applies to the booking), not by its words
		const chain = [{ item_code: "COUPE", options: JSON.stringify([{ item: "OPT-MID" }]) }]
		expect(lane.slots).toHaveBeenLastCalledWith("2026-11-10", chain, "Luc")
		// The hour the cashier pressed is the slot she meant
		expect(wrapper.get("[data-test='new-confirm']").text()).toBe("Book 15:30")
		await wrapper.get("[data-test='new-confirm']").trigger("click")
		await flushPromises()

		expect(lane.book).toHaveBeenCalledWith("CUST-2", chain, "2026-11-10 15:30:00", { salesPerson: "Luc", notify: true })
		expect(store.refresh).toHaveBeenCalled()
		expect(wrapper.emitted("booked")[0][0].booking).toBe("BKG-9")
		expect(wrapper.emitted("update:modelValue")[0]).toEqual([false])
	})

	it("sends a choice back by its article, and sends nothing for a choice the reservation gave no article for", async () => {
		lane.services.mockResolvedValue([
			{ item_code: "COUPE", label: "Coupe femme", price: 65, options: [{ group: "Length", required: false, choices: [{ item: null, label: "Mid", price_delta: 15 }] }], people: [] },
		])
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
		await wrapper.get("[data-test='new-option-COUPE-Mid']").trigger("click")
		await flushPromises()

		expect(lane.slots).toHaveBeenLastCalledWith("2026-11-10", [{ item_code: "COUPE", options: null }], "Luc")
	})

	it("offers only the people who do every service chosen, and falls back to whoever when the person cannot do one", async () => {
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='new-service-BRUSHING']").trigger("click")
		await flushPromises()

		expect(wrapper.find("[data-test='new-person-Maya']").exists()).toBe(true)
		expect(wrapper.find("[data-test='new-person-Luc']").exists()).toBe(false)
		expect(lane.slots).toHaveBeenLastCalledWith("2026-11-10", [{ item_code: "BRUSHING", options: null }], null)
	})

	it("books nothing until a customer, a service and a slot are chosen", async () => {
		const wrapper = open({ person: null, from: null })
		await flushPromises()

		expect(wrapper.get("[data-test='new-confirm']").attributes("disabled")).toBeDefined()
		await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
		await flushPromises()
		expect(wrapper.get("[data-test='new-confirm']").attributes("disabled")).toBeDefined()
		expect(lane.book).not.toHaveBeenCalled()
	})

	describe("a customer who is not in the book yet", () => {
		const made = { name: "CUST-9", customer_name: "Mme Neuve", mobile_no: "079 111 22 33" }
		const form = (wrapper) => wrapper.findComponent({ name: "CustomerFormDialog" })

		it("is made from the dialog, by the till's own customer form, opened on what was typed and on this till", async () => {
			vi.useFakeTimers()
			const wrapper = open()
			await flushPromises()
			expect(wrapper.find("[data-test='customer-form']").exists()).toBe(false)

			await wrapper.get("[data-test='new-customer-search']").setValue("Neuve Claire")
			await wrapper.get("[data-test='new-customer-create']").trigger("click")

			expect(wrapper.get("[data-test='customer-form-name']").text()).toBe("Neuve Claire")
			expect(wrapper.get("[data-test='customer-form-till']").text()).toBe("Till A")
			// The way is there before anything is typed too
			const bare = open()
			await flushPromises()
			expect(bare.get("[data-test='new-customer-create']").text()).toContain("New Customer")
		})

		it("goes on with the customer the form made: she is chosen, cached for the search, and the booking is hers", async () => {
			const wrapper = open()
			await flushPromises()
			await wrapper.get("[data-test='new-customer-create']").trigger("click")

			form(wrapper).vm.$emit("customer-created", made)
			await flushPromises()

			expect(wrapper.get("[data-test='new-customer-chosen']").text()).toContain("Mme Neuve")
			expect(wrapper.find("[data-test='new-customer-search']").exists()).toBe(false)
			expect(lane.addToCache).toHaveBeenCalledWith(made)
			expect(lane.toast.showSuccess).toHaveBeenCalledWith("Mme Neuve created and selected")

			await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
			await flushPromises()
			await wrapper.get("[data-test='new-confirm']").trigger("click")
			await flushPromises()
			expect(lane.book).toHaveBeenCalledWith("CUST-9", [{ item_code: "COUPE", options: null }], "2026-11-10 15:30:00", { salesPerson: "Luc", notify: true })
		})

		it("says she was selected, not created, when the form found her already in the book", async () => {
			const wrapper = open()
			await flushPromises()
			await wrapper.get("[data-test='new-customer-create']").trigger("click")

			form(wrapper).vm.$emit("customer-created", { ...made, neo_existing: 1 })
			await flushPromises()

			expect(wrapper.get("[data-test='new-customer-chosen']").text()).toContain("Mme Neuve")
			expect(lane.toast.showSuccess).toHaveBeenCalledWith("Customer Mme Neuve selected")
		})

		it("forgets the name it was opened on when it closes, so the same text typed again fills it again", async () => {
			const wrapper = open()
			await flushPromises()
			await wrapper.get("[data-test='new-customer-search']").setValue("Neuve Claire")
			await wrapper.get("[data-test='new-customer-create']").trigger("click")
			expect(form(wrapper).props("initialName")).toBe("Neuve Claire")

			form(wrapper).vm.$emit("update:modelValue", false)
			await flushPromises()
			expect(form(wrapper).props("initialName")).toBe("")

			await wrapper.get("[data-test='new-customer-create']").trigger("click")
			expect(form(wrapper).props("initialName")).toBe("Neuve Claire")
		})

		it("leaves the form closed when the dialog opens again", async () => {
			const wrapper = open()
			await flushPromises()
			await wrapper.get("[data-test='new-customer-create']").trigger("click")
			expect(wrapper.find("[data-test='customer-form']").exists()).toBe(true)

			await wrapper.setProps({ modelValue: false })
			await wrapper.setProps({ modelValue: true })
			await flushPromises()

			expect(wrapper.find("[data-test='customer-form']").exists()).toBe(false)
			expect(wrapper.find("[data-test='new-customer-chosen']").exists()).toBe(false)
		})
	})

	it("says that a new appointment, and a new customer, wait for the network", async () => {
		network.isOffline = true
		try {
			const wrapper = open()
			await flushPromises()

			expect(wrapper.get("[data-test='new-offline']").text()).toContain("No network")
			expect(wrapper.get("[data-test='new-customer-create']").attributes("disabled")).toBeDefined()
		} finally {
			network.isOffline = false
		}
	})

	it("does not say that nothing can be booked when the services could not be read for lack of a network", async () => {
		network.isOffline = true
		lane.services.mockResolvedValue([])
		try {
			const wrapper = open()
			await flushPromises()

			expect(wrapper.get("[data-test='new-offline']").exists()).toBe(true)
			expect(wrapper.find("[data-test='new-no-services']").exists()).toBe(false)
		} finally {
			network.isOffline = false
		}
	})

	it("shows no such note while the network is there", async () => {
		const wrapper = open()
		await flushPromises()

		expect(wrapper.find("[data-test='new-offline']").exists()).toBe(false)
		expect(wrapper.get("[data-test='new-customer-create']").attributes("disabled")).toBeUndefined()
	})

	it("says that there is no free slot that day", async () => {
		lane.slots.mockResolvedValue([])
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
		await flushPromises()

		expect(wrapper.find("[data-test='new-no-slots']").exists()).toBe(true)
	})
})
