/**
 * //// Neoffice — added file (no upstream equivalent). Laying out the floor plan (rooms, tables, stations, walls) is
 * //// for whoever the server lets manage the floor (NeoRestau lot 1, task 3): the till is told so in its settings
 * //// (`restaurant_can.manage_floor`). A cashier sees the plan and serves its tables; the way into the editor is not
 * //// his, and the editor does not open for him whatever calls it. The server refuses his writes anyway. The way in
 * //// is the « Edit the floor plan » item of the « ⋯ » menu at the end of the plan's line (Ruling 48; it was an Edit
 * //// button on the line).
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

	// The way in: the « ⋯ » at the end of the plan's line, and the item of the menu it opens
	const more = () => wrapper.find('[data-test="floor-line-more"]')
	const editItem = () => wrapper.find('[data-test="menu-edit-floor-plan"]')
	// Nothing on the line is called Edit any more, whoever looks at it
	const editButton = () => wrapper.findAll("button").find((button) => button.text() === "Edit")

	afterEach(() => {
		wrapper?.unmount()
	})

	it("offers the editor to whoever may manage the floor, in the « ⋯ » menu, and opens it", async () => {
		await floorPlan({ manage_floor: true })
		expect(editButton()).toBeUndefined()

		await more().trigger("click")
		await editItem().trigger("click")

		expect(wrapper.vm.isEditMode).toBe(true)
		expect(wrapper.findAll("button").some((button) => button.text() === "Save")).toBe(true)
	})

	it("offers no way into the editor to a cashier: no « ⋯ », no menu, no item", async () => {
		await floorPlan({ manage_floor: false, view_tips: true })

		expect(more().exists()).toBe(false)
		expect(wrapper.find('[role="menu"]').exists()).toBe(false)
		expect(editItem().exists()).toBe(false)
		expect(editButton()).toBeUndefined()
	})

	it("does not open the editor for a cashier, whatever calls it", async () => {
		await floorPlan({ manage_floor: false })

		await wrapper.vm.toggleEditMode()

		expect(wrapper.vm.isEditMode).toBe(false)
	})

	it("offers no way in while the server has not said what the user may manage", async () => {
		await floorPlan(undefined)

		expect(more().exists()).toBe(false)
		expect(editButton()).toBeUndefined()
		await wrapper.vm.toggleEditMode()
		expect(wrapper.vm.isEditMode).toBe(false)
	})
})
