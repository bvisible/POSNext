/**
 * //// Neoffice — added file (no upstream equivalent). A table payment never sends « Empty » (NeoRestau lot 1, task 9f, fix
 * //// round 2, Ruling 75). Since 2026-03-29 (df6270eb) the SERVER sends a paid table to Cleaning, when the invoice is
 * //// submitted (invoices.py, and the on_submit hook): the Cleaning dialog and « Free the tables being cleaned » rely on it.
 * //// The till used to set the table to Empty itself right after the payment, through the store's updateTableStatus, but
 * //// that call never ran in production: it wrote the offline copy first, the copy threw (a proxy cannot be cloned), and the
 * //// server was never told. Once the copy was written, the call was switched on, and every table paid at the till would
 * //// have skipped Cleaning. The till reads the floor again after a payment, and says nothing about the table's status.
 * ////
 * //// POSSale.vue is not mounted by any spec (5 800 lines, dozens of stores): the block of its payment that deals with the
 * //// table is taken out of its source and run, as written, against the real store and a fake server that does what the real
 * //// one does (it leaves the paid table in Cleaning, and obeys any status it is sent).
 * @vitest-environment jsdom
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { flushPromises } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => ({ tables: [], calls: [] }))

vi.hoisted(() => {
	globalThis.__ = (text) => text
})

// The server of a restaurant, for what a payment touches: it hands the floor over, and it sets the status it is asked to
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method, args = {}) => {
		const name = method.split(".").pop()
		server.calls.push({ name, args })
		if (name === "get_tables") {
			return {
				areas: [{ name: "r0o1m2h3a4", area_name: "Room 1" }],
				tables: server.tables.map((table) => ({ ...table })),
				stations: [],
			}
		}
		if (name === "update_table_status") {
			const table = server.tables.find((t) => t.name === args.table_name)
			if (table) table.status = args.status
			return { status: "success" }
		}
		if (name === "get_station_items_map") return { items: {}, groups: {} }
		if (name === "get_restaurant_settings")
			return { opening_hours: [], is_open: true, current_slot: null }
		return []
	}),
}))
vi.mock("@/stores/posSettings", async () => {
	const { reactive } = await import("vue")
	const tillSettings = reactive({
		enable_restaurant_mode: 1,
		restaurant: "The Bistro",
	})
	return {
		tillSettings,
		usePOSSettingsStore: () => ({ settings: tillSettings }),
	}
})
// The offline copy works: it structured-clones what it is given, and a proxy would throw, as IndexedDB's does
vi.mock("@/utils/offline/db", () => {
	const table = () => ({
		clear: async () => {},
		bulkPut: async (rows) => {
			for (const row of rows) structuredClone(row)
		},
		put: async (row) => {
			structuredClone(row)
		},
	})
	return {
		db: {
			restaurant_areas: table(),
			restaurant_tables: table(),
			transaction: (...args) => args[args.length - 1](),
		},
	}
})
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

const { useRestaurantStore } = await import("@/stores/restaurant")

const POS_SALE = path.resolve(__dirname, "../POSSale.vue")
const SRC = path.resolve(__dirname, "../..")
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor

/**
 * The block of the payment of POSSale.vue that deals with the table that was paid: the `if (restaurantTableName) { … }` that
 * follows the end of the stock refresh, taken out of the source as it is written.
 */
function theTableBlockOfAPayment() {
	const source = readFileSync(POS_SALE, "utf8")
	const after = source.indexOf('console.timeEnd("[Payment] stockRefresh")')
	if (after < 0)
		throw new Error(
			"the end of the payment's stock refresh is not in POSSale.vue any more",
		)
	const opening = "if (restaurantTableName) {"
	const start = source.indexOf(opening, after)
	if (start < 0)
		throw new Error(
			"the payment of POSSale.vue no longer has a block for the table that was paid",
		)
	let depth = 0
	for (let at = start + opening.length - 1; at < source.length; at++) {
		if (source[at] === "{") depth++
		if (source[at] === "}" && --depth === 0) return source.slice(start, at + 1)
	}
	throw new Error(
		"the block of the payment that deals with the table is not closed",
	)
}

