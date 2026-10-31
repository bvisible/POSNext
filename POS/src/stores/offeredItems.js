// //// Neoffice — added file (no upstream equivalent). « Offert » at the till (NeoRestau lot 1, task 24): the cashier offers
// //// some or all of a line; the paid part keeps the rest, the offered part is a row of the same dish right after it, at
// //// zero (utils/offeredRows.js). « Annuler l'offert » merges it back. Who may offer: whoever may change a discount at the
// //// till (its POS Settings), and, where a rule of the authorization gate asks for it (off by default), a manager's PIN
// //// for « Offer an item », asked at the gesture and again at the payment when the approval held no longer covers the
// //// ticket. The server checks both whatever the till does (pos_next.offered, the gate's before_submit).

import { useAuthorization } from "@/composables/useAuthorization"
import { useToast } from "@/composables/useToast"
import { sessionUser } from "@/data/session"
import { usePOSCartStore } from "@/stores/posCart"
import { usePOSSettingsStore } from "@/stores/posSettings"
import { usePOSShiftStore } from "@/stores/posShift"
import { cartRowOf } from "@/utils/cartRow"
import { roundCurrency } from "@/utils/currency"
import { isOffline } from "@/utils/offline"
import {
	authorizationFieldsFor,
	dropGrant,
	grantCovers,
	holdGrant,
} from "@/utils/offerApproval"
import {
	OFFERED_FIELD,
	canOfferRow,
	clampOfferQuantity,
	isOfferedRow,
	listPrice,
	makeOfferedRow,
	mergeTarget,
	offeredFieldsOf,
	offeredValue,
} from "@/utils/offeredRows"
import { defineStore } from "pinia"
import { computed, toRaw, watch } from "vue"

/** The action of the authorization gate, as registered on the server (pos_next.authorization.actions.offered_item). */
export const OFFER_ACTION = "Offer an item"

const roundQuantity = (qty) => Math.round(qty * 10000) / 10000

