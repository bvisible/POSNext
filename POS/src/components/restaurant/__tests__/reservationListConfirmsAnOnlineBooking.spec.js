/**
 * //// Neoffice — added file (no upstream equivalent). The till confirms an online booking whose guest has not confirmed
 * //// it from the e-mail (he phoned, say): the day's list offers the confirm button on such a booking even where it is
 * //// already Confirmed (a restaurant that does not validate online bookings), and the server then keeps it for good
 * //// instead of letting it expire (NeoRestau lot 1, task 18).
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { default: ReservationList } = await import("../ReservationList.vue")

function row(name, values) {
	return {
		name,
		status: "Confirmed",
		reservation_time: "20:00:00",
		guest_name: `Guest ${name}`,
		no_of_guests: 2,
		channel: "Internet",
		tables: [],
		...values,
	}
}

function open(reservations) {
	return mount(ReservationList, {
		props: { reservations, currentDate: "2026-11-06" },
		global: { mocks: { __: globalThis.__ } },
	})
}

const confirmButtonOf = (wrapper, name) =>
	wrapper
		.findAll(".reservation-row")
		.find((rowElement) => rowElement.text().includes(`Guest ${name}`))
		.find(".confirm-btn")

describe("the day's list of the till confirms an online booking for its guest", () => {
	it("offers to confirm a booking whose guest has not confirmed it, Confirmed or Pending", () => {
		const wrapper = open([
			row("RES-1", { awaits_guest: true }),
			row("RES-2", { status: "Pending", awaits_guest: true }),
			row("RES-3", { awaits_guest: false }),
		])

		expect(confirmButtonOf(wrapper, "RES-1").exists()).toBe(true)
		expect(confirmButtonOf(wrapper, "RES-2").exists()).toBe(true)
		expect(confirmButtonOf(wrapper, "RES-3").exists()).toBe(false)
	})

	it("asks the dialog to confirm the booking clicked", async () => {
		const booking = row("RES-1", { awaits_guest: true })
		const wrapper = open([booking])

		await confirmButtonOf(wrapper, "RES-1").trigger("click")

		expect(wrapper.emitted("confirm")).toEqual([[booking]])
	})
})
