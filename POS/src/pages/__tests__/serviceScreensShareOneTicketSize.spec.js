/**
 * //// Neoffice — added file (no upstream equivalent). The runner and the kitchen screen show their tickets at ONE size
 * //// (NeoResto lot 1, task 9c): the same grid (the same columns and gap at every width) and the same ticket frame (the
 * //// padding, the title, the order number, the timer and the item lines). The product owner measured 365 px against
 * //// 450 px at 1900 px wide. Each screen keeps its own content: the runner its "Mark Delivered" button, the kitchen
 * //// its per-item status and "Delivered".
 * ////
 * //// jsdom has no layout engine: the sizes are read from the classes, and the columns of the grid are worked out for a
 * //// given screen width from the breakpoints this build has (frappe-ui's Tailwind preset defines sm, md, lg and xl,
 * //// and no 2xl: a `2xl:` class would silently do nothing).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const restaurantStore = vi.hoisted(() => ({
	runnerEnabled: true,
	tillRestaurant: "The Bistro",
	fetchRestaurantSettings: async () => {},
}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))

const { default: KDS } = await import("../KDS.vue")
const { default: Runner } = await import("../Runner.vue")
const { default: KDSOrderCard } = await import(
	"@/components/invoices/KDSOrderCard.vue"
)
const { default: RunnerOrderCard } = await import(
	"@/components/invoices/RunnerOrderCard.vue"
)
const { TEXT_SIZES, textSizeVariables } = await import("@/utils/kitchenTextSize")
const {
	RUNNER_AREA,
	TICKET_CARD,
	TICKET_COLUMNS,
	TICKET_STACK,
	BAND_WAITING_HEIGHT,
	BAND_PRODUCTION_HEIGHT,
	TICKET_AREA,
	TICKET_COLUMN_PRODUCTION,
	TICKET_COLUMN_WAITING,
	TICKET_FRAME,
	TICKET_GRID,
	TICKET_LANE,
	TICKET_SPLIT_PRODUCTION,
	TICKET_SPLIT_WAITING,
} = await import("@/utils/ticketLayout")

const tokens = (classes) => classes.split(/\s+/).filter(Boolean)

// Task 38a-2 (ruling 109 and the approved mockup): the WIDTH of a ticket is the text size's, `--kds-card-w`, no longer a share of a grid of one to five
// columns that the width of the screen decided (about 320 px at 1366 px wide, whatever the size of the text). The grids, the lanes and the split below
// are as many tickets of that width as the screen holds, and these tests read it back from the classes: jsdom has no layout engine. WHAT CHANGED BY
// DESIGN in this file: the tests that pinned the breakpoints (4 columns at 1366 px, 5 at 1920 px, `lg:grid-cols-3`, `auto-cols-[calc((100%-3rem)/4)]`,
// `col-span-3`), the 16 px gap and the 16 px margin, and the split of the page's grid in columns; the runner's tickets also left the shared grid to stack
// (see "the two screens").
const SIZE_VARIABLE = "--kds-card-w"
const cardWidth = (size) =>
	Number.parseFloat(textSizeVariables(size)[SIZE_VARIABLE])
const WIDTHS = Object.fromEntries(TEXT_SIZES.map((size) => [size, cardWidth(size)]))

const spacing = (classes, prefix) => {
	const found = tokens(classes).find((token) =>
		new RegExp(`^${prefix}-\\d+$`).test(token),
	)
	return Number(found.split("-")[1]) * 4
}
// The width a token asks for, with its fallback: `var(--kds-card-w,250px)` -> { variable: "--kds-card-w", fallback: 250 }
const variableOf = (text) => {
	const found = text.match(/var\((--[a-z-]+),(\d+)px\)/)
	return found ? { variable: found[1], fallback: Number(found[2]) } : null
}
/** The columns the grid has at a screen width, for a size: as many of the size's width, with the gap between them, as the area holds. */
function columnsAt(width, size, grid = TICKET_GRID) {
	const gap = spacing(grid, "gap")
	const inner = width - 2 * spacing(TICKET_AREA, "p")
	return Math.max(1, Math.floor((inner + gap) / (WIDTHS[size] + gap)))
}

