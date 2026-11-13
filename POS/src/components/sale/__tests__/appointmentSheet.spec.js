//// Neoffice — added file (no upstream equivalent). The sheet of an appointment (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// It offers the gesture a person makes at this point as the one filled button (start, finish, collect), keeps the others as outlined ones, grays what `can` forbids,
// hides what the site does not have, and asks the time lane only through the store's capabilities; it never shows a cost.
// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const gestures = vi.hoisted(() => ({ clock: vi.fn(async () => ({ clock: { state: "running" } })) }))
const till = vi.hoisted(() => ({ appointmentsAtTheAnnouncedPrice: false }))

vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => till }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A", profileCurrency: "CHF" }) }))
vi.mock("@/composables/useAppointment", () => ({
	useAppointment: () => ({ clock: gestures.clock, loadDay: vi.fn(async () => null) }),
}))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }))
vi.mock("@/utils/currency", () => ({ formatCurrency: (amount) => `CHF ${Number(amount).toFixed(2)}` }))

const { useAppointmentsStore } = await import("@/stores/appointments")
const { default: AppointmentSheet } = await import("../AppointmentSheet.vue")

const appointment = (extra = {}) => ({
	key: "BKG-1",
	booking: "BKG-1",
	starts_at: "2026-11-10 13:30:00",
	ends_at: "2026-11-10 15:30:00",
	customer: "CUST-1",
	customer_name: "Mme Bovet",
	steps: [
		{
			label: "Couleur + mèches",
			item_code: "COULEUR",
			options: JSON.stringify([{ group: "Length", options: [{ name: "Mid" }] }]),
			starts_at: "2026-11-10 13:30:00",
			sales_person: "Luc",
			sales_person_name: "Luc",
		},
	],
	amount: 188,
	paid_amount: 40,
	state: "booked",
	invoice: null,
	in_the_till: false,
	busy: false,
	clock: { state: "idle", active_seconds: 0 },
	can: { collect: true, move: true, cancel: true, clock: true },
	...extra,
})

