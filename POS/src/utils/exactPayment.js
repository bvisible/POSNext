/**
 * //// Neoffice — added file (no upstream equivalent). The method the payment dialog's big « exact » button (and Enter
 * //// with nothing typed) pays the rest with. Upstream develop's button always paid it in cash: with « Carte de crédit »
 * //// picked it still read « Espèces exactes » and booked the sale in cash (osiris, 2026-11-04, a restaurant till whose
 * //// card was not mapped to its terminal). It now follows the method the cashier picked, cash when they picked none.
 */

/**
 * The method the « exact » button pays the rest with, or null when the button has nothing to do.
 * @param {object} p
 * @param {object[]} p.methods the payment methods the dialog offers
 * @param {object|null} p.picked the method the cashier picked last (the dialog's default until they pick one)
 * @param {(method: object) => boolean} p.isCash
 * @param {(method: object) => boolean} p.canPayExact whether a picked method may take the whole rest at once
 *   (a wallet or an account may not: they fall back on cash, as upstream)
 * @param {boolean} p.entered an amount was already entered
 * @param {number} p.remaining what is left to pay
 * @param {boolean} p.writingOff a write-off settles the rest
 */
export function exactPaymentMethod({ methods, picked, isCash, canPayExact, entered, remaining, writingOff }) {
	if (entered || !(remaining > 0) || writingOff) return null
	const offered = picked && methods.find((m) => m.mode_of_payment === picked.mode_of_payment)
	if (offered && (isCash(offered) || canPayExact(offered))) return offered
	return methods.find((m) => isCash(m)) || null
}
