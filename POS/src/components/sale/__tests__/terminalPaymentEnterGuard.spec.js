/**
 * //// Neoffice — added file (no upstream equivalent). Enter during a card or TWINT terminal
 * //// payment must not book "Exact cash" and complete the sale under the terminal dialog.
 * //// PaymentDialog.vue is too large to mount here (frappe-ui resources, a dozen stores), so this
 * //// covers the guard it applies (terminalPaymentGuard.js) wired exactly as it wires it into
 * //// usePaymentNumpad, plus the predicate completePayment / finalizePayment / payExactCash use.
 * @vitest-environment jsdom
 */
import { mount } from "@vue/test-utils"
import { afterEach, describe, expect, it, vi } from "vitest"
import { computed, defineComponent, nextTick, ref } from "vue"
import { usePaymentNumpad } from "@/composables/usePaymentNumpad"
import {
	isPaymentKeypadEnabled,
	isTerminalDialogOnScreen,
	isTerminalPaymentActive,
	terminalDialogKind,
} from "@/utils/terminalPaymentGuard"

function setup() {
	const dialogOpen = ref(true)
	const showTerminalDialog = ref(false)
	const channel = ref("terminal") // the mapping's channel (CardPresentDialog)
	const terminalInFlight = ref(false)
	const onEnter = vi.fn()
	const wrapper = mount(
		defineComponent({
			setup() {
				// Same wiring as PaymentDialog.vue (terminalDialogOnScreen, then the keypad)
				const terminalDialogOnScreen = computed(() =>
					isTerminalDialogOnScreen({ open: showTerminalDialog.value, channel: channel.value })
				)
				const { numpadDisplay } = usePaymentNumpad({
					isEnabled: computed(() =>
						isPaymentKeypadEnabled({
							dialogOpen: dialogOpen.value,
							terminalDialogShown: terminalDialogOnScreen.value,
							terminalInFlight: terminalInFlight.value,
						})
					),
					onEnter,
				})
				return { numpadDisplay }
			},
			render: () => null,
		}),
		{ attachTo: document.body }
	)
	return { dialogOpen, showTerminalDialog, channel, terminalInFlight, onEnter, wrapper }
}

const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key }))

describe("Enter while a terminal payment is in progress", () => {
	afterEach(() => vi.useRealTimers())

	it("does nothing while the card / TWINT dialog is on screen, then works again", async () => {
		vi.useFakeTimers()
		const { showTerminalDialog, onEnter, wrapper } = setup()
		vi.advanceTimersByTime(600) // past the 500 ms opening guard of usePaymentNumpad

		showTerminalDialog.value = true
		await nextTick()
		vi.advanceTimersByTime(600)
		press("Enter")
		expect(onEnter).not.toHaveBeenCalled()

		showTerminalDialog.value = false
		await nextTick()
		vi.advanceTimersByTime(600)
		press("Enter")
		expect(onEnter).toHaveBeenCalledTimes(1)
		wrapper.unmount()
	})

	it("does nothing while the terminal intent is in flight, even with its dialog hidden", async () => {
		vi.useFakeTimers()
		const { terminalInFlight, onEnter, wrapper } = setup()

		terminalInFlight.value = true
		await nextTick()
		vi.advanceTimersByTime(600)
		press("Enter")
		expect(onEnter).not.toHaveBeenCalled()
		wrapper.unmount()
	})

	it("does not take the digits typed for the terminal's own amount either", async () => {
		const { showTerminalDialog, wrapper } = setup()
		showTerminalDialog.value = true
		await nextTick()
		press("5")
		expect(wrapper.vm.numpadDisplay).toBe("")
		wrapper.unmount()
	})
})

describe("a channel with no dialog at the till locks nothing", () => {
	it("keeps Enter and the digits working when the flag is set for a web channel", async () => {
		vi.useFakeTimers()
		const { showTerminalDialog, channel, onEnter, wrapper } = setup()
		vi.advanceTimersByTime(600)

		for (const web of ["twint_web", "wallee_web", "payrexx_web", "", null]) {
			channel.value = web
			showTerminalDialog.value = true
			await nextTick()
			vi.advanceTimersByTime(600)
			onEnter.mockClear()
			press("Enter")
			expect(onEnter).toHaveBeenCalledTimes(1)
		}
		press("7")
		expect(wrapper.vm.numpadDisplay).toBe("7")
		vi.useRealTimers()
		wrapper.unmount()
	})

	it("maps only terminal and qr_bridge to a dialog (openTerminalDialog refuses the others)", () => {
		expect(terminalDialogKind("terminal")).toBe("card_present")
		expect(terminalDialogKind("qr_bridge")).toBe("qr")
		for (const web of ["twint_web", "wallee_web", "payrexx_web", "", null, undefined]) {
			expect(terminalDialogKind(web)).toBeNull()
			expect(isTerminalDialogOnScreen({ open: true, channel: web })).toBe(false)
		}
		expect(isTerminalDialogOnScreen({ open: true, channel: "qr_bridge" })).toBe(true)
		expect(isTerminalDialogOnScreen({ open: false, channel: "terminal" })).toBe(false)
	})
})

describe("isTerminalPaymentActive (completePayment, finalizePayment, payExactCash, confirmCreditSale)", () => {
	it("is true while the dialog is shown or a payment is in flight", () => {
		expect(isTerminalPaymentActive({ terminalDialogShown: true, terminalInFlight: false })).toBe(true)
		expect(isTerminalPaymentActive({ terminalDialogShown: false, terminalInFlight: true })).toBe(true)
		expect(isTerminalPaymentActive({ terminalDialogShown: false, terminalInFlight: false })).toBe(false)
		expect(isTerminalPaymentActive()).toBe(false)
	})

	it("keeps the keypad off when the payment dialog itself is closed", () => {
		expect(isPaymentKeypadEnabled({ dialogOpen: false })).toBe(false)
		expect(isPaymentKeypadEnabled({ dialogOpen: true })).toBe(true)
		expect(isPaymentKeypadEnabled({ dialogOpen: true, terminalInFlight: true })).toBe(false)
	})
})
