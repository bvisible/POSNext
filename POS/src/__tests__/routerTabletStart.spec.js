//// Neoffice — added file (no upstream equivalent). A tablet paired as the kitchen's or the runner's screen is installed
//// as an app, and every launch from its home-screen icon starts at the till's address (the manifest's start_url is /pos),
//// not at the screen the pairing opened (NeoRestau lot 1, task 48). The router sends such a session straight to ITS OWN
//// screen, asking the server which one, before the till's page is even loaded: no shift dialog, no error, no flash of the
//// till. A desk account, a visitor and a portal customer go the way they always went.
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: true }))
// The factory of a mocked page runs when the page is first imported: it counts the pages the router really loaded
const loaded = vi.hoisted(() => ({ till: 0, kitchen: 0 }))

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => {
	loaded.till += 1
	return { default: { template: "<div>till</div>" } }
})
vi.mock("@/pages/Login.vue", () => ({
	default: { template: "<div>login</div>" },
}))
vi.mock("@/pages/KDS.vue", () => {
	loaded.kitchen += 1
	return { default: { template: "<div>kds</div>" } }
})
vi.mock("@/pages/Runner.vue", () => ({
	default: { template: "<div>runner</div>" },
}))
vi.mock("@/pages/Takeaway.vue", () => ({
	default: { template: "<div>takeaway</div>" },
}))
vi.mock("@/pages/CustomerDisplay.vue", () => ({
	default: { template: "<div>display</div>" },
}))
vi.mock("@/pages/PairDevice.vue", () => ({
	default: { template: "<div>pair</div>" },
}))

const { default: router } = await import("../router")
const { ASK_FOR } = await import("@/utils/tabletStart")

const MY_SCREEN = "/api/method/pos_next.api.restaurant_devices.my_screen"
const TABLET =
	"tablet-3f9a1c2b4d5e6f70-0123456789abcdef01234567@devices.invalid"
const OTHER_TABLET =
	"tablet-aaaaaaaaaaaaaaaa-0123456789abcdef01234567@devices.invalid"
const KITCHEN = "/pos/kds?restaurant=The+Bistro&station=st-1"
const RUNNER = "/pos/runner?restaurant=The+Bistro"
const MEMORY = "pos_tablet_screen"

function cookies(values) {
	for (const [name, value] of Object.entries(values)) {
		document.cookie = `${name}=${encodeURIComponent(value)}; path=/`
	}
}

function forgetCookies() {
	for (const name of ["system_user", "user_id"]) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
	}
}

/** The browser of a paired tablet: a portal account of the tablets' domain. */
function aTablet(user = TABLET) {
	cookies({ system_user: "no", user_id: user })
	session.isLoggedIn = true
}

