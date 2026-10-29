/**
 * //// Neoffice — added file (no upstream equivalent). Laying out the floor plan (rooms, tables, stations, walls) is
 * //// for whoever the server lets manage the floor (NeoRestau lot 1, task 3): the till is told so in its settings
 * //// (`restaurant_can.manage_floor`). A cashier sees the plan and serves its tables; the Edit button is not his,
 * //// and the editor does not open for him whatever calls it. The server refuses his writes anyway.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => []) }))
vi.mock("@/socket", () => ({ initSocket: () => null }))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock("@/composables/useDraggable", () => ({
	useDraggable: () => ({ handleDragStart: vi.fn(), handleResizeStart: vi.fn(), destroy: vi.fn() }),
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
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => restaurantStore }))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileName: "Till" }) }))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

function theStore(can) {
	Object.assign(restaurantStore, {
		can,
		tillRestaurant: "The Bistro",
		areas: [{ name: "r0o1m2h3a4", area_name: "Room 1" }],
		tables: [],
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
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
		saveAllPositions: vi.fn(async () => {}),
		saveStationPositions: vi.fn(async () => {}),
		saveFloorPlanWalls: vi.fn(async () => {}),
	})
}

describe("the floor plan's editor is for whoever may lay out the floor", () => {
	let wrapper

	async function floorPlan(can) {
		theStore(can)
		wrapper = mount(FloorPlanEditor, {
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	const editButton = () => wrapper.findAll("button").find((button) => button.text() === "Edit")

	afterEach(() => {
		wrapper?.unmount()
	})

	it("shows the Edit button to whoever may manage the floor, and opens the editor", async () => {
		await floorPlan({ manage_floor: true })

		await editButton().trigger("click")

		expect(wrapper.vm.isEditMode).toBe(true)
		expect(wrapper.findAll("button").some((button) => button.text() === "Save")).toBe(true)
	})

	it("shows no Edit button to a cashier", async () => {
		await floorPlan({ manage_floor: false, view_tips: true })

		expect(editButton()).toBeUndefined()
	})

	it("does not open the editor for a cashier, whatever calls it", async () => {
		await floorPlan({ manage_floor: false })

		await wrapper.vm.toggleEditMode()

		expect(wrapper.vm.isEditMode).toBe(false)
	})

	it("shows no Edit button while the server has not said what the user may manage", async () => {
		await floorPlan(undefined)

		expect(editButton()).toBeUndefined()
		await wrapper.vm.toggleEditMode()
		expect(wrapper.vm.isEditMode).toBe(false)
	})
})
