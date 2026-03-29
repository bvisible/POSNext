<template>
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- No Order Yet -->
		<div v-if="orderItems.length === 0 && !guestStore.isLoading" class="flex-1 flex flex-col items-center justify-center p-8 text-gray-400">
			<svg class="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
			</svg>
			<p class="text-base font-medium text-gray-500">{{ __('No order yet') }}</p>
			<p class="text-sm text-gray-400 mt-1">{{ __('Send your order first, then pay here') }}</p>
		</div>

		<!-- Checkout Content -->
		<template v-else>
			<!-- Order Summary -->
			<div class="bg-white border-b border-gray-200 p-4 flex-shrink-0">
				<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Order Summary') }}</h3>
				<div class="space-y-1">
					<div
						v-for="(oItem, idx) in orderItems"
						:key="idx"
						class="flex items-center justify-between text-sm"
					>
						<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
						<span class="text-gray-900 font-medium">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
					</div>
				</div>
				<div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
					<span class="text-sm font-semibold text-gray-900">{{ __('Subtotal') }}</span>
					<span class="text-base font-bold text-gray-900">{{ formatPrice(guestStore.orderTotal) }}</span>
				</div>
			</div>

			<!-- Fully Paid -->
			<div v-if="guestStore.isFullyPaid" class="flex-1 flex flex-col items-center justify-center p-8">
				<div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
					<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
					</svg>
				</div>
				<p class="text-xl font-bold text-green-700">{{ __('Payment complete') }}</p>
				<p class="text-sm text-gray-500 mt-1">{{ __('Thank you for your order!') }}</p>
			</div>

			<!-- Payment Section -->
			<template v-else>
				<!-- Tips -->
				<div class="bg-white border-b border-gray-200 p-4 flex-shrink-0">
					<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Tip') }}</h3>
					<div class="flex items-center gap-1.5 flex-wrap">
						<button
							v-for="pct in [5, 10, 15, 20]"
							:key="pct"
							@click="selectTipPercent(pct)"
							class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
							:class="tipPercent === pct
								? 'bg-emerald-600 text-white'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
						>{{ pct }}%</button>
						<button
							@click="showCustomTip = !showCustomTip; tipPercent = null"
							class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
							:class="showCustomTip && !tipPercent
								? 'bg-emerald-600 text-white'
								: 'bg-gray-100 text-gray-700 hover:bg-gray-200'"
						>{{ __('Other') }}</button>
						<button
							v-if="tipAmount > 0"
							@click="clearTip"
							class="px-2 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 ml-auto"
						>✕</button>
					</div>
					<!-- Custom tip input -->
					<div v-if="showCustomTip && !tipPercent" class="mt-2">
						<div class="relative">
							<span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-medium">{{ currencySymbol }}</span>
							<input
								v-model="customTipAmount"
								type="number"
								step="0.50"
								min="0"
								:placeholder="__('Tip amount')"
								class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
							/>
						</div>
					</div>
					<!-- Tip display -->
					<div v-if="tipAmount > 0" class="mt-2 flex items-center justify-between p-2 bg-emerald-50 rounded-lg">
						<span class="text-xs font-medium text-emerald-700">{{ __('Tip') }}</span>
						<span class="text-sm font-bold text-emerald-700">{{ formatPrice(tipAmount) }}</span>
					</div>
				</div>

				<!-- Total with tip -->
				<div class="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
					<div class="flex items-center justify-between">
						<span class="text-sm font-bold text-gray-900">{{ __('Total to pay') }}</span>
						<span class="text-lg font-bold text-blue-600">{{ formatPrice(totalWithTip) }}</span>
					</div>
					<!-- Paid / Remaining -->
					<div v-if="guestStore.paidAmount > 0" class="mt-1 space-y-0.5">
						<div class="flex items-center justify-between text-xs text-green-700">
							<span>{{ __('Paid') }}</span>
							<span>{{ formatPrice(guestStore.paidAmount) }}</span>
						</div>
						<div class="flex items-center justify-between text-xs text-orange-600 font-semibold">
							<span>{{ __('Remaining') }}</span>
							<span>{{ formatPrice(remainingWithTip) }}</span>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="flex-1 flex flex-col justify-end">
					<div class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
						<!-- Account creation step (optional/mandatory) -->
						<div
							v-if="showAccountStep"
							class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2"
						>
							<p class="text-sm font-semibold text-gray-700">
								{{ isAccountMandatory ? __('Create an account (required)') : __('Create an account (optional)') }}
							</p>
							<input v-model="accountName" type="text" :placeholder="__('Your name')"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
							<input v-model="accountEmail" type="email" :placeholder="__('Email')"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
							<input v-model="accountPhone" type="tel" :placeholder="__('Phone (optional)')"
								class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
						</div>

						<!-- Error display -->
						<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
							<p class="text-xs text-red-600">{{ guestStore.error }}</p>
						</div>

						<!-- Payment status -->
						<div v-if="paymentState === 'pending'" class="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2">
							<svg class="w-4 h-4 text-yellow-600 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
							</svg>
							<p class="text-sm text-yellow-700">{{ __('Payment page opened in a new tab. Complete payment there.') }}</p>
						</div>

						<div v-if="paymentState === 'success'" class="mb-3 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
							<svg class="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
							</svg>
							<p class="text-sm text-green-700">{{ __('Payment received!') }}</p>
						</div>

						<!-- Pay button -->
						<button
							@click="handlePay"
							:disabled="guestStore.isLoading || totalWithTip === 0 || !isAccountValid || paymentState === 'pending'"
							class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
						>
							<svg v-if="guestStore.isLoading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
							</svg>
							<span>{{ __('Pay {0}', [formatPrice(totalWithTip)]) }}</span>
						</button>
					</div>
				</div>
			</template>
		</template>
	</div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const emit = defineEmits(["order-confirmed"])

