/**
 * //// Neoffice — added file (no upstream equivalent). The piece the order screen's « ⋯ » and the floor plan's « ⋯ »
 * //// share to open a card the hours keep off the till (NeoRestau lot 1, task 25): the cards on offer, the pick (which
 * //// goes through the authorization gate as « Open a card outside its hours » where a rule asks a manager's PIN), and
 * //// the menu entry the floor plan includes in its own menu, shaped like its other entries.
 * @vitest-environment jsdom
 */
import { reactive } from "vue"
import { beforeEach, describe, expect, it, vi } from "vitest"

const requireAuthorization = vi.hoisted(() => vi.fn())
const handleError = vi.hoisted(() => vi.fn())
const store = vi.hoisted(() => ({}))

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({ requireAuthorization }),
	isAuthorizationError: (error) =>
		String(error?.message).includes("Authorization Required"),
}))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ handleError }) }))
vi.mock("@/stores/restaurant", () => ({ useRestaurantStore: () => store }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till 1" }),
}))

const {
	ACTION_OPEN_CARD_OUTSIDE_HOURS,
	openAnotherCardMenuItem,
	useCardPicker,
} = await import("../useCardPicker")

const SATURDAY = { name: "Saturday", card_name: "Saturday service" }
const SUNDAY = { name: "Sunday", card_name: "Sunday service" }

// The state of the picker is shared by every caller of the composable: each test starts from a closed, idle picker
function anIdlePicker() {
	const { state } = useCardPicker()
	state.open = false
	state.busy = false
}

function theStore({ enabled = true, cards = [SATURDAY, SUNDAY] } = {}) {
	const state = reactive({ isEnabled: enabled, pickableCards: cards })
	for (const key of Object.keys(store)) delete store[key]
	Object.defineProperties(store, {
		isEnabled: {
			get: () => state.isEnabled,
			enumerable: true,
			configurable: true,
		},
		pickableCards: {
			get: () => state.pickableCards,
			enumerable: true,
			configurable: true,
		},
	})
	store.openCardByHand = vi.fn(async (card) => ({
		...card,
		opened_by_hand: true,
	}))
	return state
}

describe("picking a card the hours keep off the till", () => {
	beforeEach(() => {
		requireAuthorization.mockReset()
		requireAuthorization.mockResolvedValue({
			grant_token: null,
			required: false,
		})
		handleError.mockReset()
		theStore()
		anIdlePicker()
	})

	it("uses the action name the product owner gave the gate", () => {
		expect(ACTION_OPEN_CARD_OUTSIDE_HOURS).toBe("Open a card outside its hours")
	})

	it("asks the gate first, for that card, at the till of the shift", async () => {
		await useCardPicker().pick(SATURDAY)

		expect(requireAuthorization).toHaveBeenCalledTimes(1)
		const [action, context] = requireAuthorization.mock.calls[0]
		expect(action).toBe("Open a card outside its hours")
		expect(context.pos_profile).toBe("Till 1")
		expect(context.restaurant_card).toBe("Saturday")
		// The approver is told what it is, and which card
		expect(context.actionLabel).toBe("Open a card outside its hours")
		expect(context.card_label).toBe("Saturday service")
	})

	it("opens the card with the manager's grant", async () => {
		requireAuthorization.mockResolvedValue({
			grant_token: "a-grant",
			authorized: true,
		})

		const opened = await useCardPicker().pick(SATURDAY)

		expect(opened).toBe(true)
		expect(store.openCardByHand).toHaveBeenCalledWith(SATURDAY, "a-grant")
	})

	it("opens the card with no grant where no rule asks a PIN", async () => {
		const opened = await useCardPicker().pick(SATURDAY)

		expect(opened).toBe(true)
		expect(store.openCardByHand).toHaveBeenCalledWith(SATURDAY, null)
	})

	it("opens nothing when the approval is cancelled", async () => {
		requireAuthorization.mockResolvedValue(null)

		const opened = await useCardPicker().pick(SATURDAY)

		expect(opened).toBe(false)
		expect(store.openCardByHand).not.toHaveBeenCalled()
		expect(handleError).not.toHaveBeenCalled()
	})

	it("says why when the server refuses the card, and opens nothing", async () => {
		store.openCardByHand.mockRejectedValue(
			new Error("This card is not available"),
		)

		const opened = await useCardPicker().pick(SATURDAY)

		expect(opened).toBe(false)
		expect(handleError).toHaveBeenCalledTimes(1)
		expect(handleError.mock.calls[0][0].message).toBe(
			"This card is not available",
		)
	})

	it("asks the PIN anyway when the server wants one that the till did not know of", async () => {
		store.openCardByHand
			.mockRejectedValueOnce(
				new Error("Open a card outside its hours: Authorization Required"),
			)
			.mockResolvedValueOnce({ ...SATURDAY, opened_by_hand: true })
		requireAuthorization
			.mockResolvedValueOnce({ grant_token: null, required: false })
			.mockResolvedValueOnce({ grant_token: "late-grant", authorized: true })

		const opened = await useCardPicker().pick(SATURDAY)

		expect(opened).toBe(true)
		expect(requireAuthorization.mock.calls[1][2]).toEqual({ force: true })
		expect(store.openCardByHand).toHaveBeenLastCalledWith(
			SATURDAY,
			"late-grant",
		)
		expect(handleError).not.toHaveBeenCalled()
	})

	it("opens one card at a time", async () => {
		let release
		requireAuthorization.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve
				}),
		)
		const picker = useCardPicker()

		const first = picker.pick(SATURDAY)
		const second = await picker.pick(SUNDAY)
		release({ grant_token: null, required: false })

		expect(second).toBe(false)
		expect(await first).toBe(true)
		expect(store.openCardByHand).toHaveBeenCalledTimes(1)
	})
})

