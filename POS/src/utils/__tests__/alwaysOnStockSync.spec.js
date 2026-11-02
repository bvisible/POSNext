/**
 * //// Neoffice — added file (no upstream equivalent). The background refresh of the stock quantities is always on,
 * //// every minute, with no switch and no interval to set (NeoResto lot 1, task 13, ruling 84): a till with nothing
 * //// stored starts it; a device that kept `{ enabled: false }` (or a longer interval) from the old switch starts it
 * //// at 60 s and forgets the key. The till's page calls this and reads nothing from the storage any more.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	OLD_STOCK_SYNC_SETTING_KEY,
	STOCK_SYNC_INTERVAL_MS,
	startAlwaysOnStockSync,
} from "../alwaysOnStockSync"

function aWorker() {
	const calls = []
	return {
		calls,
		configureStockSync: vi.fn(async (config) => {
			calls.push(["configure", config])
			return { ...config, enabled: false }
		}),
		startStockSync: vi.fn(async () => {
			calls.push(["start"])
			return { status: "started" }
		}),
	}
}

const WHAT = { warehouse: "Store - T", itemCodes: ["COFFEE", "TART"] }

beforeEach(() => localStorage.clear())

describe("the stock refresh of a till", () => {
	it("starts on a till with nothing stored, every 60 seconds, for the items it shows", async () => {
		const worker = aWorker()

		const { result } = await startAlwaysOnStockSync(worker, WHAT)

		expect(STOCK_SYNC_INTERVAL_MS).toBe(60000)
		expect(worker.calls).toEqual([
			["configure", { warehouse: "Store - T", itemCodes: ["COFFEE", "TART"], intervalMs: 60000 }],
			["start"],
		])
		expect(result).toEqual({ status: "started" })
	})

	it("starts at 60 seconds on a device that kept the old switch off with a longer interval, and forgets the key", async () => {
		localStorage.setItem(OLD_STOCK_SYNC_SETTING_KEY, JSON.stringify({ enabled: false, intervalSeconds: 300 }))
		const worker = aWorker()

		await startAlwaysOnStockSync(worker, WHAT)

		expect(worker.startStockSync).toHaveBeenCalledTimes(1)
		expect(worker.configureStockSync.mock.calls[0][0].intervalMs).toBe(60000)
		expect(localStorage.getItem(OLD_STOCK_SYNC_SETTING_KEY)).toBeNull()
	})

	it("ignores an interval an older till had set, and a value that is not even readable", async () => {
		for (const stored of [JSON.stringify({ enabled: true, intervalSeconds: 30 }), "{not json"]) {
			localStorage.setItem(OLD_STOCK_SYNC_SETTING_KEY, stored)
			const worker = aWorker()

			await startAlwaysOnStockSync(worker, WHAT)

			expect(worker.configureStockSync.mock.calls[0][0].intervalMs).toBe(60000)
			expect(worker.startStockSync).toHaveBeenCalledTimes(1)
			expect(localStorage.getItem(OLD_STOCK_SYNC_SETTING_KEY)).toBeNull()
		}
	})

	it("starts even where the browser's storage cannot be used", async () => {
		const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})
		const worker = aWorker()

		await startAlwaysOnStockSync(worker, WHAT)

		expect(worker.startStockSync).toHaveBeenCalledTimes(1)
		remove.mockRestore()
	})
})

describe("the till's page", () => {
	const sale = readFileSync(path.resolve(__dirname, "../../pages/POSSale.vue"), "utf8")
	const screen = readFileSync(path.resolve(__dirname, "../../components/settings/TillSettingsScreen.vue"), "utf8")

	it("starts the refresh through the always-on call, and no longer reads a stored switch or interval", () => {
		expect(sale).toMatch(/startAlwaysOnStockSync\(offlineWorker, \{ warehouse, itemCodes \}\)/)
		expect(sale).not.toMatch(/localStorage\.\w+\(\s*["']pos_stock_sync_settings/)
		expect(sale).not.toMatch(/syncEnabled|syncIntervalMs/)
	})

	it("leaves the others' reconfiguration (a new warehouse, new items) to the interval it already runs at", () => {
		const update = sale.slice(sale.indexOf("async function updatePeriodicStockSyncItems"))
		expect(update.slice(0, 600)).not.toMatch(/intervalMs/)
	})

	it("has no switch and no interval in the settings screen, which only shows the state", () => {
		expect(screen).not.toMatch(/stock_sync_enabled|stock_sync_interval|STOCK_SYNC_KEY|readStockSync/)
		expect(screen).not.toMatch(/configureStockSync|startStockSync|stopStockSync/)
	})
})