describe("the width of a ticket", () => {
	it("follows the text size: Compact is the narrowest, and each size is wider than the one before", () => {
		expect(WIDTHS).toEqual({ compact: 250, normal: 280, large: 330, xl: 390 })
		const widths = TEXT_SIZES.map((size) => WIDTHS[size])
		expect([...widths].sort((a, b) => a - b)).toEqual(widths)
	})

	it("is the variable the root of the screen sets, and a card drawn outside the page falls back to the width of the dense size", () => {
		for (const classes of [
			TICKET_GRID,
			TICKET_LANE,
			TICKET_COLUMN_PRODUCTION,
			TICKET_COLUMN_WAITING,
			TICKET_SPLIT_WAITING,
			TICKET_CARD,
		]) {
			const found = variableOf(classes)
			expect(found, classes).toEqual({ variable: SIZE_VARIABLE, fallback: WIDTHS.compact })
		}
	})
})

describe("the grid of the tickets", () => {
	it("holds, at 1366 px, five Compact tickets across, four Normal, three Large and two Extra large (they were four of 320 px whatever the size)", () => {
		expect(TEXT_SIZES.map((size) => columnsAt(1366, size))).toEqual([5, 4, 3, 3])
		// ...and more of them on a wider screen: 1920 px
		expect(TEXT_SIZES.map((size) => columnsAt(1920, size))).toEqual([7, 6, 5, 4])
	})

	it("counts its columns by the width of a ticket, and a screen narrower than one gets a column that gives way instead of overflowing", () => {
		expect(TICKET_GRID).toContain("grid-cols-[repeat(auto-fill,minmax(0,var(--kds-card-w,250px)))]")
		expect(TICKET_GRID).not.toMatch(/\b(?:sm|md|lg|xl|2xl|min-\[\d+px\]):grid-cols-/)
		expect(columnsAt(240, "compact")).toBe(1)
	})

	it("never loses a column as the screen widens, whatever the size", () => {
		for (const size of TEXT_SIZES) {
			let before = 0
			for (let width = 320; width <= 2560; width += 1) {
				const columns = columnsAt(width, size)
				expect(columns, `${size} at ${width} px`).toBeGreaterThanOrEqual(before)
				before = columns
			}
		}
	})

	it("leaves an 8 px gap and a 12 px margin (they were 16 px: the room is for tickets)", () => {
		expect(spacing(TICKET_GRID, "gap")).toBe(8)
		expect(spacing(TICKET_AREA, "p")).toBe(12)
	})
})

describe("the lane of tickets of a band (the bands layout of the kitchen screen)", () => {
	it("makes a ticket exactly as wide as the text size says, whatever the screen's width: the same ticket as the runner's", () => {
		expect(tokens(TICKET_LANE)).toContain("auto-cols-[var(--kds-card-w,250px)]")
		expect(tokens(TICKET_CARD)).toContain("w-[var(--kds-card-w,250px)]")
	})

	it("leaves the gap of the grid between two tickets", () => {
		expect(spacing(TICKET_LANE, "gap")).toBe(spacing(TICKET_GRID, "gap"))
	})

	it("is one row that scrolls sideways, by touch, one ticket at a time, and does not pass any scroll on to the page", () => {
		const lane = tokens(TICKET_LANE)
		expect(lane).toEqual(
			expect.arrayContaining([
				"grid",
				"grid-flow-col",
				"overflow-x-auto",
				"overflow-y-hidden",
				// Contained both ways: sideways, the browser would take a swipe from the left edge for "back"; up and down,
				// the end of a ticket's dishes would hand the swipe on to the page (pull to refresh on an Android tablet)
				"overscroll-contain",
				"snap-x",
				"snap-mandatory",
			]),
		)
		// A single row as tall as the lane: a ticket never grows past its band
		expect(lane).toContain("grid-rows-[minmax(0,1fr)]")
	})

	it("uses only the breakpoints this build has", () => {
		expect(TICKET_LANE).not.toMatch(/\b2xl:/)
	})
})

