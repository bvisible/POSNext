/**
 * //// Neoffice — added file (no upstream equivalent). The tab of the till carries the till's name once a shift is open
 * //// ("Restaurant till · Neopos"), and says plain "Neopos" before: with the till, the runner and the kitchen open side
 * //// by side, the product owner could not tell which tab was which (NeoRestau lot 1). The till is the one screen whose
 * //// name is not in its route: it is the POS Profile of the shift, known only once a shift is open.
 * ////
 * //// POSSale.vue is too large to mount here, so this covers what the page calls (`useTillTabTitle`, over the real shift
 * //// store; the shift composable under the store is replaced by a state a test sets the way opening a shift does) and,
 * //// from the source of the page, that it calls it.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defineComponent, nextTick } from "vue"

const words = vi.hoisted(() => {
	const words = { catalogue: {} }
	globalThis.__ = (msgid) => words.catalogue[msgid] ?? msgid
	return words
})

// The shift composable under the store is not under test: its state is set as a shift opening and closing set it
vi.mock("@/composables/useShift", async () => {
	const { computed, ref } = await import("vue")
	const shiftState = ref({
		isOpen: false,
		pos_opening_shift: null,
		pos_profile: null,
	})
	return {
		shiftState,
		useShift: () => ({
			currentProfile: computed(() => shiftState.value.pos_profile),
			currentShift: computed(() => shiftState.value.pos_opening_shift),
			hasOpenShift: computed(() => shiftState.value.isOpen),
			checkOpeningShift: { fetch: async () => {} },
		}),
	}
})

const { shiftState } = await import("@/composables/useShift")
const { useTillTabTitle } = await import("@/composables/useTillTabTitle")
const { showScreen } = await import("@/utils/tabTitle")

/** What createOpeningShift (and a shift found open at start) leave in the state: the profile is the POS Profile document. */
function openShift(profileName) {
	shiftState.value = {
		isOpen: true,
		pos_opening_shift: { name: "POS-OPEN-0001" },
		pos_profile: { name: profileName, currency: "CHF" },
	}
}
function closeShift() {
	shiftState.value = {
		isOpen: false,
		pos_opening_shift: null,
		pos_profile: null,
	}
}

function theTill() {
	return mount(
		defineComponent({
			setup() {
				useTillTabTitle()
				return () => null
			},
		}),
	)
}

// The router's afterEach, for the screens a test goes to: the till has no `title` in its route, the kitchen has one
const THE_TILL = { meta: {} }
const THE_KITCHEN = { meta: { title: () => __("Kitchen") } }

let mounted = []
const till = () => {
	const page = theTill()
	mounted.push(page)
	return page
}

beforeEach(() => {
	setActivePinia(createPinia())
	mounted.forEach((page) => page.unmount())
	mounted = []
	words.catalogue = {}
	closeShift()
	showScreen(THE_TILL)
	document.title = "Neopos"
})

describe("the tab of the till", () => {
	it("says plain Neopos before a shift is open", () => {
		till()

		expect(document.title).toBe("Neopos")
	})

	it("carries the till's name once a shift is open", async () => {
		till()

		openShift("Restaurant till")
		await nextTick()

		expect(document.title).toBe("Restaurant till · Neopos")
	})

	it("carries it at once when the page opens on a shift that is already open", () => {
		openShift("Restaurant till")

		till()

		expect(document.title).toBe("Restaurant till · Neopos")
	})

	it("goes back to plain Neopos when the shift is closed", async () => {
		openShift("Restaurant till")
		till()
		expect(document.title).toBe("Restaurant till · Neopos")

		closeShift()
		await nextTick()

		expect(document.title).toBe("Neopos")
	})

	it("follows the till the next shift is opened at", async () => {
		openShift("Restaurant till")
		till()

		openShift("Bar")
		await nextTick()

		expect(document.title).toBe("Bar · Neopos")
	})

	it("keeps the till's name as it is in every language: a name is data", async () => {
		words.catalogue = { Kitchen: "Cuisine", Order: "Commande" }
		till()

		openShift("Order")
		await nextTick()

		expect(document.title).toBe("Order · Neopos")
	})

	it("comes back with the till when the visitor returns from another screen", async () => {
		openShift("Restaurant till")
		const page = till()

		// The router's afterEach names the kitchen's tab, which drops the till's name; the till is unmounted
		showScreen(THE_KITCHEN)
		page.unmount()
		expect(document.title).toBe("Kitchen · Neopos")

		// Back: the router's afterEach first, then the till's page mounts
		showScreen(THE_TILL)
		till()

		expect(document.title).toBe("Restaurant till · Neopos")
	})
})

describe("the till page", () => {
	const page = readFileSync(path.resolve(__dirname, "../POSSale.vue"), "utf8")

	it("names its tab through the composable, once, and writes no title itself", () => {
		expect(page).toMatch(
			/import \{ useTillTabTitle \} from "@\/composables\/useTillTabTitle";/,
		)
		expect(page.match(/\buseTillTabTitle\(\)/g)).toHaveLength(1)
		expect(page).not.toMatch(/\bdocument\.title\b/)
	})
})
