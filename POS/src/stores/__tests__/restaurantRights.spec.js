/**
 * //// Neoffice — added file (no upstream equivalent). What the user may manage of the restaurant is what the server
 * //// told the till in its settings (`restaurant_can`, NeoRestau lot 1, task 3), and nothing more: a right it did
 * //// not grant, or did not send yet, is refused.
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

const { tillSettings } = await import("@/stores/posSettings")
const { RESTAURANT_RIGHTS, useRestaurantStore } = await import("../restaurant")

const NONE = Object.fromEntries(RESTAURANT_RIGHTS.map((right) => [right, false]))

describe("the restaurant store knows what the user may manage", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		delete tillSettings.restaurant_can
		store = useRestaurantStore()
	})

	it("knows the six rights the server tells of", () => {
		expect(RESTAURANT_RIGHTS).toEqual([
			"manage_floor",
			"manage_cards",
			"manage_options",
			"manage_workflows",
			"manage_settings",
			"view_tips",
		])
	})

	it("grants what the server granted", () => {
		tillSettings.restaurant_can = { ...NONE, manage_cards: true, view_tips: true }

		expect(store.can).toEqual({ ...NONE, manage_cards: true, view_tips: true })
	})

	it("refuses everything until the server has said", () => {
		expect(store.can).toEqual(NONE)
	})

	it("refuses a right the server did not grant in so many words", () => {
		tillSettings.restaurant_can = { manage_floor: 1, manage_cards: "true", view_tips: null }

		expect(store.can).toEqual(NONE)
	})

	it("follows the settings when another user's are loaded", () => {
		tillSettings.restaurant_can = { ...NONE, manage_floor: true }
		expect(store.can.manage_floor).toBe(true)

		tillSettings.restaurant_can = { ...NONE }

		expect(store.can.manage_floor).toBe(false)
	})
})
