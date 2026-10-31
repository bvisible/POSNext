/**
 * //// Neoffice — added file (no upstream equivalent). Where the status menu of a dish opens on the kitchen ticket
 * //// (NeoRestau lot 1, task 23). The menu used to hang under the dish inside the ticket. Now that a long ticket's dishes
 * //// scroll inside the ticket, a menu hanging inside it would be cut by the foot of the ticket: it is placed on the
 * //// screen instead, below the dish, or above when there is no room below. Fix round 1: opened upward, it is held by its
 * //// LOWER edge, so that it touches the dish whatever its height (a dish being prepared has two buttons, a dish waiting
 * //// has three, and a fixed height left a gap of 44 px over the first).
 */
import { describe, expect, it } from "vitest"
import { placeMenu } from "../menuPlacement"

const VIEWPORT = { width: 1280, height: 800 }
const THREE = { width: 160, height: 142 }
const TWO = { width: 160, height: 98 }

/** A dish line: 300 px wide, 48 px high. */
const line = (left, top) => ({
	left,
	top,
	right: left + 300,
	bottom: top + 48,
	width: 300,
	height: 48,
})

/** The two edges of the menu in window coordinates, wherever the answer anchors it. */
function edges(placed, size, viewport = VIEWPORT) {
	const top =
		placed.top !== undefined
			? placed.top
			: viewport.height - placed.bottom - size.height
	return { top, bottom: top + size.height }
}

describe("the place of a dish's status menu", () => {
	it("opens right under the dish, held by its upper edge, its right edge on the dish's right edge, when there is room", () => {
		const placed = placeMenu(line(100, 200), THREE, VIEWPORT)

		expect(placed.placement).toBe("below")
		expect(placed.top).toBe(248 + 4)
		expect(placed.bottom).toBeUndefined()
		expect(placed.left).toBe(400 - 160)
	})

	it("opens above the dish when the room below is too short for it, held by its LOWER edge", () => {
		const placed = placeMenu(line(100, 700), THREE, VIEWPORT)

		expect(placed.placement).toBe("above")
		// The lower edge of the menu is 4 px over the dish: 800 (the window) - 700 (the dish's top) + 4
		expect(placed.bottom).toBe(104)
		expect(placed.top).toBeUndefined()
	})

	it("touches the dish whatever the height of the menu: two buttons or three leave the same 4 px", () => {
		const high = placeMenu(line(100, 700), THREE, VIEWPORT)
		const low = placeMenu(line(100, 700), TWO, VIEWPORT)

		expect(low.bottom).toBe(high.bottom)
		// In window coordinates: the menu ends at 696, 4 px over a dish that starts at 700
		expect(edges(low, TWO).bottom).toBe(696)
		expect(edges(high, THREE).bottom).toBe(696)
	})

	it("counts the room the menu really needs: a menu of two buttons fits where one of three does not", () => {
		// The dish ends at 688: 800 - 688 - 4 - 8 = 100 px under it
		const anchor = line(100, 640)

		expect(placeMenu(anchor, TWO, VIEWPORT).placement).toBe("below")
		expect(placeMenu(anchor, THREE, VIEWPORT).placement).toBe("above")
	})

	it("stays on the screen on the left: a dish that starts off screen does not push the menu out", () => {
		// The dish ends at x = 100, a menu 160 wide aligned to it would start at -60
		expect(placeMenu(line(-200, 200), THREE, VIEWPORT).left).toBe(8)
	})

	it("stays on the screen on the right", () => {
		const { left } = placeMenu(line(1100, 200), THREE, VIEWPORT)

		expect(left + THREE.width).toBeLessThanOrEqual(1280 - 8)
	})

	it("takes the roomier side, kept on the screen, when neither side has room for it", () => {
		const small = { width: 1024, height: 200 }
		const placed = placeMenu(line(100, 80), THREE, small)

		expect(placed.placement).toBe("above")
		const { top, bottom } = edges(placed, THREE, small)
		expect(top).toBeGreaterThanOrEqual(8)
		expect(bottom).toBeLessThanOrEqual(200 - 8)
	})

	it("sits fully on the screen whatever the dish's place and the menu's height", () => {
		for (const size of [TWO, THREE]) {
			for (let y = -40; y <= 840; y += 20) {
				for (const x of [-50, 0, 400, 1000, 1250]) {
					const placed = placeMenu(line(x, y), size, VIEWPORT)
					const { top, bottom } = edges(placed, size)
					expect(top, `${size.height} at ${x},${y}`).toBeGreaterThanOrEqual(8)
					expect(bottom).toBeLessThanOrEqual(VIEWPORT.height - 8)
					expect(placed.left).toBeGreaterThanOrEqual(8)
					expect(placed.left + size.width).toBeLessThanOrEqual(
						VIEWPORT.width - 8,
					)
				}
			}
		}
	})
})
