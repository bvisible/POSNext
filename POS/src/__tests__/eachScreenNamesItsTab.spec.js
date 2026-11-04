/**
 * //// Neoffice — added file (no upstream equivalent). Every tab of the till app was titled "Neopos", so with the till, the
 * //// runner and the kitchen open side by side nobody knew which tab was which (NeoResto lot 1, product owner). Each
 * //// screen now names its tab, "<screen> · Neopos", and the rule lives in ONE place: the router's afterEach reads the
 * //// `title` of the route (utils/tabTitle.js). A screen that learns a name after its route (the till once a shift is
 * //// open, the kitchen once a station is chosen, a guest page once it knows the restaurant) hands it over with
 * //// `useTabTitle`; the till and the kitchen have a spec of their own for that.
 * @vitest-environment jsdom
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, nextTick, ref } from "vue"

const session = vi.hoisted(() => ({ isLoggedIn: true }))
// The translator the app installs, over a catalogue a test chooses
const words = vi.hoisted(() => {
	const words = { catalogue: {} }
	globalThis.__ = (msgid) => words.catalogue[msgid] ?? msgid
	return words
})

vi.mock("@/composables/useShift", () => ({ shiftState: {} }))
vi.mock("@/data/user", () => ({ userResource: {} }))
vi.mock("../data/session", () => ({ session }))
vi.mock("@/pages/POSSale.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/Login.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/CustomerDisplay.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/pages/CFD.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/KDS.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/Runner.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/Takeaway.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/GuestOrder.vue", () => ({ default: { template: "<div />" } }))
vi.mock("@/pages/TakeawayOrder.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/pages/GuestReservation.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/pages/ShopScan.vue", () => ({ default: { template: "<div />" } }))

const { default: router } = await import("../router")
const { refreshTabTitle } = await import("@/utils/tabTitle")
const { useTabTitle } = await import("@/composables/useTabTitle")

// What fr.po says of these words: every one of them is a msgid the catalogue already has
const FRENCH = {
	Kitchen: "Cuisine",
	Takeaway: "À emporter",
	"Customer Display": "Affichage client",
	Order: "Commande",
	Reservation: "Réservation",
	// A bare word ERPNext's catalogue says (pos_next leaves it empty, so as not to cover it)
	Shop: "Boutique",
}

// [the screen, its address, its tab in English, its tab in French]
const SCREENS = [
	["the kitchen", "/kds", "Kitchen · Neopos", "Cuisine · Neopos"],
	["the runner", "/runner", "Runner · Neopos", "Runner · Neopos"],
	[
		"the takeaway counter",
		"/takeaway",
		"Takeaway · Neopos",
		"À emporter · Neopos",
	],
	[
		"the customer display",
		"/display",
		"Customer Display · Neopos",
		"Affichage client · Neopos",
	],
	[
		"the older customer display",
		"/cfd",
		"Customer Display · Neopos",
		"Affichage client · Neopos",
	],
	[
		"the page a table's guests order from",
		"/guest/tok-1",
		"Order · Neopos",
		"Commande · Neopos",
	],
	["the web takeaway order", "/order", "Order · Neopos", "Commande · Neopos"],
	[
		"the booking form",
		"/reservation",
		"Reservation · Neopos",
		"Réservation · Neopos",
	],
	[
		"the page a shop's customer scans from",
		"/shop/KEY",
		"Shop · Neopos",
		"Boutique · Neopos",
	],
]

/**
 * The title of the tab once a visitor has gone to an address. The title is put back to the one of the page file first
 * (index.html says "Neopos"), and a visit starts from another screen: a navigation to the route the router is on is dropped.
 */
async function visit(address) {
	await router.push(address === "/display" ? "/runner" : "/display")
	document.title = "Neopos"
	await router.push(address)
	return document.title
}

/** A screen that knows a name the route does not, as the till, the kitchen and the guest pages do. */
function aPageNaming(name, options) {
	return mount(
		defineComponent({
			setup() {
				useTabTitle(name, options)
				return () => null
			},
		}),
	)
}

beforeEach(() => {
	session.isLoggedIn = true
	window.posnext_neoresto_active = true
	words.catalogue = {}
})

describe("the tab of each screen", () => {
	it.each(SCREENS)(
		"%s (%s) says what it is: %s",
		async (_, address, english) => {
			expect(await visit(address)).toBe(english)
		},
	)

	it.each(SCREENS)(
		"%s (%s) says it in French: %s",
		async (_, address, __english, french) => {
			words.catalogue = FRENCH

			expect(await visit(address)).toBe(french)
		},
	)

	it("is plain Neopos on the till, until a shift is open", async () => {
		expect(await visit("/")).toBe("Neopos")
	})

	it("is plain Neopos on any other route, the login included", async () => {
		session.isLoggedIn = false

		expect(await visit("/account/login")).toBe("Neopos")
		expect(await visit("/nowhere-at-all")).toBe("Neopos")
	})

	it("is the title of where a visitor lands when he is sent elsewhere", async () => {
		window.posnext_neoresto_active = false
		// The kitchen is closed where the site does not run NeoResto: the till answers
		expect(await visit("/kds")).toBe("Neopos")

		window.posnext_neoresto_active = true
		session.isLoggedIn = false
		expect(await visit("/runner")).toBe("Neopos")
	})

	it("never breaks a navigation when the app has no translator yet", async () => {
		const translator = globalThis.__
		globalThis.__ = undefined
		try {
			expect(await visit("/kds")).toBe("Neopos")
		} finally {
			globalThis.__ = translator
		}
	})
})

