/**
 * //// Neoffice — added file (no upstream equivalent). The reservation form tells the reason when the server refuses a booking (NeoRestau lot 1, 01.11: a booking outside the opening hours only read
 * //// « Failed to create reservation », and the person at the till could not tell why). The server's own message is shown, the generic words only when it said nothing.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const toast = vi.hoisted(() => ({ showSuccess: vi.fn(), showError: vi.fn() }))
const reservations = vi.hoisted(() => ({ createReservation: vi.fn(), checkAvailability: vi.fn() }))
vi.mock("@/composables/useToast", () => ({ useToast: () => toast }))
vi.mock("@/composables/useReservations", () => ({ useReservations: () => reservations }))

const { default: ReservationForm } = await import("../ReservationForm.vue")

const refused = (message) => ({
	httpStatus: 417,
	exc_type: "ValidationError",
	_server_messages: JSON.stringify([JSON.stringify({ message, title: "Message", indicator: "red" })]),
})

function open() {
	return mount(ReservationForm, {
		props: {
			// a form with its date, time, guests and name filled is valid: the person at the till has only to press Save
			reservation: { reservation_date: "2026-11-01", reservation_time: "23:00:00", no_of_guests: 2, guest_name: "Test Guest", tables: [] },
			tables: [],
		},
		global: { stubs: { ReservationFloorPlan: true }, mocks: { __: globalThis.__ } },
	})
}

beforeEach(() => {
	toast.showError.mockClear()
	toast.showSuccess.mockClear()
	reservations.checkAvailability.mockResolvedValue({})
})

describe("a booking the server refuses", () => {
	it("says why: the server's own message is the toast", async () => {
		reservations.createReservation.mockRejectedValue(refused("Reservation time 23:00:00 is outside opening hours for Sunday"))
		const wrapper = open()

		await wrapper.get(".btn-save").trigger("click")
		await flushPromises()

		expect(toast.showError).toHaveBeenCalledWith("Reservation time 23:00:00 is outside opening hours for Sunday")
	})

	it("keeps the generic words when the server said nothing (a network failure)", async () => {
		reservations.createReservation.mockRejectedValue(new Error(""))
		const wrapper = open()

		await wrapper.get(".btn-save").trigger("click")
		await flushPromises()

		expect(toast.showError).toHaveBeenCalledWith("Failed to create reservation")
	})
})
