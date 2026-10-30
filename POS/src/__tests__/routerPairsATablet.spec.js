//// Neoffice — added file (no upstream equivalent). A kitchen's or a runner's tablet signs in by scanning the QR code a
//// manager shows at the till (NeoRestau lot 1, task 16): the page it opens is a visitor's (the tablet has no session
//// yet), only where the site runs NeoRestau. A kitchen's or runner's screen whose tablet is signed out is sent to that
//// page, which says how to get a new code, rather than to a password the tablet does not have.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: false }))

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => ({ default: { template: "<div>till</div>" } }))
vi.mock("@/pages/Login.vue", () => ({ default: { template: "<div>login</div>" } }))
vi.mock("@/pages/KDS.vue", () => ({ default: { template: "<div>kds</div>" } }))
vi.mock("@/pages/Runner.vue", () => ({ default: { template: "<div>runner</div>" } }))
vi.mock("@/pages/Takeaway.vue", () => ({ default: { template: "<div>takeaway</div>" } }))
vi.mock("@/pages/CustomerDisplay.vue", () => ({ default: { template: "<div>display</div>" } }))
vi.mock("@/pages/PairDevice.vue", () => ({ default: { template: "<div>pair</div>" } }))

const { default: router } = await import("../router")

// Every visit starts from a screen that is open to all (the router is one object for the whole file)
async function visit(path) {
	await router.push("/display")
	await router.push(path)
	return router.currentRoute.value
}

describe("the page a tablet is paired on", () => {
	beforeEach(() => {
		session.isLoggedIn = false
		window.posnext_neorestau_active = true
	})

	it("opens to a visitor, the code in the fragment of its address", async () => {
		const route = await visit("/pair#Zx3_kQ-9aaaa")

		expect(route.name).toBe("PairDevice")
		expect(route.hash).toBe("#Zx3_kQ-9aaaa")
	})

	it("opens to a browser that is signed in as well (a tablet paired again)", async () => {
		session.isLoggedIn = true

		const route = await visit("/pair#Zx3_kQ-9aaaa")

		expect(route.name).toBe("PairDevice")
	})

	it("stays shut where the site does not run NeoRestau", async () => {
		window.posnext_neorestau_active = false

		const route = await visit("/pair#Zx3_kQ-9aaaa")

		expect(route.name).toBe("Login")
	})

	it.each([
		["/kds?restaurant=The+Bistro&station=st-1"],
		["/runner?restaurant=The+Bistro"],
	])("sends a signed-out tablet of %s to the pairing page, not to a password", async (path) => {
		const route = await visit(path)

		expect(route.name).toBe("PairDevice")
	})

	it("still sends a visitor of the till to the login", async () => {
		const route = await visit("/?mode=restaurant")

		expect(route.name).toBe("Login")
		expect(route.query).toEqual({ mode: "restaurant" })
	})

	it("lets a signed-in tablet open its screen", async () => {
		session.isLoggedIn = true

		const route = await visit("/kds?restaurant=The+Bistro")

		expect(route.name).toBe("KDS")
	})
})
