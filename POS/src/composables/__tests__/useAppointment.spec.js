//// Neoffice — added file (no upstream equivalent). The till works the appointments of a salon (NeoSalon, step 2, lot G4; product owner, 10.11.2026).
// The reservation's draft is loaded into the cart: each line with its person, priced again at the DAY'S prices (the till's offers apply), the customer, what was
// already paid, and the payment submits THAT draft. A refusal is said in the lane's words and leaves the cart as it was; a cart that is not empty refuses before
// asking; without the network the cart is made from the agenda the till kept; the time of an appointment needs the network.
// @vitest-environment jsdom
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const toast = vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? args.reduce((out, arg, at) => out.replace(`{${at}}`, arg), s) : s
	return {}
})
const settings = vi.hoisted(() => ({
	enableSalesPersons: true,
	trackProductSalesByPerson: false,
	shouldEnforceStockValidation: () => false,
}))
const call = vi.hoisted(() => vi.fn())
const network = vi.hoisted(() => ({ isOffline: false }))
const cached = vi.hoisted(() => ({ items: {} }))

vi.mock("frappe-ui", () => ({
	call: vi.fn(async () => ({ valid: true })),
	createResource: () => ({ submit: vi.fn(), reload: vi.fn(), fetch: vi.fn() }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => {
		Object.assign(toast, {
			showSuccess: vi.fn(),
			showError: vi.fn(),
			showWarning: vi.fn(),
			showInfo: vi.fn(),
		})
		return toast
	},
}))
vi.mock("@/utils/offline", () => ({
	isOffline: () => network.isOffline,
	getCachedItem: vi.fn(async (code) => cached.items[code] || null),
}))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: network }))
vi.mock("@/stores/posSettings", () => ({ usePOSSettingsStore: () => settings }))
vi.mock("@/stores/posShift", () => ({
	usePOSShiftStore: () => ({ profileName: "Till A" }),
}))
vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useOpenTable", () => ({
	customerOfTheOrder: (order) => ({
		name: order.customer,
		customer_name: order.customer_name || order.customer,
	}),
}))

const { usePOSCartStore } = await import("@/stores/posCart")
const { forgetItemKinds } = await import("@/utils/itemKinds")
const { useAppointment, cartLineOfAppointment } = await import(
	"../useAppointment"
)

const line = (code, name, rate, person, extra = {}) => ({
	item_code: code,
	item_name: name,
	qty: 1,
	rate,
	price_list_rate: rate,
	uom: "Nos",
	stock_uom: "Nos",
	conversion_factor: 1,
	sales_person: person,
	sales_person_name: person,
	...extra,
})
const draft = {
	booking: "BKG-1",
	invoice: "ACC-SINV-1",
	customer: "CUST-7",
	customer_name: "Mme Dupont",
	starts_at: "2026-11-10 09:30:00",
	ends_at: "2026-11-10 12:15:00",
	paid_amount: 40,
	payments: [{ mode_of_payment: "Wallee", amount: 40 }],
	items: [
		line("COUPE", "Coupe femme", 65, "Sonia"),
		line("COULEUR", "Couleur", 78, "Luc"),
		line("SOIN", "Soin", 32, null),
	],
}
const row = {
	key: "BKG-1",
	booking: "BKG-1",
	customer: "CUST-7",
	customer_name: "Mme Dupont",
	starts_at: "2026-11-10 09:30:00",
	ends_at: "2026-11-10 12:15:00",
	steps: [
		{
			item_code: "COUPE",
			label: "Coupe femme",
			qty: 1,
			options: null,
			sales_person: "Sonia",
			sales_person_name: "Sonia",
		},
		{
			item_code: "COULEUR",
			label: "Couleur",
			qty: 1,
			options: JSON.stringify([
				{ group: "Length", options: [{ name: "Mid", price_adjustment: 15 }] },
			]),
			sales_person: "Luc",
			sales_person_name: "Luc",
		},
	],
}
const asked = (suffix) =>
	call.mock.calls.filter(([method]) => method.endsWith(suffix))
// The day's prices of the till: its price list says 70 for a cut and 80 for a colour
const DAY = { COUPE: 70, COULEUR: 80, SOIN: 32 }
const answerTheTill = (extra = {}) =>
	call.mockImplementation(async (method, args) => {
		if (method.endsWith("take_appointment")) return { message: draft }
		if (method.endsWith("get_item_details"))
			return { message: { price_list_rate: DAY[args.item_code] } }
		return { message: extra[method.split(".").pop()] ?? {} }
	})

describe("a line of an appointment, as the cart takes it", () => {
	it("is at the day's price plus its options, keeps its person and is never given the one who serves", () => {
		const options = JSON.stringify([
			{ group: "Length", options: [{ name: "Mid", price_adjustment: 15 }] },
		])

		const { item, qty } = cartLineOfAppointment(
			line("COULEUR", "Couleur", 78, "Luc", {
				posa_item_modifiers: options,
				qty: 2,
			}),
			80,
		)

		expect(qty).toBe(2)
		expect([item.rate, item.price_list_rate, item._modifiers_applied]).toEqual([
			95, 95, 15,
		])
		expect([
			item.sales_person,
			item.keeps_its_person,
			item.posa_item_modifiers,
		]).toEqual(["Luc", true, options])
	})

	it("falls back to the price of the draft when the day's price cannot be asked, and to nothing for a line with no person", () => {
		const { item } = cartLineOfAppointment(line("SOIN", "Soin", 32, null), null)

		expect([item.rate, item.sales_person, item.keeps_its_person]).toEqual([
			32,
			null,
			true,
		])
	})
})

