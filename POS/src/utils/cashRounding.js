//// Neoffice — added file (no upstream equivalent)
//
// The till rounds what is paid in cash to the currency's smallest fraction (CHF 0.05). main.js
// reads that step once, from the bootstrap payload at page load, and the bootstrap only knows a POS
// Profile when a shift is already open. A shift opened on the same page (every morning) therefore
// left the whole session unrounded until a reload: 26.91 charged instead of 26.90, and every return
// on such an amount refunded 0.01, because ERPNext replaces a POS refund larger than the rounded
// total by the difference. ensureCashRounding() reads the step again once a shift is open.
import { call } from "./apiWrapper"
import { getPrecision, initPrecision } from "./currency"
import { logger } from "./logger"

const log = logger.create("CashRounding")

export async function ensureCashRounding({ force = false } = {}) {
	if (!force && getPrecision().smallest_currency_fraction > 0) return
	try {
		const result = await call("pos_next.api.bootstrap.get_initial_data", {})
		const fraction = result?.pos_profile?.smallest_currency_fraction_value || 0
		if (!result?.precision && !fraction) return
		initPrecision({
			...(result?.precision || getPrecision()),
			smallest_currency_fraction: fraction,
		})
		log.debug(`Cash rounding step set to ${fraction}`)
	} catch (error) {
		log.warn("Could not read the cash rounding step", error)
	}
}
