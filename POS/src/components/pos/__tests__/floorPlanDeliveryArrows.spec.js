/**
 * //// Neoffice — added file (no upstream equivalent). A delivery arrow from a station of ANOTHER room leaves from the top
 * //// of the plan, under the chip of its station in the line above (NeoRestau lot 1, Ruling 48). Its start was a guess
 * //// (16 + index x 130 + 65 px) that assumed the chips sat at the left; the line puts them at the right, in one row or
 * //// wrapped, so each chip is measured instead: its centre, from the left edge of the plan, measured again when the
 * //// window or the line is resized and, while an arrow from another room is drawn (the only one that needs the chips), after
 * //// a render. A render with no such arrow reads nothing from the layout.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const runnerOrders = vi.hoisted(() => ({ list: [] }))
// What the browser would say of the elements, set by each test (jsdom has no layout)
const boxes = vi.hoisted(() => ({ canvas: null, chips: {} }))
// The plan's view, as the gestures hold it
const view = vi.hoisted(() => ({ zoom: null, panX: null, panY: null }))

vi.hoisted(() => {
	globalThis.__ = (text, args = []) =>
		args.reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: { template: "<div />" },
}))
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method) =>
		String(method).endsWith("get_runner_orders") ? runnerOrders.list : [],
	),
}))
vi.mock("@/socket", () => ({ initSocket: () => null }))
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
	useCanvasGestures: () => {
		view.zoom = ref(1)
		view.panX = ref(0)
		view.panY = ref(0)
		return {
			zoomLevel: view.zoom,
			panX: view.panX,
			panY: view.panY,
			transformStyle: ref({}),
			zoomIn: vi.fn(),
			zoomOut: vi.fn(),
			zoomReset: vi.fn(),
			resetPan: vi.fn(),
			cleanup: vi.fn(),
		}
	},
}))
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => restaurantStore,
}))
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

const ROOM_1 = { name: "r0o1m2h3a4", area_name: "Room 1" }
const ROOM_2 = { name: "r0o2m2h3a4", area_name: "Room 2" }
// The bar and the kitchen are in room 1; the table that is served is in room 2, so the arrows are cross-room ones
const BAR = {
	name: "b4rh4sh0f4",
	station_name: "Bar",
	area: ROOM_1.name,
	color: "#2C4FA8",
}
const KITCHEN = {
	name: "k1tch3nh4s",
	station_name: "Kitchen",
	area: ROOM_1.name,
	color: "#d68a59",
}
const TABLE = {
	name: "t4bl3h4sh0",
	table_name: "T7",
	area: ROOM_2.name,
	status: "Occupied",
	capacity: 4,
	shape: "Square",
	pos_x: 200,
	pos_y: 120,
	width: 100,
	height: 100,
}
// A station of the room that is shown: its arrow is the room's own, not one from another room
const OWN_STATION = {
	name: "0wnst4t10n",
	station_name: "Pass",
	area: ROOM_2.name,
	color: "#16A34A",
	pos_x: 700,
	pos_y: 300,
	width: 120,
	height: 60,
}
const READY = [
	{
		restaurant_table: TABLE.name,
		items: [
			{ preparation_station: BAR.name },
			{ preparation_station: KITCHEN.name },
		],
	},
]

const rect = ({ left = 0, top = 0, width = 0, height = 0 }) => ({
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

// The plan starts 100 px from the left of the window; the line above holds the chips where its layout puts them
const THE_PLAN = { left: 100, top: 100, width: 800, height: 400 }
const CHIPS_AT_THE_RIGHT = {
	Bar: { left: 560, top: 105, width: 80, height: 32 },
	Kitchen: { left: 650, top: 105, width: 120, height: 32 },
}

function theStore() {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas: [ROOM_1, ROOM_2],
		tables: [TABLE],
		floorStations: [BAR, KITCHEN],
		takeawayEnabled: false,
		runnerEnabled: true,
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

describe("a delivery arrow from a station of another room leaves from under its chip", () => {
	let wrapper
	let boundingBox

	async function floorPlan(overrides = {}) {
		theStore()
		Object.assign(restaurantStore, overrides)
		// The table served is in room 2: that is the room shown
		localStorage.setItem("pos_selected_area", ROOM_2.name)
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	// The start of each arrow, in the plan's own pixels: the guide line of each arrow is the first thing it draws
	const starts = () =>
		wrapper
			.findAll("svg line")
			.map((line) => [
				Number(line.attributes("x1")),
				Number(line.attributes("y1")),
			])
	const resized = async () => {
		window.dispatchEvent(new Event("resize"))
		await flushPromises()
	}

	beforeEach(() => {
		localStorage.clear()
		runnerOrders.list = READY
		boxes.canvas = THE_PLAN
		boxes.chips = { ...CHIPS_AT_THE_RIGHT }
		boundingBox = vi
			.spyOn(Element.prototype, "getBoundingClientRect")
			.mockImplementation(function () {
				if (this.matches?.('[data-test="floor-canvas"]'))
					return rect(boxes.canvas)
				if (this.matches?.('[data-test="station-chip"]')) {
					const name = this.querySelector(".font-semibold").textContent.trim()
					return rect(boxes.chips[name] || {})
				}
				return rect({})
			})
	})
	afterEach(() => {
		wrapper?.unmount()
		boundingBox.mockRestore()
		vi.unstubAllGlobals()
	})

	it("starts under the centre of each chip, from the left edge of the plan, at its top edge", async () => {
		await floorPlan()

		// Room 2 is shown, so the bar and the kitchen of room 1 are two arrows to the table T7
		expect(wrapper.findAll('[data-test="station-chip"]')).toHaveLength(2)
		// Bar: (560 + 40) - 100 = 500. Kitchen: (650 + 60) - 100 = 610. The top edge of the plan is y = 0
		expect(starts()).toEqual([
			[500, 0],
			[610, 0],
		])
	})

	it("is not the guess of 16 + index x 130 + 65 px of a line whose chips were at the left", async () => {
		await floorPlan()

		const guesses = [16 + 0 * 130 + 65, 16 + 1 * 130 + 65]
		expect(starts().map(([x]) => x)).not.toEqual(guesses)
	})

	it("follows the chip when the window is resized and the line puts it elsewhere", async () => {
		await floorPlan()
		expect(starts()[0][0]).toBe(500)

		boxes.chips = {
			Bar: { left: 300, top: 105, width: 80, height: 32 },
			Kitchen: { left: 400, top: 105, width: 120, height: 32 },
		}
		await resized()

		// (300 + 40) - 100 = 240, (400 + 60) - 100 = 360
		expect(starts()).toEqual([
			[240, 0],
			[360, 0],
		])
	})

	it("follows the chip when the line wraps: it watches the line and its right-hand group", async () => {
		const watchers = []
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback) {
					this.callback = callback
					this.targets = []
					this.disconnected = false
					watchers.push(this)
				}
				observe(element) {
					this.targets.push(element)
				}
				disconnect() {
					this.disconnected = true
				}
			},
		)
		await floorPlan()
		const line = wrapper.find('[data-test="floor-line"]').element
		const actions = wrapper.find('[data-test="floor-actions"]').element
		expect(watchers).toHaveLength(1)
		expect(watchers[0].targets).toEqual(expect.arrayContaining([line, actions]))
		expect(starts()[0][0]).toBe(500)

		// The line wraps: the chips go down a row and to the left
		boxes.chips = {
			Bar: { left: 420, top: 141, width: 80, height: 32 },
			Kitchen: { left: 510, top: 141, width: 120, height: 32 },
		}
		watchers[0].callback([], watchers[0])
		await flushPromises()

		expect(starts()).toEqual([
			[360, 0],
			[470, 0],
		])

		wrapper.unmount()
		wrapper = null
		expect(watchers[0].disconnected).toBe(true)
	})

	it("follows the pan and the zoom of the plan: the arrow stays under its chip on the screen", async () => {
		await floorPlan()

		view.panX.value = 40
		view.panY.value = 20
		view.zoom.value = 2
		await flushPromises()

		// The plan is drawn translate(pan) scale(zoom): the chip's 500 px and the plan's top edge, in the plan's own pixels
		expect(starts()).toEqual([
			[(500 - 40) / 2, (0 - 20) / 2],
			[(610 - 40) / 2, (0 - 20) / 2],
		])
	})

	it("keeps the guess until a chip has a place, then measures it", async () => {
		boxes.chips = {}
		await floorPlan()
		// Nothing to measure yet: the guess stands in
		expect(starts()).toEqual([
			[81, 0],
			[211, 0],
		])

		boxes.chips = { ...CHIPS_AT_THE_RIGHT }
		await resized()

		expect(starts()).toEqual([
			[500, 0],
			[610, 0],
		])
	})

	it("keeps the old guess where there is no chip to measure: the editor hides them", async () => {
		await floorPlan()
		expect(starts()[0][0]).toBe(500)

		await wrapper.vm.toggleEditMode()
		await flushPromises()

		expect(wrapper.find('[data-test="station-chip"]').exists()).toBe(false)
		// 16 + 0 x 130 + 65 and 16 + 1 x 130 + 65, as before
		expect(starts()).toEqual([
			[81, 0],
			[211, 0],
		])
	})

	it("keeps the old guess for a chip that has no width, which is not laid out", async () => {
		boxes.chips = {
			Bar: { left: 0, top: 0, width: 0, height: 0 },
			Kitchen: { ...CHIPS_AT_THE_RIGHT.Kitchen },
		}
		await floorPlan()

		// The kitchen is measured, the bar is not
		expect(starts()).toEqual([
			[81, 0],
			[610, 0],
		])
	})

	it("settles: measuring again changes nothing and does not render again", async () => {
		await floorPlan()
		const settled = boundingBox.mock.calls.length

		await resized()
		const afterOne = boundingBox.mock.calls.length
		await resized()
		const afterTwo = boundingBox.mock.calls.length

		// Each measure reads the plan and the chips, once: no loop of renders and measures
		expect(afterTwo - afterOne).toBe(afterOne - settled)
		expect(afterOne - settled).toBeLessThanOrEqual(3)
		expect(starts()).toEqual([
			[500, 0],
			[610, 0],
		])
	})

	it("reads nothing from the layout while the editor renders: no chip to measure, none known", async () => {
		await floorPlan()
		await wrapper.vm.toggleEditMode()
		await flushPromises()
		const settled = boundingBox.mock.calls.length

		// A drag in the editor renders the plan at each frame: here, a change of the walls' opacity
		wrapper.vm.wallOpacity = 0.5
		await flushPromises()
		wrapper.vm.wallOpacity = 0.7
		await flushPromises()

		expect(boundingBox.mock.calls.length).toBe(settled)
	})

	describe("the chips are measured for the arrows that need them", () => {
		// The plan is panned a few pixels at a time, as a finger does: a render for each frame
		const panFrames = async (frames = 5) => {
			for (let frame = 1; frame <= frames; frame++) {
				view.panX.value = frame * 3
				await flushPromises()
			}
		}

		it("reads nothing from the layout after a render while there is no arrow at all", async () => {
			runnerOrders.list = []
			await floorPlan()
			const settled = boundingBox.mock.calls.length

			await panFrames()

			expect(boundingBox.mock.calls.length).toBe(settled)
		})

		it("reads nothing either while the only arrow is one of the room's own station", async () => {
			runnerOrders.list = [
				{
					restaurant_table: TABLE.name,
					items: [{ preparation_station: OWN_STATION.name }],
				},
			]
			await floorPlan({ floorStations: [BAR, KITCHEN, OWN_STATION] })
			expect(wrapper.findAll("svg line")).toHaveLength(1)
			const settled = boundingBox.mock.calls.length

			await panFrames()

			expect(boundingBox.mock.calls.length).toBe(settled)
		})

		it("measures after a render while an arrow comes from another room: a chip may have moved", async () => {
			await floorPlan()
			const settled = boundingBox.mock.calls.length

			await panFrames()

			expect(boundingBox.mock.calls.length).toBeGreaterThan(settled)
		})

		it("measures an arrow that appears, at once: it is drawn under its chip", async () => {
			runnerOrders.list = []
			await floorPlan()
			expect(starts()).toEqual([])

			// The dishes are ready: the pass tells the plan
			wrapper.vm.runnerOrders = READY
			await flushPromises()

			expect(starts()).toEqual([
				[500, 0],
				[610, 0],
			])
		})

		it("still measures when the window is resized and the line wraps, with no arrow yet", async () => {
			runnerOrders.list = []
			await floorPlan()
			boxes.chips = {
				Bar: { left: 300, top: 105, width: 80, height: 32 },
				Kitchen: { left: 400, top: 105, width: 120, height: 32 },
			}

			await resized()
			wrapper.vm.runnerOrders = READY
			await flushPromises()

			expect(starts()).toEqual([
				[240, 0],
				[360, 0],
			])
		})
	})

	describe("the time an arrow takes", () => {
		const duration = () => wrapper.find("animateMotion").attributes("dur")
		const quarters = (dur) => Number.parseFloat(dur) * 4

		it("is the same while the plan is panned a few pixels: it is told in quarters of a second, not rewritten at each frame", async () => {
			await floorPlan()
			const durations = []

			for (let frame = 0; frame <= 8; frame++) {
				view.panX.value = frame * 2
				await flushPromises()
				durations.push(duration())
			}

			// The length of the arrow changes with the pan (its start stays under its chip): its time does not follow it pixel by pixel
			for (const dur of durations)
				expect(quarters(dur)).toBe(Math.round(quarters(dur)))
			expect(new Set(durations).size).toBeLessThanOrEqual(2)
		})

		it("is still longer for a longer arrow, and no shorter than three seconds", async () => {
			await floorPlan()
			const near = Number.parseFloat(duration())

			// The plan is zoomed out: the arrow, in the plan's own pixels, is much longer
			view.zoom.value = 0.5
			await flushPromises()
			const far = Number.parseFloat(duration())

			expect(near).toBeGreaterThanOrEqual(3)
			expect(far).toBeGreaterThan(near)
		})

		it("is told in quarters of a second for the arrow of a room's own station as well", async () => {
			runnerOrders.list = [
				{
					restaurant_table: TABLE.name,
					items: [{ preparation_station: OWN_STATION.name }],
				},
			]
			await floorPlan({ floorStations: [BAR, KITCHEN, OWN_STATION] })

			expect(quarters(duration())).toBe(Math.round(quarters(duration())))
			expect(Number.parseFloat(duration())).toBeGreaterThan(3)
		})
	})

	it("stops listening to the window once the plan is gone", async () => {
		const removed = vi.spyOn(window, "removeEventListener")
		await floorPlan()

		wrapper.unmount()
		wrapper = null

		expect(removed.mock.calls.map(([type]) => type)).toContain("resize")
		removed.mockRestore()
	})
})
