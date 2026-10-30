/**
 * //// Neoffice — added file (no upstream equivalent). The offline copy of the floor (NeoRestau lot 1, fix round 1): the
 * //// store keeps the rooms and the tables in IndexedDB so that a dining room stays usable when the counter's network
 * //// drops. IndexedDB structured-clones what it is given, and a reactive proxy cannot be cloned (DataCloneError): the
 * //// store handed it proxies, its catch swallowed the error, and the copy never got a change of status, of position, nor
 * //// the floor itself. It is given the objects behind the proxies now, and a copy that cannot be written never stops
 * //// what the caller was doing (the server hears of a table's status whatever the copy does).
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
// IndexedDB, as far as it matters here: every row it is handed is structured-cloned, and a proxy throws
const cache = vi.hoisted(() => ({
	areas: [],
	tables: new Map(),
	put: null,
}))
// What the store told its log: an error swallowed in a catch shows here
const logged = vi.hoisted(() => ({ errors: [] }))

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const tillSettings = reactive({ enable_restaurant_mode: 1 })
	return {
		tillSettings,
		usePOSSettingsStore: () => ({ settings: tillSettings }),
	}
})
vi.mock("@/utils/offline/db", () => ({
	db: {
		restaurant_areas: {
			clear: async () => {
				cache.areas = []
			},
			bulkPut: async (rows) => {
				for (const row of rows) cache.areas.push(structuredClone(row))
			},
		},
		restaurant_tables: {
			clear: async () => {
				cache.tables = new Map()
			},
			bulkPut: async (rows) => {
				for (const row of rows) {
					const clone = structuredClone(row)
					cache.tables.set(clone.name, clone)
				}
			},
			put: (row) => cache.put(row),
		},
		transaction: (...args) => args[args.length - 1](),
	},
}))
vi.mock("@/utils/logger", () => ({
	logger: {
		create: () =>
			new Proxy(
				{},
				{
					get: (_target, level) =>
						level === "error"
							? (...args) => logged.errors.push(args)
							: () => {},
				},
			),
	},
}))

globalThis.__ = (s) => s

const { useRestaurantStore } = await import("../restaurant")

const ROOM = { name: "r0o1m2h3a4", area_name: "Room 1" }
const TERRACE = { name: "t3rr4c3h4s", area_name: "Terrace" }
const TABLES = () => [
	{
		name: "t1h4sh",
		table_name: "T1",
		area: ROOM.name,
		status: "Occupied",
		pos_x: 10,
		pos_y: 20,
		width: 100,
		height: 100,
	},
	{
		name: "t2h4sh",
		table_name: "T2",
		area: TERRACE.name,
		status: "Empty",
		pos_x: 30,
		pos_y: 40,
		width: 100,
		height: 100,
	},
]

describe("the offline copy of the floor is written", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		call.mockResolvedValue([])
		logged.errors = []
		cache.areas = []
		cache.tables = new Map()
		cache.put = async (row) => {
			const clone = structuredClone(row)
			cache.tables.set(clone.name, clone)
		}
		store = useRestaurantStore()
		store.tables = TABLES()
	})

	const cachedTable = (name) => cache.tables.get(name)

	describe("a table's status", () => {
		it("reaches the copy, as the plain row it is", async () => {
			await store.updateTableStatus("t1h4sh", "Cleaning")

			expect(cachedTable("t1h4sh").status).toBe("Cleaning")
			expect(logged.errors).toEqual([])
		})

		it("is told to the server too", async () => {
			await store.updateTableStatus("t1h4sh", "Cleaning")

			expect(call).toHaveBeenCalledWith(
				"pos_next.api.restaurant.update_table_status",
				{ table_name: "t1h4sh", status: "Cleaning" },
			)
		})

		it("is told to the server even when the copy cannot be written", async () => {
			cache.put = async () => {
				throw new Error("QuotaExceededError")
			}

			await store.updateTableStatus("t1h4sh", "Cleaning")

			// The copy is the offline one: the server has to hear of the change whatever it does
			expect(call).toHaveBeenCalledWith(
				"pos_next.api.restaurant.update_table_status",
				{ table_name: "t1h4sh", status: "Cleaning" },
			)
			expect(store.tables[0].status).toBe("Cleaning")
		})

		it("changes no other table", async () => {
			await store.updateTableStatus("t1h4sh", "Cleaning")

			expect(store.tables[1].status).toBe("Empty")
			expect(cachedTable("t2h4sh")).toBeUndefined()
		})
	})

	describe("a table's place", () => {
		it("reaches the copy, as the plain row it is", async () => {
			await store.updateTablePosition("t1h4sh", 40, 50, 120, 90)

			expect(cachedTable("t1h4sh")).toMatchObject({
				pos_x: 40,
				pos_y: 50,
				width: 120,
				height: 90,
			})
			expect(logged.errors).toEqual([])
		})

		it("is kept on the screen when the copy cannot be written", async () => {
			cache.put = async () => {
				throw new Error("QuotaExceededError")
			}

			await store.updateTablePosition("t1h4sh", 40, 50, 120, 90)

			expect(store.tables[0]).toMatchObject({ pos_x: 40, pos_y: 50 })
			// The failure is logged, not thrown at whoever moved the table
			expect(logged.errors).toHaveLength(1)
		})
	})

	describe("the floor read from the server", () => {
		beforeEach(() => {
			call.mockImplementation(async (method) => {
				if (method.endsWith("get_tables"))
					return { areas: [ROOM, TERRACE], tables: TABLES(), stations: [] }
				if (method.endsWith("get_station_items_map"))
					return { items: {}, groups: {} }
				if (method.endsWith("get_restaurant_settings"))
					return { opening_hours: [], is_open: true, current_slot: null }
				return []
			})
		})

		it("reaches the copy: its rooms and its tables, as plain rows", async () => {
			await store.fetchFromNetwork()

			expect(cache.areas.map((area) => area.name)).toEqual([
				ROOM.name,
				TERRACE.name,
			])
			expect([...cache.tables.keys()]).toEqual(["t1h4sh", "t2h4sh"])
			expect(cachedTable("t1h4sh").status).toBe("Occupied")
			expect(logged.errors).toEqual([])
		})

		it("is shown by the store as it was read", async () => {
			await store.fetchFromNetwork()

			expect(store.areas.map((area) => area.name)).toEqual([
				ROOM.name,
				TERRACE.name,
			])
			expect(store.tables).toHaveLength(2)
		})

		it("is what a till that starts offline reads back", async () => {
			await store.fetchFromNetwork()
			const rows = [...cache.tables.values()]

			// The copy holds what the server said, row for row
			expect(rows.map((row) => [row.name, row.area, row.status])).toEqual(
				TABLES().map((row) => [row.name, row.area, row.status]),
			)
		})
	})
})