const sourceFiles = (dir) =>
	readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry)
		if (statSync(full).isDirectory())
			return entry === "__tests__" || entry === "node_modules"
				? []
				: sourceFiles(full)
		return /\.(vue|js|ts)$/.test(entry) ? [full] : []
	})

describe("a table payment leaves the table in the state the server gave it", () => {
	let store
	const paid = "t1h4sh"

	// The payment is done, as the till sees it: the server has submitted the invoice, so the table is being cleaned there;
	// the till has not read the floor again yet, and still shows the table occupied
	beforeEach(async () => {
		setActivePinia(createPinia())
		server.calls = []
		server.tables = [
			{ name: paid, table_name: "T1", area: "r0o1m2h3a4", status: "Cleaning" },
			{
				name: "t2h4sh",
				table_name: "T2",
				area: "r0o1m2h3a4",
				status: "Occupied",
			},
		]
		store = useRestaurantStore()
		store.tables = server.tables.map((table) => ({
			...table,
			status: "Occupied",
		}))
		store.areas = [{ name: "r0o1m2h3a4", area_name: "Room 1" }]
	})

	// What the till does once the payment is through, for the table it was paid at (not awaited, as in the page)
	const afterThePayment = async () => {
		const run = new AsyncFunction(
			"restaurantStore",
			"restaurantTableName",
			theTableBlockOfAPayment(),
		)
		await run(store, paid)
		for (let tick = 0; tick < 10; tick++) await flushPromises()
	}
	const statusSent = () =>
		server.calls.filter((call) => call.name === "update_table_status")

	it("sends the server no status for the table that was paid: it is not told Empty", async () => {
		await afterThePayment()

		expect(statusSent()).toEqual([])
		// What the server holds is what the invoice's submission left: Cleaning
		expect(server.tables.find((table) => table.name === paid).status).toBe(
			"Cleaning",
		)
	})

	it("reads the floor again, and shows the paid table as the server left it: being cleaned", async () => {
		await afterThePayment()

		expect(
			server.calls.filter((call) => call.name === "get_tables"),
		).toHaveLength(1)
		expect(store.tables.find((table) => table.name === paid).status).toBe(
			"Cleaning",
		)
		// The other tables are what the server says, too
		expect(store.tables.find((table) => table.name === "t2h4sh").status).toBe(
			"Occupied",
		)
	})

	it("does not show the paid table free for a moment, before the floor is read again", async () => {
		const run = new AsyncFunction(
			"restaurantStore",
			"restaurantTableName",
			theTableBlockOfAPayment(),
		)

		// The block has no await: it has run, as far as it goes, when it returns its promise
		const running = run(store, paid)

		// Nothing has come back from the server yet: the row is what it was, not Empty
		expect(store.tables.find((table) => table.name === paid).status).not.toBe(
			"Empty",
		)
		await running
	})

	it("is the block of the payment that is run: it reads the floor again", () => {
		expect(theTableBlockOfAPayment()).toContain(
			"restaurantStore.fetchFromNetwork()",
		)
	})

	it("is the only way the till has found to say Empty: no code of the till sets a table to Empty through the store", () => {
		const offenders = sourceFiles(SRC).filter((file) =>
			/updateTableStatus\s*\([^)]*["'`]Empty["'`]/.test(
				readFileSync(file, "utf8"),
			),
		)

		expect(offenders.map((file) => path.relative(SRC, file))).toEqual([])
	})

	it("is what the guard is for: once the copy is written, the store's updateTableStatus does reach the server", async () => {
		await store.updateTableStatus(paid, "Empty")

		expect(statusSent()).toEqual([
			{
				name: "update_table_status",
				args: { table_name: paid, status: "Empty" },
			},
		])
		expect(server.tables.find((table) => table.name === paid).status).toBe(
			"Empty",
		)
	})
})
