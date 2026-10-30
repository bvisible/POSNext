/**
 * //// Neoffice — added file (no upstream equivalent). The red badge of a room's tab counts its occupied tables (NeoRestau
 * //// lot 1, fix round 1). The store counted them by the LABEL of the room and the plan read them by its NAME, so that the
 * //// badge never showed on a room named by a hash (every room made since the rooms belong to a restaurant); it showed only
 * //// on a room whose name was its label. The count is keyed by the name, which is what the plan and every record use.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const tillSettings = reactive({ enable_restaurant_mode: 1 })
	return {
		tillSettings,
		usePOSSettingsStore: () => ({ settings: tillSettings }),
	}
})
vi.mock("@/utils/offline/db", () => ({ db: {} }))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

globalThis.__ = (s) => s

const { useRestaurantStore } = await import("../restaurant")

// Rooms named by a hash, with the label a waiter reads apart from it
const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
const QUIET = { name: "q7u1et5h4s", area_name: "Quiet room" }
const table = (name, area, status) => ({ name, table_name: name, area, status })

describe("the occupied tables of each room", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		store = useRestaurantStore()
		store.areas = [ROOM, TERRACE, QUIET]
		store.tables = [
			table("a1", ROOM.name, "Occupied"),
			table("a2", ROOM.name, "Occupied"),
			table("a3", ROOM.name, "Empty"),
			table("b1", TERRACE.name, "Occupied"),
			table("b2", TERRACE.name, "Cleaning"),
			table("c1", QUIET.name, "Reserved"),
		]
	})

	it("are counted by the name of the room, which the plan reads", () => {
		expect(store.occupiedCountByArea).toEqual({
			[ROOM.name]: 2,
			[TERRACE.name]: 1,
			[QUIET.name]: 0,
		})
	})

	it("are not counted by its label", () => {
		expect(store.occupiedCountByArea[ROOM.area_name]).toBeUndefined()
		expect(store.occupiedCountByArea[TERRACE.area_name]).toBeUndefined()
	})

	it("count the tables of a room that is seated, and those that are freed", () => {
		store.tables.find((t) => t.name === "a3").status = "Occupied"
		store.tables.find((t) => t.name === "b1").status = "Empty"

		expect(store.occupiedCountByArea[ROOM.name]).toBe(3)
		expect(store.occupiedCountByArea[TERRACE.name]).toBe(0)
	})

	it("still count a room whose name is its label, as the older rooms are", () => {
		store.areas = [{ name: "Main Hall", area_name: "Main Hall" }]
		store.tables = [table("m1", "Main Hall", "Occupied")]

		expect(store.occupiedCountByArea).toEqual({ "Main Hall": 1 })
	})

	it("count every occupied table of the floor in the total", () => {
		expect(store.totalOccupiedCount).toBe(3)
	})
})
