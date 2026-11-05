/**
 * //// Neoffice — added file (no upstream equivalent). « Offert » at the till (NeoResto lot 1, task 24): the cashier
 * //// offers some or all of a line; the paid part keeps the rest, the offered part is a row of the same dish at zero, kept
 * //// apart from every path that addresses a line by its item code (the stepper, the line dialog, a new unit scanned, the
 * //// offers engine, a coupon), and merged back on « Annuler l'offert ». Who may offer: whoever may change a discount at
 * //// the till; an opt-in manager PIN (« Offer an item ») approves the value offered on the ticket.
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const server = vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? String(s).replace(/{(\d+)}/g, (_, n) => args[n] ?? _) : s
	return { sent: [], promotion: 0 }
})
const auth = vi.hoisted(() => ({ required: false, grant: null, calls: [] }))
const net = vi.hoisted(() => ({ offline: false }))
const settings = vi.hoisted(() => ({ allowItemDiscount: true }))
const toast = vi.hoisted(() => ({ warnings: [], successes: [] }))

vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: (options = {}) => ({
		submit: vi.fn(async (params) => {
			const body = options.makeParams ? options.makeParams(params) : params
			if (String(options.url || "").includes("apply_offers")) {
				// The server receives what makeParams sends, and answers its items in the same order
				const data = JSON.parse(body.invoice_data)
				server.sent.push(data)
				return {
					items: data.items.map((item) => ({
						...item,
						discount_percentage: server.promotion,
						pricing_rules: server.promotion ? "PROMO10" : "",
					})),
					free_items: [],
					applied_pricing_rules: server.promotion ? ["PROMO10"] : [],
				}
			}
			return {}
		}),
		reload: vi.fn(),
		fetch: vi.fn(),
	}),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: (m) => toast.successes.push(m),
		showError: (m) => toast.warnings.push(m),
		showWarning: (m) => toast.warnings.push(m),
		showInfo: vi.fn(),
	}),
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => net.offline,
	getCachedItem: vi.fn(),
}))
vi.mock("@/stores/posSettings", () => ({
	usePOSSettingsStore: () => ({
		shouldEnforceStockValidation: () => false,
		get allowItemDiscount() {
			return settings.allowItemDiscount
		},
	}),
}))
vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({
		isAuthorizationRequired: () => auth.required,
		requireAuthorization: async (action, context, options) => {
			auth.calls.push({ action, context, options })
			return auth.grant
		},
	}),
}))
vi.mock("@/data/session", () => ({ sessionUser: () => "cashier@example.com" }))
// The real cart pulls the offline layer in through the offers store and the network state. Left real, it starts a
// worker, a Dexie database that does not exist in jsdom, a restart timer (4 s) and a network ping, and every one of
// them logs after the file has finished: vitest then fails the whole run with "Closing rpc while onUserConsoleLog was
// pending" although all the tests passed (CI frontend-tests, 2026-11-05). Doubles keep this file to the cart.
vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: false, getConnectionQuality: () => "good", subscribe: vi.fn() },
}))
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => null) }),
}))
vi.mock("@/utils/offline/db", () => ({
	db: {},
	getOneTimeRedemptions: vi.fn(async () => []),
	setOneTimeRedemptions: vi.fn(async () => {}),
	addOneTimeRedemptions: vi.fn(async () => {}),
}))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))

const { usePOSCartStore } = await import("../posCart")
const { useOfferedItemsStore } = await import("../offeredItems")
const { isOfferedRow, nestOfferedRows } = await import("@/utils/offeredRows")
const { nestFreeRows } = await import("@/utils/gwpSameItemFreeRows")
const { dropGrant } = await import("@/utils/offerApproval")

const tiramisu = {
	item_code: "TIRAMISU",
	item_name: "Tiramisu",
	rate: 9.5,
	price_list_rate: 9.5,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
}
const espresso = {
	item_code: "ESPRESSO",
	item_name: "Espresso",
	rate: 4.2,
	price_list_rate: 4.2,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
}
const GRANT = {
	authorized: true,
	grant_token: "TOKEN-1",
	expires_in: 900,
	approved_by: "manager@example.com",
}

function rowsOf(cart) {
	return cart.invoiceItems.map((r) => [
		r.item_code,
		r.quantity,
		isOfferedRow(r) ? "offered" : "paid",
	])
}

describe("« Offert »: the cart splits the line", () => {
	let cart
	let offered

	beforeEach(() => {
		setActivePinia(createPinia())
		Object.assign(settings, { allowItemDiscount: true })
		Object.assign(auth, { required: false, grant: GRANT, calls: [] })
		Object.assign(net, { offline: false })
		Object.assign(server, { sent: [], promotion: 0 })
		toast.warnings.length = 0
		toast.successes.length = 0
		dropGrant()
		cart = usePOSCartStore()
		cart.setPosProfile("Till")
		cart.customer = "Guest of table 2"
		cart.addItem(
			{ ...tiramisu, kds_status: "Pending", preparation_station: "Kitchen" },
			3,
		)
		offered = useOfferedItemsStore()
	})

	afterEach(() => vi.useRealTimers())

	it("offers part of a line: the paid part keeps the rest, the offered row follows it at zero", async () => {
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(true)
		expect(rowsOf(cart)).toEqual([
			["TIRAMISU", 2, "paid"],
			["TIRAMISU", 1, "offered"],
		])
		const row = cart.invoiceItems[1]
		expect(row).toMatchObject({
			price_list_rate: 9.5,
			discount_percentage: 100,
			amount: 0,
			tax_amount: 0,
		})
		// The list value stays readable: in the subtotal, and as much in the discounts
		expect(cart.subtotal).toBe(28.5)
		expect(cart.totalDiscount).toBe(9.5)
		expect(cart.grandTotal).toBe(19)
		expect(toast.successes).toHaveLength(1)
	})

	it("« Tout » offers the whole line in place: the line itself reads offered", async () => {
		await offered.offer(cart.invoiceItems[0], 3)
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "offered"]])
		expect(cart.grandTotal).toBe(0)
	})

	it("clamps the quantity to the line's", async () => {
		await offered.offer(cart.invoiceItems[0], 9)
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "offered"]])
	})

	it("acts on the line the cart shows, a copy of it (nestFreeRows)", async () => {
		const shown = nestFreeRows(cart.invoiceItems)[0]
		await offered.offer(shown, 1)
		expect(rowsOf(cart)).toEqual([
			["TIRAMISU", 2, "paid"],
			["TIRAMISU", 1, "offered"],
		])
	})

	it("carries the kitchen state: a dish already sent is not sent again", async () => {
		await offered.offer(cart.invoiceItems[0], 1)
		expect(cart.invoiceItems.map((r) => r.kds_status)).toEqual([
			"Pending",
			"Pending",
		])
		expect(cart.invoiceItems[1].preparation_station).toBe("Kitchen")
		// The table's draft the till saves (Valider) holds both rows, the offered one flagged, both at the kitchen
		const draft = cart.buildOfferEvaluationPayload({ customer: "Guest" })
		expect(
			draft.items.map((i) => [
				i.qty,
				i.kds_status,
				i.posa_is_offered,
				i.discount_percentage,
			]),
		).toEqual([
			[2, "Pending", 0, 0],
			[1, "Pending", 1, 100],
		])
	})

	it("« Annuler l'offert » merges the offered row back into its paid line", async () => {
		await offered.offer(cart.invoiceItems[0], 1)
		offered.cancelOffer(nestOfferedRows(nestFreeRows(cart.invoiceItems))[1])
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "paid"]])
		expect(cart.grandTotal).toBe(28.5)
	})

	it("« Annuler l'offert » on a whole line offered turns it back into a paid line", async () => {
		await offered.offer(cart.invoiceItems[0], 3)
		offered.cancelOffer(cart.invoiceItems[0])
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "paid"]])
		expect(cart.invoiceItems[0]).toMatchObject({
			discount_percentage: 0,
			discount_amount: 0,
		})
		expect(cart.grandTotal).toBe(28.5)
	})

	it("a new unit of the dish never merges into an offered row", async () => {
		await offered.offer(cart.invoiceItems[0], 3)
		cart.addItem({ ...tiramisu })
		expect(rowsOf(cart)).toEqual([
			["TIRAMISU", 3, "offered"],
			["TIRAMISU", 1, "paid"],
		])
		expect(cart.grandTotal).toBe(9.5)
	})

	it("the stepper and the line dialog address the paid line, never the offered row", async () => {
		await offered.offer(cart.invoiceItems[0], 3)
		cart.addItem({ ...tiramisu })
		cart.updateItemQuantity("TIRAMISU", 2, "Nos")
		await cart.updateItemDetails(
			"TIRAMISU",
			{ quantity: 4, discount_percentage: 0, discount_amount: 0 },
			"Nos",
		)
		expect(rowsOf(cart)).toEqual([
			["TIRAMISU", 3, "offered"],
			["TIRAMISU", 4, "paid"],
		])
		expect(cart.invoiceItems[0].discount_percentage).toBe(100)
		expect(cart.grandTotal).toBe(38)
	})

	it("the stepper going down to 0 removes the paid line, never the offered row", async () => {
		await offered.offer(cart.invoiceItems[0], 3)
		cart.addItem({ ...tiramisu })
		// What InvoiceCart emits when the paid line's quantity goes below 1: (item_code, uom)
		cart.removeItem("TIRAMISU", "Nos")
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "offered"]])
		cart.removeItem("TIRAMISU")
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "offered"]])
	})

	it("a unit change of the paid line never merges it into an offered row", async () => {
		cart.addItem(
			{
				...tiramisu,
				uom: "Box",
				item_uoms: [{ uom: "Box", conversion_factor: 1 }],
			},
			1,
		)
		// The tiramisu in Nos offered whole; the one in Box changed to Nos stays a line of its own
		await offered.offer(cart.invoiceItems[0], 3)
		await cart.updateItemDetails("TIRAMISU", { uom: "Nos" }, "Box")
		expect(
			cart.invoiceItems.filter(isOfferedRow).map((r) => r.quantity),
		).toEqual([3])
		expect(
			cart.invoiceItems
				.filter((r) => !isOfferedRow(r))
				.map((r) => [r.uom, r.quantity]),
		).toEqual([["Nos", 1]])
	})

	it("a till that does not let its cashiers change a discount offers nothing", async () => {
		settings.allowItemDiscount = false
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(false)
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "paid"]])
		expect(toast.warnings).toHaveLength(1)
	})

	it("an order (Sales Order) offers nothing: the offer is an invoice's", async () => {
		cart.setTargetDoctype("Sales Order")
		expect(offered.canOffer).toBe(false)
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(false)
		expect(rowsOf(cart)).toEqual([["TIRAMISU", 3, "paid"]])
	})
})

describe("« Offert »: the opt-in manager PIN (« Offer an item »)", () => {
	let cart
	let offered

	beforeEach(() => {
		setActivePinia(createPinia())
		Object.assign(settings, { allowItemDiscount: true })
		Object.assign(auth, { required: true, grant: GRANT, calls: [] })
		Object.assign(net, { offline: false })
		toast.warnings.length = 0
		dropGrant()
		cart = usePOSCartStore()
		cart.setPosProfile("Till")
		cart.customer = "Guest of table 2"
		cart.addItem({ ...tiramisu }, 3)
		cart.addItem({ ...espresso }, 2)
		offered = useOfferedItemsStore()
	})

	afterEach(() => vi.useRealTimers())

	it("asks a manager to approve the value offered on the ticket, then offers", async () => {
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(true)
		expect(auth.calls).toHaveLength(1)
		expect(auth.calls[0].action).toBe("Offer an item")
		expect(auth.calls[0].context).toMatchObject({
			pos_profile: "Till",
			amount: 9.5,
		})
		// The approval rides with the payment
		expect(offered.authorizationFields(cart.invoiceItems)).toEqual({
			authorization_token: "TOKEN-1",
		})
		expect(offered.needsApprovalForPayment()).toBe(false)
	})

	it("a second offer asks again, for everything offered on the ticket", async () => {
		await offered.offer(cart.invoiceItems[0], 1)
		auth.grant = { ...GRANT, grant_token: "TOKEN-2" }
		const espressoRow = cart.invoiceItems.find(
			(r) => r.item_code === "ESPRESSO",
		)
		await offered.offer(espressoRow, 2)
		expect(auth.calls).toHaveLength(2)
		expect(auth.calls[1].context.amount).toBe(17.9)
		expect(offered.authorizationFields(cart.invoiceItems)).toEqual({
			authorization_token: "TOKEN-2",
		})
	})

	it("the manager's refusal offers nothing", async () => {
		auth.grant = null
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(false)
		expect(cart.invoiceItems.some(isOfferedRow)).toBe(false)
	})

	it("offline, the PIN cannot be checked: nothing is offered, the cashier is told why", async () => {
		net.offline = true
		expect(await offered.offer(cart.invoiceItems[0], 1)).toBe(false)
		expect(auth.calls).toHaveLength(0)
		expect(toast.warnings).toHaveLength(1)
		expect(cart.invoiceItems.some(isOfferedRow)).toBe(false)
	})

	it("the payment asks again once the approval has expired", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(2026, 9, 31, 20, 0))
		await offered.offer(cart.invoiceItems[0], 1)
		expect(offered.needsApprovalForPayment()).toBe(false)
		vi.setSystemTime(new Date(2026, 9, 31, 20, 20))
		expect(offered.needsApprovalForPayment()).toBe(true)
		auth.grant = { ...GRANT, grant_token: "TOKEN-3" }
		expect(await offered.approveForPayment()).toBe(true)
		expect(auth.calls.at(-1).context.amount).toBe(9.5)
		expect(offered.authorizationFields(cart.invoiceItems)).toEqual({
			authorization_token: "TOKEN-3",
		})
	})

	it("the approval dies with the ticket: the next ticket's offers ask again", async () => {
		await offered.offer(cart.invoiceItems[0], 1)
		await cart.clearCart()
		await Promise.resolve()
		expect(offered.authorizationFields([{ posa_is_offered: 1 }])).toEqual({})
		cart.addItem({ ...tiramisu }, 2)
		await offered.offer(cart.invoiceItems[0], 1)
		expect(auth.calls).toHaveLength(2)
	})

	it("without a rule nothing is asked and no token rides", async () => {
		auth.required = false
		await offered.offer(cart.invoiceItems[0], 1)
		expect(auth.calls).toHaveLength(0)
		expect(offered.needsApprovalForPayment()).toBe(false)
		expect(offered.authorizationFields(cart.invoiceItems)).toEqual({})
	})
})

describe("« Offert » offline", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		Object.assign(settings, { allowItemDiscount: true })
		Object.assign(auth, { required: false, grant: GRANT, calls: [] })
		Object.assign(net, { offline: true })
		dropGrant()
	})

	it("the split works offline, and the sale queued offline carries the offered row", async () => {
		const cart = usePOSCartStore()
		cart.setPosProfile("Till")
		cart.addItem({ ...tiramisu }, 3)
		expect(await useOfferedItemsStore().offer(cart.invoiceItems[0], 1)).toBe(
			true,
		)
		// What POSSale queues offline is formatItemsForSubmission's output, synced later like any line
		const queued = cart.formatItemsForSubmission(cart.invoiceItems)
		expect(
			queued.map((i) => [
				i.qty,
				i.posa_is_offered,
				i.rate,
				i.price_list_rate,
				i.discount_percentage,
			]),
		).toEqual([
			[2, 0, 9.5, 9.5, 0],
			[1, 1, 0, 9.5, 100],
		])
	})
})

describe("the offers engine and an offered row", () => {
	let cart

	beforeEach(() => {
		setActivePinia(createPinia())
		Object.assign(settings, { allowItemDiscount: true })
		Object.assign(auth, { required: false, grant: GRANT, calls: [] })
		Object.assign(net, { offline: false })
		Object.assign(server, { sent: [], promotion: 10 })
		dropGrant()
		cart = usePOSCartStore()
		cart.setPosProfile("Till")
		cart.customer = "Guest of table 2"
		cart.addItem({ ...tiramisu }, 3)
	})

	it("never sees it, and a promotion it answers never changes its 100 %", async () => {
		await useOfferedItemsStore().offer(cart.invoiceItems[0], 1)
		await cart.applyOffer(
			{ name: "PROMO10", title: "Promo 10 %" },
			{ name: "Till", customer: "Guest of table 2" },
		)
		const sent = server.sent.at(-1)
		expect(sent.items.map((i) => [i.item_code, i.qty])).toEqual([
			["TIRAMISU", 2],
		])
		expect(
			cart.invoiceItems.map((r) => [r.quantity, r.discount_percentage]),
		).toEqual([
			[2, 10],
			[1, 100],
		])
		expect(cart.grandTotal).toBe(17.1)
	})

	it("reads its answer against the other rows, an offered row before them in the cart included", async () => {
		// The whole tiramisu line offered (the cart's first row), then two espressos sold
		await useOfferedItemsStore().offer(cart.invoiceItems[0], 3)
		cart.addItem({ ...espresso }, 2)
		await cart.applyOffer(
			{ name: "PROMO10", title: "Promo 10 %" },
			{ name: "Till", customer: "Guest of table 2" },
		)
		expect(server.sent.at(-1).items.map((i) => i.item_code)).toEqual([
			"ESPRESSO",
		])
		expect(
			cart.invoiceItems.map((r) => [r.item_code, r.discount_percentage]),
		).toEqual([
			["TIRAMISU", 100],
			["ESPRESSO", 10],
		])
		expect(cart.grandTotal).toBe(7.56)
	})

	it("a coupon's line discount never lands on it", async () => {
		await useOfferedItemsStore().offer(cart.invoiceItems[0], 1)
		// A coupon priced per line (posnext_promotions) names both lines of the cart: the offered one is skipped
		cart.applyDiscountToCart({
			name: "WELCOME20",
			code: "WELCOME20",
			line_level: true,
			line_updates: [
				{ line_key: 0, item_code: "TIRAMISU", discount_percentage: 20 },
				{ line_key: 1, item_code: "TIRAMISU", discount_percentage: 20 },
			],
		})
		expect(
			cart.invoiceItems.map((r) => [
				r.quantity,
				r.discount_percentage,
				r.coupon_code || null,
			]),
		).toEqual([
			[2, 20, "WELCOME20"],
			[1, 100, null],
		])
		expect(cart.grandTotal).toBe(15.2)
	})
})
