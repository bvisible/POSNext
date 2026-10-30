/**
 * //// Neoffice — added file (no upstream equivalent). "Edit table" on the floor plan edits the table that was
 * //// opened (NeoRestau lot 1, task 9). The dialog used to call `create_table` with the new label: renaming a table
 * //// made another one beside it, and its seats and shape could not be changed. It calls `update_table` on the
 * //// table's own name now, and says why the server refused it (a label another table of the restaurant has).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const toast = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
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
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))

const { call } = await import("@/utils/apiWrapper")
const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

const ROOM = "r0o1m2h3a4"
const TABLE = {
	name: "t4b1e0h4sh",
	table_name: "T1",
	area: ROOM,
	capacity: 4,
	shape: "Square",
	status: "Empty",
	pos_x: 10,
	pos_y: 20,
	width: 100,
	height: 100,
}

function theStore() {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas: [{ name: ROOM, area_name: "Room 1" }],
		tables: [TABLE],
		floorStations: [],
		takeawayEnabled: false,
		runnerEnabled: false,
		takeawayOrders: [],
		occupiedCountByArea: {},
		totalOccupiedCount: 0,
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: null,
		ofTheRestaurant: () => ({ restaurant: "The Bistro" }),
		addTable: vi.fn(async () => {}),
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
	})
}

describe("Edit table edits the table that was opened", () => {
	let wrapper

	async function editorOpenOn(table) {
		wrapper = mount(FloorPlanEditor, {
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		wrapper.vm.openEditTableDialog(table)
		// What the editor read and called while it opened is not what the edit does
		call.mockClear()
		restaurantStore.fetchFromNetwork.mockClear()
		return wrapper.vm
	}

	const callsTo = (method) =>
		call.mock.calls.filter(([name]) => name === method)

	beforeEach(() => {
		Object.assign(toast, {
			showSuccess: vi.fn(),
			showError: vi.fn(),
			handleError: vi.fn(),
		})
		theStore()
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	it("opens on what the table has now", async () => {
		const editor = await editorOpenOn(TABLE)

		expect(editor.showEditTableDialog).toBe(true)
		expect({ ...editor.editTable }).toEqual({
			name: TABLE.name,
			table_name: "T1",
			capacity: 4,
			shape: "Square",
		})
	})

	it("saves the label, the seats and the shape on the table's own name, and makes no other table", async () => {
		const editor = await editorOpenOn(TABLE)
		editor.editTable.table_name = "T1 bis"
		editor.editTable.capacity = 6
		editor.editTable.shape = "Round"

		await editor.handleEditTable()

		expect(callsTo("pos_next.api.restaurant.update_table")).toEqual([
			[
				"pos_next.api.restaurant.update_table",
				{ name: TABLE.name, table_name: "T1 bis", capacity: 6, shape: "Round" },
			],
		])
		expect(callsTo("pos_next.api.restaurant.create_table")).toEqual([])
		expect(call).toHaveBeenCalledTimes(1)
	})

	it("closes the dialog, reads the floor again and says so", async () => {
		const editor = await editorOpenOn(TABLE)
		editor.editTable.table_name = "T1 bis"

		await editor.handleEditTable()

		expect(editor.showEditTableDialog).toBe(false)
		expect(restaurantStore.fetchFromNetwork).toHaveBeenCalledTimes(1)
		expect(toast.showSuccess).toHaveBeenCalledWith("Table updated")
		expect(toast.handleError).not.toHaveBeenCalled()
	})

	it("tells why the server refused it, and keeps the dialog open", async () => {
		const editor = await editorOpenOn(TABLE)
		const refusal = Object.assign(new Error("update_table ValidationError"), {
			messages: ["Table T2 already exists in this restaurant"],
		})
		call.mockRejectedValueOnce(refusal)
		editor.editTable.table_name = "T2"

		await editor.handleEditTable()

		expect(toast.handleError).toHaveBeenCalledWith(
			refusal,
			"Failed to update table",
		)
		expect(toast.showSuccess).not.toHaveBeenCalled()
		expect(editor.showEditTableDialog).toBe(true)
		expect(restaurantStore.fetchFromNetwork).not.toHaveBeenCalled()
	})

	it("says why a new table is refused too (a number of seats below one, a label taken)", async () => {
		await editorOpenOn(TABLE)
		const refusal = Object.assign(new Error("create_table ValidationError"), {
			messages: ["Capacity must be a whole number of at least 1"],
		})
		restaurantStore.addTable.mockRejectedValueOnce(refusal)
		wrapper.vm.newTable = { table_name: "T9", capacity: -3, shape: "Round" }

		await wrapper.vm.handleAddTable()

		expect(restaurantStore.addTable).toHaveBeenCalledWith(
			expect.objectContaining({
				table_name: "T9",
				capacity: -3,
				shape: "Round",
			}),
		)
		expect(toast.handleError).toHaveBeenCalledWith(
			refusal,
			"Failed to add table",
		)
		expect(toast.showSuccess).not.toHaveBeenCalled()
		expect(wrapper.vm.showAddTableDialog).toBe(false)
	})

	it("adds the table with the seats typed, and says so", async () => {
		await editorOpenOn(TABLE)
		wrapper.vm.newTable = { table_name: "T9", capacity: 6, shape: "Round" }

		await wrapper.vm.handleAddTable()

		expect(restaurantStore.addTable).toHaveBeenCalledWith(
			expect.objectContaining({
				table_name: "T9",
				capacity: 6,
				shape: "Round",
				area: ROOM,
			}),
		)
		expect(toast.showSuccess).toHaveBeenCalledWith("Table added")
		expect(toast.handleError).not.toHaveBeenCalled()
	})

	it("calls nothing when no table is open", async () => {
		const editor = await editorOpenOn(TABLE)
		editor.editTable.name = ""

		await editor.handleEditTable()

		expect(call).not.toHaveBeenCalled()
	})
})
