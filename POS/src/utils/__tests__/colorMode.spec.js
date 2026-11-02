/**
 * //// Neoffice — added file (no upstream equivalent). The till's colour mode in ONE place (NeoResto lot 1, task 38a-2, ruling 131). main.js adopted it,
 * //// the till's user menu set it, and the kitchen and runner screens now have a theme button: three copies of the same logic would drift, so they all go
 * //// through utils/colorMode. The key is the cockpit's (`neocockpit-colormode`), the desk's own toggle writes it too.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	applyColorMode,
	COLOR_MODE_KEY,
	nextColorMode,
	paintColorMode,
	readColorMode,
	resolveTheme,
	syncColorMode,
	THEME_ACTIVE_KEY,
} from "@/utils/colorMode"

const SRC = path.resolve(__dirname, "../..")

/** A system that is dark or light, and a listener the test can fire. */
function systemIs(dark) {
	const listeners = []
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches: dark,
			addEventListener: (_, fn) => listeners.push(fn),
			removeEventListener: () => {},
		})),
	)
	return listeners
}

beforeEach(() => {
	localStorage.clear()
	document.documentElement.removeAttribute("data-theme")
	document.documentElement.classList.remove("dark")
	systemIs(false)
})
afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

describe("the mode kept on the device", () => {
	it("is the cockpit's key, and system when nothing is kept", () => {
		expect(COLOR_MODE_KEY).toBe("neocockpit-colormode")
		expect(readColorMode()).toBe("system")
		localStorage.setItem(COLOR_MODE_KEY, "dark")
		expect(readColorMode()).toBe("dark")
	})

	it("is system for a value that is no mode, and when the storage refuses", () => {
		localStorage.setItem(COLOR_MODE_KEY, "sepia")
		expect(readColorMode()).toBe("system")
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("denied")
		})
		expect(readColorMode()).toBe("system")
	})
})

describe("the look a mode comes to", () => {
	it("is the mode itself for light and dark, and the system's for system", () => {
		expect(resolveTheme("light")).toBe("light")
		expect(resolveTheme("dark")).toBe("dark")
		systemIs(true)
		expect(resolveTheme("system")).toBe("dark")
		systemIs(false)
		expect(resolveTheme("system")).toBe("light")
	})
})

describe("the cycle of the theme button", () => {
	it("goes Auto, Light, Dark, Auto", () => {
		expect(nextColorMode("system")).toBe("light")
		expect(nextColorMode("light")).toBe("dark")
		expect(nextColorMode("dark")).toBe("system")
	})

	it("does something for a mode nobody knows", () => {
		expect(nextColorMode("sepia")).toBe("system")
	})
})

describe("setting the mode", () => {
	it("keeps it under the cockpit's key, paints data-theme and the dark class, and publishes the resolved theme", () => {
		applyColorMode("dark")

		expect(localStorage.getItem(COLOR_MODE_KEY)).toBe("dark")
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
		expect(document.documentElement.classList.contains("dark")).toBe(true)
		expect(localStorage.getItem(THEME_ACTIVE_KEY)).toBe("dark")

		applyColorMode("light")
		expect(document.documentElement.getAttribute("data-theme")).toBe("light")
		expect(document.documentElement.classList.contains("dark")).toBe(false)
	})

	it("follows the system for system: the theme published is the one the system gives", () => {
		systemIs(true)
		applyColorMode("system")

		expect(localStorage.getItem(COLOR_MODE_KEY)).toBe("system")
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
		expect(localStorage.getItem(THEME_ACTIVE_KEY)).toBe("dark")
	})

	it("holds for as long as the page is open when the storage refuses", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied")
		})

		expect(() => applyColorMode("dark")).not.toThrow()
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
	})

	it("writes the user's desk theme only when asked, through the ORM and never through switch_theme", async () => {
		const fetched = []
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url, options) => {
				fetched.push([url, options?.body ? JSON.parse(options.body) : null])
				return { json: async () => ({ message: "cook@example.com" }) }
			}),
		)

		applyColorMode("dark")
		await Promise.resolve()
		expect(fetched).toEqual([])

		applyColorMode("system", { persistDeskTheme: true })
		await vi.waitFor(() => expect(fetched.length).toBe(2))
		expect(fetched[1][0]).toBe("/api/method/frappe.client.set_value")
		expect(fetched[1][1]).toEqual({
			doctype: "User",
			name: "cook@example.com",
			fieldname: "desk_theme",
			value: "Automatic",
		})
		expect(JSON.stringify(fetched)).not.toContain("switch_theme")
	})
})

describe("the page at startup", () => {
	it("is painted in the mode kept on the device, without writing anything", () => {
		localStorage.setItem(COLOR_MODE_KEY, "dark")
		const set = vi.spyOn(Storage.prototype, "setItem")

		expect(paintColorMode()).toBe("dark")

		expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
		expect(set).not.toHaveBeenCalled()
	})

	it("follows the system while the mode is system, and another tab's change", () => {
		const listeners = systemIs(false)
		syncColorMode()
		expect(document.documentElement.getAttribute("data-theme")).toBe("light")

		// The system turns dark: the page does
		systemIs(true)
		for (const fn of listeners) fn()
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark")

		// The desk's toggle, or another tab, writes the key
		localStorage.setItem(COLOR_MODE_KEY, "light")
		window.dispatchEvent(new StorageEvent("storage", { key: COLOR_MODE_KEY }))
		expect(document.documentElement.getAttribute("data-theme")).toBe("light")
	})
})

describe("the three places that use it", () => {
	const read = (file) => readFileSync(path.join(SRC, file), "utf8")

	it("main.js and the user menu no longer carry a copy of the logic: the key is written in utils/colorMode.js alone", () => {
		for (const file of [
			"main.js",
			"components/common/UserMenu.vue",
			"pages/KDS.vue",
			"pages/Runner.vue",
			"components/restaurant/ThemeButton.vue",
		]) {
			expect(read(file), file).not.toMatch(
				/(?:get|set)Item\(\s*["'](?:neocockpit-colormode|theme_active)["']/,
			)
		}
		expect(read("main.js")).toContain("syncColorMode()")
		expect(read("components/common/UserMenu.vue")).toContain(
			"@/utils/colorMode",
		)
		expect(read("components/restaurant/ThemeButton.vue")).toContain(
			"@/utils/colorMode",
		)
	})
})
