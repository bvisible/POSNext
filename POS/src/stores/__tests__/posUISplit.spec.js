/** Item/cart split kept as a ratio and clamped on resize. */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it } from "vitest"

globalThis.__ = (s) => s

const { RIGHT_PANEL_MAX, usePOSUIStore } = await import("../posUI")

describe("posUI split ratio", () => {
	let ui
	beforeEach(() => {
		setActivePinia(createPinia())
		ui = usePOSUIStore()
	})

	//// Neoffice — our default split is 0.8 (97d370df), not upstream's 0.62: on a wide screen it puts
	//// the cart at our 450 px minimum; the RIGHT_PANEL_MAX cap is reached by dragging the cart wider.
	it("caps the cart at RIGHT_PANEL_MAX on wide screens", () => {
		ui.updateLayoutBounds(1856)
		expect(1856 - ui.leftPanelWidth).toBe(450)
		ui.setLeftPanelWidth(100, 1856)
		expect(1856 - ui.leftPanelWidth).toBe(RIGHT_PANEL_MAX)
	})

	//// Neoffice — the cart keeps our 450 px minimum (7e3f9458), not upstream's 360.
	it("keeps the cart at least 450px on narrow desktops", () => {
		ui.updateLayoutBounds(960)
		expect(960 - ui.leftPanelWidth).toBeGreaterThanOrEqual(450)
		expect(ui.leftPanelWidth).toBeGreaterThanOrEqual(320)
	})

	//// Neoffice — added case: the default split is 80 % items / 20 % cart where the bounds allow it.
	it("starts from an 80/20 split", () => {
		ui.updateLayoutBounds(2500)
		expect(ui.leftPanelRatio).toBe(0.8)
		expect(ui.leftPanelWidth).toBe(2000)
	})

	it("follows the container after a resize instead of keeping old pixels", () => {
		ui.updateLayoutBounds(1302)
		ui.setLeftPanelWidth(800, 1302)
		ui.updateLayoutBounds(1856)
		ui.updateLayoutBounds(1302)
		expect(ui.leftPanelWidth).toBe(800)
		//// Neoffice — 1200, not upstream's 1000: at 1000 our 450 px cart minimum caps the item grid at
		//// 550 px; 1200 shows the same "follows the ratio" behaviour inside our bounds.
		ui.updateLayoutBounds(1200)
		expect(ui.leftPanelWidth).toBeCloseTo((800 / 1302) * 1200, 5)
	})

	it("clamps a drag outside the bounds", () => {
		ui.setLeftPanelWidth(100, 1302)
		expect(1302 - ui.leftPanelWidth).toBe(RIGHT_PANEL_MAX)
		ui.setLeftPanelWidth(5000, 1302)
		//// Neoffice — our cart minimum is 450 px (7e3f9458), not upstream's 360.
		expect(1302 - ui.leftPanelWidth).toBe(450)
	})
})
