/**
 * //// Neoffice — added file (no upstream equivalent). The public menu page (NeoRestau lot 1, task 17): what the one QR
 * //// code on a restaurant's tables opens. It shows the restaurant's guest card to read and nothing to order; where the
 * //// restaurant does not publish its menu, whatever the reason, it says so politely and shows nothing the server said.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	// The app's translation function: a sentence, and its {0} placeholders
	globalThis.__ = (text, replace) =>
		replace ? text.replace(/\{(\d+)\}/g, (_, index) => replace[index]) : text
})

const route = vi.hoisted(() => ({ params: { restaurant: "The Bistro" } }))
vi.mock("vue-router", () => ({ useRoute: () => route }))

const { default: PublicMenu } = await import("../PublicMenu.vue")
const { forgetPublicMenu } = await import("@/utils/publicMenu")

const CHILI = {
	name: "Chili sin carne",
	description: "Beans, rice & lime",
	price: 18.5,
	price_text: "",
	image: "/files/chili.jpg",
	spice_level: 2,
	badges: [
		{ name: "Vegan", type: "Dietary", icon: "vegan.svg", color: "#2f9e44" },
		{ name: "Gluten", type: "Allergen", icon: "gluten.svg", color: "#e8590c" },
	],
}
const FISH = {
	name: "Fish of the day",
	description: "",
	price: 0,
	price_text: "Market price",
	image: "",
	spice_level: 0,
	badges: [],
}
const WATER = { name: "Water", description: "", price: 0, price_text: "", image: "", spice_level: 0, badges: [] }
const BREAD = { name: "Bread", description: "", price: 4, price_text: "", image: "", spice_level: 0, badges: [] }
const MENU = {
	restaurant: { name: "The Bistro", logo: "/files/logo.png" },
	currency: "CHF",
	card: { name: "Dinner card", description: "Cooked here, every day" },
	sections: [
		{ label: "", items: [BREAD] },
		{ label: "Mains", items: [CHILI, FISH, WATER] },
	],
}

const answers = (menu) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ message: menu }) }))
// What Frappe answers a refusal with: it carries a traceback on a site in developer mode, which nobody must read
const refuses = (status) =>
	vi.fn(async () => ({
		ok: false,
		status,
		json: async () => ({
			exc_type: "DoesNotExistError",
			exc: "Traceback (most recent call last): secret path /home/neoffice/frappe-bench",
			_server_messages: '["This menu is not available"]',
		}),
	}))
const price = (amount) =>
	new Intl.NumberFormat(undefined, { style: "currency", currency: "CHF", minimumFractionDigits: 2 }).format(
		amount,
	)

describe("the public menu page", () => {
	let wrapper

	async function open(fetchStub) {
		vi.stubGlobal("fetch", fetchStub)
		wrapper = mount(PublicMenu, { global: { mocks: { __: globalThis.__ } } })
		await flushPromises()
		return wrapper
	}

	const dishes = () => wrapper.findAll(".dish")
	const dish = (name) => dishes().find((row) => row.find(".dish__name").text().startsWith(name))

	beforeEach(() => {
		forgetPublicMenu()
		route.params.restaurant = "The Bistro"
		document.title = "Neopos"
	})

	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		vi.unstubAllGlobals()
	})

	describe("where the restaurant publishes its menu", () => {
		it("reads the menu of the restaurant in the address, as a visitor with no session would", async () => {
			const read = answers(MENU)
			await open(read)

			expect(read).toHaveBeenCalledTimes(1)
			const [url, options] = read.mock.calls[0]
			expect(url).toBe("/api/method/pos_next.api.public_menu.get_public_menu?restaurant=The%20Bistro")
			// A plain read: no body, no method that writes, no token of a session
			expect(options?.method ?? "GET").toBe("GET")
			expect(options?.body).toBeUndefined()
			expect(JSON.stringify(options ?? {})).not.toMatch(/csrf|token|authorization/i)
		})

		it("names the restaurant, then the card with what the restaurant says of it", async () => {
			await open(answers(MENU))

			expect(wrapper.find("h1").text()).toBe("The Bistro")
			expect(wrapper.find(".menu-eyebrow").text()).toBe("Dinner card")
			expect(wrapper.find(".menu-lede").text()).toBe("Cooked here, every day")
			expect(wrapper.find(".menu-logo").attributes("src")).toBe("/files/logo.png")
		})

		it("lists the dishes under the title of their section, in the order of the card", async () => {
			await open(answers(MENU))

			expect(wrapper.findAll("h2").map((title) => title.text())).toEqual(["Mains"])
			expect(dishes().map((row) => row.find(".dish__name").text())).toEqual([
				"Bread",
				"Chili sin carne",
				"Fish of the day",
				"Water",
			])
			const sections = wrapper.findAll(".menu-section")
			expect(sections).toHaveLength(2)
			expect(sections[0].findAll(".dish")).toHaveLength(1)
			expect(sections[1].findAll(".dish")).toHaveLength(3)
		})

		it("gives a dish its description, its price in the currency of the restaurant", async () => {
			await open(answers(MENU))

			const chili = dish("Chili")
			expect(chili.find(".dish__description").text()).toBe("Beans, rice & lime")
			expect(chili.find(".dish__price").text()).toBe(price(18.5))
			expect(dish("Bread").find(".dish__price").text()).toBe(price(4))
			expect(dish("Bread").find(".dish__description").exists()).toBe(false)
		})

		it("writes what the card says where a dish has no price, and nothing where it has neither", async () => {
			await open(answers(MENU))

			expect(dish("Fish").find(".dish__price").text()).toBe("Market price")
			expect(dish("Water").find(".dish__price").exists()).toBe(false)
		})

		it("shows a picture for a dish that has one and no placeholder for the others", async () => {
			await open(answers(MENU))

			expect(dish("Chili").find(".dish__photo").attributes("src")).toBe("/files/chili.jpg")
			expect(wrapper.findAll(".dish__photo")).toHaveLength(1)
		})

		it("shows the badges a dish carries, each with its icon and its name", async () => {
			await open(answers(MENU))

			const badges = dish("Chili").findAll(".badge")
			expect(badges.map((badge) => badge.text())).toEqual(["Vegan", "Gluten"])
			expect(badges[0].find("img").attributes("src")).toBe("/assets/pos_next/icons/badges/vegan.svg")
			expect(badges[1].find("img").attributes("src")).toBe("/assets/pos_next/icons/badges/gluten.svg")
			expect(badges[0].find(".badge__icon").element.style.backgroundColor).toBe("rgb(47, 158, 68)")
			expect(dish("Bread").findAll(".badge")).toHaveLength(0)
		})

		it("shows how hot a dish is, once per level", async () => {
			await open(answers(MENU))

			const spice = dish("Chili").find(".dish__spice")
			expect(spice.findAll("img")).toHaveLength(2)
			expect(spice.attributes("aria-label")).toBe("Spice level 2")
			expect(dish("Bread").find(".dish__spice").exists()).toBe(false)
		})

		it("titles the tab with the restaurant's name", async () => {
			await open(answers(MENU))

			expect(document.title).toBe("The Bistro")
		})

		it("is read only: nothing to press, type, choose or follow, and no word of ordering", async () => {
			await open(answers(MENU))

			expect(wrapper.findAll("button, input, select, textarea, form, a, [role=button]")).toHaveLength(0)
			expect(wrapper.text()).not.toMatch(/cart|order|table|pay|checkout|add to/i)
		})

		it("escapes what the restaurant wrote: a name is text, never markup", async () => {
			const hostile = { ...BREAD, name: "<img src=x onerror=alert(1)>", description: "<b>bold</b>" }
			await open(answers({ ...MENU, sections: [{ label: "<i>Starters</i>", items: [hostile] }] }))

			expect(wrapper.find(".dish__name").text()).toBe("<img src=x onerror=alert(1)>")
			expect(wrapper.find(".dish__description").text()).toBe("<b>bold</b>")
			expect(wrapper.find(".menu-section__title").text()).toBe("<i>Starters</i>")
			expect(wrapper.find(".dish img[onerror]").exists()).toBe(false)
		})

		it("shows a menu with no logo, no description and no section without any hole", async () => {
			const bare = { ...MENU, restaurant: { name: "The Bistro", logo: "" }, card: { name: "Card", description: "" } }
			await open(answers({ ...bare, sections: [{ label: "", items: [BREAD] }] }))

			expect(wrapper.find(".menu-logo").exists()).toBe(false)
			expect(wrapper.find(".menu-lede").exists()).toBe(false)
			expect(wrapper.findAll("h2")).toHaveLength(0)
			expect(dishes()).toHaveLength(1)
		})
	})

	describe("while it reads", () => {
		it("says it is loading until the menu comes", async () => {
			let release
			const slow = vi.fn(
				() =>
					new Promise((resolve) => {
						release = () => resolve({ ok: true, status: 200, json: async () => ({ message: MENU }) })
					}),
			)
			vi.stubGlobal("fetch", slow)
			wrapper = mount(PublicMenu, { global: { mocks: { __: globalThis.__ } } })
			await flushPromises()

			expect(wrapper.find(".menu-status").text()).toBe("Loading menu...")
			expect(wrapper.find(".dish").exists()).toBe(false)

			release()
			await flushPromises()

			expect(wrapper.find(".menu-status").exists()).toBe(false)
			expect(dishes()).toHaveLength(4)
		})

		it("does not read the menu again when the page is built again, as it is when the translations arrive", async () => {
			const read = answers(MENU)
			await open(read)
			wrapper.unmount()

			wrapper = mount(PublicMenu, { global: { mocks: { __: globalThis.__ } } })

			// Shown at once: no second "Loading menu..."
			expect(wrapper.find(".menu-status").exists()).toBe(false)
			expect(wrapper.find("h1").text()).toBe("The Bistro")
			await flushPromises()
			expect(read).toHaveBeenCalledTimes(1)
		})

		it("reads the menu of another restaurant when the address names another", async () => {
			const read = answers(MENU)
			await open(read)
			wrapper.unmount()
			route.params.restaurant = "Café & Bar / Grill"

			await open(read)

			expect(read).toHaveBeenCalledTimes(2)
			expect(read.mock.calls[1][0]).toContain("restaurant=Caf%C3%A9%20%26%20Bar%20%2F%20Grill")
		})
	})

	describe("where the restaurant does not publish its menu", () => {
		it.each([404, 403, 417, 429, 500])("says it politely when the server answers %i, and shows nothing of the answer", async (status) => {
			await open(refuses(status))

			expect(wrapper.find("h1").text()).toBe("This menu is not available")
			expect(wrapper.text()).toContain("Please ask a member of our team.")
			expect(wrapper.text()).not.toMatch(/Traceback|secret|frappe-bench|DoesNotExistError|server_messages|\b404\b|\b500\b/)
			expect(wrapper.find(".dish").exists()).toBe(false)
			expect(wrapper.find(".menu-status").exists()).toBe(false)
			expect(document.title).toBe("This menu is not available")
		})

		it("says it politely when the connection drops", async () => {
			await open(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))))

			expect(wrapper.find("h1").text()).toBe("This menu is not available")
			expect(wrapper.text()).not.toContain("Failed to fetch")
		})

		it("says it politely when the answer is not a menu", async () => {
			for (const message of [null, {}, { sections: [] }, "<html>proxy error</html>", { restaurant: {}, sections: "no" }]) {
				wrapper?.unmount()
				forgetPublicMenu()
				await open(answers(message))

				expect(wrapper.find("h1").text()).toBe("This menu is not available")
				expect(wrapper.text()).not.toContain("proxy error")
			}
		})

		it("tries again when the page is opened again after a refusal", async () => {
			await open(refuses(404))
			wrapper.unmount()

			const read = answers(MENU)
			await open(read)

			expect(read).toHaveBeenCalledTimes(1)
			expect(wrapper.find("h1").text()).toBe("The Bistro")
		})
	})

	describe("where the restaurant publishes no card yet", () => {
		it("names the restaurant and says so politely, with no section and no error", async () => {
			await open(answers({ ...MENU, card: null, sections: [] }))

			expect(wrapper.find("h1").text()).toBe("The Bistro")
			expect(wrapper.text()).toContain("This restaurant has not published its menu yet.")
			expect(wrapper.find(".menu-eyebrow").exists()).toBe(false)
			expect(wrapper.find(".menu-section").exists()).toBe(false)
			expect(wrapper.text()).not.toContain("not available")
		})
	})
})
