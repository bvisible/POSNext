/**
 * //// Neoffice — added file (no upstream equivalent). The till's floor plan in DARK mode (NeoResto lot 1, smoke-test fix). Measured on a real till: the canvas stayed a
 * //// light sheet (an inline style, which no dark class can reach) while the names of the tables were written in the dark mode's near-white, on a pale tint of the
 * //// state's colour: 1.13:1, the names were invisible; « Cleaning » was white on pale green; the walls, a fixed dark slate, would have vanished on a dark canvas.
 * //// The canvas is a class now (the light sheet in light, the ground the till's dark remap gives `bg-gray-50` with faint dots in dark), the words of every state
 * //// have the colours of the design system's dark ramp, a table being cleaned is the system's neutral, a station's name is its colour lightened, and the light
 * //// mode keeps every class it had. The contrast of each pair is computed in components/restaurant/__tests__/tablesDarkModeStylesheet.spec.js, from the
 * //// compiled colours, and measured in a browser on the real screens.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const cart = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		(args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async () => []),
}))
vi.mock("@/socket", () => ({
	initSocket: () => ({
		disconnected: false,
		connect() {},
		on() {},
		off() {},
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		handleError: vi.fn(),
	}),
}))
vi.mock("@/composables/useDraggable", () => ({
	useDraggable: () => ({
		handleDragStart: vi.fn(),
		handleResizeStart: vi.fn(),
		destroy: vi.fn(),
	}),
}))
vi.mock("@/composables/useCanvasGestures", () => ({
	useCanvasGestures: () => ({
		zoomLevel: ref(1),
		panX: ref(0),
		panY: ref(0),
		transformStyle: ref({}),
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		zoomReset: vi.fn(),
		resetPan: vi.fn(),
		cleanup: vi.fn(),
	}),
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => cart }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till", profileCurrency: "CHF" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { default: FloorPlanWalls } = await import("../FloorPlanWalls.vue")

const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
function aTable(name, label, status, extra = {}) {
	return {
		name,
		table_name: label,
		area: ROOM.name,
		status,
		capacity: 4,
		pos_x: 20,
		pos_y: 20,
		width: 100,
		height: 100,
		waiting_items_count: 0,
		qr_waiting_count: 0,
		order_summary:
			status === "Occupied"
				? {
						item_count: 3,
						opened_at: "2026-10-31 19:00:00.000000",
						opened_by: "LM",
						grand_total: 42,
					}
				: null,
		...extra,
	}
}
const TABLES = {
	Empty: aTable("t-empty", "Free table", "Empty"),
	Occupied: aTable("t-occupied", "Busy table", "Occupied", {
		waiting_items_count: 2,
	}),
	Reserved: aTable("t-reserved", "Booked table", "Reserved"),
	Paid: aTable("t-paid", "Paid table", "Paid"),
	Cleaning: aTable("t-cleaning", "Cleaned table", "Cleaning"),
	// A status without order summary: its word is the status
	OccupiedWord: aTable("t-occupied-word", "Word table", "Occupied", {
		order_summary: null,
	}),
}
const STATIONS = [
	{
		name: "bar",
		station_name: "Bar",
		station_type: "Bar",
		color: "#2C4FA8",
		area: ROOM.name,
		pos_x: 300,
		pos_y: 20,
		width: 110,
		height: 60,
	},
	{
		name: "kit",
		station_name: "Kitchen",
		station_type: "Kitchen",
		color: "#D68A59",
		area: ROOM.name,
		pos_x: 300,
		pos_y: 100,
		width: 110,
		height: 60,
	},
]

function theStore(overrides = {}) {
	for (const key of Object.keys(restaurantStore)) delete restaurantStore[key]
	Object.assign(restaurantStore, {
		can: { manage_floor: true, set_table_status: true },
		tillRestaurant: "The Bistro",
		areas: [ROOM],
		tables: Object.values(TABLES),
		floorStations: STATIONS,
		takeawayEnabled: true,
		runnerEnabled: true,
		qrOrderingEnabled: false,
		takeawayOrders: [],
		occupiedCountByArea: {},
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: ROOM.name,
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		freeCleaningTables: vi.fn(async () => 0),
		fetchStationItemsMap: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
		saveAllPositions: vi.fn(async () => {}),
		saveStationPositions: vi.fn(async () => {}),
		saveFloorPlanWalls: vi.fn(async () => {}),
		...overrides,
	})
}

let wrapper
async function floorPlan({ width = 1366, stubWalls = true } = {}) {
	Object.defineProperty(window, "innerWidth", {
		value: width,
		configurable: true,
		writable: true,
	})
	localStorage.clear()
	theStore()
	wrapper = mount(FloorPlanEditor, {
		attachTo: document.body,
		props: { userName: "Lea Martin", siteTimezone: "Europe/Zurich" },
		global: {
			stubs: stubWalls ? { FloorPlanWalls: true } : {},
			mocks: { __: globalThis.__ },
		},
	})
	await flushPromises()
	return wrapper
}
afterEach(() => {
	wrapper?.unmount()
	wrapper = null
	document.body.innerHTML = ""
})
beforeEach(() => {
	cart.clearCart = vi.fn(async () => {})
	cart.setRestaurantTable = vi.fn()
})

const split = (el) => {
	const all = el.classes()
	return {
		light: all.filter((name) => !name.startsWith("dark:")),
		dark: all.filter((name) => name.startsWith("dark:")),
	}
}
const tile = (label) =>
	wrapper.findAll('[data-test="table"]').find((el) => el.text().includes(label))
const canvas = () => wrapper.get('[data-test="floor-canvas"]')

describe("the plan's canvas is a class, light and dark (smoke-test fix)", () => {
	it("is the light sheet with the light dots in service, and in dark the ground of the till with faint dots", async () => {
		await floorPlan()

		const sheet = canvas()
		expect(sheet.classes()).toEqual(
			expect.arrayContaining([
				"bg-[#f8fafc]",
				"dark:bg-[#181b21]",
				"[--plan-dot:#cbd5e1]",
				"dark:[--plan-dot:rgba(255,255,255,0.1)]",
				"bg-[radial-gradient(circle,var(--plan-dot)_1px,transparent_1px)]",
				"flex-1",
				"relative",
				"overflow-hidden",
			]),
		)
		// A colour in the inline style could not be reached by a dark class: only the size of the grid stays there
		expect(sheet.element.style.backgroundColor).toBe("")
		expect(sheet.element.style.backgroundImage).toBe("")
		expect(sheet.element.style.backgroundSize).toBe("25px 25px")
	})

	it("is the editor's lighter sheet in the editor, 20 px grid, and the same dark ground", async () => {
		await floorPlan()

		await wrapper.get('[data-test="floor-line-more"]').trigger("click")
		await wrapper.get('[data-test="menu-edit-floor-plan"]').trigger("click")

		expect(wrapper.vm.isEditMode).toBe(true)
		const sheet = canvas()
		expect(sheet.classes()).toEqual(
			expect.arrayContaining([
				"bg-[#f9fafb]",
				"dark:bg-[#181b21]",
				"[--plan-dot:#d1d5db]",
				"dark:[--plan-dot:rgba(255,255,255,0.1)]",
			]),
		)
		expect(sheet.classes()).not.toContain("bg-[#f8fafc]")
		expect(sheet.element.style.backgroundSize).toBe("20px 20px")
	})

	it("the phone's hint under the plan is on the same ground in dark", async () => {
		await floorPlan({ width: 390 })
		await wrapper.get('[data-test="view-plan"]').trigger("click")

		const hint = wrapper.get('[data-test="plan-hint"]')
		expect(split(hint).dark).toEqual(
			expect.arrayContaining(["dark:text-ds-sand-300", "dark:bg-[#181b21]"]),
		)
		expect(split(hint).light).toEqual(
			expect.arrayContaining(["text-[#6F665A]", "bg-[#FAF3EA]"]),
		)
	})
})

describe("the tiles of the plan in dark mode (smoke-test fix)", () => {
	// The classes each state had in light mode: the light mode must draw what it drew
	const LIGHT = {
		Empty: [
			"border-2",
			"border-green-200",
			"bg-green-50",
			"hover:border-green-400",
		],
		Occupied: [
			"border-2",
			"border-red-200",
			"bg-red-50",
			"hover:border-red-400",
		],
		Reserved: [
			"border-2",
			"border-yellow-200",
			"bg-yellow-50",
			"hover:border-yellow-400",
		],
		Paid: [
			"border-2",
			"border-blue-300",
			"bg-blue-50",
			"hover:border-blue-400",
		],
		Cleaning: [
			"border-2",
			"border-emerald-300",
			"bg-emerald-50",
			"hover:border-emerald-400",
		],
	}

	it.each(Object.entries(LIGHT))(
		"a %s tile keeps the classes it had in light",
		async (state, light) => {
			await floorPlan()

			const classes = split(tile(TABLES[state].table_name)).light
			for (const name of light) expect(classes, name).toContain(name)
		},
	)

	it("the dark edge of each state is the same as before; a table being cleaned has the neutral's wash and edge, which outrank the till's remap", async () => {
		await floorPlan()

		for (const [state, edge] of [
			["Empty", "dark:border-green-800"],
			["Occupied", "dark:border-red-800"],
			["Reserved", "dark:border-yellow-800"],
			["Paid", "dark:border-blue-800"],
		])
			expect(split(tile(TABLES[state].table_name)).dark, state).toContain(edge)
		const cleaning = split(tile(TABLES.Cleaning.table_name)).dark
		expect(cleaning).toEqual(
			expect.arrayContaining([
				"dark:border-ds-sand-400",
				"dark:hover:border-ds-sand-300",
				"dark:[&&]:!bg-[rgba(255,251,245,0.10)]",
			]),
		)
		// No emerald in dark any more: no class that compiles to nothing is left on it
		expect(cleaning.join(" ")).not.toContain("emerald")
	})

	it("the state word of each tile is in the dark ramp: success, danger, warning, the neutral's secondary text; the Paid word keeps its clay", async () => {
		await floorPlan()

		const word = (state, text) =>
			tile(TABLES[state].table_name)
				.findAll("span")
				.find((el) => el.text() === text)
		expect(split(word("Empty", "Empty")).dark).toEqual(["dark:text-ds-success"])
		expect(split(word("Empty", "Empty")).light).toContain("text-green-600")
		expect(split(word("OccupiedWord", "Occupied")).dark).toEqual([
			"dark:text-ds-danger",
		])
		expect(split(word("Reserved", "Reserved")).dark).toEqual([
			"dark:text-ds-warning",
		])
		expect(split(word("Reserved", "Reserved")).light).toContain(
			"text-yellow-600",
		)
		expect(split(word("Cleaning", "Cleaning")).dark).toEqual([
			"dark:text-ds-sand-300",
		])
		// The Paid word and the initials are blue in the source, which this build maps to the clay and the dark remap lightens
		expect(split(word("Paid", "Paid")).dark).toEqual([])
		expect(split(word("Paid", "Paid")).light).toContain("text-blue-600")
	})

	it("an order on a tile: the count in the pale red, the waiting badge in ink on its orange, the time in the secondary text", async () => {
		await floorPlan()

		const busy = tile(TABLES.Occupied.table_name)
		const count = busy.findAll("span").find((el) => el.text() === "3")
		expect(split(count).dark).toEqual(["dark:text-ds-danger-soft"])
		expect(split(count).light).toEqual(
			expect.arrayContaining(["bg-red-100", "text-red-700"]),
		)
		const waiting = busy.get("span[title='Waiting']")
		expect(split(waiting).dark).toEqual(["dark:text-ds-ink"])
		expect(split(waiting).light).toEqual(
			expect.arrayContaining(["bg-orange-500", "text-white"]),
		)
		const time = busy
			.findAll("span")
			.find((el) => el.classes().includes("text-gray-500"))
		expect(split(time).dark).toEqual(["dark:[&&]:!text-ds-sand-300"])
		// The initials keep the clay
		const initials = busy.findAll("span").find((el) => el.text() === "LM")
		expect(split(initials).dark).toEqual([])
	})

	it("the occupied seats are the system's tertiary text colour in dark, the free ones keep theirs", async () => {
		await floorPlan()

		const seats = (state) =>
			tile(TABLES[state].table_name).findAll("div.rounded-sm")
		const busy = seats("Occupied")[0]
		expect(split(busy).dark).toEqual([
			"dark:bg-ds-sand-400",
			"dark:border-ds-sand-300",
		])
		expect(split(busy).light).toEqual(
			expect.arrayContaining(["bg-gray-400", "border-gray-500"]),
		)
		expect(split(seats("Empty")[0]).dark).toEqual([])
	})
})

describe("the stations on the plan in dark mode (smoke-test fix)", () => {
	it("a station's name and icon are written through a variable, its own colour in light and the same colour lightened in dark", async () => {
		await floorPlan()

		const box = wrapper
			.findAll("div.absolute")
			.find(
				(el) =>
					el.text().includes("Bar") &&
					el.element.style.getPropertyValue("--station-color"),
			)
		expect(box, "the station's box").toBeTruthy()
		expect(box.element.style.getPropertyValue("--station-color")).toBe(
			"#2C4FA8",
		)
		// The blue of the station is lightened for the dark canvas (2.1:1 as it was); the colour in light is the very colour it was
		const lightened = box.element.style.getPropertyValue("--station-on-dark")
		expect(lightened).toMatch(/^#[0-9A-F]{6}$/)
		expect(lightened).not.toBe("#2C4FA8")
		const label = box.findAll("span").find((el) => el.text() === "Bar")
		expect(label.classes()).toEqual(
			expect.arrayContaining([
				"text-[color:var(--station-color)]",
				"dark:text-[color:var(--station-on-dark)]",
			]),
		)
		expect(label.element.style.color).toBe("")
		const icon = box.get("svg")
		expect(icon.classes()).toEqual(
			expect.arrayContaining([
				"text-[color:var(--station-color)]",
				"dark:text-[color:var(--station-on-dark)]",
			]),
		)
		// The tint and the edge are the station's colour, as they were
		expect(box.element.style.borderColor).toBeTruthy()
		expect(box.element.style.backgroundColor).toBeTruthy()
	})
})

describe("the arrows toggle in dark mode (smoke-test fix)", () => {
	it("is ink on the dark ramp's success green when it is on, as it was green with white text in light", async () => {
		await floorPlan()

		const toggle = wrapper.get("button.absolute.bottom-3.left-3")
		// The toggle starts on: arrows are shown by default
		expect(toggle.classes()).toEqual(
			expect.arrayContaining([
				"bg-green-500",
				"text-white",
				"dark:bg-ds-success",
				"dark:text-ds-ink",
			]),
		)
	})
})

describe("a wall in dark mode (smoke-test fix)", () => {
	it("is the slate it was in light and the design system's tertiary text colour in dark; a selected wall keeps its clay", () => {
		const walls = mount(FloorPlanWalls, {
			props: {
				walls: [
					{ id: "w1", x1: 0, y1: 0, x2: 200, y2: 0 },
					{ id: "w2", x1: 0, y1: 0, x2: 0, y2: 200 },
				],
				doors: [],
				windows: [],
				isEditMode: false,
				activeTool: "select",
				zoomLevel: 1,
				panX: 0,
				panY: 0,
				wallOpacity: 1,
			},
		})

		const lines = walls.findAll("line[stroke-width='4']")
		expect(lines).toHaveLength(2)
		for (const line of lines) {
			expect(line.classes()).toEqual(
				expect.arrayContaining(["text-[#374151]", "dark:text-ds-sand-400"]),
			)
			// `currentColor` is the class's colour: the slate in light, the sand in dark
			expect(line.attributes("stroke")).toBe("currentColor")
		}
		walls.unmount()
	})
})
