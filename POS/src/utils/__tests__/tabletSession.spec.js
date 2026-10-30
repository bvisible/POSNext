/**
 * //// Neoffice — added file (no upstream equivalent). What a tablet's screens read of the browser's session (NeoRestau
 * //// lot 1, task 16), from the cookies Frappe sets on every answer: `system_user` says whether the account is a desk
 * //// account, `user_id` who is signed in ("Guest" once the session has ended).
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { PAIR_PAGE, isDeskSession, isSignedOut, leaveWhenSignedOut, navigation } from "../tabletSession"

function cookies(values) {
	for (const [name, value] of Object.entries(values)) {
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/`
	}
}

afterEach(() => {
	for (const name of ["system_user", "user_id"]) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
	}
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
