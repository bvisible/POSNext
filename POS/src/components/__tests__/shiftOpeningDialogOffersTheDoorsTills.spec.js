//// Neoffice — added file (no upstream equivalent). The shift opening dialog asks the server for the tills of the door the
//// cashier came through (NeoRestau lot 1, task 5): `/pos?mode=restaurant` is the restaurant door NeoRestau opens, the
//// usual entry offers the other tills. The dialog sits on the login page and on the till, so it reads the door from the
//// route it is in, each time it asks for the list. The list is never kept between doors.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createMemoryHistory, createRouter } from "vue-router"

const made = vi.hoisted(() => [])

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s
})

// The real frappe-ui does not load under vitest: the resources the dialog creates are recorded, and answer nothing
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

const { default: ShiftOpeningDialog } = await import(
	"../ShiftOpeningDialog.vue"
)

const PROFILES_URL = "pos_next.api.pos_profile.get_pos_profiles"
const page = { template: "<div />" }

describe("the shift opening dialog", () => {
	let router
	let wrapper

	const profiles = () =>
		made.find((resource) => resource.options.url === PROFILES_URL)
	// What the dialog sent with each of its requests for the list
	const asked = () => profiles().fetch.mock.calls.map(([params]) => params)

	async function open(path, props = { modelValue: true }) {
		router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: "/", name: "POSSale", component: page },
				{ path: "/account/login", name: "Login", component: page },
			],
		})
		await router.push(path)
		await router.isReady()
		wrapper = mount(ShiftOpeningDialog, {
			props,
			global: { plugins: [router], mocks: { __: globalThis.__ } },
		})
		await flushPromises()
	}

	async function reopen() {
		await wrapper.setProps({ modelValue: false })
		await wrapper.setProps({ modelValue: true })
		await flushPromises()
	}

	beforeEach(() => {
		made.length = 0
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
	})

	it("asks for the restaurant's tills at the restaurant door", async () => {
		await open("/?mode=restaurant")

		expect(asked()).toEqual([{ mode: "restaurant" }])
	})

	it("asks the same on the login page, which the router sends a signed-out visitor to with his query string", async () => {
		await open("/account/login?mode=restaurant")

		expect(asked()).toEqual([{ mode: "restaurant" }])
	})

	it("names no door at the usual entry", async () => {
		await open("/")

		expect(asked()).toEqual([{}])
	})

	it("takes any other mode for the usual door and sends nothing of it", async () => {
		for (const query of [
			"?mode=kitchen",
			"?mode=",
			"?mode=restaurant&mode=restaurant",
			"?table=T4",
		]) {
			made.length = 0
			wrapper?.unmount()
			wrapper = null
			await open(`/${query}`)

			expect(asked(), query).toEqual([{}])
		}
	})

	it("reads the door when it asks, not when it is built", async () => {
		await open("/")
		expect(asked()).toEqual([{}])

		await router.push("/?mode=restaurant")
		await reopen()

		expect(asked()).toEqual([{}, { mode: "restaurant" }])

		await router.push("/")
		await reopen()

		expect(asked()).toEqual([{}, { mode: "restaurant" }, {}])
	})

	it("asks again, with the door it is at, for the tills of the next shift once the open one is closed", async () => {
		await open("/?mode=restaurant")
		expect(asked()).toHaveLength(1)

		await wrapper.vm.$.setupState.handleExistingShiftClosed()

		expect(asked()).toEqual([{ mode: "restaurant" }, { mode: "restaurant" }])
	})

	it("never keeps the list between doors: the request for it has no cache key", async () => {
		await open("/?mode=restaurant")

		// A key would keep the answer of one door (in the browser's IndexedDB) and serve it at the other
		expect(profiles().options.cache).toBeUndefined()
		expect(profiles().options.auto).toBe(false)
	})
})
