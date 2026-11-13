//// Neoffice — added file (no upstream equivalent). The agenda of a salon in the till (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// A column per person with how she stands, the appointments as blocks (a colleague's busy, without a name), the free hours as buttons that book, a person off
// that day hatched and said, « Me only », the agenda kept when the till has no network; on a phone, one person's day as a list.
// @vitest-environment jsdom
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const ui = vi.hoisted(() => ({ isDesktop: true }))
const network = vi.hoisted(() => ({ isOffline: false }))
const load = vi.hoisted(() => vi.fn(async () => null))

vi.mock("@/stores/posUI", () => ({ usePOSUIStore: () => ui }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till A" }) }))
vi.mock("@/composables/useAppointment", () => ({ useAppointment: () => ({ loadDay: load }) }))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))

const { useAppointmentsStore } = await import("@/stores/appointments")
const { default: SalonAgenda } = await import("../SalonAgenda.vue")

const person = (name, extra = {}) => ({
	key: name,
	sales_person: name,
	sales_person_name: name,
	status: "present",
	reason: null,
	periods: [["09:00", "12:00"], ["13:00", "17:00"]],
	from: null,
	...extra,
})
const row = (booking, who, start, end, extra = {}) => ({
	key: booking,
	booking,
	starts_at: `2026-11-10 ${start}:00`,
	ends_at: `2026-11-10 ${end}:00`,
	customer: "CUST-1",
	customer_name: "Mme Dupont",
	steps: [{ label: "Coupe", item_code: "COUPE", sales_person: who, sales_person_name: who }],
	amount: 65,
	paid_amount: 0,
	state: "booked",
	invoice: null,
	in_the_till: false,
	busy: false,
	clock: { state: "idle" },
	can: { collect: true, move: true, cancel: true, clock: true },
	...extra,
})
const busy = (key, who, start, end) => ({
	key,
	booking: null,
	starts_at: `2026-11-10 ${start}:00`,
	ends_at: `2026-11-10 ${end}:00`,
	customer: null,
	customer_name: null,
	steps: [{ label: null, item_code: null, sales_person: who, sales_person_name: who }],
	amount: 0,
	paid_amount: 0,
	state: "booked",
	invoice: null,
	in_the_till: false,
	busy: true,
	clock: { state: "idle" },
	can: { collect: false, move: false, cancel: false, clock: false },
})

