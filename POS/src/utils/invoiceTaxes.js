//// Neoffice — added file (no upstream equivalent). ERPNext's own computation of a sale's taxes and totals, for the
//// till (NeoResto lot 1, Ruling 70): what the cart shows, the provisional ticket and the receipt printed offline must
//// equal the invoice the server submits, to the cent. The server computes them in
//// erpnext/controllers/taxes_and_totals.py (class calculate_taxes_and_totals, version 15 of the fleet's fork); this
//// module is that computation, step for step, for what a till sends: the rows as formatItemsForSubmission builds them
//// (rate, quantity, list price, discount, pricing rules), each with the VAT map ERPNext gives it, the till's tax rows,
//// the header discount. Each function names the Python one it follows: a change there is a change here. Not ported:
//// what a till never sends (margins, mapped or cash discounts, shipping rules, tax withholding, purchase deductions).
//// Rounding is Frappe's flt at each field's precision (currency.js, the site's rounding method).
import { getPrecision, roundCurrency, roundFloat } from "./currency"

// erpnext.stock.get_item_details.NOT_APPLICABLE_TAX: an item's VAT map marks a tax that does not apply to it
export const NOT_APPLICABLE_TAX = "N/A"

// flt(value, precision) of a currency field (amount, net_amount, tax_amount, total, rate), and of a rate (Float)
const flt = (value) => roundCurrency(Number(value) || 0)
const fltFloat = (value) => roundFloat(Number(value) || 0)

const included = (tax) => Boolean(Number(tax.included_in_print_rate))

/** _load_item_tax_rate: an item's VAT map, as a JSON string or an object ({} when it has none). */
export function loadItemTaxRate(itemTaxRate) {
	if (!itemTaxRate) return {}
	if (typeof itemTaxRate === "object") return itemTaxRate
	try {
		const map = JSON.parse(itemTaxRate)
		return map && typeof map === "object" ? map : {}
	} catch {
		return {}
	}
}

/** _get_tax_rate: the item's own rate for the row's account when its map names it, else the row's rate. */
function getTaxRate(tax, itemTaxMap) {
	if (Object.prototype.hasOwnProperty.call(itemTaxMap, tax.account_head)) {
		const rate = itemTaxMap[tax.account_head]
		if (rate === NOT_APPLICABLE_TAX) return NOT_APPLICABLE_TAX
		return fltFloat(rate)
	}
	return Number(tax.rate) || 0
}

/**
 * calculate_item_values: the rate and amount ERPNext gives a row as the till sends it (no margin at a till). A row with
 * pricing rules and a percentage takes its rate from the percentage, as ERPNext recomputes it.
 */
export function invoiceLine(row) {
	// round_floats_in(item): the quantity at the float precision, the prices at the currency's
	const qty = fltFloat(row.qty)
	const priceListRate = flt(row.price_list_rate)
	const discountPercentage = Number(row.discount_percentage) || 0
	const pricingRules = String(row.pricing_rules || "").trim()
	let rate = flt(row.rate)
	if (discountPercentage === 100) {
		rate = 0
	} else if (priceListRate) {
		if (!rate || (pricingRules && discountPercentage > 0)) {
			rate = flt(priceListRate * (1 - discountPercentage / 100))
		} else if (Number(row.discount_amount) && pricingRules) {
			rate = priceListRate - Number(row.discount_amount)
		}
	}
	const amount = flt(rate * qty)
	return {
		qty,
		rate,
		amount,
		net_amount: amount,
		itemTaxMap: loadItemTaxRate(row.item_tax_rate),
	}
}

/**
 * The taxes and totals of a sale, as ERPNext computes them (calculate_taxes_and_totals.calculate).
 *
 * @param {Object} input
 * @param {Array<Object>} input.items - the rows as sent: rate, qty, price_list_rate, discount_percentage,
 *   discount_amount, pricing_rules, item_tax_rate (the VAT map ERPNext gives the row)
 * @param {Array<Object>} input.taxes - the till's tax rows: account_head, charge_type, rate, tax_amount (Actual),
 *   row_id, included_in_print_rate, description
 * @param {number} [input.discountAmount] - the header discount (discount_amount)
 * @param {string} [input.applyDiscountOn] - "Grand Total" (the default of a POS profile) or "Net Total"
 * @param {boolean} [input.roundRowWiseTax] - Accounts Settings round_row_wise_tax
 * @returns {{items: Array<{rate:number, amount:number, net_amount:number}>, taxes: Array<Object>, total:number,
 *   net_total:number, total_taxes_and_charges:number, grand_total:number}}
 */
