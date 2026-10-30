/**
 * //// Neoffice — added file (no upstream equivalent). The QR button of a table shows the table's code at once (NeoRestau
 * //// lot 1): it used to ask a question first (a confirmation dialog) and wait for a second click on its "Generate QR"
 * //// button. The product owner: the QR itself, straight away, with a small line that says what it is.
 * ////
 * //// Every press asks the server, which answers the table's active code and makes one only when the table has none: the
 * //// till keeps no copy of the codes it showed, so that a code expired from another device is never shown (Ruling 52).
 * ////
 * //// POSSale.vue is too large to mount here (a dozen stores, the offline workers, sockets), so this covers what the page
 * //// wires: the click path (`useTableQR`, the composable the page takes it from), the dialog that shows the code
 * //// (`TableQRCode`), and, from the source of the page, that the confirmation, its state, its handler and the copy of
 * //// the codes are gone and that the button and the dialog are still wired as they were.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())
const toCanvas = vi.hoisted(() => vi.fn(async () => {}))

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_, i) => args[i]) : s
})

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ showError }) }))
// jsdom has no canvas: the library that draws the code is replaced by a spy
vi.mock("qrcode", () => ({ default: { toCanvas } }))

const { useTableQR } = await import("@/composables/useTableQR")
const { default: TableQRCode } = await import(
	"@/components/restaurant/TableQRCode.vue"
)

const CREATE = "pos_next.api.guest_ordering.create_table_token"
const PURPOSE = "Guests scan this code to order from their phone."
const TABLE = { name: "TBL-0001", table_name: "T1" }
const ANSWER = {
	token: "tok-1",
	url: "https://shop.example/pos/guest/tok-1",
	name: "GOT-1",
}

/** The click path of the page: the open table and the till's profile are read when the button is pressed. */
function theTill({ table = TABLE, profile = "Restaurant till" } = {}) {
	const till = { table, profile }
	const qr = useTableQR({
		table: () => till.table,
		posProfile: () => till.profile,
	})
	return { till, qr }
}

/** A call the test settles when it wants, to look at the screen while the server is still answering. */
function aCallToSettle() {
	let settle
	let fail
	const pending = new Promise((resolve, reject) => {
		settle = resolve
		fail = reject
	})
	return { pending, settle, fail }
}

beforeEach(() => {
	call.mockReset()
	showError.mockReset()
	toCanvas.mockClear()
})

describe("the QR button of a table", () => {
	it("asks the server for the code and shows it at once, with nothing to confirm first", async () => {
		call.mockResolvedValue(ANSWER)
		const { qr } = theTill()

		await qr.handleQRButtonClick()

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith(CREATE, {
			table: "TBL-0001",
			pos_profile: "Restaurant till",
		})
		expect(qr.showQRDialog.value).toBe(true)
		expect(qr.currentQR.value).toEqual({
			token: "tok-1",
			url: "https://shop.example/pos/guest/tok-1",
			tableName: "T1",
		})
	})

	it("starts on the first press, and opens the dialog when the server has answered", async () => {
		const answer = aCallToSettle()
		call.mockReturnValue(answer.pending)
		const { qr } = theTill()

		const pressed = qr.handleQRButtonClick()
		// The request left with the first press: nothing waits for a second one
		expect(call).toHaveBeenCalledTimes(1)
		expect(qr.showQRDialog.value).toBe(false)

		answer.settle(ANSWER)
		await pressed
		expect(qr.showQRDialog.value).toBe(true)
	})

	it("takes nothing from the click path but the dialog's state: no confirmation, no copy of the codes", () => {
		const { qr } = theTill()

		expect(Object.keys(qr).sort()).toEqual([
			"currentQR",
			"handleQRButtonClick",
			"showQRDialog",
		])
	})

	it("asks the server at every press, for a table whose code it showed before", async () => {
		call.mockResolvedValue(ANSWER)
		const { qr } = theTill()
		await qr.handleQRButtonClick()
		qr.showQRDialog.value = false

		await qr.handleQRButtonClick()

		expect(call).toHaveBeenCalledTimes(2)
		expect(call).toHaveBeenLastCalledWith(CREATE, {
			table: "TBL-0001",
			pos_profile: "Restaurant till",
		})
		expect(qr.showQRDialog.value).toBe(true)
		expect(qr.currentQR.value.token).toBe("tok-1")
	})

	it("never shows a code the server has since expired: it shows the one the server answers now", async () => {
		const { qr } = theTill()
		call.mockResolvedValueOnce(ANSWER)
		await qr.handleQRButtonClick()
		expect(qr.currentQR.value.token).toBe("tok-1")
		qr.showQRDialog.value = false

		// The table was freed from another device: its code is expired and the server makes another
		call.mockResolvedValueOnce({
			...ANSWER,
			token: "tok-2",
			url: "https://shop.example/pos/guest/tok-2",
		})
		await qr.handleQRButtonClick()

		expect(qr.currentQR.value).toEqual({
			token: "tok-2",
			url: "https://shop.example/pos/guest/tok-2",
			tableName: "T1",
		})
		expect(qr.showQRDialog.value).toBe(true)
	})

	it("asks for the table that is open at the press", async () => {
		const { till, qr } = theTill()
		call.mockResolvedValueOnce(ANSWER)
		await qr.handleQRButtonClick()

		till.table = { name: "TBL-0002", table_name: "T2" }
		call.mockResolvedValueOnce({
			...ANSWER,
			token: "tok-2",
			url: "https://shop.example/pos/guest/tok-2",
		})
		await qr.handleQRButtonClick()
		expect(call).toHaveBeenLastCalledWith(CREATE, {
			table: "TBL-0002",
			pos_profile: "Restaurant till",
		})
		expect(qr.currentQR.value).toMatchObject({
			token: "tok-2",
			tableName: "T2",
		})

		till.table = TABLE
		call.mockResolvedValueOnce(ANSWER)
		await qr.handleQRButtonClick()
		expect(call).toHaveBeenCalledTimes(3)
		expect(call).toHaveBeenLastCalledWith(CREATE, {
			table: "TBL-0001",
			pos_profile: "Restaurant till",
		})
		expect(qr.currentQR.value).toMatchObject({
			token: "tok-1",
			tableName: "T1",
		})
	})

	it("asks once when it is pressed again while the code is on its way", async () => {
		const answer = aCallToSettle()
		call.mockReturnValue(answer.pending)
		const { qr } = theTill()

		const first = qr.handleQRButtonClick()
		const second = qr.handleQRButtonClick()
		answer.settle(ANSWER)
		await Promise.all([first, second])

		expect(call).toHaveBeenCalledTimes(1)
		expect(qr.showQRDialog.value).toBe(true)
	})

	it("says what the server said when it cannot give the code, shows no dialog, and can be pressed again", async () => {
		const refusal = new Error(`${CREATE} ValidationError Table T1 not found.`)
		call.mockRejectedValueOnce(refusal)
		const { qr } = theTill()

		await qr.handleQRButtonClick()

		expect(showError).toHaveBeenCalledTimes(1)
		expect(showError).toHaveBeenCalledWith(
			`Failed to generate QR code: ${refusal.message}`,
		)
		expect(qr.showQRDialog.value).toBe(false)

		// Nothing is left waiting on the failed call
		call.mockResolvedValueOnce(ANSWER)
		await qr.handleQRButtonClick()
		expect(call).toHaveBeenCalledTimes(2)
		expect(qr.showQRDialog.value).toBe(true)
	})

	it("builds the address of the guest page from the site when the server sends none", async () => {
		call.mockResolvedValue({ token: "tok-9" })
		const { qr } = theTill()

		await qr.handleQRButtonClick()

		expect(qr.currentQR.value.url).toBe(
			`${window.location.origin}/pos/guest/tok-9`,
		)
	})

	it("does nothing while no table is open", async () => {
		const { qr } = theTill({ table: null })

		await qr.handleQRButtonClick()

		expect(call).not.toHaveBeenCalled()
		expect(qr.showQRDialog.value).toBe(false)
	})
})

