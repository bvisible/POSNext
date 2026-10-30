/**
 * //// Neoffice — added file (no upstream equivalent). The address that the QR code on a restaurant's tables opens, the
 * //// call that reads the menu behind it, and how a price is written on it (NeoRestau lot 1, task 17).
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
	fetchPublicMenu,
	forgetPublicMenu,
	formatPrice,
	publicMenuPath,
	publicMenuUrl,
	recentPublicMenu,
} = await import("../publicMenu")

const MENU = { restaurant: { name: "The Bistro", logo: "" }, currency: "CHF", card: null, sections: [] }
const answers = (message, init = {}) =>
	vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ message }), ...init }))

describe("the address of a restaurant's public menu", () => {
	it("is /pos/menu/<restaurant> on the site", () => {
		expect(publicMenuPath("The Bistro")).toBe("/pos/menu/The%20Bistro")
		expect(publicMenuUrl("The Bistro", "https://bistro.example.test")).toBe(
			"https://bistro.example.test/pos/menu/The%20Bistro",
		)
	})

	it("is on the site the till is opened on, unless told another", () => {
		expect(publicMenuUrl("The Bistro")).toBe(`${window.location.origin}/pos/menu/The%20Bistro`)
	})

	it("keeps a name with spaces, accents and signs in one piece of the path", () => {
		const path = publicMenuPath("Café & Bar / Grill #1?")

		expect(path).toBe("/pos/menu/Caf%C3%A9%20%26%20Bar%20%2F%20Grill%20%231%3F")
		expect(path.slice("/pos/menu/".length)).not.toMatch(/[ /&#?]/)
		expect(decodeURIComponent(path.slice("/pos/menu/".length))).toBe("Café & Bar / Grill #1?")
	})
})

describe("reading the public menu", () => {
	beforeEach(() => {
		forgetPublicMenu()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
	})

	it("is one plain GET of the endpoint with the restaurant in the query", async () => {
		const read = answers(MENU)
		vi.stubGlobal("fetch", read)

		await expect(fetchPublicMenu("Café & Bar")).resolves.toEqual(MENU)

		expect(read).toHaveBeenCalledTimes(1)
		expect(read.mock.calls[0][0]).toBe(
			"/api/method/pos_next.api.public_menu.get_public_menu?restaurant=Caf%C3%A9%20%26%20Bar",
		)
		expect(read.mock.calls[0][1].method).toBeUndefined()
		expect(read.mock.calls[0][1].body).toBeUndefined()
		expect(read.mock.calls[0][1].cache).toBe("no-store")
	})

	it("rejects whatever is not a menu: a refusal, a page of a proxy, an answer with no sections", async () => {
		vi.stubGlobal("fetch", answers(MENU, { ok: false, status: 404 }))
		await expect(fetchPublicMenu("The Bistro")).rejects.toThrow("HTTP 404")

		for (const message of [undefined, null, "oops", {}, { restaurant: {} }, { sections: [] }]) {
			vi.stubGlobal("fetch", answers(message))
			await expect(fetchPublicMenu("The Bistro")).rejects.toThrow()
		}
		vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))))
		await expect(fetchPublicMenu("The Bistro")).rejects.toThrow("Failed to fetch")
		expect(recentPublicMenu("The Bistro")).toBeNull()
	})

	it("remembers the menu it read for a minute, for the restaurant it was read for", async () => {
		vi.useFakeTimers()
		const read = answers(MENU)
		vi.stubGlobal("fetch", read)

		await fetchPublicMenu("The Bistro")
		expect(recentPublicMenu("The Bistro")).toEqual(MENU)
		expect(recentPublicMenu("Another")).toBeNull()

		await fetchPublicMenu("The Bistro")
		expect(read).toHaveBeenCalledTimes(1)

		vi.advanceTimersByTime(59_000)
		expect(recentPublicMenu("The Bistro")).toEqual(MENU)
		vi.advanceTimersByTime(2_000)
		expect(recentPublicMenu("The Bistro")).toBeNull()

		await fetchPublicMenu("The Bistro")
		expect(read).toHaveBeenCalledTimes(2)
	})
})

describe("a price on the public menu", () => {
	it("is written as an amount of money in the currency of the restaurant, with two decimals", () => {
		const expected = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: "CHF",
			minimumFractionDigits: 2,
		}).format(18.5)

		expect(formatPrice(18.5, "CHF")).toBe(expected)
		expect(formatPrice(18.5, "CHF")).toContain("18.50")
	})

	it("is in francs when the menu names no currency, and a number when the currency is not one", () => {
		expect(formatPrice(4, undefined)).toContain("CHF")
		expect(formatPrice(4, "not a currency")).toBe("4.00")
	})
})