const guestStore = useGuestOrderStore()

const paymentState = ref(null) // null | 'pending' | 'success' | 'failed'

// Account creation fields
const accountName = ref("")
const accountEmail = ref("")
const accountPhone = ref("")

// Tip state
const tipPercent = ref(null)
const customTipAmount = ref("")
const showCustomTip = ref(false)

const orderItems = computed(() => guestStore.orderItems)

const isAccountMandatory = computed(() => {
	return guestStore.settings?.guest_account_mode === "Mandatory"
})

const showAccountStep = computed(() => {
	const mode = guestStore.settings?.guest_account_mode
	return mode === "Optional" || mode === "Mandatory"
})

const isAccountValid = computed(() => {
	if (!isAccountMandatory.value) return true
	return accountName.value.trim() && accountEmail.value.trim()
})

const currencySymbol = computed(() => {
	try {
		return (
			new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: guestStore.currency || "CHF",
			})
				.formatToParts(0)
				.find((p) => p.type === "currency")?.value ?? "CHF"
		)
	} catch {
		return "CHF"
	}
})

// Tip calculation
const tipAmount = computed(() => {
	if (tipPercent.value) {
		return Math.round(guestStore.orderTotal * tipPercent.value) / 100
	}
	const custom = Number.parseFloat(customTipAmount.value)
	return Number.isNaN(custom) || custom < 0 ? 0 : custom
})

const totalWithTip = computed(() => {
	return guestStore.orderTotal + tipAmount.value
})

const remainingWithTip = computed(() => {
	return Math.max(0, totalWithTip.value - guestStore.paidAmount)
})

function selectTipPercent(pct) {
	if (tipPercent.value === pct) {
		tipPercent.value = null
	} else {
		tipPercent.value = pct
		showCustomTip.value = false
		customTipAmount.value = ""
	}
}

function clearTip() {
	tipPercent.value = null
	customTipAmount.value = ""
	showCustomTip.value = false
}

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

async function handlePay() {
	if (totalWithTip.value <= 0) return
	paymentState.value = "pending"

	try {
		// Build success/failed URLs
		const baseUrl = window.location.href.split("?")[0]
		const successUrl = `${baseUrl}?payment=success`
		const failedUrl = `${baseUrl}?payment=failed`

		const result = await guestStore.createPayment(
			totalWithTip.value,
			[],
			tipAmount.value,
			successUrl,
			failedUrl,
		)
		if (result?.payment_url) {
			// Open Wallee in a new tab
			window.open(result.payment_url, "_blank")
			// Start polling to detect when payment completes
			startPaymentPolling()
		} else if (result?.success) {
			paymentState.value = "success"
			await guestStore.refreshOrderStatus()
			emit("order-confirmed", result.invoice || "")
		}
	} catch {
		paymentState.value = "failed"
	}
}

// Poll order status every 5s while Wallee tab is open
let _pollInterval = null

function startPaymentPolling() {
	stopPaymentPolling()
	_pollInterval = setInterval(async () => {
		await guestStore.refreshOrderStatus()
		if (guestStore.isFullyPaid || guestStore.paidAmount > 0) {
			stopPaymentPolling()
			paymentState.value = "success"
			emit("order-confirmed", "")
		}
	}, 5000)
}

function stopPaymentPolling() {
	if (_pollInterval) {
		clearInterval(_pollInterval)
		_pollInterval = null
	}
}

// Check URL params on mount for payment callback
onMounted(() => {
	const params = new URLSearchParams(window.location.search)
	if (params.get("payment") === "success") {
		paymentState.value = "success"
		guestStore.refreshOrderStatus()
		// Clean URL
		window.history.replaceState({}, "", window.location.pathname)
	} else if (params.get("payment") === "failed") {
		paymentState.value = "failed"
		guestStore.error = __("Payment was cancelled or failed. Please try again.")
		window.history.replaceState({}, "", window.location.pathname)
	}
})
</script>
