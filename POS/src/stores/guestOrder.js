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
// The first message a refused call carries (Frappe packs them as a JSON list of JSON strings), without its markup
function serverMessage(body) {
	try {
		const first = JSON.parse(JSON.parse(body?._server_messages || "[]")[0] || "null")
		return String(first?.message || "").replace(/<[^>]*>/g, "").trim()
	} catch {
		return ""
	}
}

//// Neoffice — whether this browser holds the session of somebody (the till's staff, or a customer whom the link of the sign-in mail signed in): Frappe's
//// `user_id` cookie is readable (it is not the session id) and says « Guest » when nobody is signed in.
export function holdsASession() {
	const match = typeof document === "undefined" ? null : document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
	return Boolean(match) && decodeURIComponent(match[1]) !== "Guest"
}

async function guestFetch(method, args = {}, { session = false, csrf = "", keepCookies = false } = {}) {
	//// Neoffice — no session at all: `credentials: "omit"`. A browser that is signed in at the till (a waiter or the owner scanning the code of a table with their own phone, a test)
	//// sent its session cookie, and Frappe then asks a CSRF token of the call, which a guest page never has: « Invalid request » on every call, shown as « Link invalid or expired »
	//// (product owner, 03.11.2026). A guest call is the table's token and nothing else, so it is sent as the guest's, whoever holds the phone.
	//// Two exceptions, each asked for by the call: `session` carries the session (and the CSRF token Frappe then asks for), which only the calls that link a signed-in
	//// customer to the table do; `keepCookies` lets the browser keep the cookie the sign-in engine sets when a code is asked for, which the link of the mail needs to find
	//// again the browser that asked (`frappe.passwordless`: a link signs in only where the code was asked for). The latter is sent only by a browser that holds no
	//// session, so that a phone signed in at the till keeps being the guest's.
	const response = await fetch(`/api/method/${method}`, {
		method: "POST",
		credentials: session || keepCookies ? "include" : "omit",
		headers: { "Content-Type": "application/json", ...(csrf ? { "X-Frappe-CSRF-Token": csrf } : {}) },
		body: JSON.stringify(args),
	})

	if (!response.ok) {
		const err = await response.json().catch(() => ({}))
		// //// Neoffice — what the server said (« Wrong code. », « Mozzarella is sold out ») and not the name of its exception class: the guest reads it on the page
		throw new Error(serverMessage(err) || err?.exc_type || err?.message || `HTTP ${response.status}`)
	}

	const data = await response.json()
	return data.message
}

