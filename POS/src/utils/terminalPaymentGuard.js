//// Neoffice — added file (no upstream equivalent). Upstream develop's payment dialog
//// books "Exact cash" when Enter is pressed with nothing typed, through a window-level
//// keydown listener. Our card and TWINT payments run in a dialog drawn over that one
//// (CardPresentDialog / QRPaymentDialog), and the listener stayed live underneath: an
//// Enter during a terminal payment could add the remainder as cash and complete the sale
//// while the customer was still paying by card. The four helpers below are the one rule the
//// payment dialog applies: which channels have a terminal dialog (terminalDialogKind), whether
//// one is actually on screen (isTerminalDialogOnScreen), whether a terminal payment owns the sale
//// (isTerminalPaymentActive: completePayment, finalizePayment, payExactCash, the credit sale) and
//// whether its keypad may react (isPaymentKeypadEnabled) (merge of 2026-10-28).

/**
 * The terminal dialog a driver channel opens: "card_present" (CardPresentDialog) for
 * `terminal`, "qr" (QRPaymentDialog) for `qr_bridge`, null for any other channel. A POS Payment
 * Driver Mapping's channel is a free link that the payments app also fills with web channels
 * (twint_web, wallee_web, payrexx_web…), for which the till has no dialog.
 * @param {string|null|undefined} channel
 * @returns {"card_present"|"qr"|null}
 */
export function terminalDialogKind(channel) {
	if (channel === "terminal") return "card_present"
	if (channel === "qr_bridge") return "qr"
	return null
}

/**
 * Whether a terminal dialog is actually on screen: the flag is set AND its channel has a
 * dialog. The flag alone stayed true with nothing drawn for a web channel, which locked the
 * keypad and "Complete" with nothing to close.
 * @param {{ open?: boolean, channel?: string|null }} state
 * @returns {boolean}
 */
export function isTerminalDialogOnScreen({ open = false, channel = null } = {}) {
	return Boolean(open) && terminalDialogKind(channel) !== null
}

/**
 * True while a payment terminal owns the sale: its dialog is on screen (idle, waiting for
 * the card or the scan, or showing a failure the reader may still recover from) or an
 * intent is in flight with the provider.
 * @param {{ terminalDialogShown?: boolean, terminalInFlight?: boolean }} state
 * @returns {boolean}
 */
export function isTerminalPaymentActive({ terminalDialogShown = false, terminalInFlight = false } = {}) {
	return Boolean(terminalDialogShown || terminalInFlight)
}

/**
 * Whether the payment dialog's own keypad (digits, Backspace, Enter shortcut) may react:
 * only while the dialog is open and no terminal payment is active.
 * @param {{ dialogOpen?: boolean, terminalDialogShown?: boolean, terminalInFlight?: boolean }} state
 * @returns {boolean}
 */
export function isPaymentKeypadEnabled({
	dialogOpen = false,
	terminalDialogShown = false,
	terminalInFlight = false,
} = {}) {
	return Boolean(dialogOpen) && !isTerminalPaymentActive({ terminalDialogShown, terminalInFlight })
}
