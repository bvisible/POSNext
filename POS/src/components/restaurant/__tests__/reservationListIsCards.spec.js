/**
 * //// Neoffice — added file (no upstream equivalent). The day's reservations as cards, by service (NeoResto lot 1, product owner, 03.11.2026: « une grande ligne… propose-moi quelque
 * //// chose de sympa », the drawing validated the same day): lunch and dinner, a count of the bookings and of the guests, a card per booking with its time, how long until it or how late,
 * //// the name, the guests, the table, the channel, the note, a status colour, and the host's gestures at its foot.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (msgid, args) => {
		const text = Array.isArray(args) ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid
		return text
	}
})

const { default: ReservationList } = await import("../ReservationList.vue")

const DELACOUR = {
	name: "RES-1",
	status: "Confirmed",
	reservation_time: "12:15:00",
	no_of_guests: 6,
	guest_name: "Entreprise Delacour",
	channel: "Phone",
	phone: "+41 79 000 00 01",
	notes: "Business lunch, one guest without gluten.",
	tables: [{ restaurant_table: "t8", table_name: "Table 8", area: "r1", area_name: "Room 1" }],
}
const ROCHAT = { name: "RES-2", status: "Seated", reservation_time: "12:30:00", no_of_guests: 3, guest_name: "Mme Rochat", channel: "Walk-in", tables: [{ table_name: "Table 2", area: "r1", area_name: "Room 1" }] }
const BERNASCONI = { name: "RES-3", status: "Confirmed", reservation_time: "19:00:00", no_of_guests: 3, guest_name: "M. Bernasconi", channel: "Phone", tables: [{ table_name: "Table 3", area: "r1" }] }
const MARTIN = { name: "RES-4", status: "Pending", awaits_guest: true, reservation_time: "19:30:00", no_of_guests: 5, guest_name: "Famille Martin", channel: "Internet", tables: [] }
const GONE = { name: "RES-5", status: "Cancelled", reservation_time: "20:00:00", no_of_guests: 8, guest_name: "Cancelled party", channel: "Phone", tables: [] }

let wrapper

function list(props = {}) {
	wrapper = mount(ReservationList, {
		props: { reservations: [DELACOUR, ROCHAT, BERNASCONI, MARTIN, GONE], currentDate: "2026-11-03", ...props },
		global: { mocks: { __: globalThis.__ } },
	})
	return wrapper
}

const card = (name) => wrapper.findAll("[data-reservation-card]").find((c) => c.text().includes(name))

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date(2026, 10, 3, 11, 10))
})

afterEach(() => {
	wrapper?.unmount()
	vi.useRealTimers()
})

describe("the day's reservations", () => {
	it("are cut into lunch and dinner, each with its own count", () => {
		list()
		const services = wrapper.findAll("[data-service]")

		expect(services.map((s) => s.attributes("data-service"))).toEqual(["lunch", "dinner"])
		expect(services[0].text()).toContain("2 reservations")
		expect(services[0].text()).toContain("9 guests")
		expect(services[1].text()).toContain("2 reservations")
		expect(services[1].text()).toContain("8 guests")
	})

	it("leave out a service with no booking", () => {
		list({ reservations: [BERNASCONI] })

		expect(wrapper.findAll("[data-service]").map((s) => s.attributes("data-service"))).toEqual(["dinner"])
	})

	it("sum the day, a cancelled booking counting for nothing", () => {
		list()
		const summary = wrapper.get("[data-summary]").text()

		expect(summary).toContain("4 reservations")
		expect(summary).toContain("17 guests")
		expect(summary).toContain("1 seated")
	})

	it("show a card per booking, in the order of the hour", () => {
		list()

		expect(wrapper.findAll("[data-reservation-card]").map((c) => c.find(".card-name").text())).toEqual([
			"Entreprise Delacour",
			"Mme Rochat",
			"M. Bernasconi",
			"Famille Martin",
			"Cancelled party",
		])
	})
})

describe("a card", () => {
	it("says the time, the guests, the table with its room, the channel and the note", () => {
		list()
		const delacour = card("Delacour")

		expect(delacour.find(".card-time").text()).toBe("12:15")
		expect(delacour.text()).toContain("6 guests")
		expect(delacour.text()).toContain("Table 8 · Room 1")
		expect(delacour.text()).toContain("Phone")
		expect(delacour.find(".card-note").text()).toBe("Business lunch, one guest without gluten.")
	})

	it("takes the colour of its status", () => {
		list()

		expect(card("Delacour").classes()).toContain("status-confirmed")
		expect(card("Rochat").classes()).toContain("status-seated")
		expect(card("Martin").classes()).toContain("status-pending")
		expect(card("Cancelled party").classes()).toEqual(expect.arrayContaining(["status-cancelled", "is-over"]))
	})

	it("says how long until the guests, today", () => {
		list()

		expect(card("Delacour").get("[data-when]").text()).toBe("in 1 h 05")
		expect(card("Bernasconi").get("[data-when]").text()).toBe("in 7 h 50")
	})

	it("says how late the guests are, in red once they are really late", () => {
		vi.setSystemTime(new Date(2026, 10, 3, 12, 20))
		list()
		const late = card("Delacour").get("[data-when]")

		expect(late.text()).toBe("5 min late")
		expect(late.classes()).not.toContain("when-late")

		vi.setSystemTime(new Date(2026, 10, 3, 12, 40))
		wrapper.unmount()
		list()
		expect(card("Delacour").get("[data-when]").classes()).toContain("when-late")
	})

	it("counts nothing on another day", () => {
		list({ currentDate: "2026-11-04" })

		expect(card("Delacour").find("[data-when]").exists()).toBe(false)
	})

	it("says that a seated party is at its table, and an online booking awaits its guest", () => {
		list()

		expect(card("Rochat").get("[data-when]").text()).toBe("At the table")
		expect(card("Martin").get("[data-when]").text()).toBe("Awaiting the guest")
	})
})

describe("the gestures of a card", () => {
	it("check a confirmed booking in, call, edit, cancel it or mark it a no show", async () => {
		list()
		const delacour = card("Delacour")

		await delacour.get("[data-action='check-in']").trigger("click")
		await delacour.get("[data-action='edit']").trigger("click")
		await delacour.get("[data-action='cancel']").trigger("click")
		await delacour.get("[data-action='no-show']").trigger("click")

		expect(wrapper.emitted("check-in")[0][0].name).toBe("RES-1")
		expect(wrapper.emitted("cancel")[0][0].name).toBe("RES-1")
		expect(wrapper.emitted("no-show")[0][0].name).toBe("RES-1")
		expect(wrapper.emitted("select").length).toBeGreaterThanOrEqual(1)
		expect(delacour.get("[data-action='call']").attributes("href")).toBe("tel:+41 79 000 00 01")
	})

	it("do not open the booking when a gesture is made", async () => {
		list()

		await card("Delacour").get("[data-action='check-in']").trigger("click")

		expect(wrapper.emitted("select")).toBeUndefined()
	})

	it("open the booking when the card itself is touched", async () => {
		list()

		await card("Delacour").trigger("click")

		expect(wrapper.emitted("select")[0][0].name).toBe("RES-1")
	})

	it("confirm a pending online booking in its guest's place", async () => {
		list()
		const martin = card("Martin")

		await martin.get("[data-action='confirm']").trigger("click")

		expect(wrapper.emitted("confirm")[0][0].name).toBe("RES-4")
		expect(martin.find("[data-action='check-in']").exists()).toBe(false)
	})

	it("offer a seated party no gesture of a booking to come", () => {
		list()
		const rochat = card("Rochat")

		expect(rochat.find("[data-at-table]").exists()).toBe(true)
		for (const action of ["check-in", "cancel", "no-show", "call"]) {
			expect(rochat.find(`[data-action='${action}']`).exists()).toBe(false)
		}
	})

	it("offer a cancelled booking none", () => {
		list()

		expect(card("Cancelled party").findAll("button, a")).toHaveLength(0)
	})
})

describe("the filters", () => {
	it("keep the status filter of the till", () => {
		list({ selectedStatus: "Confirmed" })

		expect(wrapper.findAll("[data-reservation-card]")).toHaveLength(2)
	})

	it("say so when the day is empty", () => {
		list({ reservations: [] })

		expect(wrapper.text()).toContain("No reservations for this date")
	})
})
