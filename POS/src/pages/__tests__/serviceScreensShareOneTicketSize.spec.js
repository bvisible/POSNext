/**
 * //// Neoffice — added file (no upstream equivalent). The runner and the kitchen screen show their tickets at ONE size
 * //// (NeoRestau lot 1, task 9c): the same grid (the same columns and gap at every width) and the same ticket frame (the
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
const {
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

// What this build's Tailwind knows (frappe-ui's preset): there is no 2xl
const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 }

/** The columns the grid has at a screen width: the base count, then each breakpoint's, the widest that applies. */
function columnsAt(width, grid = TICKET_GRID) {
	const steps = []
	for (const token of tokens(grid)) {
		const match = token.match(
			/^(?:(sm|md|lg|xl)|min-\[(\d+)px\]):grid-cols-(\d+)$/,
		)
		const base = token.match(/^grid-cols-(\d+)$/)
		if (base) steps.push({ from: 0, columns: Number(base[1]) })
		else if (match)
			steps.push({
				from: match[1] ? BREAKPOINTS[match[1]] : Number(match[2]),
				columns: Number(match[3]),
			})
		else if (/grid-cols-/.test(token))
			throw new Error(`${token} is not a breakpoint this build has`)
	}
	return steps
		.filter((step) => step.from <= width)
		.sort((a, b) => b.from - a.from)[0].columns
}
const spacing = (classes, prefix) => {
	const found = tokens(classes).find((token) =>
		new RegExp(`^${prefix}-\\d+$`).test(token),
	)
	return Number(found.split("-")[1]) * 4
}
/** The width of one ticket on a screen of that width: the area's padding on both sides, the gap between the columns. */
function ticketWidthAt(width) {
	const columns = columnsAt(width)
	const padding = spacing(TICKET_AREA, "p")
	const gap = spacing(TICKET_GRID, "gap")
	return (width - 2 * padding - (columns - 1) * gap) / columns
}

describe("the grid of the tickets", () => {
	it("has 4 columns at 1366 px and 5 at 1920 px, tickets of the same width on both screens", () => {
		expect(columnsAt(1366)).toBe(4)
		expect(columnsAt(1920)).toBe(5)
		// (1366 - 2 x 16 - 3 x 16) / 4 and (1920 - 2 x 16 - 4 x 16) / 5
		expect(ticketWidthAt(1366)).toBeCloseTo(321.5, 1)
		expect(ticketWidthAt(1920)).toBeCloseTo(364.8, 1)
	})

	it("uses only the breakpoints this build has", () => {
		for (const token of tokens(TICKET_GRID)) {
			if (!/grid-cols-/.test(token)) continue
			expect(token).toMatch(
				/^(?:(?:sm|md|lg|xl|min-\[\d+px\]):)?grid-cols-\d+$/,
			)
		}
		expect(TICKET_GRID).not.toMatch(/\b2xl:/)
	})

	it("never loses a column as the screen widens, and keeps a ticket from 300 to 380 px on a kitchen screen", () => {
		let before = 0
		for (let width = 320; width <= 2560; width += 1) {
			const columns = columnsAt(width)
			expect(columns).toBeGreaterThanOrEqual(before)
			before = columns
			if (width >= 1280 && width <= 1920) {
				expect(ticketWidthAt(width)).toBeGreaterThanOrEqual(300)
				expect(ticketWidthAt(width)).toBeLessThanOrEqual(380)
			}
		}
	})

	it("leaves a 16 px gap and a 16 px margin, the same in the two directions", () => {
		expect(spacing(TICKET_GRID, "gap")).toBe(16)
		expect(spacing(TICKET_AREA, "p")).toBe(16)
	})
})

/**
 * The value a responsive utility has at a screen width: the base class, then each breakpoint's, the widest that applies.
 * `pick` turns a token into what it sets, or null for a token that is not one of this family.
 */
function valueAt(width, classes, pick) {
	const steps = []
	for (const token of tokens(classes)) {
		const match = token.match(/^(?:(sm|md|lg|xl)|min-\[(\d+)px\]):(.+)$/)
		const from = match
			? match[1]
				? BREAKPOINTS[match[1]]
				: Number(match[2])
			: 0
		const value = pick(match ? match[3] : token)
		if (value != null) steps.push({ from, value })
	}
	return steps
		.filter((step) => step.from <= width)
		.sort((a, b) => b.from - a.from)[0]?.value
}

