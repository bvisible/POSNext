/**
 * //// Neoffice — added file (no upstream equivalent). The logo in the till's header keeps its proportions (NeoResto lot 1, smoke-test fix). The picture was `h-8 w-auto` in
 * //// the 64 px column of the header (48 px of room, the column's padding taken away): the browser shrank the box to 48 x 32 for a picture of 300 x 71, and a picture drawn
 * //// into a box of another shape is stretched. The box keeps its 48 x 32 hit area (the logo is the way out of the till, and a finger needs room), and the picture is fitted
 * //// inside it, never stretched.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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

	function header(props = {}) {
		wrapper = mount(POSHeader, {
			props: { currentTime: "10:00", userName: "Cashier", ...props },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}
	const logo = (props) => header(props).get(".neo-logo-light")
	const darkLogo = (props) => header(props).get(".neo-logo-dark")

	it("is the compact mark of the design system, not the wordmark that is unreadable at 11 px", () => {
		const img = logo()

		expect(img.attributes("src")).toBe(
			"/assets/pos_next/images/neoffice-mark.svg",
		)
		expect(img.attributes("src")).not.toContain("neoffice_logo.svg")
	})

	it("has a twin for the dark colour mode, the other mark of the design system", () => {
		const img = darkLogo()

		expect(img.attributes("src")).toBe(
			"/assets/pos_next/images/neoffice-mark-dark.svg",
		)
		// One image per mode: the two are never both in the way of a finger, the stylesheet shows one
		expect(header().findAll('img[alt="Neoffice"]')).toHaveLength(2)
	})

	it("is fitted inside its box (object-contain), never stretched into it", () => {
		for (const img of [logo(), darkLogo()]) {
			expect(img.classes()).toEqual(
				expect.arrayContaining(["h-8", "w-8", "object-contain"]),
			)
			// `w-auto` was what let the browser shrink the box to the column's width and stretch the picture into it
			expect(img.classes()).not.toContain("w-auto")
		}
	})

	it("is still the way out of the till, with the feedback it had, in both colour modes", () => {
		const both = header()
		for (const img of [both.get(".neo-logo-light"), both.get(".neo-logo-dark")]) {
			expect(img.classes()).toEqual(
				expect.arrayContaining([
					"cursor-pointer",
					"hover:opacity-80",
					"active:scale-95",
					"transition-all",
				]),
			)
			expect(img.attributes("title")).toBe("Back to Neoffice")
			expect(img.attributes("alt")).toBe("Neoffice")
		}
		expect(both.get('[data-test="header-logo"]').classes()).toContain(
			"neo-logo-light",
		)
	})

	it("is only a picture on the phone of a waiter, in both colour modes", () => {
		const both = header({ mayLeave: false })
		for (const img of [both.get(".neo-logo-light"), both.get(".neo-logo-dark")]) {
			expect(img.classes()).toContain("pointer-events-none")
			expect(img.attributes("title")).toBeUndefined()
		}
	})

	it("sits in the 64 px column of the header, the one the management rail below it shares", () => {
		const img = logo()

		const column = img.element.parentElement
		expect(column.className).toContain("w-16")
		expect(column.className).toContain("px-2")
	})

	it("is swapped by the stylesheet: the light mark by default, the dark one under the cockpit's dark mode", () => {
		const css = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), "../../../index.css"),
			"utf8",
		)

		expect(css).toMatch(/\.neo-logo-dark\s*\{\s*display:\s*none/)
		expect(css).toMatch(
			/\[data-theme='dark'\] \.neo-logo-dark,\s*\.dark \.neo-logo-dark\s*\{\s*display:\s*block/,
		)
		expect(css).toMatch(
			/\[data-theme='dark'\] \.neo-logo-light,\s*\.dark \.neo-logo-light\s*\{\s*display:\s*none/,
		)
	})
})