describe("the till works an appointment", () => {
	let cart
	beforeEach(() => {
		setActivePinia(createPinia())
		forgetItemKinds()
		call.mockReset()
		network.isOffline = false
		cached.items = {}
		Object.assign(settings, {
			enableSalesPersons: true,
			trackProductSalesByPerson: false,
		})
		cart = usePOSCartStore()
		cart.setPosProfile("Till A")
	})
	const lines = () => cart.invoiceItems.filter((item) => !item.is_free_item)

	it("takes a draft over: the lines at the day's prices, each with its person, the acquired amount, the draft to pay and whose appointment it is", async () => {
		answerTheTill()

		const taken = await useAppointment().takeAppointment(row)

		expect(taken).toBe(true)
		expect(
			lines().map((item) => [item.item_code, item.rate, item.sales_person]),
		).toEqual([
			["COUPE", 70, "Sonia"],
			["COULEUR", 80, "Luc"],
			["SOIN", 32, null],
		])
		expect(cart.shopCartInvoice).toBe("ACC-SINV-1")
		expect(cart.guestPaidAmount).toBe(40)
		expect(cart.appointment).toMatchObject({
			booking: "BKG-1",
			invoice: "ACC-SINV-1",
			customer_name: "Mme Dupont",
			paid_amount: 40,
		})
		expect(asked("take_appointment")[0][1]).toEqual({
			pos_profile: "Till A",
			booking: "BKG-1",
		})
	})

	it("prices each line with the till's price list for this customer", async () => {
		answerTheTill()

		await useAppointment().takeAppointment(row)

		const details = asked("get_item_details").map(([, args]) => [
			args.item_code,
			args.pos_profile,
			args.customer,
		])
		expect(details).toEqual([
			["COUPE", "Till A", "CUST-7"],
			["COULEUR", "Till A", "CUST-7"],
			["SOIN", "Till A", "CUST-7"],
		])
	})

	it("keeps the draft's price for a line when the day's price cannot be asked, and says nothing of it", async () => {
		call.mockImplementation(async (method) => {
			if (method.endsWith("take_appointment")) return { message: draft }
			throw new Error("no price")
		})

		await useAppointment().takeAppointment(row)

		expect(lines().map((item) => item.rate)).toEqual([65, 78, 32])
		expect(toast.showError).not.toHaveBeenCalled()
	})

	it("says the lane's own words when it refuses, and leaves the cart as it was", async () => {
		call.mockRejectedValue({
			exc_type: "ValidationError",
			_server_messages: JSON.stringify([
				JSON.stringify({ message: "This appointment is already collected." }),
			]),
		})

		const taken = await useAppointment().takeAppointment(row)

		expect(taken).toBe(false)
		expect(lines()).toHaveLength(0)
		expect(cart.shopCartInvoice).toBeNull()
		expect(cart.appointment).toBeNull()
		expect(toast.showError).toHaveBeenCalled()
	})

	it("asks nothing while the cart holds something", async () => {
		cart.addItem({
			item_code: "SHAMPOO",
			item_name: "Shampoo",
			rate: 30,
			price_list_rate: 30,
			uom: "Nos",
			stock_uom: "Nos",
			conversion_factor: 1,
		})

		const taken = await useAppointment().takeAppointment(row)

		expect(taken).toBe(false)
		// The cart asks the site what kind a line is when it is added: that is not the appointment's call
		expect([asked("take_appointment"), asked("get_item_details")]).toEqual([
			[],
			[],
		])
		expect(toast.showWarning).toHaveBeenCalled()
	})

	it("makes the cart from the agenda it kept when the till has no network, from the cached prices, and names the appointment for the sale", async () => {
		network.isOffline = true
		cached.items = {
			COUPE: { price_list_rate: 66 },
			COULEUR: { price_list_rate: 79 },
		}

		const taken = await useAppointment().takeAppointment(row)

		expect(taken).toBe(true)
		expect([asked("take_appointment"), asked("get_item_details")]).toEqual([
			[],
			[],
		])
		expect(
			lines().map((item) => [item.item_code, item.rate, item.sales_person]),
		).toEqual([
			["COUPE", 66, "Sonia"],
			["COULEUR", 94, "Luc"],
		])
		expect(cart.shopCartInvoice).toBeNull()
		expect(cart.appointment).toMatchObject({
			booking: "BKG-1",
			invoice: null,
			paid_amount: 0,
		})
		expect(cart.guestPaidAmount).toBe(0)
	})

	it("refuses to make an offline cart from an appointment that carries no service", async () => {
		network.isOffline = true

		const taken = await useAppointment().takeAppointment({
			...row,
			steps: [{ label: "A busy one" }],
		})

		expect(taken).toBe(false)
		expect(toast.showWarning).toHaveBeenCalled()
		expect(lines()).toHaveLength(0)
	})

	it("forgets the appointment when the cart is cleared", async () => {
		answerTheTill()
		await useAppointment().takeAppointment(row)

		await cart.clearCart()

		expect(cart.appointment).toBeNull()
		expect(cart.shopCartInvoice).toBeNull()
	})
})