function answer(status, body) {
	return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const says = (redirect) => answer(200, { message: { redirect } })

let fetchMock

// Every visit starts from a screen that is open to all (the router is one object for the whole file)
async function visit(path) {
	await router.push("/display")
	await router.push(path)
	return router.currentRoute.value
}

beforeEach(() => {
	fetchMock = vi.fn()
	vi.stubGlobal("fetch", fetchMock)
	window.posnext_neorestau_active = true
	window.localStorage.clear()
	forgetCookies()
	session.isLoggedIn = true
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe("a paired tablet that starts at the till's address", () => {
	it("lands on its own screen, asked of the server, and the till is never even loaded", async () => {
		aTablet()
		fetchMock.mockResolvedValue(says(KITCHEN))

		const route = await visit("/")

		expect(route.name).toBe("KDS")
		expect(route.path).toBe("/kds")
		expect(route.query).toEqual({ restaurant: "The Bistro", station: "st-1" })
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, request] = fetchMock.mock.calls[0]
		expect(url).toBe(MY_SCREEN)
		expect(request.method).toBe("GET")
		expect(request.credentials).toBe("same-origin")
		// Not a page of the till: the shift dialog, the profiles, the error of the owner's screenshot
		expect(loaded.till).toBe(0)
	})

	it("lands on the runner's screen when it is the runner's tablet", async () => {
		aTablet()
		fetchMock.mockResolvedValue(says(RUNNER))

		const route = await visit("/")

		expect(route.name).toBe("Runner")
		expect(route.query).toEqual({ restaurant: "The Bistro" })
	})

	it("replaces the till's address in the history: the back button does not return to it", async () => {
		aTablet()
		fetchMock.mockResolvedValue(says(KITCHEN))
		await router.push("/display")
		const push = vi.spyOn(window.history, "pushState")
		const replace = vi.spyOn(window.history, "replaceState")

		await router.push("/")

		expect(push).not.toHaveBeenCalled()
		expect(replace).toHaveBeenCalled()
	})

	it.each([
		["/takeaway", "the takeaway counter"],
		["/account/login", "the till's login"],
		["/nowhere", "an address that is nothing (the app sends it to the till)"],
		["/?mode=restaurant", "the restaurant's door to the till"],
	])(
		"%s (%s) is the till's as well: the tablet goes to its screen",
		async (path) => {
			aTablet()
			fetchMock.mockResolvedValue(says(KITCHEN))

			const route = await visit(path)

			expect(route.name).toBe("KDS")
			expect(loaded.till).toBe(0)
		},
	)

	it.each([
		["/kds?restaurant=The+Bistro", "KDS"],
		["/runner?restaurant=The+Bistro", "Runner"],
		["/pair", "PairDevice"],
		["/display", "CustomerDisplay"],
	])("opens %s as it is: nothing to ask", async (path, name) => {
		aTablet()

		const route = await visit(path)

		expect(route.name).toBe(name)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("remembers the screen the server named, for a start with no network", async () => {
		aTablet()
		fetchMock.mockResolvedValue(says(KITCHEN))

		await visit("/")

		expect(JSON.parse(window.localStorage.getItem(MEMORY))).toEqual({
			user: TABLET,
			path: KITCHEN,
		})
	})
})

describe("a paired tablet whose server does not answer", () => {
	beforeEach(() => {
		aTablet()
		window.localStorage.setItem(
			MEMORY,
			JSON.stringify({ user: TABLET, path: KITCHEN }),
		)
	})

	it("opens the screen it remembers when there is no network", async () => {
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

		const route = await visit("/")

		expect(route.name).toBe("KDS")
		expect(route.query).toEqual({ restaurant: "The Bistro", station: "st-1" })
		expect(loaded.till).toBe(0)
	})

	it("opens the screen it remembers when the server fails", async () => {
		fetchMock.mockResolvedValue(answer(502, {}))

		const route = await visit("/")

		expect(route.name).toBe("KDS")
	})

	it("opens the screen it remembers when the answer is not a screen of the app", async () => {
		for (const redirect of [
			"/app/sales-invoice",
			"https://elsewhere.example/pos/kds?x=1",
			"//elsewhere.example/pos/kds",
			null,
		]) {
			fetchMock.mockResolvedValue(says(redirect))

			const route = await visit("/")

			expect(route.name, String(redirect)).toBe("KDS")
			expect(route.query).toEqual({ restaurant: "The Bistro", station: "st-1" })
		}
	})

	it("opens the screen it remembers when the server takes too long", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		fetchMock.mockImplementation(
			(_url, { signal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () =>
						reject(new DOMException("aborted", "AbortError")),
					)
				}),
		)

		const arrival = visit("/")
		await vi.advanceTimersByTimeAsync(ASK_FOR)
		const route = await arrival

		expect(route.name).toBe("KDS")
	})

	it("goes to the pairing page when it remembers nothing", async () => {
		window.localStorage.clear()
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

		const route = await visit("/")

		expect(route.name).toBe("PairDevice")
	})

	it("does not take another tablet's memory for its own", async () => {
		window.localStorage.setItem(
			MEMORY,
			JSON.stringify({ user: OTHER_TABLET, path: KITCHEN }),
		)
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

		const route = await visit("/")

		expect(route.name).toBe("PairDevice")
	})

	it("does not take a memory that is no screen of the app", async () => {
		window.localStorage.setItem(
			MEMORY,
			JSON.stringify({ user: TABLET, path: "/app/sales-invoice" }),
		)
		fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

		expect((await visit("/")).name).toBe("PairDevice")

		window.localStorage.setItem(MEMORY, "not json at all")

		expect((await visit("/")).name).toBe("PairDevice")
	})

	it("still opens a screen when the browser keeps nothing (a private window)", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage is blocked")
		})
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage is blocked")
		})
		fetchMock.mockResolvedValue(says(KITCHEN))

		const route = await visit("/")

		expect(route.name).toBe("KDS")
	})
})

