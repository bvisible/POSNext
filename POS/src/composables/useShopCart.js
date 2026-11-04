//// Neoffice — added file (no upstream equivalent). Scanning in the shop (lot 3): the till takes over the cart of a
//// customer's phone by the code the phone shows (pos_next.api.shop_scan.open_shop_cart), scanned with the till's scanner or
//// typed in its search. The cart is put in the till's own as a table's order is (useOpenTable): each line at its list
//// price, the till's offers then work it out (the same engine the phone was priced by), and the till's payment submits the
//// phone's draft (useInvoice.shopCartInvoice), not a second invoice. If the amount the till comes to is not the one the
//// phone showed (an offer ended since), the seller is told.
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { call } from "@/utils/apiWrapper"
import { formatCurrency } from "@/utils/currency"
import { useToast } from "@/composables/useToast"
import { customerOfTheOrder } from "@/composables/useOpenTable"

/** A cart's code as the phone shows it, « K7Q-24M », or typed without its dash: six of the letters and digits a code uses. */
export const CART_CODE = /^[A-HJ-NP-Z2-9]{3}-?[A-HJ-NP-Z2-9]{3}$/i

export function looksLikeCartCode(text) {
	return CART_CODE.test(String(text || "").trim())
}

// How long the till's offers may take before the amount is compared with the phone's
const OFFERS_WAIT_MS = 5000

/** The lines of a phone's cart as the till's cart takes them: the paid lines at their list price (its offers are its own). */
export function linesForTheTill(cart) {
	return (cart?.items || [])
		.filter((line) => !line.is_free_item)
		.map((line) => ({
			item: {
				item_code: line.item_code,
				item_name: line.item_name,
				rate: line.price_list_rate,
				uom: line.uom,
				stock_uom: line.stock_uom,
				conversion_factor: line.conversion_factor,
				image: line.image,
			},
			qty: line.qty,
		}))
}

export function useShopCart() {
	const { showSuccess, showWarning } = useToast()

	/** Once the till's offers have settled, tell the seller if the till does not come to the amount the phone showed. */
	async function compareWithThePhone(cartStore, currency, phoneAmount) {
		const until = Date.now() + OFFERS_WAIT_MS
		while (cartStore.isProcessingOffers && Date.now() < until) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		const tillAmount = Number(cartStore.grandTotal || 0)
		if (Math.abs(tillAmount - Number(phoneAmount || 0)) >= 0.005) {
			const phone = formatCurrency(phoneAmount, currency)
			const till = formatCurrency(tillAmount, currency)
			// The text on the line of its __(): the catalogue extraction reads no other
			showWarning(
				__("The phone said {0}, the till {1}: an offer changed.", [
					phone,
					till,
				]),
			)
		}
	}

	/**
	 * Take over the cart of `code` when it is one: true when the code was a phone's cart (taken over, or refused because the
	 * till's cart is not empty), false to let the till look it up as an article's barcode. The stores are read when a code
	 * comes, not when the search is set up: a screen that only searches needs none of them.
	 */
	async function takeOver(code) {
		const settingsStore = usePOSSettingsStore()
		if (!settingsStore.settings.enable_shop_scan || !looksLikeCartCode(code))
			return false
		const cartStore = usePOSCartStore()
		const shiftStore = usePOSShiftStore()
		let cart
		try {
			cart = await call("pos_next.api.shop_scan.open_shop_cart", {
				code: String(code).trim(),
				pos_profile: shiftStore.profileName,
			})
		} catch {
			return false
		}
		if (!cart) return false
		if (cartStore.invoiceItems.length) {
			showWarning(__("Empty the cart before taking over the cart of a phone."))
			return true
		}

		await cartStore.clearCart()
		for (const { item, qty } of linesForTheTill(cart)) {
			cartStore.addItem(item, qty)
		}
		// The sale submits the phone's draft (useInvoice.shopCartInvoice): never the till's local drafts (currentDraftId)
		cartStore.$patch({ shopCartInvoice: cart.invoice })
		if (cart.customer) await cartStore.setCustomer(customerOfTheOrder(cart))

		showSuccess(__("Cart {0} of a phone taken over.", [cart.code]))
		if (cart.needs_validation) {
			showWarning(
				__("A seller checks an article of this cart before it is sold."),
			)
		}
		compareWithThePhone(
			cartStore,
			shiftStore.profileCurrency || undefined,
			cart.grand_total,
		)
		return true
	}

	return { takeOver }
}
