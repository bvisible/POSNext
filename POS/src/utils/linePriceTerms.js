//// Neoffice — added file (no upstream equivalent). The price terms of a cart line: a rate set by hand and a discount
//// (NeoResto lot 1, task 22, fix round 2). Units added to a line that has left for the kitchen go on a line of their
//// own, and that line must bill them as the first one does: a sent line at a hand-set 25 (list price 29) took a « + » as
//// a unit billed at 29, and a 10 % discount was lost on it. The same terms decide whether a new unit may be merged into
//// a line that waits: only into one that bills the same way.

const EPSILON = 0.0001

/**
 * What decides how one unit of a line is billed.
 *
 * @param {Object|null|undefined} line - A cart line
 * @returns {{manual: boolean, rate: number, discount: number}}
 *   `rate` is the rate set by hand when there is one, else the price list rate; `discount` is the discount in percent
 *   (a discount in amount has its percentage derived by the cart, so both kinds compare).
 */
export function priceTermsOf(line) {
	const manual = line?.is_rate_manually_edited === 1
	const rate = manual ? line?.rate : line?.price_list_rate || line?.rate
	return {
		manual,
		rate: Number(rate) || 0,
		discount: Number(line?.discount_percentage) || 0,
	}
}

/**
 * Whether two lines bill one unit the same way.
 *
 * @param {Object} a - A cart line
 * @param {Object} b - A cart line, or an item about to become one
 * @returns {boolean}
 */
export function samePriceTerms(a, b) {
	const first = priceTermsOf(a)
	const second = priceTermsOf(b)
	return (
		first.manual === second.manual &&
		Math.abs(first.rate - second.rate) < EPSILON &&
		Math.abs(first.discount - second.discount) < EPSILON
	)
}

/**
 * The fields a new line takes from the line whose units it extends, besides its rate and its list price.
 *
 * @param {Object} source - The line (or item) the new line carries the terms of
 * @returns {{discount_percentage: number, is_rate_manually_edited?: number, original_rate?: number}}
 */
export function carriedPriceTerms(source) {
	const carried = { discount_percentage: Number(source?.discount_percentage) || 0 }
	if (source?.is_rate_manually_edited === 1) {
		carried.is_rate_manually_edited = 1
		carried.original_rate = source.original_rate
	}
	return carried
}

/**
 * A row of a stored (queued) invoice as the cart takes it back. The rate of such a row is already net of the discount, and
 * the row carries the percentage as well, so a line that takes both can bill the discount twice or lose it:
 * - a row whose rate was set by hand (a hand-set 8.00 given 10 % off was queued at 7.20) keeps that rate, as the cart keeps
 *   the rate of such a line, and loses the percentage: with both it came back at 6.48;
 * - a row at the list price is billed by the cart from its list price and its percentage, so the percentage is what carries
 *   the discount: without it the line came back at the list price, more than the queued sale (a 9.00 row of a 10.00 list
 *   price came back at 10.00). The percentage is the row's own, or derived from its list price and its net rate when the
 *   row was discounted by an amount; the amount is left out, the percentage bills it. The row says so with
 *   `carries_price_terms`, which makes the cart take the terms of the row (as it does for a rate set by hand) and merge it only
 *   into a line that bills the same way (a row without a discount says so too);
 * - an offered row (100 % off) and a free row keep to the first rule: the cart gives them their own terms.
 * Every other term of the row is kept. The row it is given is not changed.
 *
 * @param {Object} row - A row of a stored invoice
 * @returns {Object} The row, as the cart takes it
 */
export function storedRowTerms(row) {
	if (row?.is_rate_manually_edited === 1 || row?.posa_is_offered || row?.is_free_item) {
		return { ...row, discount_percentage: 0 }
	}
	const list = Number(row?.price_list_rate) || 0
	const net = Number(row?.rate) || 0
	const asked = Number(row?.discount_percentage) || 0
	const derived = list > 0 && net >= 0 && net < list ? ((list - net) / list) * 100 : 0
	// Every other row says that the cart takes its terms, a row without a discount too: rows merge only when they bill the same way,
	// or a plain row would join a discounted line and be billed with its discount.
	return {
		...row,
		discount_percentage: Math.min(100, asked > 0 ? asked : derived),
		discount_amount: 0,
		carries_price_terms: true,
	}
}
