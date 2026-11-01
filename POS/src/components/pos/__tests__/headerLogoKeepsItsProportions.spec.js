/**
 * //// Neoffice — added file (no upstream equivalent). The logo in the till's header keeps its proportions (NeoRestau lot 1, smoke-test fix). The picture was `h-8 w-auto` in
 * //// the 64 px column of the header (48 px of room, the column's padding taken away): the browser shrank the box to 48 x 32 for a picture of 300 x 71, and a picture drawn
 * //// into a box of another shape is stretched. The box keeps its 48 x 32 hit area (the logo is the way out of the till, and a finger needs room), and the picture is fitted
 * //// inside it, never stretched.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s
})

vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ currentShift: null }),
}))
// The header's children are not under test (and the real frappe-ui does not load under vitest)
vi.mock("@/components/common/ActionButton.vue", () => ({
	default: { template: "<button><slot /></button>" },
}))
vi.mock("@/components/common/StatusBadge.vue", () => ({
	default: { template: "<span />" },
}))
vi.mock("@/components/common/UserMenu.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/components/common/LanguageSwitcher.vue", () => ({
	default: { template: "<div />" },
}))

const { default: POSHeader } = await import("../POSHeader.vue")

describe("the logo in the header of the till", () => {
	let wrapper
	afterEach(() => wrapper?.unmount())

	function logo() {
		wrapper = mount(POSHeader, {
			props: { currentTime: "10:00", userName: "Cashier" },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper.get('img[alt="Neoffice"]')
	}

	it("is fitted inside its 48 x 32 box (object-contain), never stretched into it", () => {
		const img = logo()

		expect(img.classes()).toEqual(
			expect.arrayContaining(["h-8", "w-full", "object-contain"]),
		)
		// `w-auto` was what let the browser shrink the box to the column's width and stretch the picture into it
		expect(img.classes()).not.toContain("w-auto")
	})

	it("is still the way out of the till, with the feedback it had", () => {
		const img = logo()

		expect(img.classes()).toEqual(
			expect.arrayContaining([
				"cursor-pointer",
				"hover:opacity-80",
				"active:scale-95",
				"transition-all",
			]),
		)
		expect(img.attributes("title")).toBe("Back to Neoffice")
		expect(img.attributes("src")).toBe(
			"/assets/neoffice_theme/images/neoffice_logo.svg",
		)
	})

	it("sits in the 64 px column of the header, the one the management rail below it shares", () => {
		const img = logo()

		const column = img.element.parentElement
		expect(column.className).toContain("w-16")
		expect(column.className).toContain("px-2")
	})
})
