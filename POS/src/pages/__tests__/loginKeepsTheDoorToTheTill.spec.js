//// Neoffice — added file (no upstream equivalent). The door follows the entry (NeoRestau lot 1, task 5, fix round 1): a
//// visitor who opens /pos?mode=restaurant while signed out is sent to the login page with his query string, signs in there,
//// and the login page then pushes him to the till. Each of its three pushes (the shift dialog closed with its X, a shift
//// opened, the dialog cancelled or the open shift resumed) must carry the query string on: otherwise the till runs at /pos/
//// and every later opening of the shift dialog ("Close & Open New", the shift buttons, the dialog that follows a shift
//// closing) asks the usual door. One app, as the real one: a router view that shows the real login page, then, once the
//// router has moved on, a stand-in for the till that opens the real shift dialog as the till does. The app's real router and
//// the real shift dialog, with the till's other contents and the network left out.
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const made = vi.hoisted(() => [])

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("frappe-ui", () => ({
	FeatherIcon: { template: "<i />" },
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
// The session is reactive: the login page opens the shift dialog when it turns signed in
vi.mock("../../data/session", async () => {
	const { reactive } = await import("vue")
	return {
		session: reactive({
			isLoggedIn: false,
			login: { error: null, loading: false, reset() {}, submit() {} },
		}),
	}
})
vi.mock("@/data/user", () => ({ userResource: {} }))
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
vi.mock("@/composables/useSessionLock", () => ({
	useSessionLock: () => ({ cachePasswordHashFromLogin: vi.fn(async () => {}) }),
}))
vi.mock("@/utils/sessionCleanup", () => ({
	cleanupUserSession: vi.fn(async () => {}),
}))
vi.mock("@/utils/csrf", () => ({ ensureCSRFToken: vi.fn(async () => {}) }))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: { setCSRFToken: vi.fn(async () => {}) },
}))
vi.mock("@/components/ShiftClosingDialog.vue", () => ({
	default: { template: "<div />" },
}))
vi.mock("@/components/common/TranslatedHTML.vue", () => ({
	default: { template: "<div />" },
}))
// The till, reduced to what matters here: with no shift open it opens the real shift dialog, as the real till does
vi.mock("@/pages/POSSale.vue", async () => {
	const { default: ShiftOpeningDialog } = await import(
		"@/components/ShiftOpeningDialog.vue"
	)
	return {
		default: {
			components: { ShiftOpeningDialog },
			template: "<div>till<ShiftOpeningDialog :model-value='true' /></div>",
		},
	}
})
vi.mock("@/pages/CustomerDisplay.vue", () => ({
	default: { template: "<div>display</div>" },
}))

const { session } = await import("../../data/session")
const { default: router } = await import("../../router")
const { default: ShiftOpeningDialog } = await import(
	"../../components/ShiftOpeningDialog.vue"
)

const PROFILES_URL = "pos_next.api.pos_profile.get_pos_profiles"
// Login.vue uses these two as globals, as the app registers them
const components = {
	Button: { template: "<button><slot /></button>" },
	Input: { template: "<input />" },
}

describe("the login page, once the visitor has signed in", () => {
	let wrapper

	// What the shift dialogs asked the server for, in order (one entry per request for the list of tills)
	const asked = () =>
		made
			.filter((resource) => resource.options.url === PROFILES_URL)
			.flatMap((resource) =>
				resource.fetch.mock.calls.map(([params]) => params),
			)

	// The visitor opens `path` signed out, is sent to the login page, signs in there: the page opens its shift dialog
	async function signedInAfterOpening(path) {
		session.isLoggedIn = false
		await router.push("/display") // every visit starts from a screen open to all
		await router.push(path)
		expect(router.currentRoute.value.name).toBe("Login")
		made.length = 0
		wrapper = mount(
			{ template: "<RouterView />" },
			{
				global: { plugins: [router], components, mocks: { __: globalThis.__ } },
			},
		)
		await flushPromises()
		session.isLoggedIn = true
		await flushPromises()
		const dialog = wrapper.findComponent(ShiftOpeningDialog)
		expect(dialog.props("modelValue")).toBe(true)
		return dialog
	}

	// The router has moved on to the till, which has opened its shift dialog: the route it runs at, and what that dialog asked
	async function theTill() {
		await vi.waitFor(() =>
			expect(router.currentRoute.value.name).toBe("POSSale"),
		)
		await flushPromises()
		expect(wrapper.text()).toContain("till")
		return router.currentRoute.value
	}

	beforeEach(() => {
		window.posnext_neorestau_active = true
	})
	afterEach(() => {
		wrapper?.unmount()
		wrapper = null
		session.isLoggedIn = false
	})

	it("asks the shift dialog on the login page for the restaurant's tills", async () => {
		await signedInAfterOpening("/?mode=restaurant")

		expect(asked()).toEqual([{ mode: "restaurant" }])
	})

	it("keeps the door when the shift dialog is closed with its X", async () => {
		const dialog = await signedInAfterOpening("/?mode=restaurant")

		dialog.vm.$emit("update:modelValue", false)

		expect((await theTill()).query).toEqual({ mode: "restaurant" })
		expect(asked()).toEqual([{ mode: "restaurant" }, { mode: "restaurant" }])
	})

	it("keeps the door when a shift is opened", async () => {
		const dialog = await signedInAfterOpening("/?mode=restaurant")

		dialog.vm.$emit("shift-opened")

		expect((await theTill()).query).toEqual({ mode: "restaurant" })
		expect(asked()).toEqual([{ mode: "restaurant" }, { mode: "restaurant" }])
	})

	it.each(["cancelled", "resumed"])(
		"keeps the door when the dialog is closed as %s",
		async (reason) => {
			const dialog = await signedInAfterOpening("/?mode=restaurant")

			dialog.vm.$emit("dialog-closed", { reason })

			expect((await theTill()).query).toEqual({ mode: "restaurant" })
			expect(asked()).toEqual([{ mode: "restaurant" }, { mode: "restaurant" }])
		},
	)

	it("keeps the door through the dialog's own button, which fires all three pushes at once", async () => {
		const dialog = await signedInAfterOpening("/?mode=restaurant")

		// The real dialog: it emits shift-opened, then closes itself as "resumed"
		await dialog.vm.$.setupState.resumeShift()

		expect((await theTill()).query).toEqual({ mode: "restaurant" })
		expect(asked()).toEqual([{ mode: "restaurant" }, { mode: "restaurant" }])
	})

	it("adds nothing for the usual entry: the till is pushed with no query", async () => {
		const dialog = await signedInAfterOpening("/")
		expect(asked()).toEqual([{}])

		dialog.vm.$emit("shift-opened")

		const till = await theTill()
		expect(till.query).toEqual({})
		expect(till.fullPath).toBe("/")
		expect(asked()).toEqual([{}, {}])
	})
})