export function calculateTaxesAndTotals({
	items = [],
	taxes = [],
	discountAmount = 0,
	applyDiscountOn = "Grand Total",
	roundRowWiseTax = false,
} = {}) {
	const lines = items.map(invoiceLine)
	const rows = taxes.map((tax, index) => ({
		...tax,
		idx: index + 1,
		rate: Number(tax.rate) || 0,
		// An « Actual » row carries its amount; ERPNext never resets it between passes
		tax_amount: tax.charge_type === "Actual" ? flt(tax.tax_amount) : 0,
	}))
	const discount = flt(discountAmount)
	const doc = {
		total: 0,
		net_total: 0,
		grand_total: 0,
		total_taxes_and_charges: 0,
	}
	const state = {
		discountApplied: false,
		grandTotalDiff: 0,
		grandTotalForDistributingDiscount: undefined,
	}
	const precision = getPrecision().currency

	if (!lines.length) {
		return { items: [], taxes: rows.map(publicRow), ...doc }
	}

	// initialize_taxes
	function initializeTaxes() {
		for (const tax of rows) {
			tax.net_amount = 0
			tax.total = 0
			tax.tax_amount_after_discount_amount = 0
			tax.tax_amount_for_current_item = 0
			tax.grand_total_for_current_item = 0
			tax.tax_fraction_for_current_item = 0
			tax.grand_total_fraction_for_current_item = 0
			if (
				tax.charge_type !== "Actual" &&
				!(state.discountApplied && applyDiscountOn === "Grand Total")
			) {
				tax.tax_amount = 0
			}
			tax.tax_amount = flt(tax.tax_amount)
		}
	}

	// get_current_tax_fraction: the share of a tax included in a price (slope) and its fixed part per unit
	function getCurrentTaxFraction(tax, line) {
		let slope = 0
		let intercept = 0
		if (included(tax)) {
			const rate = getTaxRate(tax, line.itemTaxMap)
			if (rate === NOT_APPLICABLE_TAX) return [0, 0]
			const previous = rows[(Number(tax.row_id) || 0) - 1]
			if (tax.charge_type === "On Net Total") {
				slope = rate / 100
			} else if (tax.charge_type === "On Previous Row Amount") {
				slope = (rate / 100) * previous.tax_fraction_for_current_item
				intercept = (rate / 100) * (previous.inclusive_amount_per_qty || 0)
			} else if (tax.charge_type === "On Previous Row Total") {
				slope = (rate / 100) * previous.grand_total_fraction_for_current_item
				intercept = (rate / 100) * (previous.grand_total_amount_per_qty || 0)
			} else if (tax.charge_type === "On Item Quantity") {
				intercept = rate
			} else {
				intercept = ((rate / 100) * flt(line.net_amount)) / (line.qty || 1)
			}
		}
		return [slope, intercept]
	}

	// determine_exclusive_rate: the net of a price that includes its taxes
	function determineExclusiveRate() {
		if (!rows.some(included)) return
		for (const line of lines) {
			let totalSlope = 0
			let totalIntercept = 0
			rows.forEach((tax, i) => {
				const [slope, intercept] = getCurrentTaxFraction(tax, line)
				tax.tax_fraction_for_current_item = slope
				tax.inclusive_amount_per_qty = intercept
				if (i === 0) {
					tax.grand_total_fraction_for_current_item = 1 + slope
					tax.grand_total_amount_per_qty = intercept
				} else {
					const previous = rows[i - 1]
					tax.grand_total_fraction_for_current_item =
						previous.grand_total_fraction_for_current_item + slope
					tax.grand_total_amount_per_qty =
						previous.grand_total_amount_per_qty + intercept
				}
				totalSlope += slope
				totalIntercept += intercept * line.qty
			})
			if (
				!state.discountApplied &&
				line.qty &&
				(totalSlope || totalIntercept)
			) {
				line.net_amount = flt((line.amount - totalIntercept) / (1 + totalSlope))
			}
		}
	}

	// calculate_net_total
	function calculateNetTotal() {
		doc.total = flt(lines.reduce((sum, line) => sum + line.amount, 0))
		doc.net_total = flt(lines.reduce((sum, line) => sum + line.net_amount, 0))
	}

	// get_current_tax_and_net_amount
	function getCurrentTaxAndNetAmount(line, tax) {
		const rate = getTaxRate(tax, line.itemTaxMap)
		if (rate === NOT_APPLICABLE_TAX) return [0, 0]
		const previous = rows[(Number(tax.row_id) || 0) - 1]
		switch (tax.charge_type) {
			case "Actual": {
				const actual = flt(tax.tax_amount)
				return [
					line.net_amount,
					doc.net_total ? (line.net_amount * actual) / doc.net_total : 0,
				]
			}
			case "On Net Total":
				return [line.net_amount, (rate / 100) * line.net_amount]
			case "On Previous Row Amount":
				return [
					previous.tax_amount_for_current_item,
					(rate / 100) * previous.tax_amount_for_current_item,
				]
			case "On Previous Row Total":
				return [
					previous.grand_total_for_current_item,
					(rate / 100) * previous.grand_total_for_current_item,
				]
			case "On Item Quantity":
				return [0, rate * line.qty]
			default:
				return [0, (rate / 100) * flt(line.net_amount)]
		}
	}

	// set_cumulative_total
	function setCumulativeTotal(i, tax) {
		const taxAmount = tax.tax_amount_after_discount_amount
		tax.total =
			i === 0
				? flt(doc.net_total + taxAmount)
				: flt(rows[i - 1].total + taxAmount)
	}

	// calculate_taxes
	function calculateTaxes() {
		state.grandTotalDiff = 0
		if (!rows.length) return
		const actualTaxes = {}
		for (const tax of rows) {
			if (tax.charge_type === "Actual")
				actualTaxes[tax.idx] = flt(tax.tax_amount)
		}
		lines.forEach((line, n) => {
			rows.forEach((tax, i) => {
				let [currentNet, currentTax] = getCurrentTaxAndNetAmount(line, tax)
				if (roundRowWiseTax) {
					currentTax = flt(currentTax)
					currentNet = flt(currentNet)
				}
				if (tax.charge_type === "Actual") {
					actualTaxes[tax.idx] -= currentTax
					if (n === lines.length - 1) currentTax += actualTaxes[tax.idx]
				}
				tax.net_amount += currentNet
				if (
					tax.charge_type !== "Actual" &&
					!(state.discountApplied && applyDiscountOn === "Grand Total")
				) {
					tax.tax_amount += currentTax
				}
				tax.tax_amount_for_current_item = currentTax
				tax.tax_amount_after_discount_amount += currentTax
				tax.grand_total_for_current_item =
					i === 0
						? flt(line.net_amount + currentTax)
						: flt(rows[i - 1].grand_total_for_current_item + currentTax)
			})
		})
		if (
			applyDiscountOn === "Grand Total" &&
			(state.discountApplied || discount)
		) {
			rows.forEach((tax, i) => {
				if (state.discountApplied) {
					tax.tax_amount_after_discount_amount = flt(
						tax.tax_amount_after_discount_amount,
					)
				}
				setCumulativeTotal(i, tax)
			})
			if (!state.discountApplied) {
				state.grandTotalForDistributingDiscount = rows[rows.length - 1].total
			} else {
				state.grandTotalDiff = flt(
					state.grandTotalForDistributingDiscount -
						discount -
						rows[rows.length - 1].total,
				)
			}
		}
		rows.forEach((tax, i) => {
			// round_off_totals (the regional round-off accounts are India's)
			tax.tax_amount = flt(tax.tax_amount)
			tax.tax_amount_after_discount_amount = flt(
				tax.tax_amount_after_discount_amount,
			)
			setCumulativeTotal(i, tax)
		})
	}

	// adjust_grand_total_for_inclusive_tax: the rounding gap of an inclusive price goes to the grand total
	function adjustGrandTotalForInclusiveTax() {
		if (!rows.length || !rows.some(included)) return
		const last = rows[rows.length - 1]
		const nonInclusiveTaxAmount = rows
			.filter((tax) => !included(tax))
			.reduce((sum, tax) => sum + tax.tax_amount_after_discount_amount, 0)
		let diff = doc.total + nonInclusiveTaxAmount - flt(last.total)
		if (state.discountApplied && discount) diff -= discount
		diff = flt(diff)
		state.grandTotalDiff =
			diff && Math.abs(diff) <= 5 / 10 ** precision ? diff : 0
		if (
			state.grandTotalForDistributingDiscount !== undefined &&
			!state.discountApplied
		) {
			state.grandTotalForDistributingDiscount += state.grandTotalDiff
		}
	}

	// calculate_totals
	function calculateTotals() {
		if (rows.length) {
			doc.grand_total = flt(rows[rows.length - 1].total) + state.grandTotalDiff
			doc.total_taxes_and_charges = flt(
				doc.grand_total - doc.net_total - state.grandTotalDiff,
			)
		} else {
			doc.grand_total = flt(doc.net_total)
			doc.total_taxes_and_charges = 0
		}
		doc.grand_total = flt(doc.grand_total)
	}

	// _calculate
	function calculatePass() {
		initializeTaxes()
		determineExclusiveRate()
		calculateNetTotal()
		calculateTaxes()
		adjustGrandTotalForInclusiveTax()
		calculateTotals()
	}

	// get_total_for_discount_amount
	function getTotalForDiscountAmount() {
		if (applyDiscountOn === "Net Total" || !rows.length) return doc.net_total
		let totalActualTax = 0
		const actualTaxes = {}
		const update = (tax, taxAmount) => {
			totalActualTax += taxAmount
			actualTaxes[tax.idx] = {
				tax_amount: taxAmount,
				cumulative_tax_amount: totalActualTax,
			}
		}
		for (const tax of rows) {
			if (
				tax.charge_type === "Actual" ||
				tax.charge_type === "On Item Quantity"
			) {
				update(tax, tax.tax_amount)
				continue
			}
			if (!tax.row_id) continue
			const base = actualTaxes[Number(tax.row_id)]
			if (!base) continue
			const baseTaxAmount =
				tax.charge_type === "On Previous Row Amount"
					? base.tax_amount
					: base.cumulative_tax_amount
			update(tax, (baseTaxAmount * tax.rate) / 100)
		}
		const grandTotal =
			state.grandTotalForDistributingDiscount !== undefined
				? state.grandTotalForDistributingDiscount
				: doc.grand_total
		return grandTotal - totalActualTax
	}

	// apply_discount_amount: the header discount is spread over the lines' nets, then everything is computed again
	function applyDiscountAmount() {
		if (!discount) return
		const totalForDiscountAmount = getTotalForDiscountAmount()
		if (!totalForDiscountAmount) return
		let netTotal = 0
		let expectedNetTotal = 0
		for (const line of lines) {
			const distributedAmount =
				(discount * line.net_amount) / totalForDiscountAmount
			const adjustedNetAmount = line.net_amount - distributedAmount
			expectedNetTotal += adjustedNetAmount
			line.net_amount = flt(adjustedNetAmount)
			netTotal += line.net_amount
			const roundingDifference = flt(expectedNetTotal - netTotal)
			if (roundingDifference) {
				line.net_amount = flt(line.net_amount + roundingDifference)
				netTotal += roundingDifference
			}
		}
		state.discountApplied = true
		calculatePass()
	}

	calculatePass()
	applyDiscountAmount()

	return {
		items: lines.map((line) => ({
			rate: line.rate,
			amount: line.amount,
			net_amount: line.net_amount,
		})),
		taxes: rows.map(publicRow),
		...doc,
	}
}

/** What the caller reads of a computed tax row. */
function publicRow(tax) {
	return {
		account_head: tax.account_head,
		description: tax.description,
		charge_type: tax.charge_type,
		tax_amount: tax.tax_amount || 0,
		tax_amount_after_discount_amount: tax.tax_amount_after_discount_amount || 0,
		total: tax.total || 0,
	}
}