describe("the sheet of an appointment", () => {
	let store
	const mountIt = (extra = {}) =>
		mount(AppointmentSheet, { props: { appointment: appointment(extra) }, global: { mocks: { __: globalThis.__ } } })

	beforeEach(() => {
		setActivePinia(createPinia())
		gestures.clock.mockClear()
		till.appointmentsAtTheAnnouncedPrice = false
		store = useAppointmentsStore()
		store.capabilities = { clock: true, move: true, cancel: true, check_move: true, book: true }
		vi.spyOn(store, "refresh").mockResolvedValue()
	})

	it("says who, when, what with which options and who does it, and what it announces and what was paid", () => {
		const wrapper = mountIt()

		expect(wrapper.get("[data-test='sheet-customer']").text()).toBe("Mme Bovet")
		expect(wrapper.text()).toContain("13:30 → 15:30 · 2 h")
		expect(wrapper.get("[data-test='sheet-step-0']").text()).toContain("Couleur + mèches")
		expect(wrapper.get("[data-test='sheet-step-0']").text()).toContain("Length: Mid")
		expect(wrapper.get("[data-test='sheet-step-0']").text()).toContain("Luc")
		expect(wrapper.text()).toContain("CHF 188.00")
		expect(wrapper.get("[data-test='sheet-paid']").text()).toContain("CHF 40.00")
	})

	it("offers to start an appointment nobody has started, with collect as an outlined gesture beside move and cancel", () => {
		const wrapper = mountIt()

		expect(wrapper.get("[data-test='sheet-start']").text()).toBe("Start")
		expect(wrapper.findAll("[data-test^='sheet-']").map((node) => node.attributes("data-test"))).toEqual(
			expect.arrayContaining(["sheet-collect", "sheet-move", "sheet-cancel"]),
		)
	})

	it("asks the time lane to start, then reads the agenda again, and sends no hour", async () => {
		const wrapper = mountIt()

		await wrapper.get("[data-test='sheet-start']").trigger("click")

		expect(gestures.clock).toHaveBeenCalledWith("BKG-1", "start")
		expect(store.refresh).toHaveBeenCalled()
	})

	it("offers to finish a running appointment, to pause it, and still to collect it", async () => {
		const wrapper = mountIt({ state: "started", clock: { state: "running", active_seconds: 2460, started_at: "2026-11-10 13:31:08" } })

		expect(wrapper.get("[data-test='sheet-finish']").text()).toBe("Finish")
		expect(wrapper.find("[data-test='sheet-pause']").exists()).toBe(true)
		expect(wrapper.find("[data-test='sheet-collect']").exists()).toBe(true)
		expect(wrapper.get("[data-test='sheet-active-time']").text()).toBe("0:41")
		await wrapper.get("[data-test='sheet-pause']").trigger("click")
		expect(gestures.clock).toHaveBeenCalledWith("BKG-1", "pause")
	})

	it("offers to resume the time of an appointment in pause and says whose time is running instead when another appointment took it", () => {
		const wrapper = mountIt({ state: "started", clock: { state: "paused", active_seconds: 600, paused_by: "BKG-2" } })

		expect(wrapper.get("[data-test='sheet-start']").text()).toBe("Resume the time")
		expect(wrapper.get("[data-test='sheet-paused-by']").text()).toContain("In pause")
	})

	it("explains nothing about a pause the cashier pressed herself", () => {
		const wrapper = mountIt({ state: "started", clock: { state: "paused", active_seconds: 600, paused_by: null } })

		expect(wrapper.get("[data-test='sheet-start']").text()).toBe("Resume the time")
		expect(wrapper.find("[data-test='sheet-paused-by']").exists()).toBe(false)
	})

	it("offers to collect an appointment whose work is finished, and emits the appointment when it is pressed", async () => {
		const wrapper = mountIt({ state: "finished", clock: { state: "done", active_seconds: 3300, ended_at: "2026-11-10 14:58:00" } })

		expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
		await wrapper.get("[data-test='sheet-collect']").trigger("click")

		expect(wrapper.emitted("collect")[0][0].booking).toBe("BKG-1")
		expect(wrapper.text()).toContain("Finished at 14:58")
	})

	it("offers to resume the appointment already in a till", () => {
		const wrapper = mountIt({ in_the_till: true, state: "finished", clock: { state: "done" } })

		expect(wrapper.get("[data-test='sheet-collect']").text()).toBe("Resume")
		expect(wrapper.get("[data-test='sheet-state']").text()).toBe("In the till")
	})

	it("collects first where the site has no time lane", () => {
		store.capabilities = { ...store.capabilities, clock: false }

		const wrapper = mountIt()

		expect(wrapper.get("[data-test='sheet-collect']").text()).toBe("Collect")
		expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
		expect(wrapper.find("[data-test='sheet-time']").exists()).toBe(false)
	})

	it("grays a gesture the cashier may not make and hides a gesture the site does not have", () => {
		store.capabilities = { clock: true, move: true, cancel: false }

		const wrapper = mountIt({ can: { collect: true, move: false, cancel: true, clock: true } })

		expect(wrapper.get("[data-test='sheet-move']").attributes("disabled")).toBeDefined()
		expect(wrapper.find("[data-test='sheet-cancel']").exists()).toBe(false)
	})

	it("emits move and cancel for the page to open its dialogs", async () => {
		const wrapper = mountIt()

		await wrapper.get("[data-test='sheet-move']").trigger("click")
		await wrapper.get("[data-test='sheet-cancel']").trigger("click")

		expect(wrapper.emitted("move")[0][0].booking).toBe("BKG-1")
		expect(wrapper.emitted("cancel")[0][0].booking).toBe("BKG-1")
	})

	it("offers nothing for an appointment paid at the till, and shows its invoice", () => {
		const wrapper = mountIt({ state: "paid", invoice: "ACC-SINV-9", clock: { state: "done" }, can: { collect: false, move: false, cancel: false, clock: false } })

		expect(wrapper.find("[data-test='sheet-gestures'] button").exists()).toBe(false)
		expect(wrapper.get("[data-test='sheet-invoice']").text()).toContain("ACC-SINV-9")
		expect(wrapper.get("[data-test='sheet-state']").text()).toBe("Paid")
	})

	it("offers to cancel an appointment paid online and not served yet, which the reservation app lets go", async () => {
		const wrapper = mountIt({ state: "paid", invoice: "ACC-SINV-9", can: { collect: false, move: false, cancel: true, clock: false } })

		expect(wrapper.findAll("[data-test='sheet-gestures'] button").map((node) => node.attributes("data-test"))).toEqual(["sheet-cancel"])
		await wrapper.get("[data-test='sheet-cancel']").trigger("click")
		expect(wrapper.emitted("cancel")[0][0].booking).toBe("BKG-1")
	})

	it("says the till prices the services again only where it collects them, never on a paid appointment", () => {
		expect(mountIt().get("[data-test='sheet-reprice']").text()).toContain("The till prices the services again")
		const paid = mountIt({ state: "paid", invoice: "ACC-SINV-9", can: { collect: false, move: false, cancel: true, clock: false } })

		expect(paid.text()).not.toContain("The till prices the services again")
	})

	it("says the announced price is collected where the till is set to, and nothing about pricing again", () => {
		till.appointmentsAtTheAnnouncedPrice = true

		const text = mountIt().get("[data-test='sheet-reprice']").text()

		expect(text).toBe("The price announced at booking is collected.")
		expect(text).not.toContain("prices the services again")
	})

	it("offers nothing for an appointment where the cashier may do nothing", () => {
		const wrapper = mountIt({ can: { collect: false, move: false, cancel: false, clock: false } })

		expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
		expect(wrapper.find("[data-test='sheet-collect']").exists()).toBe(false)
		expect(wrapper.get("[data-test='sheet-move']").attributes("disabled")).toBeDefined()
	})

	describe("repeating an appointment", () => {
		it("offers « Repeat » beside the other gestures when the site repeats, and emits it for the page to open its dialog", async () => {
			store.capabilities = { ...store.capabilities, repeat: true }
			const wrapper = mountIt()

			await wrapper.get("[data-test='sheet-repeat']").trigger("click")

			expect(wrapper.get("[data-test='sheet-repeat']").text()).toBe("Repeat")
			expect(wrapper.emitted("repeat")[0][0].booking).toBe("BKG-1")
		})

		it("keeps it off the sheet where the site does not repeat", () => {
			expect(mountIt().find("[data-test='sheet-repeat']").exists()).toBe(false)
		})

		it("offers it on a paid appointment (the customer's next visit) and on that one only, never on an absent one", () => {
			store.capabilities = { ...store.capabilities, repeat: true }

			const paid = mountIt({ state: "paid", invoice: "ACC-SINV-9", clock: { state: "done" }, can: { collect: false, move: false, cancel: false, clock: false } })
			expect(paid.findAll("[data-test='sheet-gestures'] button").map((node) => node.attributes("data-test"))).toEqual(["sheet-repeat"])
			expect(mountIt({ state: "absent" }).find("[data-test='sheet-repeat']").exists()).toBe(false)
		})
	})

	describe("an appointment booked before the salon closed that day", () => {
		it("says it, names it « To handle », and makes moving it the filled button", async () => {
			const wrapper = mountIt({ to_handle: "closed" })

			expect(wrapper.get("[data-test='sheet-state']").text()).toBe("To handle")
			expect(wrapper.get("[data-test='sheet-to-handle']").text()).toContain("Nothing is cancelled by itself")
			expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
			// Move is the one filled button, and it is not offered twice
			expect(wrapper.findAll("[data-test='sheet-move']")).toHaveLength(1)
			expect(wrapper.get("[data-test='sheet-move']").classes()).toContain("bg-gray-900")
			expect(wrapper.get("[data-test='sheet-cancel']").exists()).toBe(true)

			await wrapper.get("[data-test='sheet-move']").trigger("click")
			expect(wrapper.emitted("move")[0][0].booking).toBe("BKG-1")
		})

		it("says that its person is away when that is why, and still makes moving it the filled button", () => {
			const wrapper = mountIt({ to_handle: "away" })

			expect(wrapper.get("[data-test='sheet-state']").text()).toBe("To handle")
			expect(wrapper.get("[data-test='sheet-to-handle']").text()).toContain("The person is away that day")
			expect(wrapper.get("[data-test='sheet-move']").classes()).toContain("bg-gray-900")
		})

		it("falls back to the usual gestures when it can no longer be moved (its hour is past)", () => {
			const wrapper = mountIt({ to_handle: "closed", can: { collect: true, move: false, cancel: true, clock: true } })

			expect(wrapper.get("[data-test='sheet-start']").exists()).toBe(true)
			expect(wrapper.get("[data-test='sheet-move']").attributes("disabled")).toBeDefined()
		})

		it("is an ordinary appointment once it is begun, whatever the flag says", () => {
			const wrapper = mountIt({ to_handle: "closed", state: "started", clock: { state: "running", active_seconds: 60 } })

			expect(wrapper.find("[data-test='sheet-to-handle']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-state']").text()).toBe("In progress")
		})
	})

	it("never shows a cost or a margin", () => {
		const wrapper = mountIt({ clock: { state: "running", active_seconds: 100, cost: 42, margin: 12 }, state: "started" })

		expect(wrapper.text().toLowerCase()).not.toContain("margin")
		expect(wrapper.text().toLowerCase()).not.toContain("cost")
	})
})
