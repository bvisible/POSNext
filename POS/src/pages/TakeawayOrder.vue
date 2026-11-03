<template>
	<!-- //// Neoffice — added file (no upstream equivalent). Public takeaway ordering at -->
	<!-- //// /pos/order: the customer orders from the web, creates an account and pays -->
	<!-- //// before the kitchen starts. Same guest components as the QR table flow, but -->
	<!-- //// no token bound to a table. Nothing upstream serves a customer directly -->
	<!-- //// (3939a848, 2026-03-28 "QR self-ordering and takeaway web ordering"). -->
	<div class="flex flex-col h-screen bg-gray-50 overflow-hidden" style="max-height: 100dvh;">
		<!-- Loading State -->
		<div v-if="isInitializing" class="flex-1 flex flex-col items-center justify-center p-8">
			<svg class="w-10 h-10 text-blue-500 animate-spin mb-4" fill="none" viewBox="0 0 24 24">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
			</svg>
			<p class="text-gray-600">{{ __('Loading...') }}</p>
		</div>

		<!-- Error State -->
		<div v-else-if="initError" class="flex-1 flex flex-col items-center justify-center p-8 text-center">
			<div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
				<svg class="w-9 h-9 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
				</svg>
			</div>
			<h2 class="text-xl font-bold text-gray-900 mb-2">{{ __('Service unavailable') }}</h2>
			<p class="text-sm text-gray-500">{{ initError }}</p>
			<button @click="initTakeaway" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
				{{ __('Try again') }}
			</button>
		</div>

		<!-- Success State -->
		<div v-else-if="orderSuccess" class="flex-1 flex flex-col items-center justify-center p-8 text-center">
			<div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
				<svg class="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
				</svg>
			</div>
			<h2 class="text-2xl font-bold text-gray-900 mb-2">{{ __('Order confirmed!') }}</h2>
			<p class="text-gray-600 mb-1">{{ __('Your order number') }}</p>
			<p class="text-3xl font-bold text-blue-600 mb-6">{{ orderNumber }}</p>
			<p class="text-sm text-gray-500">{{ __('Show this number when you pick up your order.') }}</p>
		</div>

		<!-- Main Content -->
		<template v-else>
			<!-- Header -->
			<div class="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
				<div class="flex items-center justify-between">
					<div>
						<h1 class="text-base font-bold text-gray-900">{{ __('Takeaway Order') }}</h1>
						<p v-if="!needsAccount && guestStore.account" class="text-xs text-gray-500">
							{{ guestStore.account.customer_name }}
						</p>
					</div>
					<button
						v-if="!needsAccount && activeTab !== 'cart'"
						@click="activeTab = 'cart'"
						class="relative p-2"
					>
						<svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
						</svg>
						<span
							v-if="guestStore.cartItemCount > 0"
							class="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
						>
							{{ guestStore.cartItemCount > 9 ? '9+' : guestStore.cartItemCount }}
						</span>
					</button>
				</div>
			</div>

			<!-- //// Neoffice — the account step of a takeaway order is the sign-in of the QR page (a code mailed to the address, the name of a new account), the
			     //// frappe fork's engine's one (neoffice-maintenance#2192, #2132). It used to be a form that asked for a name, an address and a phone and kept them
			     //// nowhere: `confirmAccount` only turned the step to "done". Skipped where no code can be mailed (the server then proposes no account). -->
			<div v-if="needsAccount" class="flex-1 overflow-y-auto p-4">
				<div class="max-w-sm mx-auto mt-4">
					<GuestAccountSheet embedded />
				</div>
			</div>

			<!-- Ordering interface (after account step) -->
			<template v-else>
				<div class="flex-1 overflow-hidden">
					<GuestMenuView v-show="activeTab === 'menu'" />
					<GuestCart
						v-show="activeTab === 'cart'"
						:hide-send-order="true"
						@order-sent="handleOrderSent"
					/>
					<!-- Checkout with payment-before-order enforced -->
					<GuestCheckout
						v-show="activeTab === 'pay'"
						@order-confirmed="handleOrderConfirmed"
					/>
				</div>

				<!-- Bottom Navigation -->
				<div class="bg-white border-t border-gray-200 flex-shrink-0 safe-area-bottom">
					<div class="flex">
						<button
							@click="activeTab = 'menu'"
							:class="[
								'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
								activeTab === 'menu' ? 'text-blue-600' : 'text-gray-500',
							]"
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
							</svg>
							{{ __('Menu') }}
						</button>
						<button
							@click="activeTab = 'cart'"
							:class="[
								'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
								activeTab === 'cart' ? 'text-blue-600' : 'text-gray-500',
							]"
						>
							<div class="relative">
								<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>
								</svg>
								<span
									v-if="guestStore.cartItemCount > 0"
									class="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
								>
									{{ guestStore.cartItemCount > 9 ? '9+' : guestStore.cartItemCount }}
								</span>
							</div>
							{{ __('Cart') }}
						</button>
						<button
							@click="goToPay"
							:class="[
								'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
								activeTab === 'pay' ? 'text-blue-600' : 'text-gray-500',
							]"
						>
							<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
							</svg>
							{{ __('Pay & Order') }}
						</button>
					</div>
				</div>
			</template>
		</template>
	</div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"