//// Neoffice — a read made with the session (`signed_in_account`): a GET carries no CSRF token to ask for
async function sessionGet(method, args = {}) {
	const query = new URLSearchParams(args).toString()
	const response = await fetch(`/api/method/${method}?${query}`, { method: "GET", credentials: "include" })
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()).message
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
	// The display name of the restaurant of the session, from the validation of the token: the tab of a guest page
	// carries it, where the company of an order exists only once there is an invoice
	const restaurantName = ref("")
	const invoiceName = ref("")
	const postingDate = ref("")
	// Who the session is: the customer the till put on the table, or the one the guest signed in as (null for nobody).
	// //// Neoffice — the sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026): { customer, customer_name, source, loyalty_points, loyalty_value, loyalty_program }
	const account = ref(null)
	//// Neoffice — the customer's account this browser is already signed in with ({ user, full_name }), which the link of the sign-in mail leaves on the phone: the page offers
	//// « Continue as … » (03.11.2026). null for nobody, and for a member of the staff.
	const signedIn = ref(null)
	// "restaurant" (a table's QR code) or "takeaway" (the web order): a takeaway order is paid whole, with no tip
	const mode = ref("restaurant")

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

	// What the restaurant decided: not proposed, optional or required
	const accountMode = computed(() => settings.value?.guest_account_mode || "Not Proposed")
	const canSignIn = computed(() => accountMode.value !== "Not Proposed")
	// An account is required and nobody is identified yet: nothing can be ordered
	const mustSignIn = computed(() => accountMode.value === "Mandatory" && !account.value)
	const isTakeaway = computed(() => mode.value === "takeaway")

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
			account.value = result.account || null
			mode.value = result.mode || "restaurant"
			tableInfo.value = result.table || null
			settings.value = {
				qr_order_validation: result.qr_order_validation,
				guest_account_mode: result.guest_account_mode,
				has_loyalty_program: result.has_loyalty_program || false,
			}
			currency.value = result.currency || "CHF"
			companyLogo.value = result.company_logo || ""
			restaurantName.value = result.restaurant_name || ""
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
			// The till may put a customer on the table (or take it off) while the page is open
			if ("account" in result) account.value = result.account || null
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

	// The sign-in, on the frappe fork's engine (`frappe.passwordless`, neoffice-maintenance#2192): a code and a link are mailed to the address; the
	// code proves it; an address that has an account is the table's customer at once, a new one gives a name and the PROOF the server handed back
	// (never the address: the server opens the account of the address the proof was minted for). Nothing here opens a session on the phone.
	// The mail's link brings the guest back to this page signed in, in the browser that asked for the code: the cookie the engine sets when it is asked is kept (`keepCookies`),
	// but only by a browser that holds no session (a phone signed in at the till stays the guest's, with the code to type).
	async function requestCode(email) {
		return guestFetch(
			"pos_next.api.guest_ordering.request_guest_code",
			{ token: token.value, email },
			{ keepCookies: !holdsASession() },
		)
	}

	// Whose session this browser holds, asked once the table is known; nothing is asked when it holds none (nothing to find out, and no call that carries cookies)
	async function loadSignedInAccount() {
		signedIn.value = null
		if (!token.value || !holdsASession()) return null
		try {
			const result = await sessionGet("pos_next.api.guest_ordering.signed_in_account", { token: token.value })
			signedIn.value = result?.account || null
		} catch {
			signedIn.value = null
		}
		return signedIn.value
	}

	// Links the account of the session to the table, once the guest has pressed « Continue as … ». The write carries the session, so Frappe asks the CSRF token of that session.
	async function claimSignedInAccount() {
		const csrf = (await sessionGet("pos_next.api.utilities.get_csrf_token"))?.csrf_token
		if (!csrf) throw new Error(__("Sign in to link your account to this table."))
		const result = await guestFetch(
			"pos_next.api.guest_ordering.claim_signed_in_account",
			{ token: token.value },
			{ session: true, csrf },
		)
		if (result?.account) account.value = result.account
		return result
	}

	async function confirmCode(email, code) {
		const result = await guestFetch("pos_next.api.guest_ordering.confirm_guest_code", {
			token: token.value,
			email,
			code,
		})
		if (result?.account) account.value = result.account
		return result
	}

	async function registerAccount(proof, customerName, mobileNo) {
		const result = await guestFetch("pos_next.api.guest_ordering.register_guest_account", {
			token: token.value,
			proof,
			customer_name: customerName,
			mobile_no: mobileNo || null,
		})
		if (result?.account) account.value = result.account
		return result
	}

	let _paymentConfirmed = false

	async function confirmPayment(amount, tip = 0) {
		if (!token.value || _paymentConfirmed) return { status: "already_confirmed" }
		_paymentConfirmed = true
		try {
			const ask = () =>
				guestFetch("pos_next.api.guest_ordering.confirm_guest_payment", { token: token.value, amount, tip })
			let result = await ask()
			// //// Neoffice — a payment is recorded only once the payment provider has confirmed the money, which can come a few seconds after the
			// //// browser's return: ask again for a minute before saying so (a takeaway order, neoffice-maintenance#2132; a table's, #1973). The amount
			// //// and the tip sent are not read by the server any more: it books what the provider settled
			for (let attempt = 0; result?.status === "awaiting_payment" && attempt < 20; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 3000))
				result = await ask()
			}
			if (result?.status === "awaiting_payment") {
				_paymentConfirmed = false
				error.value = __("Your payment is not confirmed yet. Please reload this page in a moment.")
				return result
			}
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
		restaurantName.value = ""
		invoiceName.value = ""
		postingDate.value = ""
		account.value = null
		signedIn.value = null
		mode.value = "restaurant"
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
		restaurantName,
		invoiceName,
		postingDate,
		account,
		signedIn,
		mode,
		// Getters
		accountMode,
		canSignIn,
		mustSignIn,
		isTakeaway,
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
		requestCode,
		confirmCode,
		registerAccount,
		loadSignedInAccount,
		claimSignedInAccount,
		subscribeToRealtime,
		reset,
	}
})
