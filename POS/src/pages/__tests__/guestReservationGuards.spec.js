/**
 * //// Neoffice — added file (no upstream equivalent). The public booking page (/pos/reservation) tells a guest when
 * //// the server refused his booking (NeoResto lot 1, task 18): a site that hides its tracebacks answers a refusal
 * //// with an HTTP error and a message but no `exc`, and the page read that as a success. It also carries the field
 * //// only a script fills, which the server answers like any booking and then drops.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (s) => s
})

const { default: GuestReservation } = await import("../GuestReservation.vue")

const SLOTS = "pos_next.api.reservations.get_available_slots"
const TABLES = "pos_next.api.reservations.get_available_tables"
const SUBMIT = "pos_next.api.reservations.submit_guest_reservation"
const TOO_MANY = "Too many reservation requests. Please try again later or call the restaurant."
const NOT_ENABLED = "Online reservations are not enabled"

// What Frappe answers: the HTTP status, and a body that carries the message of a refusal in `_server_messages` (and
// `exc` only on a site that shows its tracebacks)
function answer(body, status = 200) {
	return { ok: status >= 200 && status < 300, status, json: async () => body }
}
function refusal(message, status) {
	return answer({ exc_type: "ValidationError", _server_messages: JSON.stringify([JSON.stringify({ message })]) }, status)
}

let answers
let opened = []
const fetchMock = vi.fn(async (url) => {
	for (const [method, reply] of Object.entries(answers)) {
		if (String(url).includes(method)) return reply
	}
	return answer({ message: [] })
})

function open() {
	window.history.replaceState({}, "", "/pos/reservation")
	const wrapper = mount(GuestReservation, { global: { mocks: { __: globalThis.__ } } })
	opened.push(wrapper)
	return wrapper
}

// A guest picks 20:00, types his name, phone and address, and books
async function book(wrapper, { decoy } = {}) {
	await flushPromises()
	await wrapper.findAll("button").find((button) => button.text() === "20:00").trigger("click")
	await flushPromises()
	const name = wrapper.findAll('input[type="text"]').filter((input) => input.attributes("name") !== "subject")
	await name[0].setValue("Jane Guest")
	await wrapper.find('input[type="tel"]').setValue("0790000000")
	await wrapper.find('input[type="email"]').setValue("jane.guest@yopmail.com")
	if (decoy !== undefined) await wrapper.find('input[name="subject"]').setValue(decoy)
	await wrapper.findAll("button").find((button) => button.text() === "Book Now").trigger("click")
	await flushPromises()
}

const submitted = () => {
	const call = fetchMock.mock.calls.find(([url]) => String(url).includes(SUBMIT))
	return call ? JSON.parse(call[1].body) : null
}

beforeEach(() => {
	opened = []
	fetchMock.mockClear()
	globalThis.fetch = fetchMock
	answers = {
		[SLOTS]: answer({ message: { slots: [{ from_time: "19:00:00", to_time: "21:00:00", label: "" }] } }),
		[TABLES]: answer({ message: { tables: [] } }),
		[SUBMIT]: answer({ message: { status: "ok", requires_verification: true } }),
	}
})
afterEach(() => {
	opened.forEach((wrapper) => wrapper.unmount())
})

describe("the times the booking page offers", () => {
	it("offers each time once, in order, where the services of the day repeat or overlap", async () => {
		// The same service saved twice, and a second one that overlaps it: 13:30 and 14:00 are two services' times
		answers[SLOTS] = answer({
			message: {
				slots: [
					{ from_time: "11:30:00", to_time: "14:00:00", label: "Lunch" },
					{ from_time: "11:30:00", to_time: "14:00:00", label: "Lunch" },
					{ from_time: "13:30:00", to_time: "15:00:00", label: "Late lunch" },
				],
			},
		})
		const wrapper = open()
		await flushPromises()

		const times = wrapper.findAll("button").map((button) => button.text()).filter((text) => /^\d\d:\d\d$/.test(text))
		expect(times).toEqual(["11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00"])
	})
})

describe("the booking page says what the server said", () => {
	it("books and asks the guest to confirm from the e-mail", async () => {
		const wrapper = open()
		await book(wrapper)

		expect(submitted()).toMatchObject({ guest_name: "Jane Guest", email: "jane.guest@yopmail.com" })
		expect(wrapper.text()).toContain("Reservation Submitted!")
	})

	it("tells a refused booking, without a traceback, as refused and never as submitted", async () => {
		answers[SUBMIT] = refusal(TOO_MANY, 429)
		const wrapper = open()
		await book(wrapper)

		expect(submitted()).not.toBeNull()
		expect(wrapper.text()).toContain(TOO_MANY)
		expect(wrapper.text()).not.toContain("Reservation Submitted!")
	})

	it("is closed where the restaurant takes no booking online, without a traceback", async () => {
		answers[SLOTS] = refusal(NOT_ENABLED, 417)
		const wrapper = open()
		await flushPromises()

		expect(wrapper.text()).toContain("Online reservations are not available")
		expect(wrapper.findAll("button").some((button) => button.text() === "Book Now")).toBe(false)
	})
})

describe("the booking page carries a field only a script fills", () => {
	it("hides it from people, from the keyboard and from autofill", async () => {
		const wrapper = open()
		await flushPromises()

		const decoy = wrapper.find('input[name="subject"]')
		expect(decoy.exists()).toBe(true)
		expect(decoy.attributes("tabindex")).toBe("-1")
		expect(decoy.attributes("autocomplete")).toBe("off")
		expect(decoy.element.closest('[aria-hidden="true"]')).not.toBeNull()
	})

	it("sends it empty with a guest's booking", async () => {
		const wrapper = open()
		await book(wrapper)

		expect(submitted().subject).toBe("")
	})

	it("sends what a script typed into it", async () => {
		const wrapper = open()
		await book(wrapper, { decoy: "Cheap offer" })

		expect(submitted().subject).toBe("Cheap offer")
	})
})
