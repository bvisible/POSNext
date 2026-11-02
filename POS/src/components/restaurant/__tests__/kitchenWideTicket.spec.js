/**
 * //// Neoffice — added file (no upstream equivalent). The WIDE card in the kitchen's bands (NeoResto lot 1, task 38a-3, ruling 107 layer 2). A ticket with more than 12 dishes, in the band of
 * //// the tickets IN PREPARATION (a column of the side-by-side layout, or the lane of the other), takes TWO columns of its grid; its dishes stay in one list. It never spans more than the
 * //// room there is: where the band holds fewer than three columns of tickets (a narrow screen, a big text size) it stays one width. The band of the tickets waiting never has one.
 * //// jsdom has no layout engine: the width of the band's area is given by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick, ref } from "vue"

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
const { TICKET_CELL_WIDE } = await import("@/utils/ticketLayout")
const { TEXT_SIZE_KEY } = await import("@/utils/kitchenTextSize")
const { WIDE_TICKET_LINES } = await import("@/utils/wideTicket")

const Ticket = {
	props: ["order"],
	template:
		'<div class="ticket" :data-name="order.name">{{ order.name }}</div>',
}

/** An order with `count` dishes sent to the stations. */
const order = (name, count, extra = {}) => ({
	name,
	kds_status: "Preparing",
	items: Array.from({ length: count }, (_, index) => ({
		item_code: `${name}-${index}`,
		item_name: `Dish ${index + 1}`,
		kds_status: "Preparing",
	})),
	...extra,
})

/** The width the band's area is laid out at: jsdom has none. */
let areaWidth = 0
/** What the screen's text size sets as the width of a ticket. */
let cardWidth = "250px"
const observers = []

let opened = []
/** Mounts the band and waits for the first measure of its area: the count of columns is read on mount, the cells are drawn again after it. */
async function show(props = {}, options = {}) {
	const wrapper = mount(KitchenBand, {
		props: {
			band: "production",
			mode: "column",
			label: "In preparation",
			emptyText: "No orders in preparation",
			orders: [order("SHORT", 4), order("LONG", WIDE_TICKET_LINES + 1)],
			stations: [],
			...props,
		},
		global: {
			stubs: { KDSOrderCard: Ticket },
			mocks: { __: globalThis.__ },
			...(options.global || {}),
		},
		attachTo: document.body,
	})
	opened.push(wrapper)
	await nextTick()
	return wrapper
}
const cell = (wrapper, name) =>
	wrapper
		.findAll('[data-test="ticket-cell"]')
		.find((el) => el.get(".ticket").attributes("data-name") === name)