describe("the lane of tickets of a band (the bands layout of the kitchen screen)", () => {
	// auto-cols-[calc((100%-3rem)/4)]  ->  { gaps: 3 rem, columns: 4 }
	const laneColumn = (token) => {
		const found = token.match(
			/^auto-cols-\[(?:calc\(\(100%-(\d+)rem\)\/(\d+)\)|100%)\]$/,
		)
		if (!found) return null
		return { gaps: Number(found[1] || 0), columns: Number(found[2] || 1) }
	}
	function laneTicketWidthAt(width) {
		const { gaps, columns } = valueAt(width, TICKET_LANE, laneColumn)
		const inner = width - 2 * spacing(TICKET_AREA, "p")
		return (inner - gaps * 16) / columns
	}

	it("makes a ticket exactly as wide as a column of the shared grid, at every screen width", () => {
		for (let width = 320; width <= 2560; width += 1) {
			expect(laneTicketWidthAt(width), `${width} px`).toBeCloseTo(
				ticketWidthAt(width),
				6,
			)
		}
	})

	it("shows as many tickets across as the shared grid has columns, and leaves the gap of the grid between them", () => {
		for (const width of [768, 800, 1024, 1180, 1280, 1366, 1600, 1920]) {
			expect(
				valueAt(width, TICKET_LANE, laneColumn).columns,
				`${width} px`,
			).toBe(columnsAt(width))
			// n columns have n - 1 gaps
			expect(valueAt(width, TICKET_LANE, laneColumn).gaps).toBe(
				columnsAt(width) - 1,
			)
		}
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
		for (const token of tokens(TICKET_LANE).filter((t) =>
			/auto-cols/.test(t),
		)) {
			expect(token).toMatch(/^(?:(?:sm|md|lg|xl|min-\[\d+px\]):)?auto-cols-\[/)
		}
	})
})

describe("the columns of the kitchen screen, side by side", () => {
	const spanOf = (token) => {
		const found = token.match(/^col-span-(\d+)$/)
		return found ? Number(found[1]) : null
	}
	const subColumns = (token) => {
		const found = token.match(/^grid-cols-(\d+)$/)
		return found ? Number(found[1]) : null
	}

	it("split the shared grid: the waiting tickets take ONE column of it, the others take the rest", () => {
		for (const width of [
			320, 640, 768, 800, 1024, 1180, 1280, 1366, 1600, 1920,
		]) {
			const all = columnsAt(width)
			const waiting = valueAt(width, TICKET_SPLIT_WAITING, spanOf)
			const production = valueAt(width, TICKET_SPLIT_PRODUCTION, spanOf)
			// Under 768 px a grid has one column: the screen does not offer this layout there
			if (width < BREAKPOINTS.md) continue
			expect(waiting, `${width} px: waiting`).toBe(1)
			expect(waiting + production, `${width} px: all`).toBe(all)
		}
	})

	it("hold as many ticket columns on the right as the right side spans, so that a ticket has the width of the grid there too", () => {
		for (let width = BREAKPOINTS.md; width <= 2560; width += 1) {
			const span = valueAt(width, TICKET_SPLIT_PRODUCTION, spanOf)
			const inside = valueAt(width, TICKET_COLUMN_PRODUCTION, subColumns)
			expect(inside, `${width} px`).toBe(span)
			// The gap is the grid's, so span columns of the grid's width fill the span exactly
			expect(spacing(TICKET_COLUMN_PRODUCTION, "gap")).toBe(
				spacing(TICKET_GRID, "gap"),
			)
		}
	})

	it("hold the waiting tickets in a single column of the grid's width", () => {
		for (let width = BREAKPOINTS.md; width <= 2560; width += 1) {
			expect(
				valueAt(width, TICKET_COLUMN_WAITING, subColumns),
				`${width} px`,
			).toBe(1)
		}
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

	it("lay their tickets out on the same grid, in the same scrolling area: the kitchen with its bands side by side", async () => {
		// Side by side, the kitchen's two bands ARE the shared grid (the waiting tickets in its first column, the others in the
		// rest), so its tickets are the runner's, column for column
		localStorage.setItem("pos_kds_layout", "columns")
		const kitchen = await open(KDS)
		const runner = await open(Runner)

		for (const [name, wrapper, selector] of [
			["kitchen", kitchen, '[data-test="bands"]'],
			["runner", runner, '[data-test="ticket-grid"]'],
		]) {
			const grid = wrapper.find(selector)
			expect(grid.exists(), `${name}: a grid`).toBe(true)
			expect(grid.classes(), `${name}: the grid`).toEqual(
				expect.arrayContaining(tokens(TICKET_GRID)),
			)
			const area = wrapper.find('[data-test="ticket-area"]')
			expect(area.classes(), `${name}: the area`).toEqual(
				expect.arrayContaining(tokens(TICKET_AREA)),
			)
			expect(area.element.contains(grid.element)).toBe(true)
		}
		// The runner's grid is the shared one and nothing else
		expect(runner.find('[data-test="ticket-grid"]').classes().sort()).toEqual(
			tokens(TICKET_GRID).sort(),
		)
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
			// What is in the line takes the line's size: no smaller text, no smaller quantity box of its own
			expect(line.find(".font-medium").classes()).not.toContain("text-sm")
			expect(line.find(".rounded-lg").classes()).toEqual(
				expect.arrayContaining(["w-8", "h-8", "text-lg"]),
			)
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

		expect(runner.text()).toContain("Mark Delivered")
		expect(kitchen.text()).not.toContain("Mark Delivered")
		// The kitchen's ticket says where the order is (Pending), the runner's item line has no status to set
		expect(kitchen.text()).toContain("Pending")
		expect(kitchen.text()).toContain("Start")
	})
})
