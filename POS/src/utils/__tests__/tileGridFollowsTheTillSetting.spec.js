/**
 * //// Neoffice — added file (no upstream equivalent). The till's setting « Tiles per row » (NeoResto lot 1, task
 * //// 13; product owner, 30.10.2026): « Automatic » keeps the grids as they always were, a number from 3 to 8 fixes
 * //// the row, and anything else is read as automatic. A till that never chose reads « Automatic ».
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { describe, expect, it, vi } from "vitest"
import {
	CARD_GRID_AUTOMATIC_CLASSES,
	FIXED_GRID_CLASS,
	TILES_PER_ROW_MAX,
	TILES_PER_ROW_MIN,
	cardGridClasses,
	tileGridClass,
	tileGridStyle,
	tilesPerRow,
} from "../tileGrid"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/stores/bootstrap", () => ({ useBootstrapStore: () => ({ getPreloadedPOSSettings: () => null }) }))
vi.mock("frappe-ui", () => ({ createResource: () => ({ submit: vi.fn(), reload: vi.fn() }) }))

describe("the number of tiles a row shows", () => {
	it("is a whole number from 3 to 8", () => {
		expect([TILES_PER_ROW_MIN, TILES_PER_ROW_MAX]).toEqual([3, 8])
		for (const count of [3, 4, 5, 6, 7, 8]) {
			expect(tilesPerRow(String(count))).toBe(count)
			expect(tilesPerRow(count)).toBe(count)
		}
	})

	it("is automatic for « Automatic », for nothing, and for anything out of its bounds", () => {
		for (const value of ["Automatic", "", null, undefined, "2", "9", "0", "-4", "6.5", "six", 12]) {
			expect(tilesPerRow(value)).toBeNull()
		}
	})
})

describe("the grid a setting draws", () => {
	it("fixes the columns of a row when the number is set", () => {
		expect(tileGridStyle("6")).toEqual({ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" })
		expect(tileGridClass("6")).toBe(FIXED_GRID_CLASS)
		expect(cardGridClasses("6")).toBe(FIXED_GRID_CLASS)
	})

	it("keeps the grids as they were when automatic", () => {
		expect(tileGridStyle("Automatic")).toEqual({})
		expect(tileGridClass("Automatic")).toBe("")
		expect(cardGridClasses("Automatic")).toBe(CARD_GRID_AUTOMATIC_CLASSES)
		expect(CARD_GRID_AUTOMATIC_CLASSES).toBe(
			"grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
		)
	})
})

describe("a till that never chose", () => {
	it("reads « Automatic » until the server says otherwise", async () => {
		setActivePinia(createPinia())
		const { usePOSSettingsStore } = await import("@/stores/posSettings")

		const store = usePOSSettingsStore()
		expect(store.settings.tiles_per_row).toBe("Automatic")
		expect(store.tilesPerRow).toBeNull()
		store.settings.tiles_per_row = "7"
		expect(store.tilesPerRow).toBe(7)
	})
})