describe("a paired tablet the server refuses", () => {
	it.each([403, 401])(
		"goes to the pairing page on a %s, and forgets its screen",
		async (status) => {
			aTablet()
			window.localStorage.setItem(
				MEMORY,
				JSON.stringify({ user: TABLET, path: KITCHEN }),
			)
			fetchMock.mockResolvedValue(answer(status, {}))

			const route = await visit("/")

			expect(route.name).toBe("PairDevice")
			expect(window.localStorage.getItem(MEMORY)).toBeNull()
			expect(loaded.till).toBe(0)
		},
	)
})

describe("a tablet whose sessions were ended (disconnected at the till, expired)", () => {
	// The app asks who is signed in before the router runs, and the answer resets the cookies: the tablet is a visitor by
	// then. What says it was a tablet is the screen it remembers.
	beforeEach(() => {
		cookies({ system_user: "no", user_id: "Guest" })
		session.isLoggedIn = false
		window.localStorage.setItem(
			MEMORY,
			JSON.stringify({ user: TABLET, path: KITCHEN }),
		)
	})

	it("goes to the pairing page when the app starts at the till's address, and asks nothing", async () => {
		const route = await visit("/")

		expect(route.name).toBe("PairDevice")
		expect(fetchMock).not.toHaveBeenCalled()
		expect(loaded.till).toBe(0)
	})

	it("keeps the password login to whoever asks for it (the pairing page links to it)", async () => {
		expect((await visit("/account/login")).name).toBe("Login")
	})

	it("leaves the till's other pages as they were", async () => {
		expect((await visit("/takeaway")).name).toBe("Login")
	})

	it("is a visitor like any other where the site does not run NeoRestau", async () => {
		window.posnext_neorestau_active = false

		expect((await visit("/")).name).toBe("Login")
	})
})

describe("everyone else", () => {
	it("a desk account reaches the till as it always did, and nothing is asked", async () => {
		cookies({ system_user: "yes", user_id: "jeremy@example.com" })

		const route = await visit("/")

		expect(route.name).toBe("POSSale")
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("a desk account in a browser that was a tablet's is not sent to the tablet's screen, and the browser forgets it was one", async () => {
		cookies({ system_user: "yes", user_id: "jeremy@example.com" })
		window.localStorage.setItem(
			MEMORY,
			JSON.stringify({ user: TABLET, path: KITCHEN }),
		)

		expect((await visit("/")).name).toBe("POSSale")
		expect(fetchMock).not.toHaveBeenCalled()
		expect(window.localStorage.getItem(MEMORY)).toBeNull()
		// So the next time it is signed out, it is a visitor's browser: the login, not the pairing page
		forgetCookies()
		session.isLoggedIn = false
		expect((await visit("/")).name).toBe("Login")
	})

	it("a visitor is sent to the login as it always was, and nothing is asked", async () => {
		session.isLoggedIn = false

		expect((await visit("/")).name).toBe("Login")

		cookies({ system_user: "no", user_id: "Guest" })

		expect((await visit("/")).name).toBe("Login")
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("a customer of the portal reaches the till as it always did, and nothing is asked", async () => {
		cookies({ system_user: "no", user_id: "customer@example.com" })

		expect((await visit("/")).name).toBe("POSSale")
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("a browser that will not say its cookies never stops the navigation: the till opens as it did", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(document, "cookie", "get").mockImplementation(() => {
			throw new Error("cookies are blocked")
		})

		expect((await visit("/")).name).toBe("POSSale")
		expect(warn).toHaveBeenCalled()
	})

	it("nothing changes where the site does not run NeoRestau", async () => {
		aTablet()
		window.posnext_neorestau_active = false

		const route = await visit("/")

		expect(route.name).toBe("POSSale")
		expect(fetchMock).not.toHaveBeenCalled()
	})
})
