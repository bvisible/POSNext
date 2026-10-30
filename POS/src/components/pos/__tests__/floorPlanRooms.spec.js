/**
 * //// Neoffice — added file (no upstream equivalent). In the floor plan's editor the add-room action is always there,
 * //// whatever the number of rooms (NeoRestau lot 1, Ruling 48). The room group, add button included, used to be drawn
 * //// only when the plan had more than one room: a restaurant with one room, or none, could not add the next one from the
 * //// plan. Renaming and deleting stay with several rooms, so the last room still cannot be deleted from the plan.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
// The store the component reads is reactive, as Pinia's is: a room the fake server creates shows up as a tab
const live = vi.hoisted(() => ({ store: null }))
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
vi.mock("@/stores/restaurant", async () => {
	const { reactive } = await import("vue")
	live.store = reactive(restaurantStore)
	return { useRestaurantStore: () => live.store }
})
vi.mock("@/stores/posCart", () => ({ usePOSCartStore: () => ({}) }))
vi.mock("@/stores/posDrafts", () => ({ usePOSDraftsStore: () => ({}) }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till" }),
}))

const { default: FloorPlanEditor } = await import("../FloorPlanEditor.vue")

const ROOM_1 = { name: "r0o1m2h3a4", area_name: "Room 1" }
const ROOM_2 = { name: "r0o2m2h3a4", area_name: "Room 2" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
const MADE = { name: "n3wr00mh4s", area_name: "Main Hall" }

function theStore(areas) {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas,
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
		// The server's answers: a room made is answered as the server does, and the plan reads it again
		createArea: vi.fn(async (name) => {
			const made = { ...MADE, area_name: name }
			live.store.areas = [...live.store.areas, made]
			return made
		}),
		deleteArea: vi.fn(async (name) => {
			live.store.areas = live.store.areas.filter((area) => area.name !== name)
		}),
	})
}

describe("the editor's add-room action", () => {
	let wrapper

	async function floorPlan(areas, { editing = true } = {}) {
		theStore(areas)
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		if (editing) {
			await wrapper.vm.toggleEditMode()
			await flushPromises()
		}
	}

	const rooms = () => wrapper.find('[data-test="floor-rooms"]')
	const addRoom = () => wrapper.find('[data-test="add-room"]')
	const renameRoom = () => wrapper.find('[title="Rename area"]')
	const deleteRoom = () => wrapper.find('[title="Delete area"]')
	const tabs = () => wrapper.findAll('[data-test="room-tab"]')

	beforeEach(() => {
		localStorage.clear()
		for (const notice of Object.values(toast)) notice.mockClear()
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	describe("is there, whatever the number of rooms", () => {
		it.each([
			["no room", []],
			["one room", [ROOM_1]],
			["two rooms", [ROOM_1, ROOM_2]],
			["three rooms", [ROOM_1, ROOM_2, TERRACE]],
		])("with %s, in edit mode", async (_label, areas) => {
			await floorPlan(areas)

			expect(addRoom().exists()).toBe(true)
			expect(addRoom().attributes("title")).toBe("Add Area")
		})

		it.each([
			["no room", []],
			["one room", [ROOM_1]],
			["two rooms", [ROOM_1, ROOM_2]],
		])("with %s, but only in edit mode", async (_label, areas) => {
			await floorPlan(areas, { editing: false })

			expect(addRoom().exists()).toBe(false)
		})

		it("opens the dialog that names the new room", async () => {
			await floorPlan([ROOM_1])
			expect(wrapper.vm.showAddAreaDialog).toBe(false)

			await addRoom().trigger("click")

			expect(wrapper.vm.showAddAreaDialog).toBe(true)
		})

		it("is the last thing of the rooms, after the tabs and what manages them, with several rooms", async () => {
			await floorPlan([ROOM_1, ROOM_2])

			const group = rooms().element
			expect(group.lastElementChild).toBe(addRoom().element)
			// The tabs come first, then rename and delete, then add: as it always was
			const order = [...group.children].map(
				(el) => el.dataset.test || el.getAttribute("title"),
			)
			expect(order).toEqual([
				"room-tab",
				"room-tab",
				"Rename area",
				"Delete area",
				"add-room",
			])
		})

		it("sits beside the Floor Plan label when there is no tab to put it after", async () => {
			await floorPlan([ROOM_1])

			expect(tabs()).toHaveLength(0)
			expect(rooms().text()).toBe("Floor Plan")
			expect(
				[...rooms().element.children].map((el) => el.dataset.test || "label"),
			).toEqual(["label", "add-room"])
		})

		it("is a button of the size the others of the group have, in the green of an addition", async () => {
			await floorPlan([ROOM_1])

			expect(addRoom().classes()).toEqual(
				expect.arrayContaining([
					"w-7",
					"h-7",
					"bg-green-100",
					"text-green-700",
				]),
			)
			expect(addRoom().attributes("type")).toBe("button")
		})
	})

	describe("the last room cannot be deleted from the plan", () => {
		it.each([
			["no room", []],
			["one room", [ROOM_1]],
		])(
			"with %s, there is no delete button and no rename button",
			async (_label, areas) => {
				await floorPlan(areas)

				expect(deleteRoom().exists()).toBe(false)
				expect(renameRoom().exists()).toBe(false)
			},
		)

		it("refuses to open the delete dialog for the only room, whoever asks", async () => {
			await floorPlan([ROOM_1])

			wrapper.vm.openDeleteAreaDialog(ROOM_1)
			await flushPromises()

			expect(wrapper.vm.showDeleteAreaDialog).toBe(false)
			expect(wrapper.vm.areaToDelete).toBe(null)
		})

		it("offers rename and delete again with a second room, for the room shown", async () => {
			await floorPlan([ROOM_1, ROOM_2])

			expect(renameRoom().exists()).toBe(true)
			expect(deleteRoom().exists()).toBe(true)
			await deleteRoom().trigger("click")
			expect(wrapper.vm.showDeleteAreaDialog).toBe(true)
			expect(wrapper.vm.areaToDelete).toEqual(ROOM_1)
		})

		it("loses the delete button when a room is deleted down to the last one, and keeps the add button", async () => {
			await floorPlan([ROOM_1, ROOM_2])
			wrapper.vm.openDeleteAreaDialog(ROOM_2)

			await wrapper.vm.handleDeleteArea()
			await flushPromises()

			expect(restaurantStore.deleteArea).toHaveBeenCalledWith(ROOM_2.name)
			expect(tabs()).toHaveLength(0)
			expect(deleteRoom().exists()).toBe(false)
			expect(addRoom().exists()).toBe(true)
		})
	})

	describe("adding a room", () => {
		it("makes the first room of a plan that had none, and shows it, so that its tables and walls have somewhere to go", async () => {
			await floorPlan([])
			expect(wrapper.vm.selectedArea).toBe(null)

			wrapper.vm.newAreaName = "Main Hall"
			await wrapper.vm.handleAddArea()
			await flushPromises()

			expect(restaurantStore.createArea).toHaveBeenCalledWith("Main Hall")
			expect(wrapper.vm.selectedArea).toBe(MADE.name)
			expect(wrapper.vm.showAddAreaDialog).toBe(false)
			expect(toast.showSuccess).toHaveBeenCalledWith("Area created")
			// One room: the label, not a tab, and the add button for the next
			expect(rooms().text()).toBe("Floor Plan")
			expect(addRoom().exists()).toBe(true)
		})

		it("adds a second room to a plan that had one, and leaves the room shown as it is", async () => {
			await floorPlan([ROOM_1])
			expect(wrapper.vm.selectedArea).toBe(ROOM_1.name)

			wrapper.vm.newAreaName = "Terrace"
			await wrapper.vm.handleAddArea()
			await flushPromises()

			expect(restaurantStore.createArea).toHaveBeenCalledWith("Terrace")
			expect(wrapper.vm.selectedArea).toBe(ROOM_1.name)
			// Now there are tabs, with rename and delete for the room shown
			expect(tabs().map((tab) => tab.text())).toEqual(["Room 1", "Terrace"])
			expect(renameRoom().exists()).toBe(true)
			expect(deleteRoom().exists()).toBe(true)
			expect(addRoom().exists()).toBe(true)
		})

		it("makes nothing from a blank name", async () => {
			await floorPlan([ROOM_1])

			wrapper.vm.newAreaName = "   "
			await wrapper.vm.handleAddArea()

			expect(restaurantStore.createArea).not.toHaveBeenCalled()
		})

		it("reports a room the server refused, and shows nothing new", async () => {
			await floorPlan([])
			restaurantStore.createArea = vi.fn(async () =>
				Promise.reject(new Error("refused")),
			)
			wrapper.vm.newAreaName = "Main Hall"

			await wrapper.vm.handleAddArea()

			expect(toast.showError).toHaveBeenCalledWith("Failed to create area")
			expect(wrapper.vm.selectedArea).toBe(null)
		})
	})
})
