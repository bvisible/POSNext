/**
 * //// Neoffice — added file (no upstream equivalent). Whether the till asks how many people are seated the first time a table is opened is a setting of the restaurant (NeoResto lot 1, covers): `ask_covers_on_open`,
 * //// ON when the server does not say (a server that does not know the setting yet, a restaurant that never saved it) and OFF only when the restaurant says 0.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())

vi.mock("@/utils/apiWrapper", () => ({ call }))
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

const GET = "pos_next.api.restaurant.get_restaurant_settings"

describe("the setting that makes the till ask how many people are seated", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		store = useRestaurantStore()
	})

	it("is on before the server has said anything", () => {
		expect(store.askCoversOnOpen).toBe(true)
		expect(store.restaurantSettings.ask_covers_on_open).toBe(1)
	})

	it("is on when the server answers without the setting", async () => {
		call.mockResolvedValue({ opening_hours: [], is_open: true })

		await store.fetchRestaurantSettings()

		expect(call).toHaveBeenCalledWith(GET, { restaurant: undefined })
		expect(store.restaurantSettings.ask_covers_on_open).toBeUndefined()
		expect(store.askCoversOnOpen).toBe(true)
	})

	it("is on when the restaurant says 1", async () => {
		call.mockResolvedValue({ opening_hours: [], ask_covers_on_open: 1 })

		await store.fetchRestaurantSettings()

		expect(store.askCoversOnOpen).toBe(true)
	})

	it("is off when the restaurant says 0", async () => {
		call.mockResolvedValue({ opening_hours: [], ask_covers_on_open: 0 })

		await store.fetchRestaurantSettings()

		expect(store.askCoversOnOpen).toBe(false)
	})

	it("is off for the other ways a 0 is written", async () => {
		for (const off of [false, "0"]) {
			call.mockResolvedValue({ opening_hours: [], ask_covers_on_open: off })
			await store.fetchRestaurantSettings()
			expect(store.askCoversOnOpen, String(off)).toBe(false)
		}
	})

	it("follows the restaurant when it switches the setting back on", async () => {
		call.mockResolvedValue({ opening_hours: [], ask_covers_on_open: 0 })
		await store.fetchRestaurantSettings()
		call.mockResolvedValue({ opening_hours: [], ask_covers_on_open: 1 })

		await store.fetchRestaurantSettings()

		expect(store.askCoversOnOpen).toBe(true)
	})
})
