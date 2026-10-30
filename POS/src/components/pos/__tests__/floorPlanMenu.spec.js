/**
 * //// Neoffice — added file (no upstream equivalent). The way into the floor plan's editor is a small « ⋯ » at the very
 * //// end of the plan's line, which opens a menu (NeoRestau lot 1, Ruling 48): the Edit button was on the line, within
 * //// every finger's reach, and was pressed too easily. The menu is a list of items, each with its own rule of who
 * //// sees it, and the « ⋯ » is shown when at least one item is: « Edit the floor plan » (whoever may lay out the floor)
 * //// and « Free the tables being cleaned » (whoever may set the status of a table, a cashier included).
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

const restaurantStore = vi.hoisted(() => ({}))
// The store the component reads is reactive, as Pinia's is: what a test changes through `live.store` is seen
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

const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
const STATION = {
	name: "k1tch3nh4s",
	station_name: "Kitchen",
	area: ROOM.name,
	color: "#d68a59",
}
// The app's own « more-horizontal » glyph (settings/SettingsSection.vue)
const DOTS = "M5 12h.01M12 12h.01M19 12h.01"

function theStore(can, overrides = {}) {
	Object.assign(restaurantStore, {
		can,
		tillRestaurant: "The Bistro",
		areas: [ROOM],
		tables: [],
		floorStations: [STATION],
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
		freeCleaningTables: vi.fn(async () => 0),
		...overrides,
	})
}

describe("the « ⋯ » menu of the floor plan's line", () => {
	let wrapper

	async function floorPlan(can, overrides) {
		theStore(can, overrides)
		wrapper = mount(FloorPlanEditor, {
			attachTo: document.body,
			global: { stubs: { FloorPlanWalls: true }, mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	const more = () => wrapper.find('[data-test="floor-line-more"]')
	const menu = () => wrapper.find('[role="menu"]')
	const items = () => wrapper.findAll('[role="menuitem"]')
	const editItem = () => wrapper.find('[data-test="menu-edit-floor-plan"]')

	beforeEach(() => {
		localStorage.clear()
		for (const notice of Object.values(toast)) notice.mockClear()
	})
	afterEach(() => {
		wrapper?.unmount()
	})

	describe("the button", () => {
		it("is a small quiet « ⋯ », 32 px square, the last thing on the line", async () => {
			await floorPlan({ manage_floor: true })

			expect(more().exists()).toBe(true)
			expect(more().classes()).toEqual(
				expect.arrayContaining(["w-8", "h-8", "text-gray-400"]),
			)
			// Quiet: no fill and no border of its own until the finger is on it
			expect(
				more()
					.classes()
					.filter((token) => /^(bg-|border)/.test(token)),
			).toEqual([])
			// The glyph the app already has for it
			expect(more().find("path").attributes("d")).toContain(DOTS)
			// The very end of the line: nothing follows it, in the group or after it
			const actions = wrapper.find('[data-test="floor-actions"]').element
			expect(actions.lastElementChild.contains(more().element)).toBe(true)
			expect(
				wrapper.find('[data-test="floor-line"]').element.lastElementChild,
			).toBe(actions)
		})

		it("is named for who cannot see it, and says it opens a menu", async () => {
			await floorPlan({ manage_floor: true })

			expect(more().attributes("aria-label")).toBe("Actions")
			expect(more().attributes("title")).toBe("Actions")
			expect(more().attributes("aria-haspopup")).toBe("menu")
			expect(more().attributes("aria-expanded")).toBe("false")
			expect(more().attributes("type")).toBe("button")
		})

		it("is shown to whoever may lay out the floor", async () => {
			await floorPlan({ manage_floor: true })

			expect(more().exists()).toBe(true)
		})

		it("is not shown to a cashier, who may not lay out the floor", async () => {
			await floorPlan({ manage_floor: false, view_tips: true })

			expect(more().exists()).toBe(false)
			expect(menu().exists()).toBe(false)
		})

		it("is not shown while the server has not said what the user may do, and the editor stays shut", async () => {
			await floorPlan(undefined)

			expect(more().exists()).toBe(false)
			await wrapper.vm.toggleEditMode()
			expect(wrapper.vm.isEditMode).toBe(false)
		})

		it("keeps its place at the end of the line when the plan has no station and no pill", async () => {
			theStore({ manage_floor: true })
			restaurantStore.floorStations = []
			wrapper = mount(FloorPlanEditor, {
				attachTo: document.body,
				global: {
					stubs: { FloorPlanWalls: true },
					mocks: { __: globalThis.__ },
				},
			})
			await flushPromises()

			expect(wrapper.find('[data-test="station-chip"]').exists()).toBe(false)
			expect(more().exists()).toBe(true)
			expect(wrapper.find('[data-test="floor-actions"]').classes()).toContain(
				"ml-auto",
			)
		})
	})

	describe("the menu", () => {
		it("opens under the « ⋯ » and holds « Edit the floor plan »", async () => {
			await floorPlan({ manage_floor: true })
			expect(menu().exists()).toBe(false)

			await more().trigger("click")

			expect(menu().exists()).toBe(true)
			expect(more().attributes("aria-expanded")).toBe("true")
			expect(items().map((item) => item.text())).toEqual([
				"Edit the floor plan",
			])
			// Hung from the button, above the canvas, and not cut by the line
			expect(more().element.parentElement.contains(menu().element)).toBe(true)
			expect(menu().classes()).toEqual(
				expect.arrayContaining(["absolute", "end-0", "z-30"]),
			)
		})

		it("enters the editor with « Edit the floor plan », as the Edit button did, and closes", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")

			await editItem().trigger("click")
			await flushPromises()

			expect(wrapper.vm.isEditMode).toBe(true)
			expect(menu().exists()).toBe(false)
			// The line shows what the editor needs, and no « ⋯ » while it is open
			expect(
				wrapper.findAll("button").some((button) => button.text() === "Save"),
			).toBe(true)
			expect(
				wrapper.findAll("button").some((button) => button.text() === "Cancel"),
			).toBe(true)
			expect(more().exists()).toBe(false)
			expect(restaurantStore.saveAllPositions).not.toHaveBeenCalled()
		})

		it("brings the « ⋯ » back once the editor is left", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")
			await editItem().trigger("click")
			await flushPromises()

			await wrapper.vm.toggleEditMode()
			await flushPromises()

			expect(wrapper.vm.isEditMode).toBe(false)
			expect(more().exists()).toBe(true)
			expect(menu().exists()).toBe(false)
		})

		it("closes on a second tap on the « ⋯ » and does nothing", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")

			await more().trigger("click")

			expect(menu().exists()).toBe(false)
			expect(wrapper.vm.isEditMode).toBe(false)
		})

		it("closes on a tap anywhere else, the canvas included, and does nothing", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")

			// A pointer-down that never bubbles up, as a table's does: the menu hears it all the same
			const table = document.createElement("div")
			table.addEventListener("pointerdown", (event) => event.stopPropagation())
			document.body.appendChild(table)
			table.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
			await flushPromises()

			expect(menu().exists()).toBe(false)
			expect(wrapper.vm.isEditMode).toBe(false)
			table.remove()
		})

		it("stays open on a tap inside it", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")

			menu().element.dispatchEvent(
				new MouseEvent("pointerdown", { bubbles: true }),
			)
			await flushPromises()

			expect(menu().exists()).toBe(true)
		})

		it("closes on Escape, gives the focus back to the « ⋯ », and does nothing", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")
			await flushPromises()
			// The first item takes the focus when the menu opens, for whoever has no finger to tap with
			expect(document.activeElement).toBe(editItem().element)

			document.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			)
			await flushPromises()

			expect(menu().exists()).toBe(false)
			expect(document.activeElement).toBe(more().element)
			expect(wrapper.vm.isEditMode).toBe(false)
		})

		it("does not hear the keyboard or the pointer once closed", async () => {
			await floorPlan({ manage_floor: true })
			const added = vi.spyOn(document, "addEventListener")
			const removed = vi.spyOn(document, "removeEventListener")

			await more().trigger("click")
			const opened = added.mock.calls.filter(
				([type]) => type === "pointerdown" || type === "keydown",
			)
			await more().trigger("click")
			const closed = removed.mock.calls.filter(
				([type]) => type === "pointerdown" || type === "keydown",
			)

			// What opening listened for, closing stops listening for
			expect(opened.map(([type]) => type).sort()).toEqual([
				"keydown",
				"pointerdown",
			])
			expect(closed.map(([type]) => type).sort()).toEqual([
				"keydown",
				"pointerdown",
			])
			added.mockRestore()
			removed.mockRestore()
		})

		it("is a list of items, each with its own rule, and is built from the ones that are shown", async () => {
			await floorPlan({ manage_floor: true })

			expect(wrapper.vm.menuItems.map((item) => item.key)).toEqual([
				"edit-floor-plan",
			])
			for (const item of wrapper.vm.menuItems) {
				expect(item.label).toEqual(expect.any(String))
				expect(item.run).toEqual(expect.any(Function))
			}
		})
	})

	describe("the items, and who sees each", () => {
		const labels = () => items().map((item) => item.text())

		it("shows « Edit the floor plan » to whoever may lay out the floor, and not the other item to him alone", async () => {
			await floorPlan({ manage_floor: true })
			await more().trigger("click")

			expect(labels()).toEqual(["Edit the floor plan"])
		})

		it("shows « Free the tables being cleaned » to a cashier, who may set the status of a table and not lay out the floor", async () => {
			await floorPlan({
				manage_floor: false,
				set_table_status: true,
				view_tips: true,
			})

			// The « ⋯ » is there for the one item he has
			expect(more().exists()).toBe(true)
			await more().trigger("click")
			expect(labels()).toEqual(["Free the tables being cleaned"])
			expect(editItem().exists()).toBe(false)
		})

		it("shows both to whoever may do both, the editor first", async () => {
			await floorPlan({ manage_floor: true, set_table_status: true })
			await more().trigger("click")

			expect(labels()).toEqual([
				"Edit the floor plan",
				"Free the tables being cleaned",
			])
			expect(wrapper.vm.menuItems.map((item) => item.key)).toEqual([
				"edit-floor-plan",
				"free-cleaning-tables",
			])
		})

		it("shows no « ⋯ » when no item is shown: not the right to lay out the floor, nor to set the status of a table", async () => {
			await floorPlan({
				manage_floor: false,
				set_table_status: false,
				view_tips: true,
			})

			expect(more().exists()).toBe(false)
			expect(menu().exists()).toBe(false)
		})

		it("shows no « ⋯ » until the server has said what the user may do", async () => {
			await floorPlan(undefined)

			expect(more().exists()).toBe(false)
		})

		it("takes the menu away from a cashier whose right goes while it is open", async () => {
			await floorPlan({ manage_floor: false, set_table_status: true })
			await more().trigger("click")
			expect(menu().exists()).toBe(true)

			live.store.can = { manage_floor: false, set_table_status: false }
			await flushPromises()

			expect(menu().exists()).toBe(false)
			expect(more().exists()).toBe(false)
		})
	})

	describe("« Free the tables being cleaned »", () => {
		const freeItem = () =>
			wrapper.find('[data-test="menu-free-cleaning-tables"]')

		async function freeing(freed, overrides = {}) {
			await floorPlan(
				{ manage_floor: true, set_table_status: true },
				{
					areas: [ROOM, TERRACE],
					freeCleaningTables: vi.fn(async () => freed),
					...overrides,
				},
			)
			await more().trigger("click")
			await freeItem().trigger("click")
			await flushPromises()
		}

		it("frees the tables of the room shown, in one call, with no confirmation, and closes", async () => {
			const confirm = vi.spyOn(window, "confirm")

			await freeing(2)

			expect(restaurantStore.freeCleaningTables).toHaveBeenCalledTimes(1)
			expect(restaurantStore.freeCleaningTables).toHaveBeenCalledWith(ROOM.name)
			// The product owner dislikes extra clicks: the item does the job, nothing asks first
			expect(confirm).not.toHaveBeenCalled()
			expect(menu().exists()).toBe(false)
			expect(wrapper.vm.isEditMode).toBe(false)
			confirm.mockRestore()
		})

		it("frees the room that is shown, not the first one nor every one", async () => {
			await floorPlan(
				{ manage_floor: false, set_table_status: true },
				{ areas: [ROOM, TERRACE], freeCleaningTables: vi.fn(async () => 1) },
			)
			await wrapper.findAll('[data-test="room-tab"]')[1].trigger("click")
			await more().trigger("click")

			await freeItem().trigger("click")
			await flushPromises()

			expect(restaurantStore.freeCleaningTables).toHaveBeenCalledTimes(1)
			expect(restaurantStore.freeCleaningTables).toHaveBeenCalledWith(
				TERRACE.name,
			)
		})

		it("says how many tables it freed, in a short toast", async () => {
			await freeing(3)

			expect(toast.showSuccess).toHaveBeenCalledTimes(1)
			expect(toast.showSuccess).toHaveBeenCalledWith("3 tables freed")
			expect(toast.showInfo).not.toHaveBeenCalled()
			expect(toast.showError).not.toHaveBeenCalled()
		})

		it("says it in the singular for one table", async () => {
			await freeing(1)

			expect(toast.showSuccess).toHaveBeenCalledWith("1 table freed")
		})

		it("says so when no table is being cleaned", async () => {
			await freeing(0)

			expect(toast.showInfo).toHaveBeenCalledTimes(1)
			expect(toast.showInfo).toHaveBeenCalledWith("No table is being cleaned")
			expect(toast.showSuccess).not.toHaveBeenCalled()
		})

		it("reports the server's refusal, with the explanation it gives, and frees nothing on screen", async () => {
			const refused = new Error("Not permitted")
			await freeing(0, {
				freeCleaningTables: vi.fn(async () => Promise.reject(refused)),
			})

			expect(toast.handleError).toHaveBeenCalledTimes(1)
			expect(toast.handleError).toHaveBeenCalledWith(
				refused,
				"Failed to update table status",
			)
			expect(toast.showSuccess).not.toHaveBeenCalled()
			expect(toast.showInfo).not.toHaveBeenCalled()
		})

		it("is no way into the editor and leaves the plan as it is", async () => {
			await freeing(2)

			expect(wrapper.vm.isEditMode).toBe(false)
			expect(restaurantStore.saveAllPositions).not.toHaveBeenCalled()
			expect(wrapper.find('[data-test="floor-line-more"]').exists()).toBe(true)
		})

		it("is not offered while the plan is edited, there is no « ⋯ » then", async () => {
			await floorPlan({ manage_floor: true, set_table_status: true })
			await wrapper.vm.toggleEditMode()
			await flushPromises()

			expect(more().exists()).toBe(false)
			expect(freeItem().exists()).toBe(false)
		})

		it("does nothing before a room is shown", async () => {
			await floorPlan(
				{ manage_floor: false, set_table_status: true },
				{ areas: [] },
			)
			wrapper.vm.selectedArea = null

			await wrapper.vm.freeCleaningTables()

			expect(restaurantStore.freeCleaningTables).not.toHaveBeenCalled()
			expect(toast.showInfo).not.toHaveBeenCalled()
		})
	})
})
