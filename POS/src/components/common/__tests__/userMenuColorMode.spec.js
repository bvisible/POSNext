/**
 * //// Neoffice — added file (no upstream equivalent). The user menu's colour mode (maintenance#2929, the audit of 18.11): adopting the saved mode when the till starts only paints it; it used to write
 * //// the user's `User.desk_theme` at EVERY load (an ORM write, with its on_update and a Version, over the desk's own choice). A choice made in the menu still writes it.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const colorMode = vi.hoisted(() => ({ apply: vi.fn(), read: vi.fn(() => "dark") }))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})
vi.mock("@/composables/useLocale", () => ({
	useLocale: () => ({ locale: { value: "fr" }, supportedLocales: [], changeLocale: vi.fn() }),
}))
vi.mock("@/utils/colorMode", () => ({
	applyColorMode: colorMode.apply,
	readColorMode: colorMode.read,
}))

const { default: UserMenu } = await import("../UserMenu.vue")

const open = () => mount(UserMenu, { props: { userName: "Camille Caisse" }, global: { mocks: { __: globalThis.__ } } })

describe("the user menu's colour mode", () => {
	beforeEach(() => {
		colorMode.apply.mockClear()
		colorMode.read.mockReturnValue("dark")
	})

	it("paints the saved mode at start and writes nothing to the user's account", () => {
		open()

		expect(colorMode.apply).toHaveBeenCalledTimes(1)
		expect(colorMode.apply).toHaveBeenCalledWith("dark", { persistDeskTheme: false })
	})

	it("writes the desk theme when the cashier chooses a mode", async () => {
		const wrapper = open()
		await wrapper.get("button").trigger("click")
		colorMode.apply.mockClear()

		await wrapper.get("button[title='Light']").trigger("click")

		expect(colorMode.apply).toHaveBeenCalledWith("light", { persistDeskTheme: true })
	})
})
