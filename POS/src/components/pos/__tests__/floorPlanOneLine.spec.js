/**
 * //// Neoffice — added file (no upstream equivalent). The top of the floor plan is ONE line (NeoRestau lot 1, Ruling 48):
 * //// the room tabs on the left, the station chips and the Runner pill on the right, with the look of the line the
 * //// runner and the kitchen screen share (RoomStationFilterLine: chips 32 px high, a line of 41 px, Ruling 44). It was
 * //// two rows of 49 and 39 px, and an Edit button that was too easy to hit. The tabs, the chips and the pills keep what
 * //// they did and showed; the way into the editor moved to the « ⋯ » menu (floorPlanMenu.spec.js).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
const runnerOrders = vi.hoisted(() => ({ list: [] }))

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

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")
const { default: RoomStationFilterLine } = await import(
	"@/components/restaurant/RoomStationFilterLine.vue"
)

// Three rooms, a bar and a kitchen: what the product owner sees on osiris
const ROOMS = [
	{ name: "r0o1m2h3a4", area_name: "Room 1" },
	{ name: "r0o2m2h3a4", area_name: "Room 2" },
	{ name: "t3rr4c3h4s", area_name: "Terrace" },
]
const BAR = {
	name: "b4rh4sh0f4",
	station_name: "Bar",
	area: "r0o1m2h3a4",
	color: "#2C4FA8",
}
const KITCHEN = {
	name: "k1tch3nh4s",
	station_name: "Kitchen",
	area: "r0o1m2h3a4",
	color: "#d68a59",
}
const FAR_STATION = {
	name: "p4str1h4sh",
	station_name: "Pastry",
	area: "r0o2m2h3a4",
	color: "#6B7280",
}
// Two dishes of the kitchen are ready for the pass
const TWO_READY = [
	{
		restaurant_table: "t4bl3h4sh0",
		items: [
			{ preparation_station: KITCHEN.name },
			{ preparation_station: KITCHEN.name },
		],
	},
]

function theStore(overrides = {}) {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas: ROOMS,
		tables: [],
		floorStations: [BAR, KITCHEN],
		takeawayEnabled: false,
		runnerEnabled: true,
		takeawayOrders: [],
		occupiedCountByArea: { r0o1m2h3a4: 1 },
		totalOccupiedCount: 1,
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
		...overrides,
	})
}

describe("the top of the floor plan is one line", () => {
	let wrapper
	let open

	async function floorPlan(overrides) {
		theStore(overrides)
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	const line = () => wrapper.find('[data-test="floor-line"]')
	const rooms = () => line().find('[data-test="floor-rooms"]')
	const actions = () => line().find('[data-test="floor-actions"]')
	const texts = (list) => list.map((el) => el.text().replace(/\s+/g, " "))

	beforeEach(() => {
		localStorage.clear()
		runnerOrders.list = TWO_READY
		open = vi.spyOn(window, "open").mockImplementation(() => null)
	})
	afterEach(() => {
		wrapper?.unmount()
		open.mockRestore()
	})

	it("holds the room tabs on the left and the station chips with the Runner pill on the right", async () => {
		await floorPlan()

		expect(wrapper.findAll('[data-test="floor-line"]')).toHaveLength(1)
		const groups = [...line().element.children].map(
			(group) => group.dataset.test,
		)
		expect(groups).toEqual(["floor-rooms", "floor-actions"])
		expect(texts(rooms().findAll('[data-test="room-tab"]'))).toEqual([
			"Room 1 1",
			"Room 2",
			"Terrace",
		])
		// The stations and the pills are in the line, on the right: there is no row of their own any more
		const chips = actions().findAll('[data-test="station-chip"]')
		expect(chips.map((chip) => chip.find(".font-semibold").text())).toEqual([
			"Bar",
			"Kitchen",
		])
		expect(chips[1].text()).toContain("2✓")
		expect(actions().find('[data-test="runner-pill"]').exists()).toBe(true)
		expect(rooms().find('[data-test="station-chip"]').exists()).toBe(false)
		expect(rooms().find('[data-test="runner-pill"]').exists()).toBe(false)
		// Nothing else carries a border above the canvas: the plan's header is this line and nothing under it
		expect(wrapper.findAll(".border-b")).toHaveLength(1)
	})

	it("is a flex row that wraps only when the width falls short, with the right side kept to the right edge", async () => {
		await floorPlan()

		const classes = line().classes()
		expect(classes).toEqual(
			expect.arrayContaining([
				"flex",
				"flex-wrap",
				"justify-between",
				"items-center",
			]),
		)
		expect(classes).not.toContain("flex-col")
		// No sideways scroller, in the line or in its groups: a menu hanging from the line would be cut by one
		for (const group of [line(), rooms(), actions()])
			expect(group.classes()).not.toContain("overflow-x-auto")
		expect(actions().classes()).toEqual(
			expect.arrayContaining(["ml-auto", "justify-end"]),
		)
	})

	it("is as short as the line of the runner and the kitchen: chips 32 px high, a line of 41 px", async () => {
		await floorPlan({ takeawayEnabled: true })

		const chips = [
			...rooms().findAll('[data-test="room-tab"]'),
			...actions().findAll('[data-test="station-chip"]'),
			actions().find('[data-test="runner-pill"]'),
			actions().find('[data-test="takeaway-pill"]'),
		]
		expect(chips).toHaveLength(7)
		for (const chip of chips) expect(chip.classes()).toContain("h-8")
		// The line adds 4 px above and below its chips and one border: 32 + 2 x 4 + 1, it was 49 + 39
		const px = (list, prefix) =>
			list
				.filter((token) => new RegExp(`^${prefix}-\\d+$`).test(token))
				.map((token) => Number(token.split("-")[1]) * 4)[0]
		expect(
			px(chips[0].classes(), "h") + 2 * px(line().classes(), "py") + 1,
		).toBe(41)
		expect(line().classes()).toContain("border-b")
	})

	it("gives its chips the size and the room of the shared line, so that the two cannot drift apart", async () => {
		await floorPlan()
		const shared = mount(RoomStationFilterLine, {
			props: {
				rooms: [{ name: "r", label: "Room" }],
				stations: [{ name: "s", label: "Bar", color: "#2C4FA8" }],
			},
			global: { mocks: { __: globalThis.__ } },
		})
		// What makes a chip a chip (its height, its text, its shape), not what colours it, nor the padding at its sides: the plan
		// keeps 12 px where the shared line has 16, so that its three rooms, two stations and both pills fit one row at 1366
		const geometry = (classes) =>
			classes.filter(
				(token) => !/^(bg-|text-(white|gray)|hover:|dark:|px-)/.test(token),
			)
		const sharedChip = geometry(
			shared.find('[data-test="rooms"] button').classes(),
		)
		const sharedLine = geometry(
			shared.find('[data-test="filter-line"]').classes(),
		)
		const sharedGroup = geometry(shared.find('[data-test="rooms"]').classes())

		expect(sharedChip).toEqual(
			expect.arrayContaining(["h-8", "text-sm", "rounded-lg"]),
		)
		for (const tab of rooms().findAll('[data-test="room-tab"]')) {
			expect(tab.classes()).toEqual(expect.arrayContaining(sharedChip))
			expect(tab.classes()).toContain("px-3")
		}
		// The station chips and the pills keep their own weight and padding, and the size and the height of a chip
		for (const chip of [
			...actions().findAll('[data-test="station-chip"]'),
			actions().find('[data-test="runner-pill"]'),
		]) {
			expect(chip.classes()).toEqual(
				expect.arrayContaining([
					"h-8",
					"text-sm",
					"rounded-lg",
					"items-center",
					"gap-1.5",
				]),
			)
		}
		expect(line().classes()).toEqual(expect.arrayContaining(sharedLine))
		expect(rooms().classes()).toEqual(expect.arrayContaining(sharedGroup))
		expect(actions().classes()).toEqual(expect.arrayContaining(sharedGroup))
		shared.unmount()
	})

	it("keeps the room tabs: a tap switches the plan, the red badge counts the occupied tables", async () => {
		await floorPlan()

		expect(wrapper.vm.selectedArea).toBe("r0o1m2h3a4")
		const [first, second] = rooms().findAll('[data-test="room-tab"]')
		expect(first.classes()).toContain("bg-blue-100")
		expect(second.classes()).not.toContain("bg-blue-100")
		const badge = first.find("span")
		expect(badge.text()).toBe("1")
		expect(badge.classes()).toEqual(
			expect.arrayContaining(["bg-red-500", "rounded-full"]),
		)
		expect(second.find("span").exists()).toBe(false)

		await second.trigger("click")

		expect(wrapper.vm.selectedArea).toBe("r0o2m2h3a4")
		expect(rooms().findAll('[data-test="room-tab"]')[1].classes()).toContain(
			"bg-blue-100",
		)
		expect(
			rooms().findAll('[data-test="room-tab"]')[0].classes(),
		).not.toContain("bg-blue-100")
	})

	it("keeps the station chips: their colour, the counts, the dashed chip of a station of another room, and what a tap opens", async () => {
		await floorPlan({ floorStations: [BAR, KITCHEN, FAR_STATION] })

		const [bar, kitchen, pastry] = actions().findAll(
			'[data-test="station-chip"]',
		)
		// A station of the room shown: a solid border and a tint in its own colour
		expect(bar.attributes("style")).toContain("border-color: rgb(44, 79, 168)")
		expect(bar.classes()).toContain("border-2")
		expect(kitchen.attributes("style")).toContain(
			"border-color: rgb(214, 138, 89)",
		)
		// The dishes ready at the kitchen, in green and pulsing
		const ready = kitchen.findAll("span").find((el) => el.text() === "2✓")
		expect(ready.classes()).toContain("animate-pulse")
		expect(ready.attributes("style")).toContain("color: rgb(22, 163, 74)")
		// A station of another room: dashed, faded, and it says which room
		expect(pastry.classes()).toEqual(
			expect.arrayContaining(["border-dashed", "opacity-60"]),
		)
		expect(pastry.text()).toContain("(Room 2)")

		await kitchen.trigger("click")
		expect(open).toHaveBeenCalledWith(
			"/pos/kds?station=k1tch3nh4s&restaurant=The%20Bistro",
			"_blank",
		)
	})

	it("keeps the Runner pill: green with the dishes ready, grey without, and it opens the pass", async () => {
		await floorPlan()

		const pill = actions().find('[data-test="runner-pill"]')
		expect(pill.text()).toBe("Runner 2")
		expect(pill.classes()).toEqual(
			expect.arrayContaining(["bg-green-500", "text-white"]),
		)
		await pill.trigger("click")
		expect(open).toHaveBeenCalledWith(
			"/pos/runner?restaurant=The%20Bistro",
			"_blank",
		)

		wrapper.unmount()
		runnerOrders.list = []
		await floorPlan()
		const idle = actions().find('[data-test="runner-pill"]')
		expect(idle.text()).toBe("Runner 0")
		expect(idle.classes()).toEqual(
			expect.arrayContaining(["border", "text-gray-400"]),
		)
		expect(idle.classes()).not.toContain("bg-green-500")
	})

	it("keeps the Takeaway pill, after the Runner pill, and it starts a takeaway", async () => {
		await floorPlan({
			takeawayEnabled: true,
			takeawayOrders: [{ kds_status: "Ready" }, { kds_status: "Pending" }],
		})

		const pills = actions().findAll(
			'[data-test="runner-pill"], [data-test="takeaway-pill"]',
		)
		expect(pills.map((pill) => pill.attributes("data-test"))).toEqual([
			"runner-pill",
			"takeaway-pill",
		])
		expect(pills[1].text()).toBe("Takeaway 1/2")
		expect(pills[1].classes()).toContain("bg-blue-500")

		await pills[1].trigger("click")
		expect(wrapper.emitted("start-takeaway")).toHaveLength(1)
	})

	it("shows no pill without its setting, and nothing of the stations without a station, as before", async () => {
		await floorPlan({ runnerEnabled: false, takeawayEnabled: false })
		expect(actions().find('[data-test="runner-pill"]').exists()).toBe(false)
		expect(actions().find('[data-test="takeaway-pill"]').exists()).toBe(false)
		expect(actions().findAll('[data-test="station-chip"]')).toHaveLength(2)

		wrapper.unmount()
		await floorPlan({ floorStations: [] })
		// The pills belong to the station bar, as they always did: no station, no pill
		expect(actions().find('[data-test="station-chip"]').exists()).toBe(false)
		expect(actions().find('[data-test="runner-pill"]').exists()).toBe(false)
	})

	it("says Floor Plan on the left while the restaurant has a single room", async () => {
		await floorPlan({ areas: [ROOMS[0]] })

		expect(wrapper.findAll('[data-test="room-tab"]')).toHaveLength(0)
		expect(rooms().text()).toBe("Floor Plan")
		// The line keeps its height with nothing but a label in it
		expect(rooms().find("div").classes()).toContain("h-8")
	})

	it("has no Edit button on the line any more", async () => {
		await floorPlan()

		const buttons = line()
			.findAll("button")
			.map((button) => button.text())
		expect(buttons).not.toContain("Edit")
		expect(buttons).not.toContain("Save")
		expect(buttons).not.toContain("Cancel")
	})

	it("shows what the editor needs while it is open: the tabs to lay out and Save and Cancel, no station", async () => {
		await floorPlan()
		await wrapper.vm.toggleEditMode()
		await flushPromises()

		expect(wrapper.vm.isEditMode).toBe(true)
		// Still one line, with the room tabs that can be dragged and the buttons that manage the rooms
		expect(wrapper.findAll('[data-test="floor-line"]')).toHaveLength(1)
		expect(
			rooms()
				.findAll('[data-test="room-tab"]')
				.every((tab) => tab.attributes("draggable") === "true"),
		).toBe(true)
		expect(rooms().find('[title="Rename area"]').exists()).toBe(true)
		expect(rooms().find('[title="Delete area"]').exists()).toBe(true)
		expect(rooms().find('[title="Add Area"]').exists()).toBe(true)
		// Save and Cancel are on the right, as they were; the stations and the pills are not shown while editing
		expect(texts(actions().findAll("button"))).toEqual(["Save", "Cancel"])
		expect(actions().find('[data-test="station-chip"]').exists()).toBe(false)
		expect(actions().find('[data-test="runner-pill"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="floor-line-more"]').exists()).toBe(false)
	})

	it("saves the plan with Save, and leaves the editor", async () => {
		await floorPlan()
		await wrapper.vm.toggleEditMode()
		await flushPromises()

		await actions()
			.findAll("button")
			.find((button) => button.text() === "Save")
			.trigger("click")
		await flushPromises()

		expect(restaurantStore.saveAllPositions).toHaveBeenCalledTimes(1)
		expect(wrapper.vm.isEditMode).toBe(false)
		expect(actions().find('[data-test="station-chip"]').exists()).toBe(true)
	})
})
