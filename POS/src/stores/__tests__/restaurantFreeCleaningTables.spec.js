/**
 * //// Neoffice — added file (no upstream equivalent). The « Free the tables being cleaned » item of the floor plan's menu
 * //// (NeoRestau lot 1, Ruling 48) frees every table of the room shown that is being cleaned, in one call to the server,
 * //// for the till's restaurant. The store sends the call and shows the tables the server freed Empty at once, without
 * //// waiting for the realtime update; the server decides which tables are freed, so the store touches only those.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const cachePut = vi.hoisted(() => vi.fn())
// What the offline copy holds: IndexedDB structured-clones what it is handed, which a reactive proxy cannot be
const cached = vi.hoisted(() => ({ rows: [] }))

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
	db: { restaurant_tables: { put: cachePut } },
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

globalThis.__ = (s) => s

const { tillSettings } = await import("@/stores/posSettings")
const { useRestaurantStore } = await import("../restaurant")

const ROOM = "r0o1m2h3a4"
const TERRACE = "t3rr4c3h4s"
const table = (name, area, status) => ({
	name,
	table_name: name.toUpperCase(),
	area,
	status,
})
const THE_FLOOR = () => [
	table("c1h4sh", ROOM, "Cleaning"),
	table("c2h4sh", ROOM, "Cleaning"),
	table("e1h4sh", ROOM, "Empty"),
	table("o1h4sh", ROOM, "Occupied"),
	table("t1h4sh", TERRACE, "Cleaning"),
]

describe("the restaurant store frees the tables being cleaned", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		cachePut.mockReset()
		cached.rows = []
		cachePut.mockImplementation(async (row) => {
			cached.rows.push(structuredClone(row))
		})
		tillSettings.restaurant = "The Bistro"
		store = useRestaurantStore()
		store.tables = THE_FLOOR()
	})

	const statuses = () =>
		Object.fromEntries(store.tables.map((t) => [t.name, t.status]))

	it("asks the server for the room, in the till's restaurant", async () => {
		call.mockResolvedValue({ status: "success", freed: 0, tables: [] })

		await store.freeCleaningTables(ROOM)

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.free_cleaning_tables",
			{
				area: ROOM,
				restaurant: "The Bistro",
			},
		)
	})

	it("names no restaurant while the till does not, and lets the server pick", async () => {
		tillSettings.restaurant = undefined
		call.mockResolvedValue({ status: "success", freed: 0, tables: [] })

		await store.freeCleaningTables(ROOM)

		expect(call).toHaveBeenCalledWith(
			"pos_next.api.restaurant.free_cleaning_tables",
			{
				area: ROOM,
				restaurant: undefined,
			},
		)
	})

	it("shows the tables the server freed Empty at once, and only those, and says how many", async () => {
		call.mockResolvedValue({
			status: "success",
			freed: 2,
			tables: ["c1h4sh", "c2h4sh"],
		})

		const freed = await store.freeCleaningTables(ROOM)

		expect(freed).toBe(2)
		expect(statuses()).toEqual({
			c1h4sh: "Empty",
			c2h4sh: "Empty",
			e1h4sh: "Empty",
			// What the server did not free is what it is: another one's table, another room's
			o1h4sh: "Occupied",
			t1h4sh: "Cleaning",
		})
	})

	it("writes the tables it freed to the offline copy, so that a reload does not bring them back", async () => {
		call.mockResolvedValue({
			status: "success",
			freed: 2,
			tables: ["c1h4sh", "c2h4sh"],
		})

		await store.freeCleaningTables(ROOM)

		// What reached the copy is a plain row, as IndexedDB clones it: the store's own proxy cannot be cloned
		expect(cached.rows.map((row) => [row.name, row.status])).toEqual([
			["c1h4sh", "Empty"],
			["c2h4sh", "Empty"],
		])
	})

	it("changes nothing when nothing was being cleaned", async () => {
		call.mockResolvedValue({ status: "success", freed: 0, tables: [] })
		const before = statuses()

		const freed = await store.freeCleaningTables(ROOM)

		expect(freed).toBe(0)
		expect(statuses()).toEqual(before)
		expect(cachePut).not.toHaveBeenCalled()
	})

	it("passes over a freed table it does not know, and counts what the server freed", async () => {
		call.mockResolvedValue({
			status: "success",
			freed: 2,
			tables: ["c1h4sh", "n3wh4sh"],
		})

		const freed = await store.freeCleaningTables(ROOM)

		expect(freed).toBe(2)
		expect(statuses().c1h4sh).toBe("Empty")
		expect(statuses().c2h4sh).toBe("Cleaning")
	})

	it("keeps a table freed when the offline copy cannot be written", async () => {
		call.mockResolvedValue({ status: "success", freed: 1, tables: ["c1h4sh"] })
		cachePut.mockRejectedValue(new Error("QuotaExceededError"))

		const freed = await store.freeCleaningTables(ROOM)

		expect(freed).toBe(1)
		expect(statuses().c1h4sh).toBe("Empty")
	})

	it("lets the server's refusal through and changes nothing", async () => {
		const refused = Object.assign(new Error("Not permitted"), {
			exc_type: "PermissionError",
		})
		call.mockRejectedValue(refused)
		const before = statuses()

		await expect(store.freeCleaningTables(ROOM)).rejects.toBe(refused)

		expect(statuses()).toEqual(before)
		expect(cachePut).not.toHaveBeenCalled()
	})
})
