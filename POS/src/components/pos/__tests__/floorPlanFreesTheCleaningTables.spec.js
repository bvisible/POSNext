/**
 * //// Neoffice — added file (no upstream equivalent). « Free the tables being cleaned » (NeoRestau lot 1, Ruling 48), the
 * //// whole way on the till's side: the real restaurant store and the real floor plan, against a server that does what
 * //// `free_cleaning_tables` does (the Python suite proves the endpoint itself). A cashier, who may set the status of a
 * //// table and not lay out the floor, taps the item: the tables of the room shown that are being cleaned are free on the
 * //// plan at once, the tables of the other rooms are not touched, and a short toast says how many.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const server = vi.hoisted(() => ({ tables: [], asked: [] }))
const toast = vi.hoisted(() => ({
	showSuccess: vi.fn(),
	showError: vi.fn(),
	showInfo: vi.fn(),
	handleError: vi.fn(),
}))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		args.reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

const ROOM_1 = {
	name: "r0o1m2h3a4",
	area_name: "Room 1",
	restaurant: "The Bistro",
}
const TERRACE = {
	name: "t3rr4c3h4s",
	area_name: "Terrace",
	restaurant: "The Bistro",
}

// The server of a restaurant: what the till reads, and the one write this suite is about
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args = {}) => {
		if (method.endsWith("get_tables")) {
			return {
				areas: [ROOM_1, TERRACE],
				tables: server.tables.map((table) => ({ ...table })),
				stations: [],
			}
		}
		if (method.endsWith("free_cleaning_tables")) {
			server.asked.push(args)
			const freed = server.tables.filter(
				(t) => t.area === args.area && t.status === "Cleaning",
			)
			for (const table of freed) table.status = "Empty"
			return {
				status: "success",
				freed: freed.length,
				tables: freed.map((t) => t.name),
			}
		}
		if (method.endsWith("get_station_items_map"))
			return { items: {}, groups: {} }
		if (method.endsWith("get_restaurant_settings"))
			return { opening_hours: [], is_open: true, current_slot: null }
		if (method.endsWith("get_restaurant_status"))
			return { is_open: true, has_active_cards: true }
		return []
	}),
}))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const tillSettings = reactive({
		enable_restaurant_mode: 1,
		restaurant: "The Bistro",
		// A cashier: he sets the status of a table, he does not lay out the floor
		restaurant_can: { set_table_status: true },
	})
	return {
		tillSettings,
		usePOSSettingsStore: () => ({ settings: tillSettings }),
	}
})
vi.mock("@/utils/offline/db", () => {
	const table = () => ({
		clear: vi.fn(),
		bulkPut: vi.fn(),
		put: vi.fn(),
		toArray: vi.fn(() => []),
	})
	return {
		db: {
			restaurant_areas: table(),
			restaurant_tables: table(),
			transaction: (...args) => args[args.length - 1](),
		},
	}
})
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
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
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { useRestaurantStore } = await import("@/stores/restaurant")

const table = (name, area, label, status) => ({
	name,
	table_name: label,
	area,
	status,
	capacity: 4,
	shape: "Square",
	pos_x: 10,
	pos_y: 10,
	width: 100,
	height: 100,
})

describe("a cashier frees the tables being cleaned from the floor plan", () => {
	let wrapper

	beforeEach(() => {
		localStorage.clear()
		for (const notice of Object.values(toast)) notice.mockClear()
		server.asked = []
		server.tables = [
			table("c1h4sh", ROOM_1.name, "T1", "Cleaning"),
			table("c2h4sh", ROOM_1.name, "T2", "Cleaning"),
			table("e1h4sh", ROOM_1.name, "T3", "Empty"),
			table("r1h4sh", ROOM_1.name, "T4", "Reserved"),
			table("t1h4sh", TERRACE.name, "T5", "Cleaning"),
		]
		setActivePinia(createPinia())
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	async function floorPlan() {
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	const more = () => wrapper.find('[data-test="floor-line-more"]')
	const freeItem = () => wrapper.find('[data-test="menu-free-cleaning-tables"]')
	// What the plan says of the tables it shows (the room that is shown)
	const cleaningOnScreen = () =>
		(wrapper.text().match(/Cleaning/g) || []).length
	const tapFree = async () => {
		await more().trigger("click")
		await freeItem().trigger("click")
		await flushPromises()
	}

	it("offers the item, and no way into the editor, to a cashier", async () => {
		await floorPlan()

		expect(more().exists()).toBe(true)
		await more().trigger("click")
		expect(
			wrapper.findAll('[role="menuitem"]').map((item) => item.text()),
		).toEqual(["Free the tables being cleaned"])
	})

	it("shows the tables of the room as being cleaned before it, as the server has them", async () => {
		await floorPlan()

		expect(cleaningOnScreen()).toBe(2)
	})

	it("frees the tables of the room shown at once, and none of the other rooms", async () => {
		await floorPlan()

		await tapFree()

		// One call, for the room shown and the restaurant of the till
		expect(server.asked).toEqual([
			{ area: ROOM_1.name, restaurant: "The Bistro" },
		])
		expect(cleaningOnScreen()).toBe(0)
		expect(toast.showSuccess).toHaveBeenCalledWith("2 tables freed in Room 1")
		// The store holds what the server did: the two tables of the room are free, the others are what they were
		expect(
			Object.fromEntries(
				useRestaurantStore().tables.map((t) => [t.table_name, t.status]),
			),
		).toEqual({
			T1: "Empty",
			T2: "Empty",
			T3: "Empty",
			T4: "Reserved",
			T5: "Cleaning",
		})

		// The terrace still has its table being cleaned
		await wrapper.findAll('[data-test="room-tab"]')[1].trigger("click")
		expect(cleaningOnScreen()).toBe(1)
	})

	it("frees the room that is shown when it is not the first", async () => {
		await floorPlan()
		await wrapper.findAll('[data-test="room-tab"]')[1].trigger("click")

		await tapFree()

		expect(server.asked).toEqual([
			{ area: TERRACE.name, restaurant: "The Bistro" },
		])
		expect(toast.showSuccess).toHaveBeenCalledWith("1 table freed in Terrace")
		expect(cleaningOnScreen()).toBe(0)
		// Back in the first room, its two tables are still being cleaned
		await wrapper.findAll('[data-test="room-tab"]')[0].trigger("click")
		expect(cleaningOnScreen()).toBe(2)
	})

	it("shows the red badge of a room that is named by a hash: the occupied tables it holds", async () => {
		server.tables = [
			table("o1h4sh", ROOM_1.name, "T1", "Occupied"),
			table("o2h4sh", ROOM_1.name, "T2", "Occupied"),
			table("e1h4sh", ROOM_1.name, "T3", "Empty"),
			table("o3h4sh", TERRACE.name, "T5", "Occupied"),
		]
		await floorPlan()

		// The rooms are named by a hash and labelled for the waiter: the badge counts by the name, as the plan reads it
		expect(ROOM_1.name).not.toBe(ROOM_1.area_name)
		const [first, second] = wrapper.findAll('[data-test="room-tab"]')
		expect(first.find("span").text()).toBe("2")
		expect(second.find("span").text()).toBe("1")
	})

	it("says so when there is nothing to free, and the plan stays as it is", async () => {
		await floorPlan()
		await tapFree()
		toast.showSuccess.mockClear()

		await tapFree()

		expect(toast.showInfo).toHaveBeenCalledWith(
			"No table is being cleaned in Room 1",
		)
		expect(toast.showSuccess).not.toHaveBeenCalled()
		expect(cleaningOnScreen()).toBe(0)
	})
})
