/**
 * //// Neoffice — added file (no upstream equivalent). What a tablet's screens read of the browser's session (NeoResto
 * //// lot 1, task 16), from the cookies Frappe sets on every answer: `system_user` says whether the account is a desk
 * //// account, `user_id` who is signed in ("Guest" once the session has ended).
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	PAIR_PAGE,
	forgetScreen,
	isDeskSession,
	isSignedOut,
	isTabletSession,
	leaveWhenSignedOut,
	navigation,
	rememberScreen,
	rememberedScreen,
	wasPairedAsATablet,
} from "../tabletSession"

function cookies(values) {
	for (const [name, value] of Object.entries(values)) {
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/`
	}
}

afterEach(() => {
	for (const name of ["system_user", "user_id"]) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
	}
	window.localStorage.clear()
	vi.restoreAllMocks()
})

describe("the session of a tablet's screen", () => {
	it("tells a desk account from a tablet's portal account", () => {
		cookies({ system_user: "yes" })
		expect(isDeskSession()).toBe(true)
		cookies({ system_user: "no" })
		expect(isDeskSession()).toBe(false)
	})

	it("knows when the browser is signed out", () => {
		cookies({ user_id: "tablet-3f9a@devices.invalid" })
		expect(isSignedOut()).toBe(false)
		cookies({ user_id: "Guest" })
		expect(isSignedOut()).toBe(true)
	})

	it("stays on the screen when a call failed with the session alive (the network, a server error)", () => {
		const open = vi.spyOn(navigation, "open").mockImplementation(() => {})
		cookies({ user_id: "tablet-3f9a@devices.invalid" })

		expect(leaveWhenSignedOut()).toBe(false)
		expect(open).not.toHaveBeenCalled()
	})

	it("leaves for the pairing page when the failed call left the browser signed out", () => {
		// Frappe refuses a visitor's call with an HTML redirect to the login: frappe-ui fails to read it, and the error the
		// screen gets has no status. The same answer set the cookie to Guest
		const open = vi.spyOn(navigation, "open").mockImplementation(() => {})
		cookies({ user_id: "Guest" })

		expect(leaveWhenSignedOut()).toBe(true)
		expect(open).toHaveBeenCalledWith(PAIR_PAGE)
		expect(PAIR_PAGE).toBe("/pos/pair")
	})
})

const TABLET = "tablet-3f9a1c2b4d5e6f70-0123456789abcdef01234567@devices.invalid"
const KITCHEN = "/pos/kds?restaurant=The+Bistro&station=st-1"

describe("whether the session is a tablet's (task 48)", () => {
	it("is a signed-in portal account of the tablets' domain", () => {
		cookies({ system_user: "no", user_id: TABLET })
		expect(isTabletSession()).toBe(true)
	})

	it.each([
		["a desk account", { system_user: "yes", user_id: "jeremy@example.com" }],
		["a desk account of the tablets' domain (never made, but the cookie says desk)", { system_user: "yes", user_id: TABLET }],
		["a visitor", { system_user: "no", user_id: "Guest" }],
		["a portal customer", { system_user: "no", user_id: "customer@example.com" }],
		["a customer whose address only ends alike", { system_user: "no", user_id: "x@notdevices.invalid.example.com" }],
	])("is not %s", (_label, values) => {
		cookies(values)
		expect(isTabletSession()).toBe(false)
	})

	it("is not, with no cookie at all", () => {
		expect(isTabletSession()).toBe(false)
	})
})

describe("the screen a tablet remembers (task 48)", () => {
	it("remembers the screen for the tablet that is signed in, and gives it back to that tablet only", () => {
		cookies({ system_user: "no", user_id: TABLET })

		rememberScreen(KITCHEN)

		expect(rememberedScreen()).toBe(KITCHEN)
		cookies({ user_id: "tablet-aaaaaaaaaaaaaaaa-0123456789abcdef01234567@devices.invalid" })
		expect(rememberedScreen()).toBeNull()
	})

	it("remembers nothing for a visitor, and nothing that is not a screen of the app", () => {
		rememberScreen(KITCHEN)
		expect(window.localStorage.length).toBe(0)

		cookies({ system_user: "no", user_id: TABLET })
		for (const path of ["/pos", "/app", "https://elsewhere.example/pos/kds", "/pos/kds#token", "//x.example/pos/kds", 42, null]) {
			rememberScreen(path)
		}
		expect(window.localStorage.length).toBe(0)
	})

	it("forgets it", () => {
		cookies({ system_user: "no", user_id: TABLET })
		rememberScreen(KITCHEN)

		forgetScreen()

		expect(rememberedScreen()).toBeNull()
	})

	it("tells a browser that was paired as a tablet, whoever is signed in now", () => {
		expect(wasPairedAsATablet()).toBe(false)
		cookies({ system_user: "no", user_id: TABLET })
		rememberScreen(KITCHEN)

		cookies({ system_user: "no", user_id: "Guest" })

		expect(wasPairedAsATablet()).toBe(true)
		expect(rememberedScreen()).toBeNull()
		forgetScreen()
		expect(wasPairedAsATablet()).toBe(false)
	})

	it("takes a memory that is no screen of the app for no memory", () => {
		window.localStorage.setItem("pos_tablet_screen", JSON.stringify({ user: TABLET, path: "/app" }))
		expect(wasPairedAsATablet()).toBe(false)
		window.localStorage.setItem("pos_tablet_screen", "not json")
		expect(wasPairedAsATablet()).toBe(false)
	})

	it("survives a browser that keeps nothing", () => {
		cookies({ system_user: "no", user_id: TABLET })
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("blocked")
		})
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new Error("blocked")
		})

		expect(() => rememberScreen(KITCHEN)).not.toThrow()
		expect(rememberedScreen()).toBeNull()
		expect(() => forgetScreen()).not.toThrow()
		expect(wasPairedAsATablet()).toBe(false)
	})
})
