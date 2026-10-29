/**
 * //// Neoffice — added file (no upstream equivalent). The settings of the restaurant (opening hours, tips, QR
 * //// and takeaway ordering, reservations) are a restaurant's own: the store reads them for the restaurant the
 * //// till belongs to and saves them back onto that same restaurant. Until the till's settings name their
 * //// restaurant the server picks it, and a site without any restaurant reads empty settings and keeps working.
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

const { tillSettings } = await import("@/stores/posSettings")
const { useRestaurantStore } = await import("../restaurant")

const GET = "pos_next.api.restaurant.get_restaurant_settings"
const SAVE = "pos_next.api.restaurant.save_restaurant_settings"
const SAVE_TIPS = "pos_next.api.restaurant.save_tip_settings"
const LUNCH = {
	day_of_week: "Monday",
	from_time: "09:00",
	to_time: "14:00",
	label: "Lunch",
	restaurant_card: null,
}

describe("restaurant settings are read and saved per restaurant", () => {
	let store
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		call.mockResolvedValue({
			opening_hours: [],
			is_open: true,
			current_slot: null,
		})
		tillSettings.restaurant = undefined
		store = useRestaurantStore()
	})

	it("reads the settings of the restaurant the till belongs to", async () => {
		tillSettings.restaurant = "Main Restaurant"

		await store.fetchRestaurantSettings()

		expect(call).toHaveBeenCalledWith(GET, { restaurant: "Main Restaurant" })
	})

	it("names no restaurant while the till does not, and lets the server pick", async () => {
		await store.fetchRestaurantSettings()

		expect(call).toHaveBeenCalledWith(GET, { restaurant: undefined })
	})

	it("keeps what the server answers: the hours, the tips and the open status", async () => {
		call.mockResolvedValue({
			restaurant: "Main Restaurant",
			opening_hours: [LUNCH],
			enable_tips: true,
			is_open: false,
			current_slot: null,
		})

		await store.fetchRestaurantSettings()

		expect(store.restaurantSettings.restaurant).toBe("Main Restaurant")
		expect(store.restaurantSettings.opening_hours).toEqual([LUNCH])
		expect(store.restaurantSettings.enable_tips).toBe(true)
		expect(store.restaurantStatus.isOpen).toBe(false)
	})

	it("works on a site that has no restaurant: empty settings, the features off", async () => {
		await store.fetchRestaurantSettings()

		expect(store.restaurantSettings.opening_hours).toEqual([])
		expect(store.restaurantSettings.enable_tips).toBeFalsy()
		expect(store.restaurantStatus.isOpen).toBe(true)
		expect(store.runnerEnabled).toBe(true)
	})

	it("saves the opening hours onto the restaurant the settings were read for", async () => {
		call.mockResolvedValue({
			restaurant: "Main Restaurant",
			opening_hours: [],
			is_open: true,
		})
		await store.fetchRestaurantSettings()
		call.mockClear()

		await store.saveRestaurantSettings([LUNCH])

		expect(call.mock.calls[0]).toEqual([
			SAVE,
			{
				settings: JSON.stringify({ opening_hours: [LUNCH] }),
				restaurant: "Main Restaurant",
			},
		])
		// The screen then shows what the server kept
		expect(call.mock.calls[1][0]).toBe(GET)
	})

	it("prefers the restaurant the till names to the one last read", async () => {
		call.mockResolvedValue({
			restaurant: "Bar",
			opening_hours: [],
			is_open: true,
		})
		await store.fetchRestaurantSettings()
		tillSettings.restaurant = "Main Restaurant"

		await store.updateRestaurantSettings({ enable_runner: 0 })

		expect(call).toHaveBeenLastCalledWith(SAVE, {
			settings: JSON.stringify({ enable_runner: 0 }),
			restaurant: "Main Restaurant",
		})
	})

	it("saves the other settings, the QR and takeaway ones, in a single call", async () => {
		const fields = {
			enable_qr_ordering: 1,
			guest_menu: "Main Menu",
			token_expiry_days: 7,
		}

		await store.updateRestaurantSettings(fields)

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(SAVE, {
			settings: JSON.stringify(fields),
			restaurant: undefined,
		})
	})

	it("saves the tip settings and hands back the item and the account the server made", async () => {
		call.mockResolvedValue({
			status: "success",
			tip_item: "TIP",
			tip_account: "2211 - Tips",
		})

		const answer = await store.saveTipSettings({
			enable_tips: 1,
			auto_detect_tip: 0,
		})

		expect(call).toHaveBeenCalledWith(SAVE_TIPS, {
			settings: JSON.stringify({ enable_tips: 1, auto_detect_tip: 0 }),
			restaurant: undefined,
		})
		expect(answer.tip_item).toBe("TIP")
	})

	it("tells the caller when a save fails", async () => {
		call.mockRejectedValue(new Error("Not permitted"))

		await expect(
			store.updateRestaurantSettings({ enable_runner: 0 }),
		).rejects.toThrow("Not permitted")
		await expect(store.saveTipSettings({ enable_tips: 1 })).rejects.toThrow(
			"Not permitted",
		)
	})

	it("leaves the screen as it was when reading fails", async () => {
		call.mockRejectedValue(new Error("offline"))

		await store.fetchRestaurantSettings()

		expect(store.restaurantStatus.isOpen).toBe(true)
	})
})
