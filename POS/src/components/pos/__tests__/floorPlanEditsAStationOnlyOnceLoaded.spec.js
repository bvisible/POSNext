/**
 * //// Neoffice — added file (no upstream equivalent). The station dialog of the floor plan saves what it read
 * //// (NeoRestau lot 1, task 9, fix round 1). When the station's details did not load, it used to open on the basic
 * //// data of the plan with empty lists and Save wrote them: the station's items, its item groups, its workflow and its
 * //// toggles were wiped. A dialog whose details did not load shows the failure, keeps Save off and sends nothing.
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
	// An open dialog shows its body and its actions, a closed one nothing
	Dialog: {
		props: ["modelValue", "options"],
		template:
			"<div v-if='modelValue' :data-dialog='options && options.title'><slot name='body-content' /><slot name='actions' /></div>",
	},
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
// The station as the floor plan knows it: its place on the plan, none of what the dialog edits
const ON_THE_PLAN = {
	name: "st4t10n",
	station_name: "Kitchen",
	station_type: "Kitchen",
	color: "#F97316",
	area: ROOM,
}
// The station as the server reads it: the lists, the workflow, the toggles, and the workflow of a dish
const DETAILS = {
	name: "st4t10n",
	station_name: "Kitchen",
	station_type: "Bar",
	color: "#112233",
	workflow: "Fast",
	is_active: 1,
	use_runner: 0,
	items: [
		{
			item: "SOUP",
			item_name: "Soup",
			prep_time: 7,
			priority: "Urgent",
			workflow: "Slow",
		},
	],
	item_groups: [{ item_group: "Starters", prep_time: 2, priority: "Normal" }],
}

function theStore() {
	Object.assign(restaurantStore, {
		can: { manage_floor: true },
		tillRestaurant: "The Bistro",
		areas: [{ name: ROOM, area_name: "Room 1" }],
		tables: [],
		floorStations: [ON_THE_PLAN],
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
		fetchStationItemsMap: vi.fn(async () => {}),
		fetchTakeawayOrders: vi.fn(async () => {}),
		startStatusPolling: vi.fn(),
		stopStatusPolling: vi.fn(),
		getFloorPlanWalls: () => ({ walls: [], doors: [], windows: [] }),
		getFloorPlanBg: () => "",
	})
}

describe("the station dialog saves what it read", () => {
	let wrapper

	/** The server answers the station's details with `details`, or refuses with it when it is an Error. */
	function serverAnswers(details) {
		call.mockImplementation(async (method) => {
			if (method.endsWith("get_station_details")) {
				if (details instanceof Error) throw details
				return details
			}
			if (method.endsWith("get_preparation_workflows")) {
				return [
					{ name: "Fast", workflow_name: "Fast" },
					{ name: "Slow", workflow_name: "Slow" },
				]
			}
			return []
		})
	}

	async function editor() {
		wrapper = mount(FloorPlanEditor, {
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		return wrapper.vm
	}

	const dialog = () => wrapper.find('[data-dialog="Edit Station"]')
	const saveButton = () =>
		dialog()
			.findAll("button")
			.find((button) => button.text() === "Save")
	const callsTo = (method) =>
		call.mock.calls.filter(([name]) => name.endsWith(method))

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

	it("opens on the station it read, and Save is on", async () => {
		serverAnswers(DETAILS)
		const plan = await editor()

		await plan.openEditStationDialog(ON_THE_PLAN)
		await flushPromises()

		expect(dialog().exists()).toBe(true)
		expect(saveButton().attributes("disabled")).toBeUndefined()
		expect(dialog().text()).toContain("Soup")
		expect(dialog().text()).toContain("Starters")
		expect(toast.handleError).not.toHaveBeenCalled()
	})

	it("saves what it read: the lists, the workflow of the station and the one of each dish", async () => {
		serverAnswers(DETAILS)
		const plan = await editor()
		await plan.openEditStationDialog(ON_THE_PLAN)
		call.mockClear()

		await plan.handleSaveStation()

		expect(callsTo("update_station")).toEqual([
			[
				"pos_next.api.restaurant.update_station",
				{
					name: "st4t10n",
					station_name: "Kitchen",
					station_type: "Bar",
					color: "#112233",
					workflow: "Fast",
					is_active: 1,
					use_runner: 0,
					items: JSON.stringify(DETAILS.items),
					item_groups: JSON.stringify(DETAILS.item_groups),
				},
			],
		])
		expect(toast.showSuccess).toHaveBeenCalledWith("Station updated")
	})

	describe("when the details did not load", () => {
		const refusal = Object.assign(
			new Error("get_station_details PermissionError"),
			{
				messages: ["Not permitted"],
			},
		)

		async function openedOnTheFailure() {
			serverAnswers(refusal)
			const plan = await editor()
			await plan.openEditStationDialog(ON_THE_PLAN)
			await flushPromises()
			call.mockClear()
			return plan
		}

		it("says why, with the server's own words", async () => {
			await openedOnTheFailure()

			expect(toast.handleError).toHaveBeenCalledWith(
				refusal,
				"Failed to load station details",
			)
		})

		it("keeps Save off and shows the failure instead of lists that were never read", async () => {
			await openedOnTheFailure()

			expect(dialog().exists()).toBe(true)
			expect(saveButton().attributes("disabled")).toBeDefined()
			expect(dialog().text()).toContain("Failed to load station details")
			// Nothing says the station has no items: nobody knows
			expect(dialog().text()).not.toContain("No items assigned")
			expect(dialog().text()).not.toContain("No item groups assigned")
		})

		it("sends nothing, whoever presses Save", async () => {
			const plan = await openedOnTheFailure()

			await saveButton().trigger("click")
			await plan.handleSaveStation()

			expect(callsTo("update_station")).toEqual([])
			expect(toast.showSuccess).not.toHaveBeenCalled()
			expect(dialog().exists()).toBe(true)
		})

		it("can still delete the station, which needs only its name", async () => {
			const plan = await openedOnTheFailure()

			await plan.handleDeleteStation()

			expect(callsTo("delete_station")).toEqual([
				["pos_next.api.restaurant.delete_station", { name: "st4t10n" }],
			])
		})

		it("opens the next station on its own details, not on what the failed one left", async () => {
			const plan = await openedOnTheFailure()
			serverAnswers({ ...DETAILS, name: "other", station_name: "Bar" })

			await plan.openEditStationDialog({ ...ON_THE_PLAN, name: "other" })
			await flushPromises()

			expect(saveButton().attributes("disabled")).toBeUndefined()
			expect(dialog().text()).toContain("Soup")
		})
	})

	it("closes the door again when a later load fails, and shows nothing of the station read before", async () => {
		serverAnswers(DETAILS)
		const plan = await editor()
		await plan.openEditStationDialog(ON_THE_PLAN)
		plan.showEditStationDialog = false
		serverAnswers(new Error("offline"))

		await plan.openEditStationDialog({
			...ON_THE_PLAN,
			name: "other",
			station_name: "Bar",
		})
		await flushPromises()
		call.mockClear()
		await plan.handleSaveStation()

		expect(saveButton().attributes("disabled")).toBeDefined()
		expect(dialog().text()).not.toContain("Soup")
		expect(callsTo("update_station")).toEqual([])
	})
})
