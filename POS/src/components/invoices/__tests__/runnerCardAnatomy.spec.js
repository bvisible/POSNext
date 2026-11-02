/**
 * //// Neoffice — added file (no upstream equivalent). The runner's card has the anatomy of the kitchen's (NeoResto lot 1, task 38a-2, ruling 130). A
 * //// runner screen with a long ticket hid its « Mark delivered » button at the foot of the card, under the dishes, which is the one button the runner
 * //// needs. Top to bottom now: a HEADER of one line (room chip, table, number, timer: no invoice name, no « Ready » pill), the ACTION ROW directly under it
 * //// (« Deliver », « Hand over » for a takeaway, the slot of the print button), then the DISHES, which scroll inside the card.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn(async () => ({ status: "success" })))

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button @click=\"$emit('click')\"><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

const { default: RunnerOrderCard } = await import("../RunnerOrderCard.vue")

const dish = (name, extra = {}) => ({
	name,
	item_name: `Dish ${name}`,
	qty: 1,
	preparation_station: "kit",
	station_name: "Cuisine",
	station_color: "#F55D1A",
	...extra,
})
const card = (extra = {}) => ({
	key: "SINV-0042",
	title: "Table 22",
	subtitle: "#SINV-0042",
	invoiceName: "SINV-0042",
	creation: "2026-10-30 12:00:00",
	modified: "2026-10-30 12:00:00",
	roomName: "Salle 1",
	ticketNo: "0014",
	items: [
		dish("a"),
		dish("b", {
			qty: 2,
			preparation_station: "bar",
			station_name: "Bar",
			station_color: "#4A6B8F",
		}),
	],
	stationGroups: [],
	...extra,
})

let opened = []
function show(props = {}) {
	const wrapper = mount(RunnerOrderCard, {
		props: { card: card(), viewMode: "table", ...props },
		attachTo: document.body,
		global: { mocks: { __: globalThis.__ } },
	})
	opened.push(wrapper)
	return wrapper
}
beforeEach(() => {
	opened = []
	call.mockClear()
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
})

describe("the header", () => {
	it("is ONE line: the room's code, the table, the ticket's number, the timer", () => {
		const header = show().get('[data-test="ticket-header"]')

		expect(header.get('[data-test="ticket-room"]').text()).toBe("S01")
		expect(header.get('[data-test="ticket-title"]').text()).toBe("Table 22")
		expect(header.get('[data-test="ticket-number"]').text()).toBe("0014")
		// The fixture is dated: it ages from « mm:ss » into « 46 h 13 » (utils/elapsedLabel)
		expect(header.get('[data-test="ticket-timer"]').text()).toMatch(
			/^(\d{2,}:\d{2}|\d+ h \d{2})$/,
		)
		// One flex row, not a block of two lines
		expect(header.get(":scope > div").classes()).toEqual(
			expect.arrayContaining(["flex", "items-center", "justify-between"]),
		)
	})

	it("never writes the invoice's own name, and says nothing for a card with no ticket number", () => {
		const wrapper = show({ card: card({ ticketNo: "" }) })

		expect(wrapper.text()).not.toContain("SINV-0042")
		expect(wrapper.find('[data-test="ticket-number"]').exists()).toBe(false)
	})

	it("carries no « Ready » pill: every card of this screen is ready, the green border says it", () => {
		const wrapper = show()

		expect(wrapper.text()).not.toMatch(/\bReady\b/)
		expect(wrapper.get('[data-test="runner-ticket"]').classes()).toEqual(
			expect.arrayContaining(["border-l-4", "border-green-500"]),
		)
	})

	it("draws the code the server tells for the room (the one typed on it), before the one made from the room's name (task 38b)", () => {
		expect(
			show({ card: card({ roomName: "Salle 1", roomCode: "RDC" }) })
				.get('[data-test="ticket-room"]')
				.text(),
		).toBe("RDC")
		expect(
			show({ card: card({ roomName: "Salle 2", roomCode: "" }) })
				.get('[data-test="ticket-room"]')
				.text(),
		).toBe("S02")
	})

	it("says « Takeaway » for a takeaway, with no room chip, and its number after a dot", () => {
		const wrapper = show({
			card: card({ takeaway: true, title: "", ticketNo: "EMP-0009" }),
		})

		expect(wrapper.get('[data-test="ticket-title"]').text()).toBe("Takeaway")
		expect(wrapper.find('[data-test="ticket-room"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-number"]').text()).toBe("· EMP-0009")
	})

	it("draws no room chip for a room it does not know", () => {
		expect(
			show({ card: card({ roomName: "" }) })
				.find('[data-test="ticket-room"]')
				.exists(),
		).toBe(false)
	})
})

describe("the action row", () => {
	it("stands right under the header, OUTSIDE the scrolling dishes: a long ticket never pushes the button out of sight", () => {
		const wrapper = show()
		const top = wrapper.get('[data-test="ticket-top"]')
		const actions = wrapper.get('[data-test="ticket-actions"]')
		const body = wrapper.get('[data-test="ticket-body"]')

		expect(top.element.contains(actions.element)).toBe(true)
		expect(
			top.element.contains(wrapper.get('[data-test="ticket-header"]').element),
		).toBe(true)
		expect(body.element.contains(actions.element)).toBe(false)
		// The top is before the dishes in the card, and nothing comes after the dishes but their hint
		const order = [
			...wrapper.get('[data-test="runner-ticket"]').element.children,
		].map((el) => el.dataset.test)
		expect(order).toEqual(["ticket-top", "ticket-scroll-area"])
	})

	it("has « Deliver » taking the width, as the kitchen's button words it, and « Hand over » for a takeaway", () => {
		const main = show().get('[data-test="ticket-main"]')
		expect(main.text()).toBe("Deliver")
		expect(main.classes()).toEqual(
			expect.arrayContaining(["flex-1", "min-w-0"]),
		)

		expect(
			show({ card: card({ takeaway: true }) })
				.get('[data-test="ticket-main"]')
				.text(),
		).toBe("Hand over")
	})

	it("delivers every ready dish of the card when pressed", async () => {
		const wrapper = show()

		await wrapper.get('[data-test="ticket-main"]').trigger("click")
		await flushPromises()

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.mark_items_delivered",
			{
				invoice_name: "SINV-0042",
				item_names: JSON.stringify(["a", "b"]),
			},
		)
	})

	it("has the slot of the print button, drawn only when the screen can print (task 44), 44 px square", () => {
		expect(show().find('[data-test="ticket-print"]').exists()).toBe(false)

		const print = show({ canPrint: true }).get('[data-test="ticket-print"]')
		expect(print.classes()).toEqual(
			expect.arrayContaining([
				"h-[var(--kds-btn-h,44px)]",
				"w-[var(--kds-btn-h,44px)]",
			]),
		)
	})
})

describe("a dish", () => {
	it("has its quantity BEFORE its name as « 2× », tinted when there are several", () => {
		const lines = show().findAll('[data-test="ticket-line"]')

		const [one, several] = lines
		for (const line of lines) {
			const children = [...line.element.children].map((el) => el.dataset.test)
			expect(children.indexOf("ticket-qty")).toBeLessThan(
				children.indexOf("ticket-dish-name"),
			)
		}
		expect(one.get('[data-test="ticket-qty"]').text()).toBe("1×")
		expect(one.get('[data-test="ticket-qty"]').classes()).not.toContain(
			"bg-blue-100",
		)
		expect(several.get('[data-test="ticket-qty"]').text()).toBe("2×")
		expect(several.get('[data-test="ticket-qty"]').classes()).toContain(
			"bg-blue-100",
		)
	})

	it("has the station as a small dot of its colour before the name, and its three letters beside it that only the large sizes show", () => {
		const lines = show().findAll('[data-test="ticket-line"]')

		const dot = lines[1].get('[data-test="ticket-station-dot"]')
		expect(dot.element.style.getPropertyValue("--dot-color")).toBe("#4A6B8F")
		expect(dot.attributes("title")).toBe("Bar")
		const code = lines[1].get('[data-test="ticket-station-code"]')
		expect(code.text()).toBe("BAR")
		// Shown by the size: the table of sizes says `inline` for Large and Extra large, none below
		expect(code.classes()).toContain("[display:var(--kds-tt-d,none)]")
		expect(lines[1].get('[data-test="ticket-dish-name"]').text()).toContain(
			"Dish b",
		)
		// A pill with the station's whole name is gone
		expect(lines[1].text()).not.toContain("Bar Dish")
	})

	it("has no station mark in a view filtered on one station: it says nothing there", () => {
		const wrapper = show({ showStation: false })

		expect(wrapper.find('[data-test="ticket-station-dot"]').exists()).toBe(
			false,
		)
		expect(wrapper.find('[data-test="ticket-station-code"]').exists()).toBe(
			false,
		)
	})

	it("is as high as its text, no longer a 48 px row of its own with a quantity bubble", () => {
		const line = show().get('[data-test="ticket-line"]')

		expect(line.classes()).toEqual(
			expect.arrayContaining(["!min-h-0", "!text-[length:var(--kds-fs,13px)]"]),
		)
		expect(line.find(".w-8").exists()).toBe(false)
	})

	it("says its options, its remark and its allergy as the kitchen ticket does: one piece draws them for both", () => {
		const wrapper = show({
			card: card({
				items: [
					dish("a", {
						posa_item_modifiers: JSON.stringify([
							{ options: [{ name: "Rare" }, { name: "No salt" }] },
						]),
						posa_special_instructions: "Allergy: peanuts",
					}),
					dish("b", { posa_special_instructions: "Same time as table 4" }),
				],
			}),
		})

		expect(wrapper.get('[data-test="ticket-options"]').text()).toBe(
			"→ Rare, No salt",
		)
		expect(wrapper.get('[data-test="ticket-allergy"]').text()).toBe(
			"Allergy: peanuts",
		)
		expect(wrapper.get('[data-test="ticket-remark"]').text()).toContain(
			"Same time as table 4",
		)
	})

	it("takes the restaurant's own allergy words", () => {
		const items = [dish("a", { posa_special_instructions: "Contains sesame" })]
		expect(
			show({ card: card({ items }) })
				.find('[data-test="ticket-allergy"]')
				.exists(),
		).toBe(false)
		expect(
			show({ card: card({ items }), allergyWords: ["sesame"] })
				.find('[data-test="ticket-allergy"]')
				.exists(),
		).toBe(true)
	})
})

describe("a station's card (By Station)", () => {
	const stationCard = () => ({
		key: "kit",
		title: "Cuisine",
		subtitle: "3 items",
		stationColor: "#F55D1A",
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:00:00",
		items: [],
		tableGroups: [
			{
				tableName: "T1",
				invoiceName: "SINV-1",
				items: [dish("a"), dish("b", { qty: 3 })],
			},
			{ tableName: "T2", invoiceName: "SINV-2", items: [dish("c")] },
		],
	})

	it("keeps the same anatomy: the station's name and its count in the header, the action row under it, the dishes grouped by table without station marks", () => {
		const wrapper = show({ card: stationCard(), viewMode: "station" })

		expect(wrapper.get('[data-test="ticket-title"]').text()).toBe("Cuisine")
		expect(wrapper.get('[data-test="ticket-number"]').text()).toBe("3 items")
		expect(wrapper.find('[data-test="ticket-room"]').exists()).toBe(false)
		expect(wrapper.get('[data-test="ticket-main"]').text()).toBe("Deliver")
		expect(wrapper.findAll('[data-test="ticket-group"]')).toHaveLength(2)
		expect(wrapper.find('[data-test="ticket-station-dot"]').exists()).toBe(
			false,
		)
		expect(
			wrapper.findAll('[data-test="ticket-qty"]').map((qty) => qty.text()),
		).toEqual(["1×", "3×", "1×"])
	})
})

describe("the hint that dishes are out of sight", () => {
	function stubBoxes(wrapper, visibleLines) {
		const body = wrapper.get('[data-test="ticket-body"]').element
		const rect = (top, bottom) => ({
			top,
			bottom,
			left: 0,
			right: 200,
			width: 200,
			height: bottom - top,
		})
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
			function () {
				if (this === body) return rect(0, visibleLines * 40)
				const lines = [...body.querySelectorAll("[data-ticket-line]")]
				const at = lines.indexOf(this)
				return at < 0 ? rect(0, 0) : rect(at * 40, at * 40 + 40)
			},
		)
		return body
	}

	it("says how many are cut by the foot of the card, in a strip under the dishes, and nothing when they all show", async () => {
		const items = Array.from({ length: 6 }, (_, index) => dish(`d${index}`))
		const wrapper = show({ card: card({ items }) })
		expect(wrapper.find('[data-test="ticket-more"]').exists()).toBe(false)

		const body = stubBoxes(wrapper, 4)
		body.dispatchEvent(new Event("scroll"))
		await wrapper.vm.$nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+2 lines")
		expect(wrapper.get('[data-test="ticket-more-strip"]').exists()).toBe(true)
	})

	it("says « +1 line » for one", async () => {
		const items = Array.from({ length: 5 }, (_, index) => dish(`d${index}`))
		const wrapper = show({ card: card({ items }) })

		stubBoxes(wrapper, 4).dispatchEvent(new Event("scroll"))
		await wrapper.vm.$nextTick()

		expect(wrapper.get('[data-test="ticket-more"]').text()).toBe("+1 line")
	})
})