describe("the gestures of the salon", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		call.mockReset()
		network.isOffline = false
	})

	it("reads the day of the till, and nothing without the network", async () => {
		call.mockResolvedValue({
			message: {
				available: true,
				date: "2026-11-10",
				appointments: [{ booking: "BKG-1" }],
			},
		})

		const day = await useAppointment().loadDay("2026-11-10")

		expect(day.appointments).toEqual([{ booking: "BKG-1" }])
		expect(asked("get_appointments")[0][1]).toEqual({
			pos_profile: "Till A",
			date: "2026-11-10",
		})
		call.mockClear()
		network.isOffline = true
		expect(await useAppointment().loadDay()).toBeNull()
		expect(call).not.toHaveBeenCalled()
	})

	it("moves an appointment, warning the customer unless told otherwise, and says it", async () => {
		call.mockResolvedValue({
			message: { booking: "BKG-1", to: "2026-11-10 16:00:00" },
		})

		const done = await useAppointment().move("BKG-1", "2026-11-10 16:00:00", {
			salesPerson: "Luc",
		})
		await useAppointment().move("BKG-1", "2026-11-10 16:00:00", {
			notify: false,
		})

		expect(done.to).toBe("2026-11-10 16:00:00")
		expect(
			asked("move_appointment").map(([, args]) => [
				args.sales_person,
				args.notify,
			]),
		).toEqual([
			["Luc", 1],
			[null, 0],
		])
		expect(toast.showSuccess).toHaveBeenCalled()
	})

	it("asks whether a move would fit without saying anything when it cannot be asked", async () => {
		call.mockRejectedValue(new Error("gone"))

		const answer = await useAppointment().checkMove(
			"BKG-1",
			"2026-11-10 16:00:00",
			"Luc",
		)

		expect(answer).toBeNull()
		expect(toast.showError).not.toHaveBeenCalled()
		expect(asked("check_appointment_move")[0][1]).toMatchObject({
			booking: "BKG-1",
			sales_person: "Luc",
		})
	})

	it("cancels, or marks absent, with the reason asked", async () => {
		call.mockResolvedValue({
			message: {
				booking: "BKG-1",
				state: "cancelled",
				refunded: 40,
				to_refund: 0,
			},
		})

		await useAppointment().cancel("BKG-1")
		await useAppointment().cancel("BKG-1", { reason: "no_show", notify: false })

		expect(
			asked("cancel_appointment").map(([, args]) => [args.reason, args.notify]),
		).toEqual([
			["cancelled", 1],
			["no_show", 0],
		])
	})

	it("times an appointment by the gesture alone, never an hour, and only with the network", async () => {
		call.mockResolvedValue({
			message: { booking: "BKG-1", clock: { state: "running" } },
		})

		const done = await useAppointment().clock("BKG-1", "start", "Luc")

		expect(done.clock.state).toBe("running")
		expect(asked("clock_appointment")[0][1]).toEqual({
			pos_profile: "Till A",
			booking: "BKG-1",
			action: "start",
			sales_person: "Luc",
		})
		call.mockClear()
		network.isOffline = true
		expect(await useAppointment().clock("BKG-1", "finish")).toBeNull()
		expect(call).not.toHaveBeenCalled()
		expect(toast.showWarning).toHaveBeenCalled()
	})

	it("lists what can be booked and the free slots, and books with the chain as the site reads it", async () => {
		call.mockImplementation(async (method) => ({
			message: method.endsWith("get_services")
				? [{ item_code: "COUPE" }]
				: method.endsWith("get_slots")
					? [{ starts_at: "2026-11-10 15:30:00" }]
					: { booking: "BKG-7" },
		}))
		const gestures = useAppointment()

		expect(await gestures.services()).toEqual([{ item_code: "COUPE" }])
		expect(
			await gestures.slots(
				"2026-11-10",
				[{ item_code: "COUPE", options: null }],
				"Luc",
			),
		).toEqual([{ starts_at: "2026-11-10 15:30:00" }])
		expect(
			await gestures.book(
				"CUST-7",
				[{ item_code: "COUPE", options: null }],
				"2026-11-10 15:30:00",
				{ notify: false },
			),
		).toEqual({ booking: "BKG-7" })

		expect(asked("get_slots")[0][1].items).toBe(
			'[{"item_code":"COUPE","options":null}]',
		)
		expect(asked("book_appointment")[0][1]).toMatchObject({
			customer: "CUST-7",
			starts_at: "2026-11-10 15:30:00",
			notify: 0,
			sales_person: null,
		})
	})

	it("hands back an empty list when the services cannot be read", async () => {
		call.mockRejectedValue(new Error("gone"))

		expect(await useAppointment().services()).toEqual([])
	})
})
