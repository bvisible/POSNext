//// Neoffice — added file (no upstream equivalent). The till's own screens of the restaurant (the preparation
//// display /kds, the runner /runner, the takeaway counter /takeaway) open only where the site runs NeoRestau
//// (NeoRestau lot 1, task 4, fix round 1; nothing of the restaurant shows where it is off). The /pos page says
//// whether it does (window.posnext_neorestau_active), which is known at once for a screen that may load with no
//// till profile and no session; where it does not, the router sends the visitor back to the till.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: true }))

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => ({ default: { template: "<div>till</div>" } }))
vi.mock("@/pages/Login.vue", () => ({ default: { template: "<div>login</div>" } }))
vi.mock("@/pages/KDS.vue", () => ({ default: { template: "<div>kds</div>" } }))
vi.mock("@/pages/Runner.vue", () => ({ default: { template: "<div>runner</div>" } }))
vi.mock("@/pages/Takeaway.vue", () => ({ default: { template: "<div>takeaway</div>" } }))
vi.mock("@/pages/CustomerDisplay.vue", () => ({ default: { template: "<div>display</div>" } }))

const { default: router } = await import("../router")

const SCREENS = [
	["/kds", "KDS"],
	["/runner", "Runner"],
	["/takeaway", "Takeaway"],
]

// Every visit starts from a screen that is open to all (the router is one object for the whole file, and a
// navigation to the route it is on, or redirected back onto it, is dropped)
async function visit(path) {
	await router.push("/display")
	await router.push(path)
	return router.currentRoute.value
}

describe("the restaurant's own screens of the till", () => {
	beforeEach(() => {
		session.isLoggedIn = true
		window.posnext_neorestau_active = true
	})

	it.each(SCREENS)("%s opens where the site runs NeoRestau", async (path, name) => {
		const route = await visit(path)

		expect(route.name).toBe(name)
	})

	it.each(SCREENS)("%s sends back to the till where the site does not run NeoRestau", async (path) => {
		window.posnext_neorestau_active = false

		const route = await visit(path)

		expect(route.name).toBe("POSSale")
		expect(route.fullPath).toBe("/")
	})

	it.each(SCREENS)("%s stays shut when the page did not say (nothing to show on a doubt)", async (path) => {
		window.posnext_neorestau_active = undefined

		const route = await visit(path)

		expect(route.name).toBe("POSSale")
	})

	it("sends a visitor who is not signed in to the login, not to the restaurant's screen", async () => {
		window.posnext_neorestau_active = false
		session.isLoggedIn = false

		const route = await visit("/kds")

		expect(route.name).toBe("Login")
	})

	it("leaves the screens that are not the restaurant's alone", async () => {
		window.posnext_neorestau_active = false

		const route = await visit("/display")

		expect(route.name).toBe("CustomerDisplay")
	})
})
