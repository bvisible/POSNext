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
const { TICKET_AREA, TICKET_FRAME, TICKET_GRID } = await import(
	"@/utils/ticketLayout"
)

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

	it("lay their tickets out on the same grid, in the same scrolling area", async () => {
		const kitchen = await open(KDS)
		const runner = await open(Runner)

		for (const [name, wrapper] of [
			["kitchen", kitchen],
			["runner", runner],
		]) {
			const grid = wrapper.find('[data-test="ticket-grid"]')
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
		expect(kitchen.find('[data-test="ticket-grid"]').classes().sort()).toEqual(
			runner.find('[data-test="ticket-grid"]').classes().sort(),
		)
	})

	it("do not keep a grid of their own", () => {
		const sources = import.meta.glob("/src/pages/{KDS,Runner}.vue", {
			query: "?raw",
			import: "default",
			eager: true,
		})
		expect(Object.keys(sources).sort()).toEqual([
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
