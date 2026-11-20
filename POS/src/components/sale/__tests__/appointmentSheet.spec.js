//// Neoffice — added file (no upstream equivalent). The sheet of an appointment (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// It offers the gesture a person makes at this point as the one filled button (start, finish, collect), keeps the others as outlined ones, grays what `can` forbids,
// hides what the site does not have, and asks the time lane only through the store's capabilities; it never shows a cost.
// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const gestures = vi.hoisted(() => ({
	clock: vi.fn(async () => ({ clock: { state: "running" } })),
	claim: vi.fn(async () => ({ booking: "BKG-1", sales_person: "Luc", sales_person_name: "Luc" })),
	cabinsOf: vi.fn(async () => []),
	changeCabin: vi.fn(async () => null),
	fileOf: vi.fn(async () => null),
}))
const till = vi.hoisted(() => ({ appointmentsAtTheAnnouncedPrice: false }))

vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => till }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A", profileCurrency: "CHF" }) }))
vi.mock("@/composables/useAppointment", () => ({
	useAppointment: () => ({
		clock: gestures.clock,
		claim: gestures.claim,
		cabinsOf: gestures.cabinsOf,
		changeCabin: gestures.changeCabin,
		fileOf: gestures.fileOf,
		loadDay: vi.fn(async () => null),
	}),
}))
const network = vi.hoisted(() => {
	const listeners = []
	return {
		isOffline: false,
		subscribe(callback) {
			listeners.push(callback)
			return () => listeners.splice(listeners.indexOf(callback), 1)
		},
		go(offline) {
			this.isOffline = offline
			for (const callback of [...listeners]) callback({ isOffline: offline })
		},
	}
})
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))
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
		gestures.claim.mockClear()
		gestures.cabinsOf.mockReset().mockResolvedValue([])
		gestures.changeCabin.mockReset().mockResolvedValue(null)
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

	//// Neoffice — a haircut paid by card at the counter read « Already paid online » (maintenance#2798)
	it("says the money of a sale the till validated was collected at the till, and calls online only what was paid ahead", () => {
		const atTheTill = mountIt({ state: "paid", paid_amount: 78, invoice: "FA-1", paid_at_the_till: true, can: {} })
		const ahead = mountIt({ state: "paid", paid_amount: 78, invoice: "FA-2", paid_at_the_till: false, can: {} })
		const downPayment = mountIt()

		expect(atTheTill.get("[data-test='sheet-paid']").text()).toContain("Collected at the till")
		expect(atTheTill.get("[data-test='sheet-paid']").text()).not.toContain("online")
		expect(ahead.get("[data-test='sheet-paid']").text()).toContain("Already paid online")
		expect(downPayment.get("[data-test='sheet-paid']").text()).toContain("Already paid online")
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

	//// Neoffice — an appointment nobody has is taken by the cashier who gives the service (neoffice-maintenance#3185, Jérémy, 20.11.2026: « Oui, elle le prend »)
	describe("an appointment nobody has", () => {
		const nobodys = (extra = {}) =>
			mountIt({
				steps: [{ label: "Coupe", item_code: "COUPE", starts_at: "2026-11-10 13:30:00", sales_person: null, sales_person_name: null }],
				can: { collect: false, move: false, cancel: false, clock: false },
				claimable: true,
				...extra,
			})

		beforeEach(() => {
			store.capabilities = { ...store.capabilities, claim: true }
		})

		it("offers one button, « I take it », and says what it does: nothing else is offered before she has it", () => {
			const wrapper = nobodys()

			expect(wrapper.get("[data-test='sheet-claim']").text()).toBe("I take it")
			expect(wrapper.get("[data-test='sheet-claim-note']").text()).toContain("it becomes yours alone")
			expect(wrapper.findAll("[data-test='sheet-gestures'] button").map((node) => node.attributes("data-test"))).toEqual(["sheet-claim"])
			expect(wrapper.get("[data-test='sheet-step-0']").text()).toContain("To assign")
		})

		it("asks the site to give it to her, then reads the agenda again (it shows whose it is now)", async () => {
			const wrapper = nobodys()

			await wrapper.get("[data-test='sheet-claim']").trigger("click")
			await flushPromises()

			expect(gestures.claim).toHaveBeenCalledWith("BKG-1")
			expect(store.refresh).toHaveBeenCalled()
		})

		it("reads the agenda again when the site refused (a colleague was first): the sheet then shows who has it", async () => {
			gestures.claim.mockResolvedValueOnce(null)
			const wrapper = nobodys()

			await wrapper.get("[data-test='sheet-claim']").trigger("click")
			await flushPromises()

			expect(store.refresh).toHaveBeenCalled()
		})

		it("offers nothing to take where the site has not the gesture or the cashier may not (it is a colleague's, or hers already)", () => {
			store.capabilities = { ...store.capabilities, claim: false }
			expect(nobodys().find("[data-test='sheet-claim']").exists()).toBe(false)

			store.capabilities = { ...store.capabilities, claim: true }
			const notHers = nobodys({ claimable: false })
			expect(notHers.find("[data-test='sheet-claim']").exists()).toBe(false)
			expect(notHers.find("[data-test='sheet-claim-note']").exists()).toBe(false)
		})

		it("waits for the network and says so, and does not say the appointment can be collected", async () => {
			network.go(true)
			const wrapper = nobodys()
			await flushPromises()

			expect(wrapper.get("[data-test='sheet-claim']").attributes("disabled")).toBeDefined()
			expect(wrapper.get("[data-test='sheet-claim-needs-network']").text()).toBe("Taking an appointment needs the network.")
			expect(wrapper.find("[data-test='sheet-needs-network']").exists()).toBe(false)
			network.go(false)
		})

		it("once it is hers the gestures are hers: the row the agenda gives next is no longer claimable", () => {
			const wrapper = mountIt({ claimable: false })

			expect(wrapper.find("[data-test='sheet-claim']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-start']").text()).toBe("Start")
		})
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

	it("says that the time of a forgotten clock is an estimate, and says nothing for a measured one", () => {
		const forgotten = mountIt({ state: "finished", clock: { state: "done", active_seconds: 5400, ended_at: "2026-11-10 19:00:00", estimated: true } })
		expect(forgotten.get("[data-test='sheet-estimated']").text()).toContain("Duration estimated")
		expect(forgotten.get("[data-test='sheet-estimated']").text()).toContain("planned length")

		const measured = mountIt({ state: "finished", clock: { state: "done", active_seconds: 3300, ended_at: "2026-11-10 14:58:00", estimated: false } })
		expect(measured.find("[data-test='sheet-estimated']").exists()).toBe(false)
		const older = mountIt({ state: "finished", clock: { state: "done", active_seconds: 3300 } })
		expect(older.find("[data-test='sheet-estimated']").exists()).toBe(false)
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

	//// Neoffice — a clock per step (voie 4, 19.11.2026): a colour in several times is not one chrono
	describe("an appointment done in several times has a clock per step", () => {
		const step = (rank, label, person, clockState, extra = {}) => ({
			step: rank,
			booking: `COL-${rank}`,
			label,
			item_code: `SRV-${rank}`,
			starts_at: `2026-11-10 ${["09:00", "10:00", "10:45"][rank - 1]}:00`,
			ends_at: `2026-11-10 ${["09:30", "10:45", "11:00"][rank - 1]}:00`,
			sales_person: person,
			sales_person_name: person,
			clock: { state: clockState, active_seconds: 0, started_at: null, ended_at: null, estimated: false, paused_by: null, ...extra.clock },
			can_time: true,
			...extra.step,
		})
		const colour = (clocks = ["done", "running", "idle"], extra = {}) => ({
			booking: "COL-1",
			state: "started",
			clock: { state: "running", active_seconds: 2400, started_at: "2026-11-10 09:00:00" },
			steps: [
				step(1, "Application", "Luc", clocks[0], { clock: { active_seconds: 1800, started_at: "2026-11-10 09:00:00", ended_at: "2026-11-10 09:30:00" } }),
				step(2, "Rinse and cut", "Sonia", clocks[1], { clock: { active_seconds: 600, started_at: "2026-11-10 10:00:00" } }),
				step(3, "Finish", "Luc", clocks[2]),
			],
			...extra,
		})

		it("says where each step stands and how long it has really run, and the appointment's time is the sum with the steps done counted", () => {
			const wrapper = mountIt(colour())

			expect(wrapper.get("[data-test='sheet-step-clock-0']").text()).toBe("Finished at 09:30")
			expect(wrapper.get("[data-test='sheet-step-active-time-0']").text()).toBe("0:30")
			expect(wrapper.get("[data-test='sheet-step-clock-1']").text()).toBe("Started at 10:00")
			expect(wrapper.get("[data-test='sheet-step-active-time-1']").text()).toBe("0:10")
			expect(wrapper.get("[data-test='sheet-step-clock-2']").text()).toBe("Not started")
			expect(wrapper.get("[data-test='sheet-active-time']").text()).toBe("0:40")
			expect(wrapper.get("[data-test='sheet-time-text']").text()).toBe("1 of 3 steps finished")
		})

		it("says the wait between two steps, with no clock and no gesture, and nothing where the next step follows at once", () => {
			const wrapper = mountIt(colour())

			expect(wrapper.get("[data-test='sheet-wait-0']").text()).toBe("Wait · 30 min")
			expect(wrapper.find("[data-test='sheet-wait-1']").exists()).toBe(false)
			expect(wrapper.find("[data-test='sheet-wait-2']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-wait-0']").findAll("button")).toHaveLength(0)
		})

		it("offers each step the gestures of where it stands, and none for a step done", () => {
			const wrapper = mountIt(colour(["done", "running", "idle"]))

			const gesturesOf = (at) =>
				wrapper
					.findAll("button")
					.map((node) => node.attributes("data-test"))
					.filter((name) => new RegExp(`^sheet-step-(start|pause|finish)-${at}$`).test(name))
			expect(gesturesOf(0)).toEqual([])
			expect(gesturesOf(1)).toEqual(["sheet-step-pause-1", "sheet-step-finish-1"])
			expect(gesturesOf(2)).toEqual(["sheet-step-start-2"])
			const paused = mountIt(colour(["done", "paused", "idle"]))
			expect(paused.get("[data-test='sheet-step-start-1']").text()).toBe("Resume the time")
			expect(paused.get("[data-test='sheet-step-clock-1']").text()).toBe("In pause")
		})

		it("times the step that is pressed, by its own booking, never the first one, then reads the agenda again", async () => {
			const wrapper = mountIt(colour(["done", "running", "idle"]))

			await wrapper.get("[data-test='sheet-step-start-2']").trigger("click")
			expect(gestures.clock).toHaveBeenLastCalledWith("COL-3", "start")
			await wrapper.get("[data-test='sheet-step-finish-1']").trigger("click")
			expect(gestures.clock).toHaveBeenLastCalledWith("COL-2", "finish")
			await wrapper.get("[data-test='sheet-step-pause-1']").trigger("click")
			expect(gestures.clock).toHaveBeenLastCalledWith("COL-2", "pause")
			expect(store.refresh).toHaveBeenCalledTimes(3)
		})

		it("offers no gesture on a step this cashier may not time, nor where the site has no time lane, and still says where it stands", () => {
			const colleague = colour(["idle", "idle", "idle"])
			colleague.steps[1].can_time = false
			// A step that names no booking has nothing to be timed by, whatever the site says of the cashier
			delete colleague.steps[2].booking
			const wrapper = mountIt(colleague)
			expect(wrapper.find("[data-test='sheet-step-start-0']").exists()).toBe(true)
			expect(wrapper.find("[data-test='sheet-step-start-1']").exists()).toBe(false)
			expect(wrapper.find("[data-test='sheet-step-start-2']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-step-clock-1']").text()).toBe("Not started")

			store.capabilities = { ...store.capabilities, clock: false }
			const none = mountIt(colour(["idle", "idle", "idle"]))
			expect(none.find("[data-test^='sheet-step-start-']").exists()).toBe(false)
		})

		it("does not offer the time twice: the bottom buttons collect, since they would only reach the first step", () => {
			const wrapper = mountIt(colour(["idle", "idle", "idle"], { state: "booked", clock: { state: "idle", active_seconds: 0 } }))

			expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
			expect(wrapper.find("[data-test='sheet-pause']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-collect']").text()).toBe("Collect")
			const running = mountIt(colour())
			expect(running.find("[data-test='sheet-finish']").exists()).toBe(false)
			expect(running.find("[data-test='sheet-pause']").exists()).toBe(false)
		})

		it("says which steps are estimates, step by step, and not once for the whole", () => {
			const forgotten = colour(["done", "done", "done"], { state: "finished", clock: { state: "done", active_seconds: 4000, estimated: true, ended_at: "2026-11-10 11:00:00" }, can: {} })
			forgotten.steps[1].clock = { ...forgotten.steps[1].clock, ended_at: "2026-11-10 10:45:00", estimated: true }

			const wrapper = mountIt(forgotten)

			expect(wrapper.get("[data-test='sheet-step-clock-1']").text()).toBe("Finished at 10:45 · Duration estimated")
			expect(wrapper.get("[data-test='sheet-step-clock-0']").text()).toBe("Finished at 09:30")
			expect(wrapper.find("[data-test='sheet-estimated']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-time-text']").text()).toBe("3 of 3 steps finished")
		})

		it("keeps an appointment of one step as it was: one clock, its own gestures at the bottom, no list of steps", () => {
			const wrapper = mountIt()

			expect(wrapper.find("[data-test='sheet-step-times']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-start']").text()).toBe("Start")
			expect(wrapper.get("[data-test='sheet-time-text']").text()).toBe("Not started")
		})

		//// Neoffice — the card of a step after the first, in its person's column: its own step in `steps`, the whole in `chain`
		it("reads the whole appointment on the card of a later step, and times a step by its own booking", async () => {
			const whole = colour(["done", "running", "idle"])
			const wrapper = mountIt({ ...whole, booking: "COL-2", steps: [whole.steps[1]], chain: whole.steps })

			expect(wrapper.findAll("[data-test^='sheet-step-time-']")).toHaveLength(3)
			expect(wrapper.get("[data-test='sheet-time-text']").text()).toBe("1 of 3 steps finished")
			expect(wrapper.get("[data-test='sheet-step-0']").text()).toContain("Application")
			expect(wrapper.get("[data-test='sheet-step-2']").text()).toContain("Finish")
			expect(wrapper.get("[data-test='sheet-wait-0']").text()).toBe("Wait · 30 min")
			await wrapper.get("[data-test='sheet-step-finish-1']").trigger("click")
			expect(gestures.clock).toHaveBeenLastCalledWith("COL-2", "finish")
			await wrapper.get("[data-test='sheet-step-start-2']").trigger("click")
			expect(gestures.clock).toHaveBeenLastCalledWith("COL-3", "start")
		})

		it("collects, not times, at the bottom of the card of a later step, and announces the whole appointment", () => {
			const whole = colour(["idle", "idle", "idle"], { state: "booked", clock: { state: "idle", active_seconds: 0 } })
			const wrapper = mountIt({ ...whole, booking: "COL-2", steps: [whole.steps[1]], chain: whole.steps, amount: 150 })

			expect(wrapper.find("[data-test='sheet-start']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-collect']").text()).toBe("Collect")
			expect(wrapper.text()).toContain("CHF 150.00")
		})

		it("waits for the network to time a step", async () => {
			const wrapper = mountIt(colour(["done", "running", "idle"]))
			network.go(true)
			await flushPromises()

			expect(wrapper.get("[data-test='sheet-step-start-2']").attributes("disabled")).toBeDefined()
			expect(wrapper.get("[data-test='sheet-step-finish-1']").attributes("disabled")).toBeDefined()
			network.go(false)
			await flushPromises()
			expect(wrapper.get("[data-test='sheet-step-start-2']").attributes("disabled")).toBeUndefined()
		})
	})

	describe("repeating an appointment", () => {
		it("offers « Repeat » beside the other gestures when the site repeats, and emits it for the page to open its dialog", async () => {
			store.capabilities = { ...store.capabilities, repeat: true }
			const wrapper = mountIt()

			await wrapper.get("[data-test='sheet-repeat']").trigger("click")

			expect(wrapper.get("[data-test='sheet-repeat']").text()).toBe("Repeat")
			expect(wrapper.emitted("repeat")[0][0].booking).toBe("BKG-1")
		})

		// //// Neoffice — the audit of 18.11 (voie 4): the reservation repeats an appointment of a customer; for a walk-in (nobody to give the next visits to) it only refuses
		it("keeps it off the appointment of a walk-in: nobody to book the next visits for", () => {
			store.capabilities = { ...store.capabilities, repeat: true }

			expect(mountIt({ customer: null, customer_name: "" }).find("[data-test='sheet-repeat']").exists()).toBe(false)
			expect(mountIt({ customer: "", customer_name: "Passage" }).find("[data-test='sheet-repeat']").exists()).toBe(false)
			expect(mountIt().find("[data-test='sheet-repeat']").exists()).toBe(true)
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

	// //// Neoffice — the cabin of the appointment (NeoSalon, cabins level 2, 16.11.2026)
	describe("its cabin", () => {
		const cabinOne = { name: "CAB-1", label: "Cabin 1", color: "#C2723F" }
		const room = (extra = {}) => ({
			steps: [{ ...appointment().steps[0], cabin: cabinOne, needs_cabin: false, ...extra }],
		})
		const options = [
			{ ...cabinOne, current: true, free: true, why: null },
			{ name: "CAB-2", label: "Cabin 2", color: null, current: false, free: true, why: null },
			{ name: "CAB-3", label: "Cabin 3", color: null, current: false, free: false, why: "taken" },
			{ name: "CAB-4", label: "Cabin 4", color: null, current: false, free: false, why: "not_allowed" },
		]

		beforeEach(() => {
			store.capabilities = { ...store.capabilities, cabin: true }
			gestures.cabinsOf.mockResolvedValue(options)
		})

		it("shows nothing for a service that asks for no cabin, and asks nothing", async () => {
			const wrapper = mountIt()
			await flushPromises()

			expect(wrapper.find("[data-test='sheet-cabin-section']").exists()).toBe(false)
			expect(gestures.cabinsOf).not.toHaveBeenCalled()
		})

		it("says the cabin it is in, with its colour, and lists the others: the ones that are not free are disabled and say why", async () => {
			const wrapper = mountIt(room())
			await flushPromises()

			expect(wrapper.get("[data-test='sheet-cabin-current']").text()).toBe("Cabin 1")
			expect(gestures.cabinsOf).toHaveBeenCalledWith("BKG-1")
			const select = wrapper.get("[data-test='sheet-cabin']")
			expect(select.element.value).toBe("CAB-1")
			expect(wrapper.get("[data-test='sheet-cabin-CAB-2']").attributes("disabled")).toBeUndefined()
			expect(wrapper.get("[data-test='sheet-cabin-CAB-3']").attributes("disabled")).toBeDefined()
			expect(wrapper.get("[data-test='sheet-cabin-CAB-3']").text()).toBe("Cabin 3 — taken")
			expect(wrapper.get("[data-test='sheet-cabin-CAB-4']").text()).toBe("Cabin 4 — not for this person")
		})

		it("puts the appointment in the cabin that is chosen, then reads the agenda again", async () => {
			gestures.changeCabin.mockResolvedValue({ booking: "BKG-1", from: cabinOne, to: { name: "CAB-2", label: "Cabin 2", color: null } })
			const wrapper = mountIt(room())
			await flushPromises()

			await wrapper.get("[data-test='sheet-cabin']").setValue("CAB-2")
			await flushPromises()

			expect(gestures.changeCabin).toHaveBeenCalledWith("BKG-1", "CAB-2")
			expect(store.refresh).toHaveBeenCalled()
		})

		it("goes back to the cabin it was in when the reservation refuses, and asks the cabins again", async () => {
			const wrapper = mountIt(room())
			await flushPromises()
			gestures.cabinsOf.mockClear()

			await wrapper.get("[data-test='sheet-cabin']").setValue("CAB-2")
			await flushPromises()

			expect(gestures.changeCabin).toHaveBeenCalledWith("BKG-1", "CAB-2")
			expect(store.refresh).not.toHaveBeenCalled()
			expect(wrapper.get("[data-test='sheet-cabin']").element.value).toBe("CAB-1")
			expect(gestures.cabinsOf).toHaveBeenCalledTimes(1)
		})

		it("says « To place » for a care taken before the cabins and offers to choose one", async () => {
			const wrapper = mountIt({ steps: [{ ...appointment().steps[0], cabin: null, needs_cabin: true }] })
			gestures.cabinsOf.mockResolvedValue(options.map((option) => ({ ...option, current: false })))
			await flushPromises()

			expect(wrapper.get("[data-test='sheet-cabin-to-place']").text()).toBe("To place")
			expect(wrapper.find("[data-test='sheet-cabin-current']").exists()).toBe(false)
			expect(wrapper.get("[data-test='sheet-cabin']").element.value).toBe("")
		})

		it("only says the cabin where the till cannot change it: the site has no cabin gesture, the cashier may not move it, or it is paid", async () => {
			store.capabilities = { ...store.capabilities, cabin: false }
			const without = mountIt(room())
			await flushPromises()
			expect(without.get("[data-test='sheet-cabin-current']").text()).toBe("Cabin 1")
			expect(without.find("[data-test='sheet-cabin']").exists()).toBe(false)

			store.capabilities = { ...store.capabilities, cabin: true }
			const mayNot = mountIt({ ...room(), can: { collect: true, move: false, cancel: true, clock: true } })
			await flushPromises()
			expect(mayNot.find("[data-test='sheet-cabin']").exists()).toBe(false)

			gestures.cabinsOf.mockClear()
			const paid = mountIt({ ...room(), state: "paid" })
			await flushPromises()
			expect(paid.find("[data-test='sheet-cabin']").exists()).toBe(false)
			expect(gestures.cabinsOf).not.toHaveBeenCalled()
		})
	})
})

describe("the customer's file on the sheet of an appointment", () => {
	let store
	const file = (extra = {}) => ({
		has_record: true,
		agreement: { state: "given", on: "2026-10-02" },
		formula: { service: "Balayage", applied_on: "2026-10-02", formula: "6.1 + 7.3 (30 g)", developer: "Oxydant 6 %", minutes: 35, remark: "Racines plus claires" },
		allergy: { state: "current", tested_on: "2026-10-01", valid_until: "2027-04-01", rule: "After a number of months" },
		...extra,
	})
	const mountIt = (extra = {}) => mount(AppointmentSheet, { props: { appointment: appointment(extra) }, global: { mocks: { __: globalThis.__ } } })

	beforeEach(() => {
		setActivePinia(createPinia())
		gestures.fileOf.mockReset()
		gestures.fileOf.mockResolvedValue(file())
		store = useAppointmentsStore()
		store.capabilities = { file: true, clock: true, move: true, cancel: true, check_move: true, book: true }
	})

	it("reads the file of the customer when the sheet opens, and shows her last formula, her allergy test and her agreement", async () => {
		const wrapper = mountIt()
		await flushPromises()

		expect(gestures.fileOf).toHaveBeenCalledWith("BKG-1")
		const text = wrapper.get("[data-test='sheet-file']").text()
		expect(text).toContain("Customer file")
		expect(text).toContain("Balayage")
		expect(text).toContain("6.1 + 7.3 (30 g)")
		expect(text).toContain("Oxydant 6 % · 35 min")
		expect(text).toContain("Racines plus claires")
		expect(wrapper.get("[data-test='sheet-file-allergy']").text()).toMatch(/Allergy test done on .*2026, valid until .*2027\./)
		expect(wrapper.get("[data-test='sheet-file-agreement']").text()).toMatch(/Agreement for health data given on .*2026\./)
	})

	it("says where the allergy test stands in each case, and warns when it is to be done again or was never done", async () => {
		const cases = [
			[{ state: "none", tested_on: null, valid_until: null }, "No allergy test on file.", true],
			[{ state: "due", tested_on: "2026-01-05", valid_until: "2026-07-05" }, "Allergy test to do again", true],
			[{ state: "before_each", tested_on: "2026-10-01", valid_until: null }, "Allergy test done again before each colouring", false],
			[{ state: "current", tested_on: "2026-10-01", valid_until: null }, "Allergy test done on", false],
		]
		for (const [allergy, wanted, warns] of cases) {
			gestures.fileOf.mockResolvedValue(file({ allergy: { rule: "x", ...allergy } }))
			const wrapper = mountIt()
			await flushPromises()
			const line = wrapper.get("[data-test='sheet-file-allergy']")
			expect(line.text()).toContain(wanted)
			expect(line.classes().some((name) => name.includes("amber"))).toBe(warns)
		}
	})

	it("says what the agreement is: given, withdrawn or not on file", async () => {
		for (const [agreement, wanted] of [
			[{ state: "withdrawn", on: "2026-11-02" }, "Agreement for health data withdrawn on"],
			[{ state: "none", on: null }, "No agreement for health data on file."],
		]) {
			gestures.fileOf.mockResolvedValue(file({ agreement }))
			const wrapper = mountIt()
			await flushPromises()
			expect(wrapper.get("[data-test='sheet-file-agreement']").text()).toContain(wanted)
		}
	})

	it("says that no colour formula is on file, and shows nothing of the formula's own lines then", async () => {
		gestures.fileOf.mockResolvedValue(file({ formula: null }))
		const wrapper = mountIt()
		await flushPromises()

		expect(wrapper.get("[data-test='sheet-file-no-formula']").text()).toBe("No colour formula on file.")
		expect(wrapper.find("[data-test='sheet-file-formula']").exists()).toBe(false)
	})

	it("asks nothing and shows nothing where the site does not let the till read the file", async () => {
		store.capabilities = { ...store.capabilities, file: false }
		const wrapper = mountIt()
		await flushPromises()

		expect(gestures.fileOf).not.toHaveBeenCalled()
		expect(wrapper.find("[data-test='sheet-file']").exists()).toBe(false)
	})

	//// Neoffice — added tests (neoffice-maintenance#3176): the file is asked for an appointment the cashier may work only, so a cashier who reads her own is not refused at every opening of a colleague's
	it("asks nothing for an appointment the cashier may not work (a colleague's, or nobody's yet): the door would refuse it", async () => {
		const wrapper = mountIt({ may: false })
		await flushPromises()

		expect(gestures.fileOf).not.toHaveBeenCalled()
		expect(wrapper.find("[data-test='sheet-file']").exists()).toBe(false)
	})

	it("asks for the file of an appointment she may work, paid or not, and of an answer that does not say", async () => {
		for (const extra of [{ may: true }, { may: true, state: "paid", can: { collect: false, move: false, cancel: false, clock: false } }, {}]) {
			gestures.fileOf.mockClear()
			const wrapper = mountIt(extra)
			await flushPromises()

			expect(gestures.fileOf).toHaveBeenCalledWith("BKG-1")
			expect(wrapper.find("[data-test='sheet-file']").exists()).toBe(true)
			wrapper.unmount()
		}
	})

	it("shows nothing when the file could not be read (no record kept, a slow link, offline)", async () => {
		gestures.fileOf.mockResolvedValue(null)
		const wrapper = mountIt()
		await flushPromises()

		expect(gestures.fileOf).toHaveBeenCalled()
		expect(wrapper.find("[data-test='sheet-file']").exists()).toBe(false)
	})

	it("ignores an answer that comes after the sheet moved to another appointment", async () => {
		let release
		gestures.fileOf.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
		gestures.fileOf.mockResolvedValueOnce(file({ formula: { service: "Brushing", applied_on: "2026-09-01", formula: "no colour", developer: null, minutes: null, remark: null } }))
		const wrapper = mountIt()
		await wrapper.setProps({ appointment: appointment({ booking: "BKG-2", key: "BKG-2" }) })
		await flushPromises()
		release(file({ formula: { service: "Old customer", applied_on: "2026-01-01", formula: "stale", developer: null, minutes: null, remark: null } }))
		await flushPromises()

		const text = wrapper.get("[data-test='sheet-file']").text()
		expect(text).toContain("Brushing")
		expect(text).not.toContain("Old customer")
	})

	it("never draws a health remark or a photo: the sheet has no place for them", () => {
		const source = fs.readFileSync(path.resolve(__dirname, "../AppointmentSheet.vue"), "utf-8")
		expect(source).not.toMatch(/health_notes|customerFile\.(health|photo)/i)
	})
})

describe("the sheet of an appointment without the network", () => {
	let store
	const mountIt = (extra = {}) => mount(AppointmentSheet, { props: { appointment: appointment(extra) }, global: { mocks: { __: globalThis.__ } } })
	beforeEach(() => {
		setActivePinia(createPinia())
		network.go(false)
		store = useAppointmentsStore()
		store.capabilities = { clock: true, move: true, cancel: true, repeat: true, check_move: true, book: true }
	})

	it("waits for the network to move, cancel, repeat or time an appointment, and says so, and still lets it be collected", async () => {
		network.go(true)
		const wrapper = mountIt({ state: "finished", clock: { state: "done", active_seconds: 600 } })
		await flushPromises()

		for (const key of ["move", "cancel", "repeat"]) expect(wrapper.get(`[data-test='sheet-${key}']`).attributes("disabled")).toBeDefined()
		expect(wrapper.get("[data-test='sheet-collect']").attributes("disabled")).toBeUndefined()
		expect(wrapper.get("[data-test='sheet-needs-network']").text()).toContain("No network")
	})

	it("waits for the network to start the time too", async () => {
		network.go(true)
		const wrapper = mountIt({ state: "booked" })
		await flushPromises()

		expect(wrapper.get("[data-test='sheet-start']").attributes("disabled")).toBeDefined()
	})

	it("follows the network: back online the gestures are there again and the note goes", async () => {
		network.go(true)
		const wrapper = mountIt({ state: "finished", clock: { state: "done", active_seconds: 600 } })
		await flushPromises()
		expect(wrapper.find("[data-test='sheet-needs-network']").exists()).toBe(true)

		network.go(false)
		await flushPromises()

		expect(wrapper.find("[data-test='sheet-needs-network']").exists()).toBe(false)
		expect(wrapper.get("[data-test='sheet-move']").attributes("disabled")).toBeUndefined()
		expect(wrapper.get("[data-test='sheet-cancel']").attributes("disabled")).toBeUndefined()
	})
})
