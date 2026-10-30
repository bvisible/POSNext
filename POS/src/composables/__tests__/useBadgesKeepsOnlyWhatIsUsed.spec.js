/**
 * //// Neoffice — added file (no upstream equivalent). The badges composable offers what a screen calls and nothing
 * //// else (NeoRestau lot 1, task 9, fix round 1). A panel once read and saved the badges of a dish through it; the panel
 * //// is gone (the item sheet reads the catalogue here and saves with update_item_badges itself), and loadItemBadges and
 * //// saveItemBadges, with a raw fetch and a CSRF header of their own, stayed with no caller.
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn() }))

const { useBadges } = await import("../useBadges")
const sources = import.meta.glob(["/src/**/*.vue", "/src/**/*.js"], {
	query: "?raw",
	import: "default",
	eager: true,
})

describe("the badges composable", () => {
	const offered = Object.entries(useBadges())
		.filter(([, value]) => typeof value === "function")
		.map(([name]) => name)

	it("still offers what the item sheet calls", () => {
		expect(offered).toEqual(
			expect.arrayContaining([
				"loadMenuBadges",
				"getBadgesByType",
				"getBadgeIconUrl",
			]),
		)
	})

	it("offers only functions that a screen calls", () => {
		const callers = Object.entries(sources).filter(
			([path]) =>
				!path.includes("/__tests__/") &&
				!path.endsWith("/composables/useBadges.js"),
		)
		const unused = offered.filter(
			(name) =>
				!callers.some(([, source]) => new RegExp(`\\b${name}\\b`).test(source)),
		)
		expect(unused).toEqual([])
	})
})