describe("the dialog that shows the code", () => {
	let wrapper

	function dialog(props = {}) {
		wrapper = mount(TableQRCode, {
			props: {
				token: "tok-1",
				tableName: "T1",
				url: "https://shop.example/pos/guest/tok-1",
				...props,
			},
			global: { mocks: { __: globalThis.__ } },
		})
		return wrapper
	}

	afterEach(() => {
		wrapper?.unmount()
	})

	it("says in one line what the code is for", () => {
		dialog()

		const line = wrapper.find('[data-test="table-qr-purpose"]')
		expect(line.exists()).toBe(true)
		expect(line.text()).toBe(PURPOSE)
		expect(wrapper.text().split(PURPOSE)).toHaveLength(2)
	})

	it("draws the code of the table's address", async () => {
		dialog()
		await new Promise((resolve) => setTimeout(resolve, 80))
		await flushPromises()

		expect(toCanvas).toHaveBeenCalledTimes(1)
		expect(toCanvas.mock.calls[0][1]).toBe(
			"https://shop.example/pos/guest/tok-1",
		)
	})

	it("keeps the table, its address and its two actions: print and close", async () => {
		dialog()

		expect(wrapper.text()).toContain("QR Code")
		expect(wrapper.text()).toContain("T1")
		expect(wrapper.text()).toContain("https://shop.example/pos/guest/tok-1")
		const actions = wrapper.findAll("button").map((button) => button.text())
		expect(actions).toEqual(expect.arrayContaining(["Print", "Close"]))

		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Close")
			.trigger("click")
		expect(wrapper.emitted("close")).toHaveLength(1)
	})
})

describe("the till page", () => {
	const page = readFileSync(path.resolve(__dirname, "../POSSale.vue"), "utf8")

	it("has no confirmation dialog left, nor the state and the handler behind it", () => {
		for (const gone of [
			"showQRConfirmDialog",
			"confirmQRGeneration",
			"QR Self-Ordering Confirmation Dialog",
			"__('QR Self-Ordering')",
			"Open this table for QR self-ordering?",
			'__("Generate QR")',
		]) {
			expect(page, gone).not.toContain(gone)
		}
		expect(page).not.toMatch(/function handleQRButtonClick/)
	})

	it("takes its QR click path and its dialog's state from the composable, and keeps no copy of the codes", () => {
		expect(page).toMatch(
			/const\s*\{\s*showQRDialog,\s*currentQR,\s*handleQRButtonClick\s*\}\s*=\s*useTableQR\(/,
		)
		// Nothing to drop when a table is cleaned or freed: the server is asked at every press
		expect(page).not.toContain("activeQRTokens")
	})

	it("binds the QR button to that click path and the dialog to that state", () => {
		expect(page).toMatch(/<button[^>]*@click="handleQRButtonClick"/)
		expect(page).toContain(
			":title=\"__('Generate QR code for guest ordering')\"",
		)
		expect(page).toMatch(
			/<TableQRCode\s+v-if="showQRDialog"\s+:token="currentQR\.token"\s+:url="currentQR\.url"\s+:tableName="currentQR\.tableName"\s+@close="showQRDialog = false"\s*\/>/,
		)
	})
})