beforeEach(() => {
	opened = []
	areaWidth = 1000
	cardWidth = "250px"
	observers.length = 0
	vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
		function width() {
			return this.matches?.(
				'[data-test="ticket-lane"], [data-test="ticket-column"]',
			)
				? areaWidth
				: 0
		},
	)
	// The page's text size sets the width of a ticket as a variable on its root, inherited by the band
	document.documentElement.style.setProperty("--kds-card-w", cardWidth)
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback) {
				this.callback = callback
				observers.push(this)
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	)
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	document.documentElement.style.removeProperty("--kds-card-w")
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("a ticket with many dishes in the band of the tickets in preparation", () => {
	it("takes TWO columns of the grid in the side-by-side layout, and a short ticket keeps one", async () => {
		const wrapper = await show()

		const long = cell(wrapper, "LONG")
		expect(long.classes()).toContain(TICKET_CELL_WIDE)
		expect(TICKET_CELL_WIDE).toBe("col-span-2")
		expect(long.attributes("data-wide")).toBe("true")
		const short = cell(wrapper, "SHORT")
		expect(short.classes()).not.toContain(TICKET_CELL_WIDE)
		expect(short.attributes("data-wide")).toBeUndefined()
	})

	it("takes two columns of the lane in the layout of bands one above the other", async () => {
		const wrapper = await show({ mode: "lane" })

		expect(cell(wrapper, "LONG").classes()).toContain("col-span-2")
		expect(cell(wrapper, "SHORT").classes()).not.toContain("col-span-2")
	})

	it("is wide from the 13th dish: 12 dishes are one width, 13 are two", async () => {
		const wrapper = await show({
			orders: [order("TWELVE", 12), order("THIRTEEN", 13)],
		})

		expect(cell(wrapper, "TWELVE").attributes("data-wide")).toBeUndefined()
		expect(cell(wrapper, "THIRTEEN").attributes("data-wide")).toBe("true")
	})

	it("counts the dishes sent, not the ones announced under « Coming next »: a ticket of 10 and 6 held back is not wide", async () => {
		const held = order("HELD", 10)
		for (let index = 0; index < 6; index += 1)
			held.items.push({ item_code: `H${index}`, kds_status: "Waiting" })

		expect(
			cell(await show({ orders: [held] }), "HELD").attributes("data-wide"),
		).toBeUndefined()
	})

	it("is never wider than the area: its span is two columns of the grid and no more, whatever the dishes", async () => {
		const wrapper = await show({ orders: [order("HUGE", 60)] })

		expect(
			cell(wrapper, "HUGE")
				.classes()
				.filter((c) => c.startsWith("col-span")),
		).toEqual(["col-span-2"])
	})

	it("stays one width where the area holds fewer than THREE columns: two Compact tickets (516 px) is too narrow, three (766 px) is enough", async () => {
		areaWidth = 516
		const narrow = await show()
		expect(cell(narrow, "LONG").attributes("data-wide")).toBeUndefined()
		expect(cell(narrow, "LONG").classes()).not.toContain("col-span-2")

		areaWidth = 766
		const enough = await show()
		expect(cell(enough, "LONG").attributes("data-wide")).toBe("true")
	})

	it("goes by the width of a TICKET, which the text size sets: 1000 px hold three Compact tickets (250 px) but two Large ones (330 px)", async () => {
		cardWidth = "330px"
		document.documentElement.style.setProperty("--kds-card-w", cardWidth)
		const large = await show()
		expect(cell(large, "LONG").attributes("data-wide")).toBeUndefined()

		document.documentElement.style.setProperty("--kds-card-w", "250px")
		const compact = await show()
		expect(cell(compact, "LONG").attributes("data-wide")).toBe("true")
	})

	it("is not wide until the area has been measured: a ticket must not take two columns of an area nobody knows the width of", async () => {
		areaWidth = 0
		const wrapper = await show()

		expect(cell(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
	})

	it("follows the area when it changes size, as a tablet turned does", async () => {
		areaWidth = 516
		const wrapper = await show()
		expect(cell(wrapper, "LONG").attributes("data-wide")).toBeUndefined()

		areaWidth = 1000
		observers.forEach((observer) => observer.callback())
		await nextTick()
		expect(cell(wrapper, "LONG").attributes("data-wide")).toBe("true")

		areaWidth = 500
		observers.forEach((observer) => observer.callback())
		await nextTick()
		expect(cell(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
	})

	it("follows the text size: a bigger ticket leaves fewer columns, with the area as wide as before", async () => {
		const size = ref("compact")
		const wrapper = await show(
			{},
			{ global: { provide: { [TEXT_SIZE_KEY]: size } } },
		)
		expect(cell(wrapper, "LONG").attributes("data-wide")).toBe("true")

		document.documentElement.style.setProperty("--kds-card-w", "330px")
		size.value = "large"
		await nextTick()
		await nextTick()
		await nextTick()

		expect(cell(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
	})

	it("is wide when it arrives with a refresh, and not wide any more when its dishes go (delivered ones leave the ticket)", async () => {
		const wrapper = await show({ orders: [order("A", 5)] })
		expect(cell(wrapper, "A").attributes("data-wide")).toBeUndefined()

		await wrapper.setProps({ orders: [order("A", 14)] })
		expect(cell(wrapper, "A").attributes("data-wide")).toBe("true")

		await wrapper.setProps({ orders: [order("A", 3)] })
		expect(cell(wrapper, "A").attributes("data-wide")).toBeUndefined()
	})
})

describe("the band of the tickets waiting", () => {
	it("never has a wide ticket: its column is one ticket wide, and a long ticket there scrolls its dishes inside itself", async () => {
		const wrapper = await show({ band: "waiting", orders: [order("LONG", 30)] })

		expect(cell(wrapper, "LONG").attributes("data-wide")).toBeUndefined()
		expect(cell(wrapper, "LONG").classes()).not.toContain("col-span-2")
	})
})
