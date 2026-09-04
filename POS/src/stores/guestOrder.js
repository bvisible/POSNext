//// Neoffice — added file (no upstream equivalent). Upstream POSNext is cashier-only: every
//// order goes through a signed-in POS session. Our restaurant clients wanted QR
//// self-ordering at the table and web takeaway, so this store is the guest-side cart. It
//// calls allow_guest endpoints through a table token and sends NO CSRF header at all —
//// posting a stale one made Frappe answer 417 when the browser came back from the Wallee
//// redirect — and it holds the totals the POS cart cannot see: tip already paid, modifier
//// prices, TVA, and a Wallee payment only recorded once the provider confirms, so an order
//// is never shown as Paid before the money moved. (3939a848, 2026-03-28 "QR self-ordering
//// and takeaway web ordering", then 018f0ccb, 14f151fc, d5a11720, 25ef6b34, bb9d0c56,
//// 07d0d493, 1866d5c0, 749f69c8, e108d31d, 15cb5663, 6d7195f4, 02f74451, 2a0b109b,
//// 373880ee, 82ff46c3 — 2026-03-28 → 2026-04-01)
import { defineStore } from "pinia"
import { ref, computed } from "vue"

// Helper to make API calls to guest endpoints (no Frappe session required)
// Guest API calls: no CSRF header needed for allow_guest=True endpoints
// Sending an invalid/stale CSRF causes 417 errors, so we don't send one at all
async function guestFetch(method, args = {}) {
	const response = await fetch(`/api/method/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(args),
	})

	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		throw new Error(err?.exc_type || err?.message || `HTTP ${response.status}`)
	}

	const data = await response.json()
	return data.message
}

export const useGuestOrderStore = defineStore("guestOrder", () => {
	// State
	const token = ref(null)
	const tableInfo = ref(null)
	const menuItems = ref([])
	const menuCategories = ref([])
	const cart = ref([]) // Array of { item, qty, modifiers, price }
	const orderItems = ref([]) // Items from server (already submitted)
	const orderTotal = ref(0)
	const paidAmount = ref(0)
	const paymentStatus = ref(null) // null | 'pending' | 'paid' | 'partial'
	const isLoading = ref(false)
	const error = ref(null)
	const settings = ref({}) // Populated from token validation
	const currency = ref("CHF") // Currency from POS Profile
	const companyLogo = ref("") // Company logo URL
	const taxAmount = ref(0)
	const paidTipAmount = ref(0)
	const companyName = ref("")
	const invoiceName = ref("")
	const postingDate = ref("")

	// Getters
	const cartTotal = computed(() => {
		return cart.value.reduce((sum, entry) => sum + entry.price * entry.qty, 0)
	})

	const cartItemCount = computed(() => {
		return cart.value.reduce((sum, entry) => sum + entry.qty, 0)
	})

	const remainingAmount = computed(() => {
		return Math.max(0, orderTotal.value - paidAmount.value)
	})

	const isFullyPaid = computed(() => {
		return orderTotal.value > 0 && paidAmount.value >= orderTotal.value
	})

	// Actions
	async function validateToken(tokenValue) {
		isLoading.value = true
		error.value = null
		try {
			const result = await guestFetch(
				"pos_next.api.guest_ordering.validate_token",
				{ token: tokenValue },
			)
			token.value = tokenValue
			tableInfo.value = result.table || null
			settings.value = {
				qr_order_validation: result.qr_order_validation,
				guest_account_mode: result.guest_account_mode,
				has_loyalty_program: result.has_loyalty_program || false,
			}
			currency.value = result.currency || "CHF"
			companyLogo.value = result.company_logo || ""
			return result
		} catch (err) {
			error.value = err.message
			throw err
		} finally {
			isLoading.value = false
		}
	}

	async function fetchMenu() {
		if (!token.value) return
		isLoading.value = true
		error.value = null
		try {
			const result = await guestFetch(
				"pos_next.api.guest_ordering.get_guest_menu",
				{ token: token.value },
			)
			const categories = result.categories || []
			menuCategories.value = categories
			// Flatten items from categories, tagging each with its category label
			menuItems.value = categories.flatMap((cat) =>
				(cat.menu_items || []).map((item) => ({
					...item,
					category: cat.label,
				})),
			)
		} catch (err) {
			error.value = err.message
			throw err
		} finally {
			isLoading.value = false
		}
	}

	function addToCart(item, qty = 1, modifiers = []) {
		const basePrice = item.discounted_price ?? item.price_with_tax ?? item.price ?? 0
		const modifierTotal = modifiers.reduce((sum, m) => sum + (m.additional_price || m.price_adjustment || 0), 0)
		const price = basePrice + modifierTotal
		// Check if same item + same modifiers already in cart
		const existingIndex = cart.value.findIndex(
			(entry) =>
				entry.item.item_code === item.item_code &&
				JSON.stringify(entry.modifiers) === JSON.stringify(modifiers),
		)
		if (existingIndex >= 0) {
			cart.value[existingIndex].qty += qty
		} else {
			cart.value.push({ item, qty, modifiers, price })
		}
	}

	function removeFromCart(index) {
		cart.value.splice(index, 1)
	}

	function updateCartQty(index, qty) {
		if (qty <= 0) {
			removeFromCart(index)
		} else {
			cart.value[index].qty = qty
		}
	}

	function clearCart() {
		cart.value = []
	}

	async function submitOrder() {
		if (!token.value || cart.value.length === 0) return
		isLoading.value = true
		error.value = null
		try {
			const items = cart.value.map((entry) => ({
				item_code: entry.item.item_code,
				qty: entry.qty,
				rate: entry.price,
				modifiers: entry.modifiers,
			}))
			const result = await guestFetch(
				"pos_next.api.guest_ordering.submit_guest_order",
				{ token: token.value, items: JSON.stringify(items) },
			)
			clearCart()
			await refreshOrderStatus()
			return result
		} catch (err) {
			error.value = err.message
			throw err
		} finally {
			isLoading.value = false
		}
	}

	async function refreshOrderStatus() {
		if (!token.value) return
		try {
			const result = await guestFetch(
				"pos_next.api.guest_ordering.get_order_status",
				{ token: token.value },
			)
			orderItems.value = result.items || []
			orderTotal.value = result.grand_total || 0
			paidAmount.value = result.paid_amount || 0
			paymentStatus.value = result.payment_status || null
			taxAmount.value = result.total_taxes_and_charges || 0
			paidTipAmount.value = result.tip_total || 0
			companyName.value = result.company || ""
			invoiceName.value = result.invoice || ""
			postingDate.value = result.posting_date || ""
		} catch (err) {
			error.value = err.message
		}
	}

	async function createPayment(amount, items = [], tip = 0, successUrl = "", failedUrl = "") {
		if (!token.value) return
		isLoading.value = true
		error.value = null
		try {
			const args = { token: token.value, amount }
			if (items.length) args.payment_items = JSON.stringify(items)
			if (tip > 0) args.tip = tip
			if (successUrl) args.success_url = successUrl
			if (failedUrl) args.failed_url = failedUrl
			const result = await guestFetch(
				"pos_next.api.guest_ordering.create_guest_payment",
				args,
			)
			return result
		} catch (err) {
			error.value = err.message
			throw err
		} finally {
			isLoading.value = false
		}
	}

	let _paymentConfirmed = false

	async function confirmPayment(amount, tip = 0) {
		if (!token.value || _paymentConfirmed) return { status: "already_confirmed" }
		_paymentConfirmed = true
		try {
			const result = await guestFetch(
				"pos_next.api.guest_ordering.confirm_guest_payment",
				{ token: token.value, amount, tip },
			)
			await refreshOrderStatus()
			return result
		} catch (err) {
			_paymentConfirmed = false
			error.value = err.message
		}
	}

	// Realtime subscription for multi-device sync
	let _realtimeSubscribed = false

	function subscribeToRealtime() {
		if (_realtimeSubscribed || !tableInfo.value?.name) return
		const rt = window.frappe?.realtime
		if (!rt) {
			// Retry after realtime is ready
			setTimeout(subscribeToRealtime, 2000)
			return
		}
		const room = `guest_table_${tableInfo.value.name}`
		// Join the room so server-scoped events reach this client
		if (rt.subscribe) {
			rt.subscribe(room)
		}
		rt.on("guest_order_update", (data) => {
			if (data?.table === tableInfo.value?.name) {
				refreshOrderStatus()
			}
		})
		// Listen for KDS status changes to update badges in real-time
		// kds_update is a global event (no table filter), just refresh
		rt.on("kds_update", () => {
			refreshOrderStatus()
		})
		_realtimeSubscribed = true
	}

	function reset() {
		token.value = null
		tableInfo.value = null
		menuItems.value = []
		menuCategories.value = []
		cart.value = []
		orderItems.value = []
		orderTotal.value = 0
		paidAmount.value = 0
		paymentStatus.value = null
		isLoading.value = false
		error.value = null
		settings.value = {}
		currency.value = "CHF"
		companyLogo.value = ""
		taxAmount.value = 0
		companyName.value = ""
		invoiceName.value = ""
		postingDate.value = ""
		_realtimeSubscribed = false
	}

	return {
		// State
		token,
		tableInfo,
		menuItems,
		menuCategories,
		cart,
		orderItems,
		orderTotal,
		paidAmount,
		paidTipAmount,
		paymentStatus,
		isLoading,
		error,
		settings,
		currency,
		companyLogo,
		taxAmount,
		companyName,
		invoiceName,
		postingDate,
		// Getters
		cartTotal,
		cartItemCount,
		remainingAmount,
		isFullyPaid,
		// Actions
		validateToken,
		fetchMenu,
		addToCart,
		removeFromCart,
		updateCartQty,
		clearCart,
		submitOrder,
		refreshOrderStatus,
		createPayment,
		confirmPayment,
		subscribeToRealtime,
		reset,
	}
})