describe("the columns of the kitchen screen, side by side", () => {
	it("are a row: the waiting tickets in a column one ticket wide (and a little more, for a scrollbar), the tickets in preparation taking the rest", () => {
		expect(tokens(TICKET_COLUMNS)).toEqual(expect.arrayContaining(["flex", "h-full"]))
		expect(tokens(TICKET_COLUMNS)).not.toContain("grid")
		// The column of waiting tickets does not grow or shrink: its width is a ticket's plus 12 px
		expect(tokens(TICKET_SPLIT_WAITING)).toEqual(
			expect.arrayContaining(["flex-none", "w-[calc(var(--kds-card-w,250px)+12px)]"]),
		)
		expect(tokens(TICKET_SPLIT_PRODUCTION)).toEqual(expect.arrayContaining(["flex-1", "min-w-0"]))
	})

	it("hold the waiting tickets in a single column of a ticket's width", () => {
		expect(tokens(TICKET_COLUMN_WAITING)).toContain("grid-cols-[var(--kds-card-w,250px)]")
	})

	it("hold, on the right, as many ticket columns of the text size's width as the side holds, with the gap of the grid", () => {
		expect(TICKET_COLUMN_PRODUCTION).toContain("grid-cols-[repeat(auto-fill,minmax(0,var(--kds-card-w,250px)))]")
		expect(spacing(TICKET_COLUMN_PRODUCTION, "gap")).toBe(spacing(TICKET_GRID, "gap"))
	})
})

