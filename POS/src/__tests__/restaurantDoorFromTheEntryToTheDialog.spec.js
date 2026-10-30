//// Neoffice — added file (no upstream equivalent). The whole way of the restaurant door on the front end (NeoRestau lot 1,
//// task 5): NeoRestau's button opens /pos?mode=restaurant; a visitor who is not signed in is sent to the login with his query
//// string by the app's own router; the shift dialog, opened on the login page as on the till, asks the server for the
//// restaurant's tills. The real router and the real dialog, with the pages and the network left out.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ isLoggedIn: false }))
const made = vi.hoisted(() => [])

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		template: "<div><slot name='body-content' /><slot name='actions' /></div>",
	},
	Input: { template: "<input />" },
	createResource: (options) => {
		const resource = {
			options,
			data: null,
			loading: false,
			error: null,
			fetch: vi.fn(async () => resource.data),
			submit: vi.fn(async () => null),
			reset: vi.fn(),
		}
		made.push(resource)
		return resource
	},
}))
vi.mock("@/composables/useShift", () => ({
	shiftState: {},
	useShift: () => ({
		createOpeningShift: {
			loading: false,
			error: null,
			reset: vi.fn(),
			submit: vi.fn(),
		},
		getOpeningDialogData: {},
		checkOpeningShift: { fetch: vi.fn(async () => null) },
	}),
}))
vi.mock("@/composables/useFormatters", () => ({
	useFormatters: () => ({ formatDateTime: (value) => value }),
}))
vi.mock("@/components/ShiftClosingDialog.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/components/common/TranslatedHTML.vue", () => ({
	default: { template: "<div />" },
}))
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
const { default: ShiftOpeningDialog } = await import(
	"../components/ShiftOpeningDialog.vue"
)

describe("the restaurant door, from the entry route to the shift dialog", () => {
	let wrapper

	// What the dialog opened on the page the router brought the visitor to asked the server for
	async function dialogOpenedAfter(path) {
		await router.push("/display") // every visit starts from a screen open to all
		await router.push(path)
		made.length = 0
		wrapper = mount(ShiftOpeningDialog, {
			props: { modelValue: true },
			global: { plugins: [router], mocks: { __: globalThis.__ } },
		})
		await flushPromises()
		return made
			.find(
				(resource) =>
					resource.options.url === "pos_next.api.pos_profile.get_pos_profiles",
			)
			.fetch.mock.calls.map(([params]) => params)
	}

	beforeEach(() => {
		session.isLoggedIn = false
		window.posnext_neorestau_active = true
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it("reaches a visitor who signs in at the login page", async () => {
		const asked = await dialogOpenedAfter("/?mode=restaurant")

		expect(router.currentRoute.value.name).toBe("Login")
		expect(asked).toEqual([{ mode: "restaurant" }])
	})

	it("reaches a visitor who is signed in already, on the till", async () => {
		session.isLoggedIn = true

		const asked = await dialogOpenedAfter("/?mode=restaurant")

		expect(router.currentRoute.value.name).toBe("POSSale")
		expect(asked).toEqual([{ mode: "restaurant" }])
	})

	it("is not invented for the usual entry", async () => {
		const asked = await dialogOpenedAfter("/")

		expect(router.currentRoute.value.name).toBe("Login")
		expect(asked).toEqual([{}])
	})
})
