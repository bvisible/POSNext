/**
 * //// Neoffice — added file (no upstream equivalent). The floor plan opens the kitchen screen, the pass and the
 * //// takeaway counter in tabs of their own (NeoRestau lot 1, task 2). A new tab has no till settings loaded yet,
 * //// so each of them is told the till's restaurant in its address.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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

const STATION = { name: "h4sh0f4stn", station_name: "Kitchen", area: "r0o1m2h3a4", color: "#d68a59" }

function theStore(tillRestaurant) {
	Object.assign(restaurantStore, {
		tillRestaurant,
		areas: [{ name: "r0o1m2h3a4", area_name: "Room 1" }],
		tables: [],
		floorStations: [STATION],
		takeawayEnabled: true,
		runnerEnabled: true,
		takeawayOrders: [],
		occupiedCountByArea: {},
		totalOccupiedCount: 0,
		hasCardWarning: false,
		restaurantStatus: { warning: null },
		defaultArea: null,
		ofTheRestaurant: () => ({ restaurant: tillRestaurant }),
		fetchFromNetwork: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
	})
}

describe("the tabs the floor plan opens are told the restaurant of the till", () => {
	let open
	let wrapper

	async function floorPlan(tillRestaurant) {
		theStore(tillRestaurant)
		wrapper = mount(FloorPlanEditor, {
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	beforeEach(() => {
		open = vi.spyOn(window, "open").mockImplementation(() => null)
	})
	afterEach(() => {
		wrapper?.unmount()
		open.mockRestore()
	})

	it("opens the kitchen screen of a station on the till's restaurant", async () => {
		await floorPlan("The Bistro")

		await wrapper.findAll("span.font-semibold").find((el) => el.text() === "Kitchen").trigger("click")

		expect(open).toHaveBeenCalledWith("/pos/kds?station=h4sh0f4stn&restaurant=The%20Bistro", "_blank")
	})

	it("opens the pass on the till's restaurant", async () => {
		await floorPlan("The Bistro")

		await wrapper.findAll("div").find((el) => el.text().startsWith("Runner")).trigger("click")

		expect(open).toHaveBeenCalledWith("/pos/runner?restaurant=The%20Bistro", "_blank")
	})

	it("opens the takeaway counter on the till's restaurant", async () => {
		await floorPlan("The Bistro")

		await wrapper.findAll("span").find((el) => el.text() === "0/0").trigger("click")

		expect(open).toHaveBeenCalledWith("/pos/takeaway?restaurant=The%20Bistro", "_blank")
	})

	it("opens the pages with no restaurant while the till's settings do not name one", async () => {
		await floorPlan(undefined)

		await wrapper.findAll("span.font-semibold").find((el) => el.text() === "Kitchen").trigger("click")
		await wrapper.findAll("div").find((el) => el.text().startsWith("Runner")).trigger("click")
		await wrapper.findAll("span").find((el) => el.text() === "0/0").trigger("click")

		expect(open.mock.calls.map(([url]) => url)).toEqual([
			"/pos/kds?station=h4sh0f4stn",
			"/pos/runner",
			"/pos/takeaway",
		])
	})
})