describe("the agenda of the salon", () => {
	let store
	const mountIt = () =>
		mount(SalonAgenda, { global: { mocks: { __: globalThis.__ } } })

	beforeEach(() => {
		setActivePinia(createPinia())
		ui.isDesktop = true
		network.isOffline = false
		load.mockClear()
		store = useAppointmentsStore()
		store.day = "2026-11-10"
		store.loaded = true
		store.available = true
		store.capabilities = { book: true, move: true, cancel: true, clock: true, check_move: true }
		store.mine = ["Luc"]
		store.people = [
			person("Luc"),
			person("Maya"),
			person("Sonia", { status: "on_leave", reason: "Leave until 20-11-2026", periods: [] }),
			person("Camille", { status: "not_yet", from: "14:00", periods: [["14:00", "19:00"]] }),
		]
		store.appointments = [
			row("BKG-1", "Luc", "09:00", "10:30", { state: "paid" }),
			row("BKG-2", "Luc", "13:30", "15:30", { state: "started", clock: { state: "running" } }),
			busy("busy-2", "Maya", "10:00", "11:00"),
			row("BKG-4", "Camille", "14:30", "15:30"),
		]
	})

	it("has a column for each person, headed by how she stands and the hours she works", () => {
		const wrapper = mountIt()

		expect(wrapper.findAll("[data-test^='column-head-']").map((node) => node.attributes("data-test"))).toEqual([
			"column-head-Luc",
			"column-head-Maya",
			"column-head-Sonia",
			"column-head-Camille",
		])
		expect(wrapper.get("[data-test='column-standing-Luc']").text()).toBe("Here")
		expect(wrapper.get("[data-test='column-standing-Camille']").text()).toBe("From 14:00")
		expect(wrapper.get("[data-test='column-head-Luc']").text()).toContain("09:00–12:00 · 13:00–17:00")
	})

	it("hatches the column of a person who is off that day and says why, with no appointment to take", () => {
		const wrapper = mountIt()

		const off = wrapper.get("[data-test='column-off-Sonia']")

		expect(off.text()).toContain("On leave")
		expect(off.text()).toContain("Leave until 20-11-2026")
		expect(wrapper.find("[data-test='column-Sonia'] [data-test^='free-']").exists()).toBe(false)
	})

	it("shows an appointment with its customer, its service and where it stands", () => {
		const wrapper = mountIt()

		const block = wrapper.get("[data-test='block-BKG-2']")

		expect(block.text()).toContain("Mme Dupont")
		expect(block.text()).toContain("Coupe")
		expect(block.text()).toContain("In progress")
		expect(wrapper.get("[data-test='block-BKG-1']").text()).toContain("Paid")
	})

	it("shows a colleague's appointment as busy, without a name, and does not open it", async () => {
		const wrapper = mountIt()

		const block = wrapper.get("[data-test='block-busy-2']")
		await block.trigger("click")

		expect(block.text()).toContain("Busy")
		expect(block.text()).not.toContain("Mme Dupont")
		expect(block.attributes("disabled")).toBeDefined()
		expect(store.selectedKey).toBeNull()
		expect(wrapper.emitted("selected")).toBeUndefined()
	})

	it("opens the sheet of the appointment touched", async () => {
		const wrapper = mountIt()

		await wrapper.get("[data-test='block-BKG-2']").trigger("click")

		expect(store.selectedKey).toBe("BKG-2")
		expect(wrapper.emitted("selected")[0][0].booking).toBe("BKG-2")
	})

	it("offers the free hours of a person as buttons that book, with the hour pressed", async () => {
		const wrapper = mountIt()

		const free = wrapper.get("[data-test='free-Luc-630']")
		await free.trigger("click")

		expect(free.text()).toContain("10:30 free")
		expect(wrapper.emitted("new-appointment")[0][0]).toMatchObject({ from: 630, person: { sales_person: "Luc" } })
	})

	it("offers no free hour where the site cannot book", () => {
		store.capabilities = { ...store.capabilities, book: false }
		const wrapper = mountIt()

		expect(wrapper.get("[data-test='free-Luc-630']").text()).toBe("")
		expect(wrapper.find("[data-test='agenda-new']").exists()).toBe(false)
	})

	it("starts a new appointment from the cashier's own column", async () => {
		const wrapper = mountIt()

		await wrapper.get("[data-test='agenda-new']").trigger("click")

		expect(wrapper.emitted("new-appointment")[0][0]).toMatchObject({ from: null, person: { sales_person: "Luc" } })
	})

	it("keeps only the cashier's own column when « Me only » is on", async () => {
		const wrapper = mountIt()

		await wrapper.get("[data-test='agenda-mine']").trigger("click")

		expect(wrapper.findAll("[data-test^='column-head-']").map((node) => node.attributes("data-test"))).toEqual(["column-head-Luc"])
	})

	it("has no « Me only » where the cashier is nobody's own", () => {
		store.mine = []

		expect(mountIt().find("[data-test='agenda-mine']").exists()).toBe(false)
	})

	it("says that the agenda is the one kept when the till has no network", () => {
		store.fromCache = true
		store.cachedAt = new Date("2026-11-10T13:58:00").getTime()

		const wrapper = mountIt()

		expect(wrapper.get("[data-test='agenda-offline']").text()).toContain("No network")
	})

	it("says that nothing can be shown when the till has no network and kept nothing, and when the agenda cannot be read", () => {
		store.loaded = false
		network.isOffline = true
		expect(mountIt().find("[data-test='agenda-no-network']").exists()).toBe(true)

		network.isOffline = false
		store.failed = true
		expect(mountIt().find("[data-test='agenda-failed']").exists()).toBe(true)
	})

	it("moves the day with its arrows and reads that day again", async () => {
		load.mockClear()
		const wrapper = mountIt()

		await wrapper.get("[data-test='agenda-next']").trigger("click")
		await wrapper.get("[data-test='agenda-previous']").trigger("click")
		await wrapper.get("[data-test='agenda-previous']").trigger("click")

		expect(store.day).toBe("2026-11-09")
		expect(load.mock.calls.map(([day]) => day)).toEqual(["2026-11-11", "2026-11-10", "2026-11-09"])
	})

	describe("on a day that is closed, or has other hours", () => {
		it("says nothing on a normal day, or when the site does not say", () => {
			expect(mountIt().find("[data-test='agenda-salon']").exists()).toBe(false)

			store.salon = { state: "open", reason: null, label: null, periods: [["09:00", "18:00"]] }
			expect(mountIt().find("[data-test='agenda-salon']").exists()).toBe(false)
		})

		it("says the day is closed and why, with the number of appointments booked before the closing to move or cancel", () => {
			store.salon = { state: "closed", reason: "holiday", label: "Christmas Day", periods: [] }
			store.appointments = [
				row("BKG-9", "Maya", "10:00", "11:00", { to_handle: "closed" }),
				row("BKG-10", "Luc", "14:00", "15:00", { to_handle: "closed" }),
				row("BKG-11", "Luc", "16:00", "17:00", { state: "started", clock: { state: "running" } }),
			]
			const wrapper = mountIt()

			const notice = wrapper.get("[data-test='agenda-salon']")
			expect(notice.text()).toContain("Closed that day")
			expect(notice.text()).toContain("Christmas Day")
			expect(wrapper.get("[data-test='agenda-to-handle']").text()).toContain("2 booked before the closing")
			expect(wrapper.get("[data-test='agenda-to-handle']").text()).toContain("None is cancelled by itself")
		})

		it("names the reason when the site gives no label, and does not count what nobody has to handle", () => {
			store.salon = { state: "closed", reason: "weekly_off", label: null, periods: [] }
			const wrapper = mountIt()

			expect(wrapper.get("[data-test='agenda-salon']").text()).toContain("Weekly day off")
			expect(wrapper.find("[data-test='agenda-to-handle']").exists()).toBe(false)
		})

		it("marks an appointment booked before the closing « To handle », and one under way as it was", () => {
			store.salon = { state: "closed", reason: "closure", label: null, periods: [] }
			// Two hours tall: a block shorter than 64 px has no room for its pill
			store.appointments = [
				row("BKG-9", "Maya", "10:00", "12:00", { to_handle: "closed" }),
				row("BKG-2", "Luc", "13:30", "15:30", { state: "started", clock: { state: "running" } }),
			]
			const wrapper = mountIt()

			expect(wrapper.get("[data-test='block-BKG-9']").text()).toContain("To handle")
			expect(wrapper.get("[data-test='block-BKG-2']").text()).toContain("In progress")
		})

		it("offers no free hour to book: nobody works that day", () => {
			store.salon = { state: "closed", reason: "holiday", label: null, periods: [] }
			store.appointments = []

			expect(mountIt().findAll("[data-test^='free-']")).toHaveLength(0)
		})

		it("keeps the free hours of a day with other hours, and says the hours", () => {
			store.salon = { state: "special", reason: "special_hours", label: "Late opening", periods: [["10:00", "14:00"]] }
			const wrapper = mountIt()

			expect(wrapper.get("[data-test='agenda-salon-title']").text()).toBe("Special hours")
			expect(wrapper.get("[data-test='agenda-salon']").text()).toContain("10:00–14:00 · Late opening")
			expect(wrapper.findAll("[data-test^='free-']").length).toBeGreaterThan(0)
		})

		it("draws the appointments of a person who is away, marked « To handle », and says how many, on a day the salon is open", () => {
			store.salon = { state: "open", reason: null, label: null, periods: [["09:00", "18:00"]] }
			store.appointments = [row("BKG-9", "Sonia", "10:00", "12:00", { to_handle: "away" })]
			const wrapper = mountIt()

			expect(wrapper.get("[data-test='column-off-Sonia']").text()).toContain("On leave")
			expect(wrapper.get("[data-test='block-BKG-9']").text()).toContain("To handle")
			expect(wrapper.get("[data-test='agenda-away']").text()).toContain("1 appointments of a person who is away that day")
			expect(wrapper.find("[data-test='agenda-salon']").exists()).toBe(false)
			expect(wrapper.find("[data-test='column-Sonia'] [data-test^='free-']").exists()).toBe(false)
		})

		it("lists the rows to handle on a phone, with no free hour", () => {
			ui.isDesktop = false
			store.salon = { state: "closed", reason: "holiday", label: null, periods: [] }
			store.appointments = [row("BKG-9", "Luc", "10:00", "11:00", { to_handle: "closed" })]
			const wrapper = mountIt()

			expect(wrapper.get("[data-test='row-BKG-9']").text()).toContain("To handle")
			expect(wrapper.findAll("[data-test^='free-']")).toHaveLength(0)
		})
	})

	it("says the site's booking has nothing for this till once it answered so, never before", () => {
		const fresh = useAppointmentsStore()

		store.loaded = false
		store.available = false
		expect(fresh.unanswered).toBe(false)
		store.loaded = true
		expect(fresh.unanswered).toBe(true)
		store.available = true
		expect(fresh.unanswered).toBe(false)
	})

	it("is not available when the site has no agenda for this till", () => {
		store.available = false
		store.people = []
		store.appointments = []

		expect(mountIt().find("[data-test='agenda-unavailable']").exists()).toBe(true)
	})

	describe("on a phone", () => {
		beforeEach(() => {
			ui.isDesktop = false
		})

		it("lists the day of the cashier's own column first, with the other people and everybody as chips", () => {
			const wrapper = mountIt()

			expect(wrapper.findAll("[data-test^='agenda-chip-']").map((node) => node.attributes("data-test"))).toEqual([
				"agenda-chip-Luc",
				"agenda-chip-Maya",
				"agenda-chip-Sonia",
				"agenda-chip-Camille",
				"agenda-chip-all",
			])
			expect(wrapper.get("[data-test='agenda-chip-Luc']").text()).toContain("Me — Luc")
			expect(wrapper.find("[data-test='row-BKG-1']").exists()).toBe(true)
			expect(wrapper.find("[data-test='row-BKG-4']").exists()).toBe(false)
		})

		it("lists a colleague's day as busy rows, and everybody's under « All »", async () => {
			const wrapper = mountIt()

			await wrapper.get("[data-test='agenda-chip-Maya']").trigger("click")
			expect(wrapper.get("[data-test='row-busy-2']").text()).toContain("Busy")

			await wrapper.get("[data-test='agenda-chip-all']").trigger("click")
			expect(wrapper.findAll("[data-test^='row-']")).toHaveLength(4)
		})

		it("calls a free hour free, and not a button that books, where the site cannot book", () => {
			store.capabilities = { ...store.capabilities, book: false }
			const wrapper = mountIt()

			const free = wrapper.get("[data-test='free-630']")
			expect(free.text()).toBe("Free hour")
			expect(free.attributes("disabled")).toBeDefined()
		})

		it("opens the sheet of the row touched and books from a free hour", async () => {
			const wrapper = mountIt()

			await wrapper.get("[data-test='row-BKG-2']").trigger("click")
			expect(store.selectedKey).toBe("BKG-2")

			await wrapper.get("[data-test='free-630']").trigger("click")
			expect(wrapper.emitted("new-appointment")[0][0]).toMatchObject({ from: 630, person: { sales_person: "Luc" } })
		})
	})
})
