//// Neoffice — added file (no upstream equivalent). On a phone, leaving the order of a table brings the waiter back to the tables (NeoResto lot 1; product owner, 05.11.2026: « je valide, j'envoie en cuisine, il ne revient pas
//// sur l'écran de base, il reste planté sur le panier »). A phone has two tabs, the card and the cart; the cart tab was the one the waiter had opened to send, and nothing took it back to the card tab when the order was sent,
//// called, paid or put back (the cart is then cleared and the table is gone): the waiter was left on an empty cart. A tablet draws the floor in the same pane and was never stuck.
import { nextTick, watch } from "vue"

/**
 * Whether the waiter was in the order of a table or a takeaway, and no longer is.
 *
 * @param {boolean} was - Was in an order
 * @param {boolean} now - Is in an order
 */
export function hasLeftTheOrder(was, now) {
	return Boolean(was) && !now
}

/**
 * Puts the phone back on its first tab (the card, where the tables are listed once no table is open) when the order is left.
 *
 * @param {{ cart: { restaurantTable?: any, isTakeaway?: boolean }, ui: { setMobileTab: (tab: string) => void }, isPhone: { value: boolean } }} options
 *   - `cart` and `ui` are the cart and UI stores, `isPhone` a ref that is true below the phone's width.
 */
export function useReturnToTables({ cart, ui, isPhone }) {
	const inAnOrder = () => Boolean(cart.restaurantTable || cart.isTakeaway)
	watch(inAnOrder, async (now, was) => {
		if (!hasLeftTheOrder(was, now) || !isPhone.value) return
		// The cart is cleared and another table may be set in the same breath (another group of the table): only a table that stays gone sends the waiter back
		await nextTick()
		if (!inAnOrder()) ui.setMobileTab("items")
	})
}
