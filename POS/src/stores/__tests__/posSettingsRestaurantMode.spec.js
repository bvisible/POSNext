//// Neoffice — added file (no upstream equivalent). A till is a restaurant till or a counter till by
//// its OWN POS Settings (enable_restaurant_mode), never by a switch on the device: the header switch
//// and the per-device localStorage override it wrote are gone, so no stored value may win over the
//// setting, and old devices drop the key. The mode the store holds is the EFFECTIVE one the server
//// sent (the tick, counted only where the site runs NeoRestau and for a till that names its restaurant,
//// NeoRestau lot 1, task 4): the store holds no second copy of it, and knows whether the site runs NeoRestau.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const KEY = "pos_next_restaurant_mode"

const bootstrap = { getPreloadedPOSSettings: vi.fn(() => null) }
let apiSettings = {}

vi.mock("../bootstrap", () => ({ useBootstrapStore: () => bootstrap }))
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))
// The settings resource answers with whatever the test put in apiSettings, like get_pos_settings would.
vi.mock("frappe-ui", () => ({
	createResource: (options) => ({
		submit: vi.fn(async () => {
			options.onSuccess(apiSettings)
			return apiSettings
		}),
	}),
}))

const { usePOSSettingsStore } = await import("../posSettings")

// Both ways the till gets its settings: handed over by the bootstrap call, or fetched on its own.
const LOADS = {
	"bootstrap preload": (settings) => {
		bootstrap.getPreloadedPOSSettings.mockReturnValue(settings)
	},
	"API fallback": (settings) => {
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = settings
	},
}

describe("posSettings: restaurant mode follows the till's own settings", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		localStorage.clear()
		bootstrap.getPreloadedPOSSettings.mockReset()
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = {}
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe.each(Object.entries(LOADS))("%s", (_name, serve) => {
		it.each([
			[1, "0"],
			[0, "1"],
			[1, "1"],
			[0, "0"],
			[1, null],
			[0, null],
		])("setting %s wins over a device value of %s, and the key is removed", async (setting, stored) => {
			if (stored !== null) localStorage.setItem(KEY, stored)
			serve({ enabled: 1, enable_restaurant_mode: setting })
			const store = usePOSSettingsStore()

			expect(await store.loadSettings("POS-1")).toBe(true)

			expect(store.settings.enable_restaurant_mode).toBe(setting)
			expect(localStorage.getItem(KEY)).toBeNull()
		})
	})

	it("follows a change of the setting on reload, whatever the device still stores", async () => {
		LOADS["API fallback"]({ enabled: 1, enable_restaurant_mode: 0 })
		const store = usePOSSettingsStore()
		await store.loadSettings("POS-1")
		expect(store.settings.enable_restaurant_mode).toBe(0)

		// A stale value from an older version, and the setting turned on by the back-office meanwhile.
		localStorage.setItem(KEY, "0")
		apiSettings = { enabled: 1, enable_restaurant_mode: 1 }
		await store.reloadSettings()

		expect(store.settings.enable_restaurant_mode).toBe(1)
		expect(localStorage.getItem(KEY)).toBeNull()
	})

	it("offers no way to flip the mode on the device", () => {
		const store = usePOSSettingsStore()

		expect(store.toggleRestaurantMode).toBeUndefined()
	})

	it("still loads the settings when the browser refuses to touch its storage", async () => {
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new Error("storage is blocked")
		})
		LOADS["bootstrap preload"]({ enabled: 1, enable_restaurant_mode: 1 })
		const store = usePOSSettingsStore()

		expect(await store.loadSettings("POS-1")).toBe(true)

		expect(store.settings.enable_restaurant_mode).toBe(1)
	})

	it("holds no second copy of the mode: the settings the server sent are the one source", () => {
		expect(usePOSSettingsStore().enableRestaurantMode).toBeUndefined()
	})
})

describe("posSettings: whether the site runs NeoRestau", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		bootstrap.getPreloadedPOSSettings.mockReset()
		bootstrap.getPreloadedPOSSettings.mockReturnValue(null)
		apiSettings = {}
	})

	it("is off until the server says so", () => {
		expect(usePOSSettingsStore().settings.neorestau_active).toBe(false)
	})

	it.each(Object.entries(LOADS))("is carried as the server sent it, %s", async (_name, serve) => {
		for (const active of [true, false]) {
			setActivePinia(createPinia())
			serve({ enabled: 1, neorestau_active: active })
			const store = usePOSSettingsStore()

			await store.loadSettings("POS-1")

			expect(store.settings.neorestau_active).toBe(active)
		}
	})

	it("is forgotten with the rest of the settings when the next user signs in", async () => {
		LOADS["API fallback"]({ enabled: 1, neorestau_active: true, enable_restaurant_mode: 1 })
		const store = usePOSSettingsStore()
		await store.loadSettings("POS-1")

		store.resetSettings()

		expect(store.settings.neorestau_active).toBe(false)
		expect(store.settings.enable_restaurant_mode).toBe(0)
	})
})