describe("a name the screen learns after its route", () => {
	it("goes in front of the screen's own, and is data: it is never translated", async () => {
		words.catalogue = FRENCH
		await visit("/kds")
		const station = ref("Order")
		const page = aPageNaming(station)

		expect(document.title).toBe("Order · Cuisine · Neopos")
		station.value = "Bar"
		await nextTick()
		expect(document.title).toBe("Bar · Cuisine · Neopos")
		station.value = ""
		await nextTick()
		expect(document.title).toBe("Cuisine · Neopos")
		page.unmount()
	})

	it("can stand in place of the screen's own name: a restaurant instead of Order", async () => {
		await visit("/order")
		const restaurant = ref("")
		const page = aPageNaming(restaurant, { instead: true })

		expect(document.title).toBe("Order · Neopos")
		restaurant.value = "The Bistro"
		await nextTick()
		expect(document.title).toBe("The Bistro · Neopos")
		page.unmount()
	})

	it("is dropped when the visitor goes to another screen", async () => {
		await visit("/kds")
		const page = aPageNaming(ref("Bar"))
		expect(document.title).toBe("Bar · Kitchen · Neopos")

		await router.push("/runner")

		expect(document.title).toBe("Runner · Neopos")
		page.unmount()
	})

	it("is written again, in the user's language, when the catalogue arrives after the first navigation", async () => {
		await visit("/kds")
		const page = aPageNaming(ref("Bar"))
		expect(document.title).toBe("Bar · Kitchen · Neopos")

		words.catalogue = FRENCH
		refreshTabTitle()

		expect(document.title).toBe("Bar · Cuisine · Neopos")
		page.unmount()
	})
})

describe("the rule, in one place", () => {
	const SRC = path.resolve(__dirname, "..")
	const read = (...parts) => readFileSync(path.join(SRC, ...parts), "utf8")
	const walk = (dir) =>
		readdirSync(dir).flatMap((entry) => {
			const file = path.join(dir, entry)
			if (statSync(file).isDirectory()) {
				return entry === "__tests__" || entry === "node_modules"
					? []
					: walk(file)
			}
			return /\.(js|ts|vue)$/.test(entry) ? [file] : []
		})

	it("is the only code that writes the title of the tab", () => {
		const writers = walk(SRC)
			.filter((file) =>
				/\bdocument\.title\s*=[^=]/.test(readFileSync(file, "utf8")),
			)
			.map((file) => path.relative(SRC, file))

		// Two screens of the restaurant name their tab after their own page, which is the kitchen's and the runner's station (useDocumentTitle, which
		// gives the old title back when the screen goes), and the public menu names it after the restaurant: the three are written down here, so that
		// a fourth cannot come in unseen
		expect(writers.sort()).toEqual(
			[
				path.join("composables", "useDocumentTitle.js"),
				path.join("pages", "PublicMenu.vue"),
				path.join("utils", "tabTitle.js"),
			].sort(),
		)
	})

	it("is not written by frappe-ui's page meta either: no component takes its title from it", () => {
		// main.js installs frappe-ui's pageMetaPlugin, whose usePageMeta writes document.title for a component that has a
		// `pageMeta` option. None has one, and none may: the title of a tab would then come from two places
		const users = walk(SRC)
			.filter((file) =>
				/\b(usePageMeta|pageMeta)\b/.test(readFileSync(file, "utf8")),
			)
			.map((file) => path.relative(SRC, file))

		expect(users).toEqual([])
	})

	it("has the router write it after each navigation, from the `title` of the route", () => {
		const routes = read("router.js")

		expect(routes).toMatch(/router\.afterEach\(/)
		expect(routes).toMatch(/showScreen\(to\)/)
		// One literal __() per word, so that the catalogue extraction finds the msgid: one title for each screen's route
		expect(routes.match(/title: \(\) => __\("[A-Za-z ]+"\)/g)).toHaveLength(
			SCREENS.length,
		)
	})

	it("is written again when the catalogue of translations changes", () => {
		expect(read("App.vue")).toMatch(
			/watch\(\s*translationVersion\s*,\s*refreshTabTitle\s*\)/,
		)
	})

	it("is handed a name by the screens that learn one", () => {
		expect(read("pages", "POSSale.vue")).toMatch(/\buseTillTabTitle\(\)/)
		// the kitchen's and the runner's tab is named by their own page (useDocumentTitle: the station's name), not by this rule
		expect(read("pages", "KDS.vue")).toMatch(/\buseDocumentTitle\(/)
		// The restaurant's name, which the session's first call answers: not the company of an order, which exists
		// only once there is an invoice, and tells restaurants of one company apart no better
		const guestName =
			/useTabTitle\(\s*\(\)\s*=>\s*guestStore\.restaurantName\s*,\s*\{\s*instead:\s*true\s*\}\s*\)/
		expect(read("pages", "GuestOrder.vue")).toMatch(guestName)
		expect(read("pages", "TakeawayOrder.vue")).toMatch(guestName)
	})
})
