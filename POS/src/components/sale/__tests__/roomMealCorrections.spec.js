//// Neoffice — added file (no upstream equivalent). Correcting a meal put on a hotel room, from the history of invoices (the restaurant's till on the room).
// The same window as « On the room » works in two more modes: « move » (another room, with the reason) and « release » (off the room, with the reason); a PIN is asked
// only where the hotel asks for one; the call is made by the window and its refusal is shown in the hotel's own words. The history draws the chip and the two actions.
// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const server = vi.hoisted(() => ({ call: vi.fn(async () => []) }))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))
vi.mock("@/utils/apiWrapper", () => ({ call: server.call }))
vi.mock("@/utils/currency", () => ({ formatCurrency: (amount) => `CHF ${Number(amount).toFixed(2)}` }))

const { default: RoomChargeDialog } = await import("../RoomChargeDialog.vue")

const stay = { reservation: "RES-2", room: "102", room_number: "102", guest_name: "Ben Zzquillon", check_out_date: "2026-11-30", takes_charges: 1 }
const open = (props) => mount(RoomChargeDialog, { props: { modelValue: true, invoice: "FA-1", ...props }, global: { mocks: { __: globalThis.__ } } })
const typeRoom = async (wrapper, text) => {
	await wrapper.find('[data-test="room-search"]').setValue(text)
	await wrapper.find('[data-test="room-search"]').trigger("input")
	vi.advanceTimersByTime(300)
	await flushPromises()
}

describe("correcting a meal on a room", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.useFakeTimers()
		server.call.mockReset()
		server.call.mockResolvedValue([])
	})

	it("moves a meal: the room is chosen, the reason is written, the hotel is called with both", async () => {
		server.call.mockResolvedValueOnce([stay]).mockResolvedValueOnce({ invoice: "FA-1" })
		const wrapper = open({ mode: "move" })
		expect(wrapper.text()).toContain("Change room")
		expect(wrapper.find('[data-test="room-intro-move"]').exists()).toBe(true)
		await typeRoom(wrapper, "102")
		await wrapper.find('[data-test="room-102"]').trigger("click")
		// the reason is what makes the button live
		expect(wrapper.find('[data-test="room-confirm"]').attributes("disabled")).toBeDefined()
		await wrapper.find('[data-test="room-reason"]').setValue("the waiter chose the wrong room")
		expect(wrapper.find('[data-test="room-confirm"]').text()).toContain("Move to room 102")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		await flushPromises()
		expect(server.call).toHaveBeenLastCalledWith("pos_next.api.room_charge.move_to_room", {
			invoice: "FA-1",
			reason: "the waiter chose the wrong room",
			pin: undefined,
			reservation: "RES-2",
		})
		expect(wrapper.emitted("done")).toEqual([[{ invoice: "FA-1", mode: "move" }]])
		expect(wrapper.emitted("update:modelValue")).toEqual([[false]])
	})

	it("takes a meal off the room: no room to look for, the reason alone", async () => {
		server.call.mockResolvedValueOnce({ released: true })
		const wrapper = open({ mode: "release" })
		expect(wrapper.find('[data-test="room-search"]').exists()).toBe(false)
		expect(wrapper.find('[data-test="room-intro-release"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="room-confirm"]').attributes("disabled")).toBeDefined()
		await wrapper.find('[data-test="room-reason"]').setValue("the guest pays at the table")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		await flushPromises()
		expect(server.call).toHaveBeenCalledWith("pos_next.api.room_charge.take_off_the_room", { invoice: "FA-1", reason: "the guest pays at the table", pin: undefined })
		expect(wrapper.emitted("done")).toEqual([[{ invoice: "FA-1", mode: "release" }]])
	})

	it("asks for a PIN only where the hotel asks for one, and sends it", async () => {
		server.call.mockResolvedValueOnce({ released: true })
		const without = open({ mode: "release" })
		expect(without.find('[data-test="room-pin"]').exists()).toBe(false)
		const wrapper = open({ mode: "release", pinRequired: true })
		expect(wrapper.find('[data-test="room-pin"]').attributes("type")).toBe("password")
		await wrapper.find('[data-test="room-reason"]').setValue("wrong table")
		await wrapper.find('[data-test="room-pin"]').setValue("4321")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		await flushPromises()
		expect(server.call).toHaveBeenCalledWith("pos_next.api.room_charge.take_off_the_room", { invoice: "FA-1", reason: "wrong table", pin: "4321" })
	})

	it("keeps the window open and says what the hotel refused, in its own words", async () => {
		server.call.mockRejectedValueOnce({ message: "The bill of this stay is already closed." })
		const wrapper = open({ mode: "release" })
		await wrapper.find('[data-test="room-reason"]').setValue("too late")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		await flushPromises()
		expect(wrapper.find('[data-test="room-problem"]').exists()).toBe(true)
		expect(wrapper.emitted("done")).toBeUndefined()
		expect(wrapper.emitted("update:modelValue")).toBeUndefined()
	})

	it("the plain « On the room » mode still hands the stay to the payment window and calls nothing", async () => {
		server.call.mockResolvedValueOnce([stay])
		const wrapper = open({ mode: "charge", total: 38 })
		expect(wrapper.find('[data-test="room-reason"]').exists()).toBe(false)
		await typeRoom(wrapper, "102")
		await wrapper.find('[data-test="room-102"]').trigger("click")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		expect(wrapper.emitted("chosen")).toEqual([[{ reservation: "RES-2", room_number: "102", guest_name: "Ben Zzquillon" }]])
		expect(server.call).toHaveBeenCalledTimes(1)
	})
})

describe("the history of invoices shows where a meal is", () => {
	// a path held in a variable: vite turns `new URL("literal", import.meta.url)` into an asset address
	const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
	const history = () => source("../InvoiceHistoryDialog.vue")

	it("asks the hotel where the listed sales are, and draws a chip", () => {
		expect(history()).toContain('call("pos_next.api.room_charge.rooms_of"')
		expect(history()).toContain("loadRooms(newInvoices.map((inv) => inv.name))")
		expect(history()).toContain(':data-test="`room-chip-${invoice.name}`"')
	})

	it("gives a meal on a room the chip's state in place of the sale's status, which a move leaves at « Paid »", () => {
		expect(history()).toContain('v-else-if="!onRoom(invoice)"')
		expect(history()).toContain('__("On room {0}: {1} to collect at the desk", [rooms[invoice.name].room_number, formatCurrency(rooms[invoice.name].owed)])')
	})

	it("offers the two corrections only for a meal still on its room, of a submitted sale", () => {
		expect(history()).toContain("return Boolean(room) && !room.released && invoice.docstatus === 1")
		expect(history()).toContain("openRoomCorrection(invoice, 'move')")
		expect(history()).toContain("openRoomCorrection(invoice, 'release')")
		expect(history()).toContain('<RoomChargeDialog')
	})
})
