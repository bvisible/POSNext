/**
 * //// Neoffice — added file (no upstream equivalent). The till's default customer, asked when the cart is cleared, never replaces a
 * //// customer set while the question was on its way (neoffice-maintenance#2163, the restaurant film of 02.11.2026: a table opened
 * //// again showed no customer's name). Opening a table clears the cart, which asks the server for the till's default customer, then
 * //// sets the customer of the table's order: an answer that came back after it put the till's default customer in its place.
 */
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

const submit = vi.fn()

vi.mock("frappe-ui", () => ({
	createResource: () => ({ submit, fetch: vi.fn(), reload: vi.fn(), data: null }),
	call: vi.fn(),
}))
vi.mock("@/utils/offline", () => ({ isOffline: () => true, getCachedItem: vi.fn() }))
vi.mock("@/stores/serialNumber", () => ({ useSerialNumberStore: () => ({ returnSerials: vi.fn() }) }))

const { shiftState } = await import("@/composables/useShift")
const { useInvoice } = await import("../useInvoice")

const TABLES_CUSTOMER = { name: "CUST-0007", customer_name: "Marie Dupont" }

/** The server's answer for the default customer, held until `answer` (or `fail`) is called. */
function aSlowAnswer() {
	const held = {}
	submit.mockImplementation(
		() =>
			new Promise((resolve, reject) => {
				held.answer = () => resolve({ customer: "Walk-in", customer_name: "Walk-in" })
				held.fail = () => reject(new Error("offline"))
			})
	)
	return held
}

describe("the till's default customer comes back late (neoffice-maintenance#2163)", () => {
	let invoice
	beforeEach(() => {
		setActivePinia(createPinia())
		submit.mockReset()
		shiftState.value = { ...shiftState.value, pos_profile: { name: "P1", customer: "Walk-in" } }
		invoice = useInvoice()
		invoice.posProfile.value = "P1"
	})

	it("leaves the customer of the table opened in the meantime", async () => {
		const server = aSlowAnswer()

		const asked = invoice.setDefaultCustomer()
		invoice.customer.value = TABLES_CUSTOMER
		server.answer()
		await asked

		expect(invoice.customer.value).toEqual(TABLES_CUSTOMER)
	})

	it("leaves it too when the question fails and the cached profile's customer would stand in", async () => {
		const server = aSlowAnswer()

		const asked = invoice.setDefaultCustomer()
		invoice.customer.value = TABLES_CUSTOMER
		server.fail()
		await asked

		expect(invoice.customer.value).toEqual(TABLES_CUSTOMER)
	})

	it("still gives a cleared cart the till's default customer", async () => {
		const server = aSlowAnswer()

		const asked = invoice.setDefaultCustomer()
		server.answer()
		await asked

		expect(invoice.customer.value).toMatchObject({ name: "Walk-in", customer_name: "Walk-in" })
	})
})
