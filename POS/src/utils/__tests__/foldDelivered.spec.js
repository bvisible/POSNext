/**
 * //// Neoffice — added file (no upstream equivalent). « Replier les services livrés » (NeoResto lot 1, Daniel, 01.11): a device's choice to fold, in the cart of a table's order,
 * //// the courses that are all delivered. ON unless the device says otherwise; kept on the device like the kitchen's text size, and a device whose storage is missing or refuses keeps it
 * //// for the page only.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
	DEFAULT_FOLD_DELIVERED,
	FOLD_DELIVERED_KEY,
	foldDeliveredFromStorage,
	readFoldDelivered,
	saveFoldDelivered,
} from "../foldDelivered"

const storageOf = (overrides = {}) => {
	const values = new Map()
	return {
		values,
		getItem: vi.fn((key) => (values.has(key) ? values.get(key) : null)),
		setItem: vi.fn((key, value) => values.set(key, String(value))),
		...overrides,
	}
}
const useStorage = (storage) =>
	Object.defineProperty(window, "localStorage", {
		value: storage,
		configurable: true,
	})

describe("the value a device stored", () => {
	it("is ON by default: the courses that are all delivered fold unless a device says otherwise", () => {
		expect(DEFAULT_FOLD_DELIVERED).toBe(true)
		expect(foldDeliveredFromStorage(null)).toBe(true)
		expect(foldDeliveredFromStorage(undefined)).toBe(true)
		expect(foldDeliveredFromStorage("garbage")).toBe(true)
		expect(foldDeliveredFromStorage("")).toBe(true)
	})

	it("reads what the device stored", () => {
		expect(foldDeliveredFromStorage("1")).toBe(true)
		expect(foldDeliveredFromStorage("0")).toBe(false)
	})
})

describe("the device's storage", () => {
	const original = Object.getOwnPropertyDescriptor(window, "localStorage")
	beforeEach(() => vi.resetModules())
	afterEach(() => {
		if (original) Object.defineProperty(window, "localStorage", original)
	})

	it("keeps the choice under one key, as 1 or 0", () => {
		const storage = storageOf()
		useStorage(storage)

		saveFoldDelivered(false)
		expect(storage.values.get(FOLD_DELIVERED_KEY)).toBe("0")
		saveFoldDelivered(true)
		expect(storage.values.get(FOLD_DELIVERED_KEY)).toBe("1")
	})

	it("reads it back", () => {
		useStorage(storageOf())
		saveFoldDelivered(false)

		expect(readFoldDelivered()).toBe(false)
	})

	it("reads the default from a device that stored nothing", () => {
		useStorage(storageOf())

		expect(readFoldDelivered()).toBe(true)
	})

	it("reads the default when the storage refuses", () => {
		useStorage(
			storageOf({
				getItem: () => {
					throw new Error("blocked")
				},
			}),
		)

		expect(readFoldDelivered()).toBe(true)
	})

	it("does not fail when the storage cannot be written to", () => {
		useStorage(
			storageOf({
				setItem: () => {
					throw new Error("full")
				},
			}),
		)

		expect(() => saveFoldDelivered(false)).not.toThrow()
	})
})

describe("the choice the cart reads", () => {
	const original = Object.getOwnPropertyDescriptor(window, "localStorage")
	beforeEach(() => vi.resetModules())
	afterEach(() => {
		if (original) Object.defineProperty(window, "localStorage", original)
	})

	it("starts from what the device stored", async () => {
		const storage = storageOf()
		storage.values.set(FOLD_DELIVERED_KEY, "0")
		useStorage(storage)
		const { useFoldDelivered } = await import("@/composables/useFoldDelivered")

		expect(useFoldDelivered().foldDelivered.value).toBe(false)
	})

	it("is kept on the device when it is changed", async () => {
		const storage = storageOf()
		useStorage(storage)
		const { useFoldDelivered } = await import("@/composables/useFoldDelivered")

		useFoldDelivered().setFoldDelivered(false)

		expect(useFoldDelivered().foldDelivered.value).toBe(false)
		expect(storage.values.get(FOLD_DELIVERED_KEY)).toBe("0")
	})

	it("is ONE value for the page: two readers never disagree", async () => {
		useStorage(storageOf())
		const { useFoldDelivered } = await import("@/composables/useFoldDelivered")
		const first = useFoldDelivered()
		const second = useFoldDelivered()

		first.setFoldDelivered(false)

		expect(second.foldDelivered.value).toBe(false)
	})

	it("takes anything truthy or falsy for a yes or a no", async () => {
		useStorage(storageOf())
		const { useFoldDelivered } = await import("@/composables/useFoldDelivered")
		const { foldDelivered, setFoldDelivered } = useFoldDelivered()

		setFoldDelivered(0)
		expect(foldDelivered.value).toBe(false)
		setFoldDelivered("yes")
		expect(foldDelivered.value).toBe(true)
	})
})