describe("the height shared between the two bands of the bands layout", () => {
	const share = (classes) => {
		const found = tokens(classes)
			.map((token) => token.match(/^flex-\[(\d+)_\d+_0%\]$/))
			.find(Boolean)
		return found ? Number(found[1]) : null
	}

	it("gives each band a share of its own that does not depend on what it holds: the boundary between them never moves", () => {
		expect(share(BAND_WAITING_HEIGHT)).toBeGreaterThan(0)
		expect(share(BAND_PRODUCTION_HEIGHT)).toBeGreaterThan(0)
	})

	it("gives the band where the cooks work more than the one that waits", () => {
		expect(share(BAND_PRODUCTION_HEIGHT)).toBeGreaterThan(
			share(BAND_WAITING_HEIGHT),
		)
	})

	it("keeps a floor under each band, so that a short screen makes the page scroll instead of crushing one of them", () => {
		for (const classes of [BAND_WAITING_HEIGHT, BAND_PRODUCTION_HEIGHT]) {
			expect(tokens(classes).some((t) => /^min-h-\[/.test(t))).toBe(true)
		}
	})
})

describe("the two screens", () => {
	const orderOfTheKitchen = {
		name: "SINV-1",
		area: "r1",
		restaurant_table: "t1",
		table_display_name: "T1",
		kds_status: "Pending",
		// The ticket's number: the kitchen ticket shows it where it shows the order's number, and shows none for an order with none (task 38a-1)
		ticket_no: "0001",
		creation: "2026-10-30 12:00:00",
		modified: "2026-10-30 12:00:00",
		items: [
			{
				name: "l1",
				item_name: "Soup",
				qty: 1,
				preparation_station: "kit",
				kds_status: "Pending",
			},
		],
	}
	const orderOfTheRunner = {
		...orderOfTheKitchen,
		items: [
			{
				name: "l1",
				item_name: "Soup",
				qty: 1,
				preparation_station: "kit",
				station_name: "Kitchen",
				station_color: "#D68A59",
				kds_status: "Ready",
			},
		],
	}
	let opened = []

	beforeEach(() => {
		localStorage.clear()
		window.history.replaceState({}, "", "/pos/kds")
		opened = []
		call.mockReset()
		call.mockImplementation(async (method) => {
			if (method.endsWith("get_kds_orders")) return [orderOfTheKitchen]
			if (method.endsWith("get_runner_orders")) return [orderOfTheRunner]
			if (method.endsWith("get_tables"))
				return { areas: [{ name: "r1", area_name: "Room 1" }], tables: [] }
			return []
		})
	})
	afterEach(() => {
		opened.forEach((wrapper) => wrapper.unmount())
	})

	async function open(component) {
		const wrapper = mount(component, {
			global: {
				stubs: { KDSOrderCard: true, RunnerOrderCard: true },
				mocks: { __: globalThis.__ },
			},
		})
		opened.push(wrapper)
		await flushPromises()
		return wrapper
	}

	// Task 38a-2, ruling 130: the runner's tickets no longer stand on the shared grid, in the shared scrolling area. They are STACKED: short tickets
	// flow in columns (top to bottom, then the next column) as tall as the screen leaves them, in an area that scrolls sideways. What stays shared is the
	// WIDTH of a ticket (one size per text size, `--kds-card-w`) and the frame of the card.
	it("lay their tickets out in their own ways: the kitchen with its bands side by side as a row of columns, the runner's stacked in columns", async () => {
		localStorage.setItem("pos_kds_layout", "columns")
		const kitchen = await open(KDS)
		const runner = await open(Runner)

		const grid = kitchen.find('[data-test="bands"]')
		expect(grid.exists(), "kitchen: a row of columns").toBe(true)
		expect(grid.classes(), "kitchen: the row").toEqual(
			expect.arrayContaining(tokens(TICKET_COLUMNS)),
		)
		const kitchenArea = kitchen.find('[data-test="ticket-area"]')
		expect(kitchenArea.classes()).toEqual(
			expect.arrayContaining(tokens(TICKET_AREA)),
		)
		expect(kitchenArea.element.contains(grid.element)).toBe(true)

		const flow = runner.find('[data-test="ticket-flow"]')
		expect(flow.exists(), "runner: a flow of tickets").toBe(true)
		expect(flow.classes().sort()).toEqual(tokens(TICKET_STACK).sort())
		const runnerArea = runner.find('[data-test="ticket-area"]')
		expect(runnerArea.classes()).toEqual(
			expect.arrayContaining(tokens(RUNNER_AREA)),
		)
		expect(runnerArea.element.contains(flow.element)).toBe(true)
		// Its cards are the width of the text size and never taller than the flow
		const cards = runner.findAll('[data-test="ticket-flow"] > *')
		expect(cards.length).toBeGreaterThan(0)
		for (const card of cards)
			expect(card.classes()).toEqual(expect.arrayContaining(tokens(TICKET_CARD)))
	})

	it("lay the kitchen's tickets out as wide as the runner's when its bands are one above the other: lanes of the same ticket width", async () => {
		localStorage.setItem("pos_kds_layout", "bands")
		const kitchen = await open(KDS)

		const area = kitchen.find('[data-test="ticket-area"]')
		expect(area.classes()).toEqual(expect.arrayContaining(tokens(TICKET_AREA)))
		const lanes = kitchen.findAll('[data-test="ticket-lane"]')
		expect(lanes.length).toBeGreaterThan(0)
		for (const lane of lanes) {
			expect(lane.classes()).toEqual(
				expect.arrayContaining(tokens(TICKET_LANE)),
			)
			expect(area.element.contains(lane.element)).toBe(true)
		}
	})

	it("do not keep a grid of their own", () => {
		const sources = import.meta.glob(
			"/src/{pages/{KDS,Runner}.vue,components/restaurant/KitchenBand.vue}",
			{ query: "?raw", import: "default", eager: true },
		)
		expect(Object.keys(sources).sort()).toEqual([
			"/src/components/restaurant/KitchenBand.vue",
			"/src/pages/KDS.vue",
			"/src/pages/Runner.vue",
		])
		for (const [file, source] of Object.entries(sources)) {
			expect(source, file).not.toMatch(/grid-cols-/)
			expect(source, file).toMatch(/ticketLayout/)
		}
	})

	it("cut their tickets to the same frame: padding, title, order number, timer and item line", () => {
		const kitchen = mount(KDSOrderCard, {
			props: { order: orderOfTheKitchen },
			global: { mocks: { __: globalThis.__ } },
		})
		const runner = mount(RunnerOrderCard, {
			props: {
				card: {
					key: "SINV-1",
					title: "T1",
					subtitle: "#SINV-1",
					// The header's number is the ticket's, as on the kitchen's (task 38a-2, ruling 130): never the invoice's name, and none when there is none
					ticketNo: "0001",
					invoiceName: "SINV-1",
					creation: "2026-10-30 12:00:00",
					modified: "2026-10-30 12:00:00",
					items: orderOfTheRunner.items,
					stationGroups: [],
				},
				viewMode: "table",
			},
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(kitchen, runner)

		for (const part of ["header", "title", "number", "timer", "body", "line"]) {
			for (const [name, wrapper] of [
				["kitchen", kitchen],
				["runner", runner],
			]) {
				const element = wrapper.find(`[data-test="ticket-${part}"]`)
				expect(element.exists(), `${name}: the ${part}`).toBe(true)
				expect(element.classes(), `${name}: the ${part}`).toEqual(
					expect.arrayContaining(tokens(TICKET_FRAME[part])),
				)
			}
		}
	})

	it('cut the runner\'s "By Station" tickets to the same frame too, dish lines included', () => {
		const kitchen = mount(KDSOrderCard, {
			props: { order: orderOfTheKitchen },
			global: { mocks: { __: globalThis.__ } },
		})
		// A station's card: its dishes grouped by table, a table holding the dishes of two orders
		const runner = mount(RunnerOrderCard, {
			props: {
				card: {
					key: "cuisine",
					title: "Kitchen",
					subtitle: "3 items",
					stationColor: "#D68A59",
					creation: "2026-10-30 12:00:00",
					modified: "2026-10-30 12:00:00",
					items: [],
					tableGroups: [
						{
							tableName: "T1",
							invoiceName: "SINV-1",
							items: [
								{
									name: "l1",
									item_name: "Soup",
									qty: 1,
									_invoiceName: "SINV-1",
								},
								{
									name: "l2",
									item_name: "Steak",
									qty: 2,
									_invoiceName: "SINV-2",
								},
							],
						},
						{
							tableName: "T2",
							invoiceName: "SINV-3",
							items: [
								{
									name: "l3",
									item_name: "Salad",
									qty: 1,
									_invoiceName: "SINV-3",
								},
							],
						},
					],
				},
				viewMode: "station",
			},
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(kitchen, runner)

		// The card-level parts are the same in this view
		for (const part of ["header", "title", "number", "timer", "body"]) {
			expect(
				runner.find(`[data-test="ticket-${part}"]`).classes(),
				`runner by station: the ${part}`,
			).toEqual(expect.arrayContaining(tokens(TICKET_FRAME[part])))
		}
		// Every dish of the card is a line of the frame: the kitchen's line size, not a compact one of its own
		const lines = runner.findAll('[data-test="ticket-line"]')
		expect(lines).toHaveLength(3)
		const kitchenLine = kitchen.find('[data-test="ticket-line"]')
		for (const line of lines) {
			expect(line.classes()).toEqual(
				expect.arrayContaining(tokens(TICKET_FRAME.line)),
			)
			expect(line.classes()).toEqual(
				expect.arrayContaining(
					tokens(TICKET_FRAME.line).filter((token) =>
						kitchenLine.classes().includes(token),
					),
				),
			)
			// What is in the line takes the line's size: no smaller text, and (task 38a-2, ruling 130) no box of its own for the quantity, which stands
			// BEFORE the name as « 2x », like the kitchen ticket's
			expect(line.find(".font-medium").classes()).not.toContain("text-sm")
			expect(line.get('[data-test="ticket-qty"]').text()).toMatch(/^\d+×$/)
			expect(line.find(".w-8").exists()).toBe(false)
		}
	})

	it("keep their own content in the frame: the runner its button, the kitchen its statuses", () => {
		const kitchen = mount(KDSOrderCard, {
			props: { order: orderOfTheKitchen },
			global: { mocks: { __: globalThis.__ } },
		})
		const runner = mount(RunnerOrderCard, {
			props: {
				card: {
					key: "SINV-1",
					title: "T1",
					subtitle: "#SINV-1",
					invoiceName: "SINV-1",
					creation: "2026-10-30 12:00:00",
					modified: "2026-10-30 12:00:00",
					items: orderOfTheRunner.items,
					stationGroups: [],
				},
				viewMode: "table",
			},
			global: { mocks: { __: globalThis.__ } },
		})
		opened.push(kitchen, runner)

		// The runner's button is « Deliver » (the kitchen's own word for it, task 38a-1, ruling 113), in the action row under the header (task 38a-2, ruling 130)
		expect(runner.get('[data-test="ticket-main"]').text()).toBe("Deliver")
		expect(runner.text()).not.toContain("Mark Delivered")
		expect(kitchen.text()).not.toContain("Deliver")
		// The kitchen's ticket says where the order is (Pending: on its root, and by its button, the header does not write it any more,
		// task 38a-1), the runner's item line has no status to set
		expect(
			kitchen.get('[data-test="ticket"]').attributes("data-state"),
		).toBe("Pending")
		expect(kitchen.text()).toContain("Start")
	})
})
