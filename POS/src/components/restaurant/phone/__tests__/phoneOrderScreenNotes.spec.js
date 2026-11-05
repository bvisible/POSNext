/**
 * //// Neoffice — added file (no upstream equivalent). The groups of the table, on the waiter's phone (NeoResto lot 1, notes: « table 5, .1, .2, .3 »): the ink header names the table « Table 5 » while it has one note and
 * //// carries a discreet icon « ＋ » (a dashed 44 px target) that opens a second group; from two notes on the name is « Table 5.2 · Dupont » and a row of pills `[.1 Dupont] [.2] [＋]` stands under the header, the current one in
 * //// paper on the ink. A tap on a pill, the ＋ and the ✎ are told to the page, which asks the questions and reads the other group. A takeaway has none of it.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { reactive } from "vue"

const state = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args) =>
		args ? text.replace(/\{(\d+)\}/g, (_, at) => args[at]) : text
})

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => state.cart }))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => state.restaurant,
}))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileCurrency: "CHF" }),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => state.settings,
}))

const { default: PhoneOrderScreen } = await import("../PhoneOrderScreen.vue")

const STEAK = { item_type: "Item", item: "STEAK", item_name: "Rib steak", price: 42 }
const LUNCH = { name: "CARD-LUNCH", card_name: "Lunch", items: [STEAK] }
const note = (rank, extra = {}) => ({
	name: `SINV-${rank}`,
	note: rank,
	note_name: null,
	covers: null,
	grand_total: 0,
	items_count: 0,
	kds_status: "Pending",
	...extra,
})

let wrapper
function screen() {
	wrapper = mount(PhoneOrderScreen, {
		props: { cards: [LUNCH], selectedCard: "CARD-LUNCH" },
		global: { stubs: { teleport: true }, mocks: { __: globalThis.__ } },
	})
	return wrapper
}
const strip = () => wrapper.find("[data-notes-strip]")
const pills = () => wrapper.findAll('[data-test="note-pill"]')
const addIcon = () => wrapper.find("[data-add-note]")
const name = () => wrapper.find("[data-table-name]").text()

beforeEach(() => {
	state.cart = reactive({
		invoiceItems: [],
		roundedGrandTotal: 0,
		restaurantTable: { name: "TABLE-5", table_name: "Table 5", capacity: 4 },
		restaurantCovers: null,
		restaurantNote: 1,
		restaurantNoteName: "",
		restaurantNotes: [note(1)],
		currentDraftId: "SINV-1",
		isTakeaway: false,
		takeawayNumber: null,
	})
	state.restaurant = reactive({
		restaurantSettings: { enable_qr_ordering: 1 },
		activeMenus: [],
		getModifiersForItem: () => [],
	})
	state.settings = reactive({ settings: { phone_card_pictures: 0 } })
})
afterEach(() => {
	wrapper?.unmount()
})

describe("a table with one note, on the phone", () => {
	it("is named « Table 5 » and draws no row of pills", () => {
		screen()

		expect(name()).toBe("Table 5")
		expect(strip().exists()).toBe(false)
	})

	it("has the discreet « ＋ » icon, a 44 px dashed target that says what it does and asks for a second group", async () => {
		screen()

		expect(addIcon().exists()).toBe(true)
		expect(addIcon().attributes("aria-label")).toBe("Add a group to this table")
		expect(addIcon().classes()).toEqual(expect.arrayContaining(["min-h-[44px]", "min-w-[44px]", "border-dashed", "shrink-0"]))
		await addIcon().trigger("click")
		expect(wrapper.emitted("note-add")).toHaveLength(1)
	})

	it("has no « ＋ » while the order is not saved yet: there is nothing to group", () => {
		state.cart.currentDraftId = null
		state.cart.restaurantNotes = []
		screen()

		expect(addIcon().exists()).toBe(false)
	})

	it("keeps the covers pastille, the QR button and the back button of the header", () => {
		screen()

		expect(wrapper.find("[data-covers]").exists()).toBe(true)
		expect(wrapper.find("[data-qr]").exists()).toBe(true)
		expect(wrapper.find("[data-back]").exists()).toBe(true)
	})
})

describe("a table with several notes, on the phone", () => {
	beforeEach(() => {
		state.cart.restaurantNotes = [note(1, { note_name: "Dupont" }), note(2)]
		state.cart.restaurantNote = 2
	})

	it("is named « Table 5.2 », with the group's name when it has one", () => {
		screen()
		expect(name()).toBe("Table 5.2")
		wrapper.unmount()

		state.cart.restaurantNote = 1
		state.cart.restaurantNoteName = "Dupont"
		screen()
		expect(name()).toBe("Table 5.1 · Dupont")
	})

	it("draws the row of pills inside the ink header, the current one marked", () => {
		screen()

		expect(strip().exists()).toBe(true)
		expect(wrapper.get("header").element.contains(strip().element)).toBe(true)
		expect(pills().map((pill) => pill.find('[data-test="note-pill-label"]').text())).toEqual([".1", ".2"])
		expect(pills().map((pill) => pill.attributes("aria-pressed"))).toEqual(["false", "true"])
	})

	it("stands the pills on the ink: the current one is paper", () => {
		screen()
		const current = pills()[1].find("span")

		expect(current.classes()).toEqual(expect.arrayContaining(["bg-[#FFFDF8]", "text-[#141414]"]))
	})

	it("has the ＋ in the row and no « ＋ » icon in the header", () => {
		screen()

		expect(wrapper.find('[data-test="note-add"]').exists()).toBe(true)
		expect(addIcon().exists()).toBe(false)
	})

	it("tells the page which group was tapped, and that the ＋ and the ✎ were pressed", async () => {
		screen()

		await pills()[0].trigger("click")
		await wrapper.find('[data-test="note-add"]').trigger("click")
		await wrapper.find('[data-test="note-rename"]').trigger("click")

		expect(wrapper.emitted("note-select")).toEqual([[1]])
		expect(wrapper.emitted("note-add")).toHaveLength(1)
		expect(wrapper.emitted("note-rename")).toEqual([[2]])
	})

	it("draws no ＋ while the current group is itself new: it is already the empty one", () => {
		state.cart.currentDraftId = null
		screen()

		expect(wrapper.find('[data-test="note-add"]').exists()).toBe(false)
		expect(pills()).toHaveLength(2)
	})

	it("draws the new group the server does not have yet as the current pill", () => {
		state.cart.restaurantNotes = [note(1)]
		state.cart.restaurantNote = 2
		state.cart.currentDraftId = null
		screen()

		expect(pills().map((pill) => pill.attributes("aria-pressed"))).toEqual(["false", "true"])
		expect(name()).toBe("Table 5.2")
	})
})

describe("a takeaway, on the phone", () => {
	it("has no group", () => {
		state.cart.isTakeaway = true
		state.cart.takeawayNumber = "A-12"
		state.cart.restaurantNotes = [note(1), note(2)]
		screen()

		expect(strip().exists()).toBe(false)
		expect(addIcon().exists()).toBe(false)
		expect(name()).toBe("A-12")
	})
})
