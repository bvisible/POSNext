/**
 * //// Neoffice — added file (no upstream equivalent). Where the status menu of a dish opens on the kitchen ticket
 * //// (NeoRestau lot 1, task 23). The menu used to hang under the dish inside the ticket. Now that a long ticket's dishes
 * //// scroll inside the ticket, a menu hanging inside it would be cut by the foot of the ticket: it is placed on the
 * //// screen instead, below the dish, or above when there is no room below.
 */
import { describe, expect, it } from "vitest"
import { placeMenu } from "../menuPlacement"

const VIEWPORT = { width: 1280, height: 800 }
const MENU = { width: 160, height: 140 }

/** A dish line: 300 px wide, 48 px high. */
const line = (left, top) => ({
	left,
	top,
	right: left + 300,
	bottom: top + 48,
	width: 300,
	height: 48,
})

describe("the place of a dish's status menu", () => {
	it("opens right under the dish, its right edge on the dish's right edge, when there is room", () => {
		const { top, left } = placeMenu(line(100, 200), MENU, VIEWPORT)
		expect(top).toBe(248 + 4)
		expect(left).toBe(400 - 160)
	})

	it("opens above the dish when the room below is too short for it", () => {
		const { top } = placeMenu(line(100, 700), MENU, VIEWPORT)
		expect(top).toBe(700 - 4 - 140)
		// And it does not cover the dish
		expect(top + MENU.height).toBeLessThanOrEqual(700)
	})

	it("stays on the screen on the left: a dish that starts off screen does not push the menu out", () => {
		// The dish ends at x = 100, a menu 160 wide aligned to it would start at -60
		const { left } = placeMenu(line(-200, 200), MENU, VIEWPORT)
		expect(left).toBe(8)
	})

	it("stays on the screen on the right", () => {
		const { left } = placeMenu(line(1100, 200), MENU, VIEWPORT)
		expect(left + MENU.width).toBeLessThanOrEqual(1280 - 8)
	})

	it("takes the roomier side, kept on the screen, when neither side has room for it", () => {
		const small = { width: 1024, height: 200 }
		const { top } = placeMenu(line(100, 80), MENU, small)
		expect(top).toBeGreaterThanOrEqual(8)
		expect(top + MENU.height).toBeLessThanOrEqual(200 - 8)
	})

	it("sits fully on the screen whatever the dish's place", () => {
		for (let y = -40; y <= 840; y += 20) {
			for (const x of [-50, 0, 400, 1000, 1250]) {
				const { top, left } = placeMenu(line(x, y), MENU, VIEWPORT)
				expect(top).toBeGreaterThanOrEqual(8)
				expect(left).toBeGreaterThanOrEqual(8)
				expect(top + MENU.height).toBeLessThanOrEqual(VIEWPORT.height - 8)
				expect(left + MENU.width).toBeLessThanOrEqual(VIEWPORT.width - 8)
			}
		}
	})
})