export const useOfferedItemsStore = defineStore("offeredItems", () => {
	const cart = usePOSCartStore()
	const settings = usePOSSettingsStore()
	const { showSuccess, showWarning } = useToast()

	/** Whether the till lets its cashiers offer: the right to change a discount there, on an invoice (an order is
	 * fulfilled later: what it would offer is the invoice's to say). */
	const canOffer = computed(
		() =>
			Boolean(settings.allowItemDiscount) &&
			(cart.targetDoctype || "Sales Invoice") === "Sales Invoice",
	)

	const till = () => cart.posProfile || usePOSShiftStore().profileName || null
	const who = () => ({ user: sessionUser(), profile: till() })
	const offeredOnTheTicket = () => offeredValue(cart.invoiceItems)

	// The approval held is the ticket's: gone with its last offered row (an offer cancelled, a sale paid, a table left)
	watch(
		() => cart.invoiceItems.some(isOfferedRow),
		(offers) => {
			if (!offers) dropGrant()
		},
		{ flush: "sync" },
	)

	/** A manager's approval for `total` offered on the ticket, where a rule asks for one. */
	async function approve(total) {
		const { isAuthorizationRequired, requireAuthorization } = useAuthorization()
		if (total <= 0 || !isAuthorizationRequired(OFFER_ACTION)) return true
		if (grantCovers(total, who())) return true
		if (isOffline()) {
			showWarning(
				__(
					"A manager must approve the offered items, and the network is needed for it.",
				),
			)
			return false
		}
		const grant = await requireAuthorization(OFFER_ACTION, {
			pos_profile: till(),
			amount: total,
			currency: usePOSShiftStore().profileCurrency,
			amountLabel: "Value offered",
			actionLabel: __("Offer an item"),
		})
		if (!grant) return false
		holdGrant(grant, { amount: total, ...who() })
		return true
	}

	/**
	 * Offer `qty` units of a line of the cart (the cart row, or the copy the cart shows of it). The paid part keeps the
	 * rest; the whole quantity offered turns the line itself offered.
	 * @returns {Promise<boolean>} whether the line was offered
	 */
	async function offer(line, qty) {
		const row = cartRowOf(line)
		if (!canOffer.value) {
			showWarning(
				__(
					"This till does not let its cashiers change a discount: nothing can be offered.",
				),
			)
			return false
		}
		if (!canOfferRow(row) || !cart.invoiceItems.includes(row)) return false
		const quantity = clampOfferQuantity(row, qty)
		if (
			!(await approve(
				roundCurrency(offeredOnTheTicket() + quantity * listPrice(row)),
			))
		)
			return false
		// The line may have left the cart, or changed, while the manager approved
		if (!cart.invoiceItems.includes(row) || !canOfferRow(row)) return false

		if (quantity >= row.quantity) {
			Object.assign(row, offeredFieldsOf(toRaw(row)))
			cart.recalculateItem(row)
		} else {
			const offered = makeOfferedRow(toRaw(row), quantity)
			row.quantity = roundQuantity(row.quantity - quantity)
			cart.recalculateItem(row)
			cart.recalculateItem(offered)
			cart.invoiceItems.splice(cart.invoiceItems.indexOf(row) + 1, 0, offered)
		}
		cart.rebuildIncrementalCache()
		cart.$patch({ hasUnsentChanges: true })
		showSuccess(
			__("Offered: {0} × {1}", [quantity, row.item_name || row.item_code]),
		)
		return true
	}

	/** « Annuler l'offert »: the offered row goes back into its paid line, or turns back into a paid line itself. */
	function cancelOffer(line) {
		const row = cartRowOf(line)
		if (!isOfferedRow(row) || !cart.invoiceItems.includes(row)) return false
		const into = mergeTarget(cart.invoiceItems, row)
		if (into) {
			into.quantity = roundQuantity(into.quantity + row.quantity)
			cart.recalculateItem(into)
			cart.invoiceItems.splice(cart.invoiceItems.indexOf(row), 1)
		} else {
			Object.assign(row, {
				[OFFERED_FIELD]: 0,
				discount_percentage: 0,
				discount_amount: 0,
				discount_mode: null,
			})
			cart.recalculateItem(row)
		}
		cart.rebuildIncrementalCache()
		cart.$patch({ hasUnsentChanges: true })
		return true
	}

	/** Whether the payment must first have the offered items approved (a rule asks, the approval held does not cover). */
	function needsApprovalForPayment() {
		const total = offeredOnTheTicket()
		return (
			total > 0 &&
			useAuthorization().isAuthorizationRequired(OFFER_ACTION) &&
			!grantCovers(total, who())
		)
	}

	/** The approval of everything the ticket offers, asked before the payment. */
	async function approveForPayment() {
		return approve(offeredOnTheTicket())
	}

	/** Whether the payment has a check of the offered items to go through first. */
	function needsCheckBeforePayment() {
		if (!cart.invoiceItems.some(isOfferedRow)) return false
		return !canOffer.value || needsApprovalForPayment()
	}

	/** The offered items' checks before the payment opens: an invoice's, approved where a rule asks for it. */
	async function checkBeforePayment() {
		if (!cart.invoiceItems.some(isOfferedRow)) return true
		if (!settings.allowItemDiscount) {
			showWarning(
				__(
					"This till does not let its cashiers change a discount: cancel the offer to take the payment.",
				),
			)
			return false
		}
		if ((cart.targetDoctype || "Sales Invoice") !== "Sales Invoice") {
			showWarning(
				__(
					"Offered items are sold on an invoice only: cancel the offer to make an order.",
				),
			)
			return false
		}
		return approveForPayment()
	}

	/** What the payment of `items` carries: the approval held, when the ticket offers something. */
	function authorizationFields(items = cart.invoiceItems) {
		return authorizationFieldsFor(items)
	}

	return {
		canOffer,
		offer,
		cancelOffer,
		needsApprovalForPayment,
		approveForPayment,
		needsCheckBeforePayment,
		checkBeforePayment,
		authorizationFields,
	}
})
