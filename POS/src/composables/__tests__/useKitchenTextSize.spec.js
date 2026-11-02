/**
 * //// Neoffice — added file (no upstream equivalent). The kitchen screen's text size as the screen holds it (NeoResto lot 1, task 38a-1,
 * //// ruling 109): the cook's pick, kept on the device and read again when the screen opens, shown as the CSS variables the root carries.
 * //// The rules are in utils/kitchenTextSize; this wires them to the browser's storage.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useKitchenTextSize } from "../useKitchenTextSize"

const KEY = "pos_kds_text_size"

beforeEach(() => {
	localStorage.clear()
})
afterEach(() => {
	vi.restoreAllMocks()
})

describe("the text size of the kitchen screen", () => {
	it("opens on Compact when this device has never been asked: the shipped default is the dense one", () => {
		const { size, style } = useKitchenTextSize()

		expect(size.value).toBe("compact")
		expect(style.value["--kds-fs"]).toBe("13px")
	})

	it("cycles on each press, writes the variables of the new size, and keeps the choice on the device", () => {
		const { size, style, cycle } = useKitchenTextSize()

		cycle()
		expect(size.value).toBe("normal")
		expect(style.value["--kds-fs"]).toBe("15px")
		expect(localStorage.getItem(KEY)).toBe("normal")

		cycle()
		cycle()
		expect(size.value).toBe("xl")
		expect(style.value["--kds-btn-h"]).toBe("46px")
		cycle()
		expect(size.value).toBe("compact")
		expect(localStorage.getItem(KEY)).toBe("compact")
	})

	it("opens on the size this device kept, the next time", () => {
		useKitchenTextSize().choose("large")

		const again = useKitchenTextSize()

		expect(again.size.value).toBe("large")
		expect(again.style.value["--kds-fs"]).toBe("18px")
	})

	it("can be set to one size directly, and ignores a size that is not one", () => {
		const { size, choose } = useKitchenTextSize()

		choose("xl")
		expect(size.value).toBe("xl")
		choose("huge")
		expect(size.value).toBe("xl")
		expect(localStorage.getItem(KEY)).toBe("xl")
	})

	it("works as long as the screen is open when the storage refuses: a private window, site data blocked", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied")
		})

		const { size, cycle } = useKitchenTextSize()
		expect(size.value).toBe("compact")
		cycle()

		expect(size.value).toBe("normal")
	})

	it("keeps a size per device: each screen reads its own storage, never a server's", () => {
		const { cycle } = useKitchenTextSize()
		cycle()

		expect(Object.keys(localStorage)).toEqual([KEY])
	})
})
