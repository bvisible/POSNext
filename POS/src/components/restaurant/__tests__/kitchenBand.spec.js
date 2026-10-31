/**
 * //// Neoffice — added file (no upstream equivalent). One band of the kitchen screen (NeoRestau lot 1, task 23): its
 * //// header with the number of tickets it holds, then its tickets as a LANE that scrolls sideways (bands one above the
 * //// other) or as a COLUMN that scrolls up and down (side by side), with a count of the tickets out of sight, or one short
 * //// line when it holds none. jsdom has no layout engine: the boxes of the elements are given by hand.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nextTick } from "vue"

vi.hoisted(() => {
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/{(\d+)}/g, (_, n) => replace[n] ?? "") : text
})

// The band imports the ticket card (stubbed below), whose modules need these to load
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
const {
	BAND_PRODUCTION_HEIGHT,
	BAND_WAITING_HEIGHT,
	TICKET_COLUMN_PRODUCTION,
	TICKET_COLUMN_WAITING,
	TICKET_LANE,
	TICKET_SPLIT_PRODUCTION,
	TICKET_SPLIT_WAITING,
} = await import("@/utils/ticketLayout")

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

// A card, as the band sees it: what it is handed, and the function it calls once the server has answered
const Ticket = {
	props: ["order", "stations", "showStationBadge", "station", "refresh"],
	template:
		'<div class="ticket" :data-name="order.name" @click="refresh && refresh()">{{ order.name }}</div>',
}

const orders = (count, prefix = "SINV") =>
	Array.from({ length: count }, (_, index) => ({
		name: `${prefix}-${index + 1}`,
		items: [],
	}))

const rect = (left, top, width, height) => ({
	left,
	top,
	width,
	height,
	right: left + width,
	bottom: top + height,
	x: left,
	y: top,
	toJSON() {},
})

/** A lane 1248 px wide showing 4 tickets of 300 px (16 px apart), scrolled by `scrolled` px. */
function stubLane() {
	const state = { scrolled: 0 }
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			if (this.matches?.('[data-test="ticket-lane"]'))
				return rect(16, 100, 1248, 300)
			if (this.matches?.('[data-test="ticket-cell"]')) {
				const cells = [...this.parentElement.children]
				return rect(
					16 + cells.indexOf(this) * 316 - state.scrolled,
					100,
					300,
					300,
				)
			}
			return rect(0, 0, 0, 0)
		},
	)
	return state
}

/** A column 316 px wide, 620 px high, holding tickets of 308 px (16 px apart), scrolled by `scrolled` px. */
function stubColumn({ height = 620 } = {}) {
	const state = { scrolled: 0 }
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function box() {
			if (this.matches?.('[data-test="ticket-column"]'))
				return rect(16, 150, 316, height)
			if (this.matches?.('[data-test="ticket-cell"]')) {
				const cells = [...this.parentElement.children]
				return rect(
					16,
					150 + cells.indexOf(this) * 324 - state.scrolled,
					300,
					308,
				)
			}
			return rect(0, 0, 0, 0)
		},
	)
	return state
}

let opened = []
function show(props = {}, options = {}) {
	const wrapper = mount(KitchenBand, {
		props: {
			band: "waiting",
			mode: "lane",
			label: "Pending",
			emptyText: "No pending orders",
			orders: orders(3),
			stations: [],
			showStationBadge: true,
			...props,
		},
		global: { stubs: { KDSOrderCard: Ticket }, mocks: { __: globalThis.__ } },
		...options,
	})
	opened.push(wrapper)
	return wrapper
}
const shown = (wrapper) =>
	wrapper.findAll(".ticket").map((el) => el.attributes("data-name"))
const text = (wrapper, selector) =>
	wrapper.get(selector).text().replace(/\s+/g, " ")