describe("the cards on offer", () => {
	it("are the store's pickable cards", () => {
		theStore()

		expect(useCardPicker().cards.value.map((card) => card.name)).toEqual([
			"Saturday",
			"Sunday",
		])
	})

	it("are available where the store has some, in restaurant mode", () => {
		const state = theStore()
		const picker = useCardPicker()
		expect(picker.available.value).toBe(true)

		state.pickableCards = []
		expect(picker.available.value).toBe(false)

		state.pickableCards = [SATURDAY]
		state.isEnabled = false
		expect(picker.available.value).toBe(false)
	})
})

describe("the dialog the floor plan opens", () => {
	beforeEach(() => {
		theStore()
		anIdlePicker()
	})

	it("is shared by every caller of the composable", () => {
		useCardPicker().openDialog()

		expect(useCardPicker().state.open).toBe(true)

		useCardPicker().closeDialog()
		expect(useCardPicker().state.open).toBe(false)
	})
})

describe("the entry of the floor plan's « ⋯ » menu", () => {
	beforeEach(() => {
		theStore()
		anIdlePicker()
	})

	it("is shaped like the floor plan's own entries: a key, a label, an icon, who sees it, and what it does", () => {
		const item = openAnotherCardMenuItem()

		expect(Object.keys(item).sort()).toEqual([
			"icon",
			"key",
			"label",
			"run",
			"visible",
		])
		expect(item.key).toBe("open-another-card")
		expect(item.label).toBe("Open another card")
		expect(typeof item.icon).toBe("string")
		expect(item.icon.length).toBeGreaterThan(10)
		expect(typeof item.visible).toBe("boolean")
		expect(typeof item.run).toBe("function")
	})

	it("is seen when there is a card to fetch, and not otherwise", () => {
		const state = theStore()
		expect(openAnotherCardMenuItem().visible).toBe(true)

		state.pickableCards = []
		expect(openAnotherCardMenuItem().visible).toBe(false)
	})

	it("is not seen outside restaurant mode", () => {
		theStore({ enabled: false })

		expect(openAnotherCardMenuItem().visible).toBe(false)
	})

	it("opens the dialog that lists the cards when it runs", async () => {
		await openAnotherCardMenuItem().run()

		expect(useCardPicker().state.open).toBe(true)
	})

	it("is filtered out of the menu by its rule, as the floor plan filters its entries", () => {
		const state = theStore({ cards: [] })
		const menuItems = () =>
			[
				{
					key: "edit-floor-plan",
					label: "Edit the floor plan",
					icon: "M0",
					visible: false,
					run() {},
				},
				openAnotherCardMenuItem(),
			].filter((item) => item.visible)
		expect(menuItems()).toEqual([])

		state.pickableCards = [SATURDAY]
		expect(menuItems().map((item) => item.key)).toEqual(["open-another-card"])
	})
})
