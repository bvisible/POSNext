//// Neoffice — added file (no upstream equivalent). The door a visitor comes through (`/pos?mode=restaurant` is the
//// restaurant door NeoRestau opens) survives the router's redirects between the till and the login (NeoRestau lot 1,
//// task 5). A visitor who is not signed in is sent to the login first; the shift dialog, on the login page as on the till,
//// reads the door from the query of the route it is in, so a redirect that dropped the query string would offer a
//// restaurant cashier the usual tills after signing in.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: false }))

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => ({
	default: { template: "<div>till</div>" },
}))
vi.mock("@/pages/Login.vue", () => ({
	default: { template: "<div>login</div>" },
}))
vi.mock("@/pages/CustomerDisplay.vue", () => ({
	default: { template: "<div>display</div>" },
}))

const { default: router } = await import("../router")

describe("the door a visitor comes through", () => {
	beforeEach(async () => {
		session.isLoggedIn = false
		window.posnext_neorestau_active = true
		// Every visit starts from a screen that is open to all (the router is one object for the whole file, and a
		// navigation to the route it is on is dropped)
		await router.push("/display")
	})

	it("goes with a visitor who is not signed in to the login", async () => {
		await router.push("/?mode=restaurant")

		const route = router.currentRoute.value
		expect(route.name).toBe("Login")
		expect(route.query).toEqual({ mode: "restaurant" })
	})

	it("keeps the whole query string, not only the mode", async () => {
		await router.push("/?mode=restaurant&table=T4")

		expect(router.currentRoute.value.query).toEqual({
			mode: "restaurant",
			table: "T4",
		})
	})

	it("adds nothing for the usual entry", async () => {
		await router.push("/")

		const route = router.currentRoute.value
		expect(route.name).toBe("Login")
		expect(route.query).toEqual({})
		expect(route.fullPath).toBe("/account/login")
	})

	it("goes with a visitor who is already signed in, from the login page to the till", async () => {
		session.isLoggedIn = true

		await router.push("/account/login?mode=restaurant")

		const route = router.currentRoute.value
		expect(route.name).toBe("POSSale")
		expect(route.query).toEqual({ mode: "restaurant" })
	})

	it("leaves a signed-in visitor of the till where he is, door included", async () => {
		session.isLoggedIn = true

		await router.push("/?mode=restaurant")

		const route = router.currentRoute.value
		expect(route.name).toBe("POSSale")
		expect(route.query).toEqual({ mode: "restaurant" })
	})

	it("does not touch the screens that are open to all", async () => {
		await router.push("/display?mode=restaurant")

		const route = router.currentRoute.value
		expect(route.name).toBe("CustomerDisplay")
		expect(route.query).toEqual({ mode: "restaurant" })
	})
})
