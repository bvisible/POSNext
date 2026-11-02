/**
 * //// Neoffice — added file (no upstream equivalent). A band hands each card the NAME of the room its order sits in (NeoResto lot 1,
 * //// task 38a-1, ruling 126), so that the card's header can show the room's short code: an order carries the link to its room
 * //// (`area`), the screen knows the rooms. A takeaway sits in no room, and a room the screen does not know draws no chip.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ runnerEnabled: false }),
}))

const { default: KitchenBand } = await import("../KitchenBand.vue")

const ROOMS = [
	{ name: "r-1", area_name: "Salle 1" },
	{ name: "r-t", area_name: "Terrasse" },
]
const ticket = (name, extra = {}) => ({
	name,
	restaurant_table: "t1",
	table_display_name: `Table ${name}`,
	kds_status: "Pending",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	items: [
		{ item_code: "SOUP", item_name: "Soup", qty: 1, kds_status: "Pending" },
	],
	...extra,
})

let opened = []
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	opened = []
})
function band(orders, rooms = ROOMS) {
	const wrapper = mount(KitchenBand, {
		props: {
			band: "waiting",
			label: "Pending",
			emptyText: "None",
			orders,
			rooms,
		},
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
const chips = (wrapper) =>
	wrapper.findAll('[data-test="ticket-room"]').map((chip) => chip.text())

describe("the room chip of a band's tickets", () => {
	it("is the short code of the room each order sits in", () => {
		const wrapper = band([
			ticket("A", { area: "r-1" }),
			ticket("B", { area: "r-t" }),
		])

		expect(chips(wrapper)).toEqual(["S01", "TER"])
	})

	it("is not drawn for a takeaway, which sits in no room, nor for a room the screen does not know", () => {
		const wrapper = band([
			ticket("A", { area: "", is_takeaway: 1, takeaway_number: "T-001" }),
			ticket("B", { area: "gone" }),
			ticket("C"),
		])

		expect(chips(wrapper)).toEqual([])
	})

	it("is not drawn while the rooms are not known yet (a screen that has not read them)", () => {
		const wrapper = band([ticket("A", { area: "r-1" })], [])

		expect(chips(wrapper)).toEqual([])
	})
})
