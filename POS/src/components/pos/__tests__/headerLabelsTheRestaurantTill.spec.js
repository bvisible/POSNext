/**
 * //// Neoffice — added file (no upstream equivalent). A restaurant till says so in its header with a fixed label
 * //// (NeoRestau lot 1, task 4), where the RESTO switch used to be: nothing in the header flips the mode, the till's own
 * //// settings decide it (and only where the site runs NeoRestau: the server sends the effective mode).
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
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

const LABEL = "Restaurant till"

describe("the header of the till", () => {
	let wrapper

	function header(props = {}) {
		wrapper = mount(POSHeader, {
			props: { currentTime: "10:00", userName: "Cashier", ...props },
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}

	afterEach(() => {
		wrapper?.unmount()
	})

	it("labels a restaurant till with a fixed label", () => {
		header({ isRestaurantMode: true })

		const label = wrapper.find('[data-test="restaurant-till-label"]')
		expect(label.exists()).toBe(true)
		expect(label.text()).toContain(LABEL)
	})

	it("says nothing of the restaurant on a counter till", () => {
		header({ isRestaurantMode: false })

		expect(wrapper.find('[data-test="restaurant-till-label"]').exists()).toBe(
			false,
		)
		expect(wrapper.text()).not.toContain(LABEL)
	})

	it("says nothing of the restaurant until it is told the till is one", () => {
		header()

		expect(wrapper.find('[data-test="restaurant-till-label"]').exists()).toBe(
			false,
		)
	})

	it("only labels: the label is no button, and nothing in the header is a switch", () => {
		header({ isRestaurantMode: true })
		const label = wrapper.find('[data-test="restaurant-till-label"]')

		expect(label.exists()).toBe(true)
		expect(label.element.closest("button")).toBeNull()
		expect(wrapper.find('[role="switch"]').exists()).toBe(false)
		wrapper.unmount()

		header({ isRestaurantMode: false })
		expect(wrapper.find('[role="switch"]').exists()).toBe(false)
	})

	it("is handed the restaurant mode by the page that owns the till's stores", () => {
		const page = readFileSync(
			path.resolve(__dirname, "../../../pages/POSSale.vue"),
			"utf8",
		)
		const tag = page.match(/<POSHeader[\s\S]*?>\s*\n\s*<template #menu-items>/)

		expect(tag).not.toBeNull()
		expect(tag[0]).toContain(
			':is-restaurant-mode="Boolean(restaurantStore.isEnabled)"',
		)
	})
})
