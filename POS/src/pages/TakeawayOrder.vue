<template>
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
						<p v-if="accountStep === 'done'" class="text-xs text-gray-500">
							{{ accountName }}
						</p>
					</div>
					<button
						v-if="accountStep === 'done' && activeTab !== 'cart'"
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

			<!-- Account/Login Step (mandatory for takeaway) -->
			<div v-if="accountStep !== 'done'" class="flex-1 overflow-y-auto p-4">
				<div class="max-w-sm mx-auto mt-4">
					<div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
						<h2 class="text-lg font-bold text-gray-900 mb-1">{{ __('Your details') }}</h2>
						<p class="text-sm text-gray-500 mb-4">{{ __('Required to receive your order') }}</p>

						<div class="space-y-3">
							<div>
								<label class="block text-xs font-medium text-gray-700 mb-1">
									{{ __('Name') }} <span class="text-red-500">*</span>
								</label>
								<input
									v-model="accountName"
									type="text"
									:placeholder="__('Your name')"
									class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700 mb-1">
									{{ __('Email') }} <span class="text-red-500">*</span>
								</label>
								<input
									v-model="accountEmail"
									type="email"
									:placeholder="__('your@email.com')"
									class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700 mb-1">
									{{ __('Phone') }}
								</label>
								<input
									v-model="accountPhone"
									type="tel"
									:placeholder="__('Phone number (optional)')"
									class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
							</div>
						</div>

						<div v-if="accountError" class="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
							<p class="text-xs text-red-600">{{ accountError }}</p>
						</div>

						<button
							@click="confirmAccount"
							:disabled="!accountName.trim() || !accountEmail.trim()"
							class="w-full mt-4 py-3 bg-blue-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{{ __('Continue') }}
						</button>
					</div>
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
import { ref, onMounted, onUnmounted } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"
import GuestMenuView from "@/components/guest/GuestMenuView.vue"
import GuestCart from "@/components/guest/GuestCart.vue"
import GuestCheckout from "@/components/guest/GuestCheckout.vue"

const guestStore = useGuestOrderStore()

const isInitializing = ref(true)
const initError = ref(null)
const orderSuccess = ref(false)
const orderNumber = ref(null)

// Account step: 'form' | 'done'
const accountStep = ref("form")
const accountName = ref("")
const accountEmail = ref("")
const accountPhone = ref("")
const accountError = ref(null)

const activeTab = ref("menu")

async function initTakeaway() {
	isInitializing.value = true
	initError.value = null
	try {
		// Create a takeaway token (no table needed)
		const response = await fetch(
			"/api/method/pos_next.api.guest_ordering.create_takeaway_token",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Frappe-CSRF-Token": window.csrf_token || "",
				},
				body: JSON.stringify({}),
			},
		)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const data = await response.json()
		const token = data.message?.token
		if (!token) throw new Error("No token returned")

		await guestStore.validateToken(token)
		await guestStore.fetchMenu()
	} catch (err) {
		initError.value = err.message || __("Failed to load takeaway menu")
	} finally {
		isInitializing.value = false
	}
}

function confirmAccount() {
	accountError.value = null
	if (!accountName.value.trim() || !accountEmail.value.trim()) {
		accountError.value = __("Name and email are required")
		return
	}
	// Simple email validation
	const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	if (!emailRe.test(accountEmail.value)) {
		accountError.value = __("Please enter a valid email address")
		return
	}
	accountStep.value = "done"
}

function goToPay() {
	if (guestStore.cartItemCount === 0) return
	activeTab.value = "pay"
}

function handleOrderSent() {
	activeTab.value = "pay"
}

function handleOrderConfirmed(num) {
	orderNumber.value = num
	orderSuccess.value = true
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
