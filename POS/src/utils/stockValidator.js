/**
 * Stock Validation Utility
 * Single source of truth for stock availability checks.
 */

import { call } from "frappe-ui";

/**
 * Determine whether an item requires stock validation.
 * Centralises the skip-logic so every call site uses the same rules.
 *
 * @param {Object} item - Item object (from search API or cart)
 * @returns {boolean} true when stock should be enforced for this item
 */
export function shouldValidateItemStock(item) {
	if (!item) return false;

	// Non-stock items are never validated
	if (item.is_stock_item === 0 || item.is_stock_item === false) return false;

	// Item-level allow_negative_stock bypasses validation
	//// Neoffice — Biome reformat only: the allow_negative_stock guard's `return false` moved
	//// onto its own line (458d81a9). Same condition; this file's real divergence is the
	//// translated shortage messages further down (ef2cbcfd).
	//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
	if (item.allow_negative_stock === 1 || item.allow_negative_stock === true) return false;

	// Batch / serial items have their own dialog-level validation
	if (item.has_serial_no || item.has_batch_no) return false;

	// Must be a stock item or bundle (or have stock data)
	//// Neoffice — Biome formatter pass of 458d81a9 (2026-03-20 "remove BrainWise branding,
	//// add restaurant mode, and code formatting"): the assignment reflowed onto two lines.
	//// Same condition, same result.
	const hasStockData = item.actual_qty !== undefined || item.stock_qty !== undefined;
	return !!(item.is_stock_item || item.is_bundle || hasStockData);
}

/**
 * Stock qty for a single cart/catalog row (qty × conversion_factor).
 * @param {Object} row
 * @returns {number}
 */
export function rowStockQty(row, qtyOverride = null) {
	const qty =
		qtyOverride !== null && qtyOverride !== undefined
			? Number.parseFloat(qtyOverride)
			: Number.parseFloat(row?.quantity ?? row?.qty ?? 0);
	const factor = Number.parseFloat(row?.conversion_factor) || 1;
	return (Number.isFinite(qty) ? qty : 0) * factor;
}

/**
 * Sum stock qty already in the cart for one SKU only.
 * Includes paid and free rows of that item_code; never other products
 * (e.g. a free Aqua Water line must not count against iPhone 17).
 *
 * @param {Array} cartItems
 * @param {string} itemCode
 * @returns {number}
 */
export function getCartStockQtyForItem(cartItems, itemCode) {
	if (!itemCode || !Array.isArray(cartItems)) return 0;
	return cartItems.reduce((sum, row) => {
		if (row?.item_code !== itemCode) return sum;
		return sum + rowStockQty(row);
	}, 0);
}

/**
 * Warehouse (Bin) qty for the item.
 *
 * Grid items inject remaining stock into `actual_qty` (server − cart reserved)
 * and keep Bin qty on `original_stock`. Cart lines store Bin qty on `actual_qty`.
 * Always prefer `original_stock` so we never compare "qty already in cart + new"
 * against remaining stock (that double-counts and inflates requested vs available).
 *
 * @param {Object} item
 * @returns {number}
 */
export function getWarehouseStockQty(item) {
	if (!item) return 0;
	if (item.original_stock !== undefined && item.original_stock !== null) {
		return Number.parseFloat(item.original_stock) || 0;
	}
	return Number.parseFloat(item.actual_qty ?? item.stock_qty ?? 0) || 0;
}

/**
 * Check if the requested quantity exceeds available stock.
 *
 * @param {Object}  item       - Item with actual_qty / stock_qty / original_stock
 * @param {number}  requestedQty - Total quantity to validate against (this SKU only)
 * @param {string}  [warehouse]  - Warehouse name (for error message)
 * @returns {{ available: boolean, actualQty: number, error: string|null }}
 */
export function checkStockAvailability(item, requestedQty, warehouse) {
	const actualQty = getWarehouseStockQty(item);
	const wh = warehouse || item.warehouse || "";

	if (actualQty >= requestedQty) {
		return { available: true, actualQty, error: null };
	}

	return {
		available: false,
		actualQty,
		error: formatStockError(item.item_name, requestedQty, actualQty, wh),
	};
}

/**
 * Get item stock from Frappe API
 * @param {string} itemCode - Item code
 * @param {string} warehouse - Warehouse
 * @returns {Promise<number>} - Available quantity
 */
export async function getItemStock(itemCode, warehouse) {
	try {
		const result = await call("frappe.client.get_value", {
			doctype: "Bin",
			filters: {
				item_code: itemCode,
				warehouse: warehouse,
			},
			fieldname: "actual_qty",
		});

		return Number.parseFloat(result?.actual_qty || 0);
	} catch (error) {
		console.warn("Failed to fetch stock:", error);
		return 0;
	}
}

/**
 * Format stock error message for user
 * @param {string} itemName - Item name
 * @param {number} requested - Requested quantity
 * @param {number} available - Available quantity
 * @param {string} warehouse - Warehouse name
 * @returns {string} - Formatted error message
 */
export function formatStockError(itemName, requested, available, warehouse) {
	if (available <= 0) {
		//// Neoffice — upstream returned this shortage text as an interpolated template string, so
		//// it reached a French-speaking cashier in English. Turned into an __() msgid with
		//// positional slots and shipped in the French PO (ef2cbcfd, 2026-07-09 "don't stock-block
		//// non-stock items scanned from the search bar").
		return __('"{0}" is out of stock in warehouse "{1}".', [itemName, warehouse]);
	}

	//// Neoffice — same i18n move as above (ef2cbcfd): the singular/plural unit word goes
	//// through __() too, because "unit"/"units" does not translate as a suffix in French.
	const unit = requested === 1 ? __("unit") : __("units");
	const availableUnit = available === 1 ? __("unit") : __("units");
	return __(
		'Not enough stock for "{0}".\n\nYou requested {1} {2}, but only {3} {4} available in "{5}".',
		[itemName, requested, unit, available, availableUnit, warehouse]
	);
}
