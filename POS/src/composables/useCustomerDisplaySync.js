/**
 * Customer Display Sync Composable
 *
 * Watches cart changes and syncs them to the customer display API.
 * This composable should be used in the main POS component (POSSale.vue).
 *
 * Features:
 * - Debounced cart sync to avoid excessive API calls
 * - Automatic sync on cart changes
 * - Sale complete notification
 * - Cart clear on session close
 */

import { createResource } from "frappe-ui"
import { ref, watch, onUnmounted, toRaw } from "vue"
import { usePOSCartStore } from "@/stores/posCart"
import { logger } from "@/utils/logger"

const log = logger.create("CustomerDisplaySync")

// Debounce delay for cart sync
const SYNC_DEBOUNCE_MS = 300

// Track if sync is enabled
const isSyncEnabled = ref(false)
const currentPosOpeningEntry = ref(null)

// Sync resources
const updateCartResource = createResource({
	url: "pos_next.api.customer_display.update_cart_data",
	auto: false,
})

const clearCartResource = createResource({
	url: "pos_next.api.customer_display.clear_cart_cache",
	auto: false,
})

const notifySaleCompleteResource = createResource({
	url: "pos_next.api.customer_display.notify_sale_complete",
	auto: false,
})

/**
 * Build cart data payload for customer display
 */
function buildCartPayload(cartStore, currency = "EUR") {
	const items = toRaw(cartStore.invoiceItems).map((item) => ({
		item_code: item.item_code,
		item_name: item.item_name,
		qty: item.quantity || item.qty || 0,
		rate: item.rate || 0,
		amount: item.amount || 0,
		uom: item.uom || item.stock_uom || "Unit",
		discount_percentage: item.discount_percentage || 0,
		image: item.image || null,
	}))

	return {
		items,
		customer: cartStore.customer?.name || cartStore.customer || null,
		customer_name: cartStore.customer?.customer_name || null,
		subtotal: cartStore.subtotal || 0,
		total_tax: cartStore.totalTax || 0,
		discount_amount: cartStore.totalDiscount || 0,
		grand_total: cartStore.grandTotal || 0,
		currency: currency,
	}
}

/**
 * Sync cart data to customer display
 */
async function syncCartToDisplay(cartStore, currency) {
	if (!isSyncEnabled.value || !currentPosOpeningEntry.value) {
		return
	}

	try {
		const cartData = buildCartPayload(cartStore, currency)

		await updateCartResource.fetch({
			pos_opening_entry: currentPosOpeningEntry.value,
			cart_data: JSON.stringify(cartData),
		})

		log.debug("Cart synced to display", { itemCount: cartData.items.length })
	} catch (error) {
		log.error("Failed to sync cart to display", error)
	}
}

/**
 * Notify display that sale is complete
 */
async function notifySaleComplete(grandTotal = 0, invoiceName = null) {
	if (!isSyncEnabled.value || !currentPosOpeningEntry.value) {
		return
	}

	try {
		await notifySaleCompleteResource.fetch({
			pos_opening_entry: currentPosOpeningEntry.value,
			invoice_name: invoiceName,
			grand_total: grandTotal,
		})

		log.info("Sale complete notification sent")
	} catch (error) {
		log.error("Failed to notify sale complete", error)
	}
}

/**
 * Clear display cart (on session close or manual clear)
 */
async function clearDisplayCart() {
	if (!currentPosOpeningEntry.value) {
		return
	}

	try {
		await clearCartResource.fetch({
			pos_opening_entry: currentPosOpeningEntry.value,
		})

		log.info("Display cart cleared")
	} catch (error) {
		log.error("Failed to clear display cart", error)
	}
}

/**
 * Main composable
 */
export function useCustomerDisplaySync() {
	const cartStore = usePOSCartStore()
	let debounceTimer = null
	let watcherCleanup = null

	/**
	 * Enable cart sync for a POS session
	 * @param {string} posOpeningEntry - POS Opening Entry name
	 * @param {string} currency - Currency code
	 */
	function enableSync(posOpeningEntry, currency = "EUR") {
		if (!posOpeningEntry) {
			log.warn("Cannot enable sync without POS opening entry")
			return
		}

		currentPosOpeningEntry.value = posOpeningEntry
		isSyncEnabled.value = true

		// Setup watchers for cart changes
		setupWatchers(currency)

		// Do initial sync
		syncCartToDisplay(cartStore, currency)

		log.info("Customer display sync enabled", { posOpeningEntry })
	}

	/**
	 * Disable cart sync
	 */
	function disableSync() {
		isSyncEnabled.value = false

		// Clear any pending debounced sync
		if (debounceTimer) {
			clearTimeout(debounceTimer)
			debounceTimer = null
		}

		// Cleanup watchers
		if (watcherCleanup) {
			watcherCleanup()
			watcherCleanup = null
		}

		log.info("Customer display sync disabled")
	}

	/**
	 * Setup watchers for cart changes
	 */
	function setupWatchers(currency) {
		// Cleanup existing watchers
		if (watcherCleanup) {
			watcherCleanup()
		}

		// Watch for cart changes (items, customer, totals)
		const unwatch = watch(
			[
				() => cartStore.invoiceItems.length,
				() => cartStore.invoiceItems.map((i) => `${i.item_code}:${i.quantity}:${i.rate}`).join(","),
				() => cartStore.customer?.name || cartStore.customer,
				() => cartStore.grandTotal,
				() => cartStore.totalDiscount,
			],
			() => {
				// Debounced sync
				if (debounceTimer) {
					clearTimeout(debounceTimer)
				}

				debounceTimer = setTimeout(() => {
					syncCartToDisplay(cartStore, currency)
				}, SYNC_DEBOUNCE_MS)
			},
			{ deep: false }
		)

		watcherCleanup = unwatch
	}

	/**
	 * Manually trigger cart sync
	 */
	function forceSync(currency = "EUR") {
		syncCartToDisplay(cartStore, currency)
	}

	// Cleanup on unmount
	onUnmounted(() => {
		disableSync()
	})

	return {
		// State
		isSyncEnabled,
		currentPosOpeningEntry,

		// Actions
		enableSync,
		disableSync,
		forceSync,
		notifySaleComplete,
		clearDisplayCart,
	}
}
