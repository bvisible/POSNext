//// Neoffice — added file (no upstream equivalent). The public menu is a page of the router that anybody opens
//// (NeoRestau lot 1, task 17): the QR code on a restaurant's tables leads a guest to /pos/menu/<restaurant>. Like the other
//// pages a guest opens it needs no session; and it is not one of the till's own screens of the restaurant, which would send
//// a guest to the login where the site does not run NeoRestau: the page asks the server and says politely that the menu is
//// not available.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: false }))

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => ({ default: { template: "<div>till</div>" } }))
vi.mock("@/pages/Login.vue", () => ({ default: { template: "<div>login</div>" } }))
vi.mock("@/pages/CustomerDisplay.vue", () => ({ default: { template: "<div>display</div>" } }))
vi.mock("@/pages/PublicMenu.vue", () => ({ default: { template: "<div>menu</div>" } }))

const { default: router } = await import("../router")

// Every visit starts from a screen that is open to all (the router is one object for the whole file, and a navigation to
// the route it is on is dropped)
async function visit(path) {
	await router.push("/display")
	await router.push(path)
	return router.currentRoute.value
}

describe("the public menu route", () => {
	beforeEach(() => {
		session.isLoggedIn = false
		window.posnext_neorestau_active = true
	})

	it("opens for a visitor with no session, with the restaurant of the address", async () => {
		const route = await visit("/menu/The%20Bistro")

		expect(route.name).toBe("PublicMenu")
		expect(route.params.restaurant).toBe("The Bistro")
		expect(route.meta.allowGuest).toBe(true)
	})

	it("reads a name with accents, signs and a slash as one restaurant", async () => {
		const route = await visit("/menu/Caf%C3%A9%20%26%20Bar%20%2F%20Grill")

		expect(route.name).toBe("PublicMenu")
		expect(route.params.restaurant).toBe("Café & Bar / Grill")
	})

	it("opens whether or not the site runs NeoRestau: the page says it politely, the router does not send the guest away", async () => {
		for (const flag of [false, undefined]) {
			window.posnext_neorestau_active = flag

			const route = await visit("/menu/The%20Bistro")

			expect(route.name).toBe("PublicMenu")
			expect(route.fullPath).toBe("/menu/The%20Bistro")
		}
	})

	it("opens for a signed-in user as well", async () => {
		session.isLoggedIn = true

		const route = await visit("/menu/The%20Bistro")

		expect(route.name).toBe("PublicMenu")
	})

	it("is not the address of a menu when no restaurant is named", async () => {
		const route = await visit("/menu")

		expect(route.name).not.toBe("PublicMenu")
	})

	it("leaves the pages of the table's own QR code where they were", async () => {
		const names = router.getRoutes().map((route) => route.name)

		expect(names).toEqual(expect.arrayContaining(["GuestOrder", "TakeawayOrder", "GuestReservation", "PublicMenu"]))
		expect(router.getRoutes().find((route) => route.name === "GuestOrder").path).toBe("/guest/:token")
	})
})
