/**
 * //// Neoffice — added file (no upstream equivalent). The till reads the family of every Item Group once, with the rest of the
 * //// restaurant (NeoResto lot 1, service families), and keeps it for the cart: it never walks the group tree itself.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const asked = vi.hoisted(() => {
	globalThis.__ = (s) => s
	return {
		calls: [],
		families: { Pasta: "Main", Soups: "Starter" },
		fail: false,
	}
})
vi.mock("@/utils/apiWrapper", () => ({
	call: vi.fn(async (method) => {
		asked.calls.push(method)
		if (method.endsWith("get_group_families")) {
			if (asked.fail) throw new Error("offline")
			return asked.families
		}
		return null
	}),
}))
vi.mock("../posSettings", () => ({
	usePOSSettingsStore: () => ({ settings: { enable_restaurant_mode: true } }),
}))
vi.mock("../../utils/apiWrapper", () => ({
	call: vi.fn(async (method) => {
		asked.calls.push(method)
		if (method.endsWith("get_group_families")) {
			if (asked.fail) throw new Error("offline")
			return asked.families
		}
		return null
	}),
}))
vi.mock("../../utils/offline/db", () => {
	const table = () => ({
		toArray: async () => [],
		clear: async () => {},
		bulkPut: async () => {},
		put: async () => {},
	})
	return {
		db: {
			restaurant_areas: table(),
			restaurant_tables: table(),
			transaction: async (...args) => args.at(-1)(),
		},
	}
})

const { useRestaurantStore } = await import("../restaurant")
const { familyOfGroup, hasServiceFamilies, setGroupFamilies } = await import(
	"@/utils/serviceFamilies"
)

describe("the till reads the family of every Item Group once", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		setGroupFamilies({})
		asked.calls = []
		asked.fail = false
	})
	afterEach(() => setGroupFamilies({}))

	it("keeps the map the server resolved, up the tree, for the cart to read", async () => {
		await useRestaurantStore().fetchGroupFamilies()

		expect(familyOfGroup("Pasta")).toBe("Main")
		expect(familyOfGroup("Soups")).toBe("Starter")
		expect(familyOfGroup("Shop")).toBe("")
		expect(hasServiceFamilies.value).toBe(true)
	})

	it("is asked with the rest of the restaurant", async () => {
		await useRestaurantStore().fetchFromNetwork()

		expect(asked.calls).toContain(
			"pos_next.api.service_families.get_group_families",
		)
		expect(familyOfGroup("Pasta")).toBe("Main")
	})

	it("leaves the map as it was when the call fails, and says nothing of it to the caller", async () => {
		setGroupFamilies({ Pasta: "Main" })
		asked.fail = true

		await expect(
			useRestaurantStore().fetchGroupFamilies(),
		).resolves.toBeUndefined()

		expect(familyOfGroup("Pasta")).toBe("Main")
	})

	it("tells that a site with no family has none", async () => {
		asked.families = {}

		await useRestaurantStore().fetchGroupFamilies()

		expect(hasServiceFamilies.value).toBe(false)
		asked.families = { Pasta: "Main", Soups: "Starter" }
	})
})
