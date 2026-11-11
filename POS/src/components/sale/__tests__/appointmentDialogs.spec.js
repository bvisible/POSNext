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
	book: vi.fn(async () => ({ booking: "BKG-9" })),
	loadDay: vi.fn(async () => null),
	call: vi.fn(async () => []),
	toast: { showInfo: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showError: vi.fn() },
}))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A", profileCurrency: "CHF" }) }))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => lane }))
vi.mock("@/composables/useToast", () => ({ useToast: () => lane.toast }))
vi.mock("@/utils/apiWrapper", () => ({ call: lane.call }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }))
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

describe("the cancel dialog", () => {
	const open = (extra = {}) => mountWith(CancelAppointmentDialog, { modelValue: true, appointment: appointment(extra) })

	it("opens on a customer who cancels, to be warned", () => {
		const wrapper = open()

		expect(wrapper.get("[data-test='cancel-cancelled']").element.checked).toBe(true)
		expect(wrapper.get("[data-test='cancel-notify']").element.checked).toBe(true)
		expect(wrapper.get("[data-test='cancel-confirm']").text()).toBe("Cancel the appointment")
	})

	it("does not warn a customer who did not come, and marks her absent", async () => {
		const wrapper = open()

		await wrapper.get("[data-test='cancel-no_show']").setValue(true)

		expect(wrapper.get("[data-test='cancel-notify']").element.checked).toBe(false)
		expect(wrapper.get("[data-test='cancel-confirm']").text()).toBe("Mark absent")
		await wrapper.get("[data-test='cancel-confirm']").trigger("click")
		await flushPromises()
		expect(lane.cancel).toHaveBeenCalledWith("BKG-1", { reason: "no_show", notify: false })
	})

	it("says what she paid online and that it is refunded automatically", () => {
		const wrapper = open({ paid_amount: 40 })

		expect(wrapper.get("[data-test='cancel-refund']").text()).toContain("She paid CHF 40.00 online.")
		expect(wrapper.get("[data-test='cancel-refund']").text()).toContain("refunded to her automatically")
		expect(open().find("[data-test='cancel-refund']").exists()).toBe(false)
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

	it("says that there is no free slot that day", async () => {
		lane.slots.mockResolvedValue([])
		const wrapper = open()
		await flushPromises()

		await wrapper.get("[data-test='new-service-COUPE']").trigger("click")
		await flushPromises()

		expect(wrapper.find("[data-test='new-no-slots']").exists()).toBe(true)
	})
})
