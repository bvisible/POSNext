/**
 * //// Neoffice — added file (no upstream equivalent). The logo of the header is the way out to the back office, through a « Leave POS? » question (87f168fe). On the phone of a waiter it is a picture and
 * //// nothing else (the product owner, 08.11.2026: « pour pas que l'on puisse facilement sortir de l'application au niveau du serveur »): no pointer, no title, no question, no way out. Anywhere
 * //// else it is what it was.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s, args) => (args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s)
})

vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ currentShift: null }),
}))
// The header's children are not under test (and the real frappe-ui does not load under vitest)
vi.mock("@/components/common/ActionButton.vue", () => ({ default: { template: "<button><slot /></button>" } }))
vi.mock("@/components/common/StatusBadge.vue", () => ({ default: { template: "<span />" } }))
vi.mock("@/components/common/UserMenu.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/components/common/LanguageSwitcher.vue", () => ({ default: { template: "<div />" } }))

const { default: POSHeader } = await import("../POSHeader.vue")

describe("the logo in the header of the till", () => {
	let wrapper
	afterEach(() => {
		wrapper?.unmount()
		document.body.innerHTML = ""
	})

	function header(props = {}) {
		wrapper = mount(POSHeader, {
			attachTo: document.body,
			props: { currentTime: "10:00", userName: "Cashier", ...props },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}
	const logo = () => wrapper.get('[data-test="header-logo"]')
	const question = () => document.body.textContent.includes("Leave POS?")

	it("asks « Leave POS? » when it is tapped, where the user may leave", async () => {
		header()

		await logo().trigger("click")

		expect(question()).toBe(true)
		expect(logo().classes()).toContain("cursor-pointer")
		expect(logo().attributes("title")).toBe("Back to Neoffice")
	})

	it("asks nothing on the phone of a waiter: a picture, no pointer, no title", async () => {
		header({ mayLeave: false })

		await logo().trigger("click")

		expect(question()).toBe(false)
		expect(logo().classes()).not.toContain("cursor-pointer")
		expect(logo().classes()).toContain("pointer-events-none")
		expect(logo().attributes("title")).toBeUndefined()
	})

	it("keeps the picture fitted in its box on the phone of a waiter too", () => {
		header({ mayLeave: false })

		//// Neoffice — the picture is the square O2 mark now (h-8 w-8), no longer the wordmark (w-full): neoffice-maintenance#2086
		expect(logo().classes()).toEqual(expect.arrayContaining(["h-8", "w-8", "object-contain"]))
	})
})