import { useTabTitle } from "@/composables/useTabTitle"
import GuestMenuView from "@/components/guest/GuestMenuView.vue"
import GuestCart from "@/components/guest/GuestCart.vue"
import GuestCheckout from "@/components/guest/GuestCheckout.vue"
import GuestAccountSheet from "@/components/guest/GuestAccountSheet.vue"

const guestStore = useGuestOrderStore()
// The tab says the restaurant's name, in place of "Order", as the session names it from its first call (utils/tabTitle.js)
useTabTitle(() => guestStore.restaurantName, { instead: true })

const isInitializing = ref(true)
const initError = ref(null)
const orderSuccess = ref(false)
const orderNumber = ref(null)

// The order waits for an account: the server says so for a takeaway session (mode "Mandatory") unless no code can be mailed here
const needsAccount = computed(() => guestStore.canSignIn && !guestStore.account)

const activeTab = ref("menu")

// //// Neoffice — the session of a takeaway order outlives a page load: the payment page sends the customer back here, and a new token would have lost
// //// the order, the account and the payment (neoffice-maintenance#2132). The token is kept for the tab, and dropped when the order is done.
const TOKEN_KEY = "pos_next_takeaway_token"

function keptToken() {
	try {
		return window.sessionStorage.getItem(TOKEN_KEY)
	} catch {
		return null
	}
}

function keepToken(value) {
	try {
		if (value) window.sessionStorage.setItem(TOKEN_KEY, value)
		else window.sessionStorage.removeItem(TOKEN_KEY)
	} catch {
		// a browser that keeps nothing: the order then lives for this page only
	}
}

async function newTakeawayToken() {
	// Create a takeaway token (no table needed)
	const response = await fetch("/api/method/pos_next.api.guest_ordering.create_takeaway_token", {
		method: "POST",
		credentials: "omit",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	const data = await response.json()
	const token = data.message?.token
	if (!token) throw new Error("No token returned")
	return token
}

async function initTakeaway() {
	isInitializing.value = true
	initError.value = null
	try {
		const kept = keptToken()
		let token = kept
		if (kept) {
			try {
				await guestStore.validateToken(kept)
			} catch {
				token = null
				keepToken(null)
			}
		}
		if (!token) {
			token = await newTakeawayToken()
			keepToken(token)
			await guestStore.validateToken(token)
		}
		await guestStore.fetchMenu()
		await guestStore.refreshOrderStatus()
	} catch (err) {
		initError.value = err.message || __("Failed to load takeaway menu")
	} finally {
		isInitializing.value = false
	}
}

// //// Neoffice — "Pay & Order" first sends the cart, which makes the order (held at the kitchen, priced by the menu on the server): a payment needs an
// //// order to pay, and a takeaway session had none before it (neoffice-maintenance#2132)
async function goToPay() {
	if (guestStore.cartItemCount === 0 && !(guestStore.orderTotal > 0)) return
	if (guestStore.cartItemCount > 0) {
		try {
			await guestStore.submitOrder()
		} catch {
			// the store carries what the server said; the page stays on the cart
			return
		}
	}
	activeTab.value = "pay"
}

function handleOrderSent() {
	activeTab.value = "pay"
}

function handleOrderConfirmed(num) {
	orderNumber.value = num
	orderSuccess.value = true
	keepToken(null)
	guestStore.reset()
}

onMounted(initTakeaway)
onUnmounted(() => guestStore.reset())
</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
