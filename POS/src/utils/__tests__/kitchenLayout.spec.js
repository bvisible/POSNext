/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen can lay its two bands out in two ways, stacked
 * //// or side by side (NeoRestau lot 1, task 23). The choice is a habit of the DEVICE: a tablet on the wall and a tablet
 * //// held upright do not read the same way. It is kept in the browser's storage, which can be missing, full or refused,
 * //// and a fresh device has to open on a layout of its own without ever having been asked.
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	DEFAULT_LAYOUTS,
	LAYOUTS,
	LAYOUT_BANDS,
	LAYOUT_COLUMNS,
	LAYOUT_STORAGE_KEY,
	defaultLayout,
	readLayout,
	resolveLayout,
	saveLayout,
} from "../kitchenLayout"

beforeEach(() => {
	localStorage.clear()
})

describe("the two layouts", () => {
	it("are called bands (one above the other) and columns (side by side)", () => {
		expect(LAYOUTS).toEqual([LAYOUT_BANDS, LAYOUT_COLUMNS])
		expect(LAYOUT_BANDS).toBe("bands")
		expect(LAYOUT_COLUMNS).toBe("columns")
	})

	it("are kept under the key the other settings of this screen share the prefix of", () => {
		expect(LAYOUT_STORAGE_KEY).toBe("pos_kds_layout")
	})
})

describe("the layout kept on this device", () => {
	it("is read back as it was saved", () => {
		expect(saveLayout(LAYOUT_COLUMNS)).toBe(true)
		expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe("columns")
		expect(readLayout()).toBe(LAYOUT_COLUMNS)

		saveLayout(LAYOUT_BANDS)
		expect(readLayout()).toBe(LAYOUT_BANDS)
	})

	it("is nothing on a fresh device", () => {
		expect(readLayout()).toBe(null)
	})

	it("is nothing when what is stored is not a layout of ours: a value from another version never picks a layout", () => {
		for (const value of ["", "grid", "BANDS", "undefined", "1", "{}"]) {
			localStorage.setItem(LAYOUT_STORAGE_KEY, value)
			expect(readLayout(), value).toBe(null)
		}
	})

	it("refuses to save what is not a layout", () => {
		expect(saveLayout("grid")).toBe(false)
		expect(saveLayout(undefined)).toBe(false)
		expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe(null)
	})

	it("survives a storage that throws on read, on write, or that is not there: the screen opens, on its default", () => {
		const refusing = {
			getItem() {
				throw new Error("SecurityError")
			},
			setItem() {
				throw new Error("QuotaExceededError")
			},
		}
		expect(readLayout(refusing)).toBe(null)
		expect(saveLayout(LAYOUT_COLUMNS, refusing)).toBe(false)
		expect(readLayout(null)).toBe(null)
		expect(saveLayout(LAYOUT_COLUMNS, null)).toBe(false)
	})

	it("survives a window whose `localStorage` is a trap: reading the property itself throws", () => {
		const spy = vi
			.spyOn(window, "localStorage", "get")
			.mockImplementation(() => {
				throw new Error("SecurityError")
			})
		expect(readLayout()).toBe(null)
		expect(saveLayout(LAYOUT_BANDS)).toBe(false)
		spy.mockRestore()
	})
})

describe("the layout a screen opens on", () => {
	it("is the columns on a tablet held flat AND on one held upright: measured, side by side reads better in both (task 23 report)", () => {
		// 30 tickets waiting, 15 in preparation, one of 25 dishes, on 1280 x 800 and on 800 x 1280: side by side shows the
		// dishes of a ticket whole where the bands clip them (5 dishes of the long ticket against 1 or 2 in landscape, 11
		// against 4 in portrait) and more tickets complete (3 + 2 against 2 + 2 in portrait). If a real tablet says otherwise
		// for one orientation, that value of DEFAULT_LAYOUTS is the one to change.
		expect(defaultLayout({ portrait: false })).toBe(LAYOUT_COLUMNS)
		expect(defaultLayout({ portrait: true })).toBe(LAYOUT_COLUMNS)
		expect(DEFAULT_LAYOUTS).toEqual({
			landscape: LAYOUT_COLUMNS,
			portrait: LAYOUT_COLUMNS,
		})
	})

	it("is chosen by the way the tablet is held, from a table of two entries: a differing one is followed to the letter", () => {
		const table = { landscape: LAYOUT_COLUMNS, portrait: LAYOUT_BANDS }

		expect(defaultLayout({ portrait: false }, table)).toBe(LAYOUT_COLUMNS)
		expect(defaultLayout({ portrait: true }, table)).toBe(LAYOUT_BANDS)
		expect(
			resolveLayout({ stored: null, portrait: true, wide: true }, table),
		).toBe(LAYOUT_BANDS)
		expect(
			resolveLayout({ stored: null, portrait: false, wide: true }, table),
		).toBe(LAYOUT_COLUMNS)
	})

	it("is what the cook picked, whatever the orientation, once he has picked", () => {
		const table = { landscape: LAYOUT_COLUMNS, portrait: LAYOUT_BANDS }
		for (const portrait of [false, true]) {
			for (const stored of LAYOUTS) {
				expect(resolveLayout({ stored, portrait, wide: true }, table)).toBe(
					stored,
				)
			}
		}
	})

	it("is the default of the orientation until he picks: and follows the tablet when it is turned", () => {
		expect(resolveLayout({ stored: null, portrait: false, wide: true })).toBe(
			defaultLayout({ portrait: false }),
		)
		expect(resolveLayout({ stored: null, portrait: true, wide: true })).toBe(
			defaultLayout({ portrait: true }),
		)
	})

	it("ignores a stored value that is not a layout, as if nothing had been stored", () => {
		expect(resolveLayout({ stored: "grid", portrait: false, wide: true })).toBe(
			defaultLayout({ portrait: false }),
		)
	})

	it("is always the bands on a screen too narrow to put two ticket columns side by side, a pick or not", () => {
		for (const stored of [null, ...LAYOUTS]) {
			for (const portrait of [false, true]) {
				expect(resolveLayout({ stored, portrait, wide: false })).toBe(
					LAYOUT_BANDS,
				)
			}
		}
	})
})