beforeEach(() => {
	opened = []
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe("the header of a band", () => {
	it("names the band and counts its tickets: the label, then the number in parentheses", () => {
		const wrapper = show({ orders: orders(3) })

		expect(text(wrapper, '[data-test="band-header"]')).toBe("Pending (3)")
		expect(text(wrapper, '[data-test="band-count"]')).toBe("(3)")
	})

	it("counts 30 as 30 whatever is in view", () => {
		expect(
			text(show({ orders: orders(30) }), '[data-test="band-header"]'),
		).toBe("Pending (30)")
	})

	it("is the title of its band for whoever reads the page without seeing it", () => {
		const wrapper = show({ band: "production", label: "Preparing" })

		const region = wrapper.get('[data-test="band-production"]')
		expect(region.element.tagName).toBe("SECTION")
		const title = wrapper.get('[data-test="band-header"]')
		expect(title.element.tagName).toBe("H2")
		expect(region.attributes("aria-labelledby")).toBe(title.attributes("id"))
	})
})

describe("an empty band", () => {
	it("keeps its header, with a zero, and says in one short line that it holds nothing", () => {
		const wrapper = show({ orders: [] })

		expect(text(wrapper, '[data-test="band-header"]')).toBe("Pending (0)")
		expect(text(wrapper, '[data-test="band-empty"]')).toBe("No pending orders")
		expect(wrapper.find(".ticket").exists()).toBe(false)
	})

	it("takes the same room as a band with tickets in it: its height is its share of the screen, not its content", () => {
		const empty = show({ orders: [], band: "waiting" })
		const full = show({ orders: orders(5), band: "waiting" })

		const shares = (wrapper) =>
			wrapper
				.get('[data-test="band-waiting"]')
				.classes()
				.filter((c) => /^(flex-\[|min-h-)/.test(c))
		expect(shares(empty)).toEqual(shares(full))
		expect(shares(empty).length).toBeGreaterThan(0)
	})
})

describe("a band as a lane (bands one above the other)", () => {
	it("is one row of tickets that scrolls sideways, on the shared lane", () => {
		const wrapper = show({ mode: "lane" })

		const lane = wrapper.get('[data-test="ticket-lane"]')
		expect(lane.classes()).toEqual(expect.arrayContaining(tokens(TICKET_LANE)))
		expect(lane.classes()).toEqual(
			expect.arrayContaining(["flex-1", "min-h-0"]),
		)
		expect(wrapper.find('[data-test="ticket-column"]').exists()).toBe(false)
	})

	it("holds every ticket, in the order it was given, each in a cell that stops the swipe on its left edge", () => {
		const wrapper = show({ mode: "lane", orders: orders(30) })

		expect(shown(wrapper)).toEqual(orders(30).map((o) => o.name))
		const cells = wrapper.findAll('[data-test="ticket-cell"]')
		expect(cells).toHaveLength(30)
		for (const cell of cells) {
			expect(cell.classes()).toEqual(
				expect.arrayContaining(["snap-start", "min-h-0", "min-w-0"]),
			)
		}
	})

	it("takes its height from the share the waiting band has, and the production band its own, larger one", () => {
		const waiting = show({ mode: "lane", band: "waiting" })
		const production = show({ mode: "lane", band: "production" })

		expect(waiting.get('[data-test="band-waiting"]').classes()).toEqual(
			expect.arrayContaining(tokens(BAND_WAITING_HEIGHT)),
		)
		expect(production.get('[data-test="band-production"]').classes()).toEqual(
			expect.arrayContaining(tokens(BAND_PRODUCTION_HEIGHT)),
		)
	})

	it("hands its tickets, its stations and the badge choice to each card, and tells the screen when one of them changed", async () => {
		const wrapper = show({
			mode: "lane",
			orders: orders(2),
			stations: [{ name: "kit" }],
			showStationBadge: false,
		})
		const cards = wrapper.findAllComponents(Ticket)

		expect(cards).toHaveLength(2)
		expect(cards[0].props("stations")).toEqual([{ name: "kit" }])
		expect(cards[0].props("showStationBadge")).toBe(false)

		await cards[1].trigger("click")
		expect(wrapper.emitted("status-updated")).toHaveLength(1)
	})

	it("hands each card a function to call once the server has answered, one that still works when the card is gone", async () => {
		// A press that moves a ticket to the other band unmounts its card before the answer comes; the band stays. The
		// card cannot emit then (Vue drops the events of a component that is gone): it calls what the band gave it
		const wrapper = show({ mode: "lane", orders: orders(2) })
		const [first] = wrapper.findAllComponents(Ticket)
		const refresh = first.props("refresh")
		expect(typeof refresh).toBe("function")

		await wrapper.setProps({ orders: orders(2).slice(1) })
		refresh()

		expect(wrapper.emitted("status-updated")).toHaveLength(1)
	})

	it("hands each card the station chosen, none with every station", () => {
		const every = show({ mode: "lane", orders: orders(1) })
		expect(every.findComponent(Ticket).props("station")).toBe(null)

		const bar = show({ mode: "lane", orders: orders(1), station: "bar" })
		expect(bar.findComponent(Ticket).props("station")).toBe("bar")
	})

	it("counts only the tickets that are alive in its header, and shows the delivered ones after them, dimmed", () => {
		// "Show completed" brings the delivered tickets in: they are not work in hand, the count does not say they are
		const live = orders(2, "LIVE")
		const done = [
			{ name: "DONE-1", kds_status: "Delivered", items: [] },
			{ name: "DONE-2", kds_status: "Delivered", items: [] },
		]
		const wrapper = show({ band: "production", orders: [...live, ...done] })

		expect(text(wrapper, '[data-test="band-count"]')).toBe("(2)")
		expect(shown(wrapper)).toEqual(["LIVE-1", "LIVE-2", "DONE-1", "DONE-2"])
		const cells = wrapper.findAll('[data-test="ticket-cell"]')
		expect(cells.map((c) => c.classes().includes("opacity-60"))).toEqual([
			false,
			false,
			true,
			true,
		])
	})

	describe("the tickets out of sight", () => {
		it("counts the ones past the right edge in the header: 4 in view, so +26 of 30", async () => {
			stubLane()
			const wrapper = show({ mode: "lane", orders: orders(30) })
			await nextTick()

			expect(text(wrapper, '[data-test="band-more"]')).toBe("+26")
			const header = wrapper.get("header").element
			expect(
				header.contains(wrapper.get('[data-test="band-more"]').element),
			).toBe(true)
		})

		it("says nothing when every ticket fits", async () => {
			stubLane()
			const wrapper = show({ mode: "lane", orders: orders(4) })
			await nextTick()

			expect(wrapper.find('[data-test="band-more"]').exists()).toBe(false)
			expect(wrapper.find('[data-test="band-before"]').exists()).toBe(false)
		})

		it("follows the swipe: the count of the tickets to come goes down, the count of the ones gone by shows", async () => {
			const state = stubLane()
			const wrapper = show({ mode: "lane", orders: orders(30) })
			await nextTick()
			expect(wrapper.find('[data-test="band-before"]').exists()).toBe(false)

			state.scrolled = 5 * 316
			await wrapper.get('[data-test="ticket-lane"]').trigger("scroll")

			expect(text(wrapper, '[data-test="band-more"]')).toBe("+21")
			// The oldest tickets are the ones that matter: the cook is told he has scrolled past 5 of them
			expect(text(wrapper, '[data-test="band-before"]')).toBe("‹ +5")
		})

		it("goes at the end of the lane", async () => {
			const state = stubLane()
			const wrapper = show({ mode: "lane", orders: orders(30) })
			await nextTick()

			state.scrolled = 26 * 316
			await wrapper.get('[data-test="ticket-lane"]').trigger("scroll")

			expect(wrapper.find('[data-test="band-more"]').exists()).toBe(false)
			expect(text(wrapper, '[data-test="band-before"]')).toBe("‹ +26")
		})

		it("follows the tickets that come and go with a refresh", async () => {
			stubLane()
			const wrapper = show({ mode: "lane", orders: orders(6) })
			await nextTick()
			expect(text(wrapper, '[data-test="band-more"]')).toBe("+2")

			await wrapper.setProps({ orders: orders(9) })
			expect(text(wrapper, '[data-test="band-more"]')).toBe("+5")

			await wrapper.setProps({ orders: orders(3) })
			expect(wrapper.find('[data-test="band-more"]').exists()).toBe(false)
		})

		it("follows the width of the screen: a tablet turned shows fewer tickets across", async () => {
			let notify
			vi.stubGlobal(
				"ResizeObserver",
				class {
					constructor(callback) {
						notify = callback
					}
					observe() {}
					unobserve() {}
					disconnect() {}
				},
			)
			const state = stubLane()
			const wrapper = show({ mode: "lane", orders: orders(10) })
			await nextTick()
			expect(text(wrapper, '[data-test="band-more"]')).toBe("+6")

			// The window is now 2 tickets wide
			vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
				function box() {
					if (this.matches?.('[data-test="ticket-lane"]'))
						return rect(16, 100, 616, 300)
					if (this.matches?.('[data-test="ticket-cell"]')) {
						const cells = [...this.parentElement.children]
						return rect(
							16 + cells.indexOf(this) * 316 - state.scrolled,
							100,
							300,
							300,
						)
					}
					return rect(0, 0, 0, 0)
				},
			)
			notify()
			await nextTick()

			expect(text(wrapper, '[data-test="band-more"]')).toBe("+8")
		})

		it("stops watching the lane's size when it is taken away", () => {
			const disconnect = vi.fn()
			vi.stubGlobal(
				"ResizeObserver",
				class {
					observe() {}
					unobserve() {}
					disconnect() {
						disconnect()
					}
				},
			)
			const wrapper = show({ mode: "lane" })
			wrapper.unmount()
			opened = []

			expect(disconnect).toHaveBeenCalled()
		})
	})
})

describe("a band as a column (bands side by side)", () => {
	it("is a column of tickets that scrolls up and down, on the shared columns of its side", () => {
		const waiting = show({ mode: "column", band: "waiting" })
		const production = show({ mode: "column", band: "production" })

		const left = waiting.get('[data-test="ticket-column"]')
		expect(left.classes()).toEqual(
			expect.arrayContaining([
				...tokens(TICKET_COLUMN_WAITING),
				"flex-1",
				"min-h-0",
				"overflow-y-auto",
				"overscroll-y-contain",
			]),
		)
		const right = production.get('[data-test="ticket-column"]')
		expect(right.classes()).toEqual(
			expect.arrayContaining([
				...tokens(TICKET_COLUMN_PRODUCTION),
				"overflow-y-auto",
			]),
		)
		expect(waiting.find('[data-test="ticket-lane"]').exists()).toBe(false)
	})

	it("lets a ticket take its own height: the rows are not stretched to fill the column", () => {
		const column = show({ mode: "column" }).get('[data-test="ticket-column"]')
		expect(column.classes()).toContain("content-start")
	})

	it("takes the columns of the shared grid its side spans: one for the waiting tickets, the rest for the others", () => {
		const waiting = show({ mode: "column", band: "waiting" })
		const production = show({ mode: "column", band: "production" })

		expect(waiting.get('[data-test="band-waiting"]').classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_SPLIT_WAITING)),
		)
		expect(production.get('[data-test="band-production"]').classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_SPLIT_PRODUCTION)),
		)
	})

	it("hands its tickets the height of the column as their cap: a long ticket grows down to the foot of the column, then scrolls inside", async () => {
		vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(588)
		const wrapper = show({ mode: "column" })
		await nextTick()

		const column = wrapper.get('[data-test="ticket-column"]').element
		expect(column.style.getPropertyValue("--ticket-max-h")).toBe("588px")
	})

	it("sets no cap when it cannot know its height yet", async () => {
		const wrapper = show({ mode: "column" })
		await nextTick()

		const column = wrapper.get('[data-test="ticket-column"]').element
		expect(column.style.getPropertyValue("--ticket-max-h")).toBe("")
	})

	describe("the tickets out of sight", () => {
		it("counts the ones below the foot of the column in a strip of its own under it, so that nothing is hidden by the count", async () => {
			stubColumn()
			const wrapper = show({ mode: "column", orders: orders(30) })
			await nextTick()

			expect(text(wrapper, '[data-test="band-more"]')).toBe("+29")
			const footer = wrapper.get('[data-test="band-footer"]')
			const chip = wrapper.get('[data-test="band-more"]')
			expect(footer.element.contains(chip.element)).toBe(true)
			// Under the column, outside it: not over a ticket, not in the header
			const column = wrapper.get('[data-test="ticket-column"]').element
			expect(column.contains(footer.element)).toBe(false)
			expect(wrapper.get("header").element.contains(chip.element)).toBe(false)
			expect(chip.classes()).not.toContain("absolute")
			expect(footer.classes()).toContain("flex-shrink-0")
		})

		it("keeps the strip when there is nothing to count: the column does not change height when a ticket arrives", async () => {
			stubColumn()
			const few = show({ mode: "column", orders: orders(1) })
			const many = show({ mode: "column", orders: orders(30) })
			await nextTick()

			expect(few.find('[data-test="band-more"]').exists()).toBe(false)
			expect(few.find('[data-test="band-footer"]').exists()).toBe(true)
			expect(few.get('[data-test="band-footer"]').classes()).toEqual(
				many.get('[data-test="band-footer"]').classes(),
			)
		})

		it("counts the ones scrolled by in the header, with an arrow up", async () => {
			const state = stubColumn()
			const wrapper = show({ mode: "column", orders: orders(30) })
			await nextTick()
			expect(wrapper.find('[data-test="band-before"]').exists()).toBe(false)

			state.scrolled = 4 * 324
			await wrapper.get('[data-test="ticket-column"]').trigger("scroll")

			expect(text(wrapper, '[data-test="band-before"]')).toBe("↑ +4")
			expect(text(wrapper, '[data-test="band-more"]')).toBe("+25")
			expect(
				wrapper
					.get("header")
					.element.contains(wrapper.get('[data-test="band-before"]').element),
			).toBe(true)
		})

		it("draws nothing over the tickets: no fade, no pill, so that no button is greyed out or covered", async () => {
			const state = stubColumn()
			const wrapper = show({ mode: "column", orders: orders(30) })
			await nextTick()
			state.scrolled = 4 * 324
			await wrapper.get('[data-test="ticket-column"]').trigger("scroll")

			const column = wrapper.get('[data-test="ticket-column"]').element
			expect(column.parentElement.querySelector(".absolute")).toBe(null)
			expect(wrapper.find('[data-test="band-more-fade"]').exists()).toBe(false)
			expect(wrapper.find('[data-test="band-before-fade"]').exists()).toBe(
				false,
			)
		})
	})
})

describe("45 tickets in two bands", () => {
	it("keeps every one of them, none dropped to make the page lighter", () => {
		const waiting = show({ band: "waiting", orders: orders(30, "W") })
		const production = show({ band: "production", orders: orders(15, "P") })

		expect(shown(waiting)).toHaveLength(30)
		expect(shown(production)).toHaveLength(15)
		expect(text(waiting, '[data-test="band-count"]')).toBe("(30)")
		expect(text(production, '[data-test="band-count"]')).toBe("(15)")
	})
})
