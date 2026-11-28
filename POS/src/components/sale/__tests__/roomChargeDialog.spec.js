//// Neoffice — added file (no upstream equivalent). « On the room » of a hotel restaurant (the lot of the restaurant's till on the room).
// The dialog asks the hotel app for the stay by room number or name, shows who is in it, locks a room that takes no charge, and hands the chosen stay to the
// payment window, which submits the whole sale with it. The payment window draws the link only where a hotel says it is on, locked with its reason when its accounts are off.
// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.hoisted(() => {
	globalThis.__ = (text, args = []) => (args || []).reduce((out, arg, at) => out.replace(`{${at}}`, arg), text)
})
const server = vi.hoisted(() => ({ call: vi.fn(async () => []) }))

vi.mock("frappe-ui", () => ({
	Dialog: { props: ["modelValue", "options"], template: '<div v-if="modelValue"><h2>{{ options.title }}</h2><slot name="body-content" /></div>' },
}))
vi.mock("@/stores/posShift", () => ({ usePOSShiftStore: () => ({ profileCurrency: "CHF" }) }))
vi.mock("@/utils/apiWrapper", () => ({ call: server.call }))
vi.mock("@/utils/currency", () => ({ formatCurrency: (amount) => `CHF ${Number(amount).toFixed(2)}`, formatDate: (value) => `DATE(${value})` }))

const { default: RoomChargeDialog } = await import("../RoomChargeDialog.vue")

const stay = (extra = {}) => ({
	reservation: "RES-1",
	room: "101",
	room_number: "101",
	guest_name: "Ada Zzquillon",
	check_out_date: "2026-11-30",
	takes_charges: 1,
	...extra,
})
const open = () => mount(RoomChargeDialog, { props: { modelValue: true, total: 108.1 }, global: { mocks: { __: globalThis.__ } } })
const type = async (wrapper, text) => {
	await wrapper.find('[data-test="room-search"]').setValue(text)
	await wrapper.find('[data-test="room-search"]').trigger("input")
	vi.advanceTimersByTime(300)
	await flushPromises()
}

describe("« On the room » dialog", () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.useFakeTimers()
		server.call.mockReset()
		server.call.mockResolvedValue([])
	})
	afterEach(() => vi.useRealTimers())

	it("says what goes on the room and asks nothing of the hotel before a question is typed", async () => {
		const wrapper = open()
		expect(wrapper.text()).toContain("CHF 108.10")
		expect(server.call).not.toHaveBeenCalled()
		expect(wrapper.find('[data-test="room-confirm"]').attributes("disabled")).toBeDefined()
	})

	it("asks for a room number of one digit, or a name of two letters, and for nothing shorter", async () => {
		const wrapper = open()
		await type(wrapper, "z")
		expect(server.call).not.toHaveBeenCalled()
		await type(wrapper, "1")
		expect(server.call).toHaveBeenCalledWith("pos_next.api.room_charge.search_stays", { text: "1" })
		await type(wrapper, "zz")
		expect(server.call).toHaveBeenLastCalledWith("pos_next.api.room_charge.search_stays", { text: "zz" })
	})

	it("lists who is in the room, and hands the chosen stay to the payment window", async () => {
		server.call.mockResolvedValue([stay()])
		const wrapper = open()
		await type(wrapper, "101")
		expect(wrapper.find('[data-test="room-101"]').text()).toContain("101 · Ada Zzquillon")
		await wrapper.find('[data-test="room-101"]').trigger("click")
		expect(wrapper.find('[data-test="room-confirm"]').text()).toContain("Put on room 101")
		await wrapper.find('[data-test="room-confirm"]').trigger("click")
		expect(wrapper.emitted("chosen")).toEqual([[{ reservation: "RES-1", room_number: "101", guest_name: "Ada Zzquillon" }]])
		expect(wrapper.emitted("update:modelValue")).toEqual([[false]])
	})

	it("shows a room that takes no charge and does not let it be chosen", async () => {
		server.call.mockResolvedValue([stay({ takes_charges: 0 })])
		const wrapper = open()
		await type(wrapper, "101")
		const row = wrapper.find('[data-test="room-101"]')
		expect(row.attributes("disabled")).toBeDefined()
		expect(row.text()).toContain("This room takes no charge")
		await row.trigger("click")
		expect(wrapper.find('[data-test="room-confirm"]').attributes("disabled")).toBeDefined()
	})

	it("says so when nobody is in the room", async () => {
		server.call.mockResolvedValue([])
		const wrapper = open()
		await type(wrapper, "999")
		expect(wrapper.find('[data-test="room-none"]').text()).toContain("Nobody in house")
	})

	it("says what the hotel refused, in its own words", async () => {
		server.call.mockRejectedValue({ message: "The hotel's accounts are off." })
		const wrapper = open()
		await type(wrapper, "101")
		expect(wrapper.find('[data-test="room-problem"]').exists()).toBe(true)
		expect(wrapper.find('[data-test="room-results"]').exists()).toBe(false)
	})

	it("forgets the last question when it is opened again", async () => {
		server.call.mockResolvedValue([stay()])
		const wrapper = open()
		await type(wrapper, "101")
		await wrapper.setProps({ modelValue: false })
		await wrapper.setProps({ modelValue: true })
		expect(wrapper.find('[data-test="room-search"]').element.value).toBe("")
		expect(wrapper.find('[data-test="room-results"]').exists()).toBe(false)
	})
})

describe("the payment window and the sale carry the room", () => {
	const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

	it("draws the link only where a hotel says it is on, never offline, locked with its reason while the accounts are off", () => {
		const dialog = source("../PaymentDialog.vue")
		expect(dialog).toContain('v-if="roomCharge.offered && paymentEntries.length === 0 && !isOffline"')
		expect(dialog).toContain(':disabled="isSubmitting || !isSalesPersonValid || !roomCharge.available"')
		expect(dialog).toContain('call("pos_next.api.room_charge.status")')
	})

	it("submits the whole sale as a credit sale with the stay, and nothing else", () => {
		const dialog = source("../PaymentDialog.vue")
		expect(dialog).toContain("addCreditAccountPayment({ reservation: stay.reservation, room_number: stay.room_number, guest_name: stay.guest_name });")
		expect(dialog).toContain("...(room ? { room_charge: room } : {}),")
		// the very credit sale of « Pay on Account »: one place builds it, and the sales-person gate stands before it
		expect(dialog.match(/function addCreditAccountPayment\(/g)).toHaveLength(1)
		expect(source("../../../pages/POSSale.vue")).toContain("roomCharge: paymentData.room_charge || null,")
		expect(source("../../../stores/posCart.js")).toContain("options.roomCharge || null")
		const invoice = source("../../../composables/useInvoice.js")
		expect(invoice).toContain("roomCharge = null")
		expect(invoice).toContain("submitData.room_charge = { reservation: roomCharge.reservation };")
	})
})
