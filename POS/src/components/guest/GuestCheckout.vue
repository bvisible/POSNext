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
			<!-- Payment Success Dialog -->
			<div v-if="showPaymentDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
				<div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
					<div class="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
						:class="guestStore.isFullyPaid ? 'bg-green-100' : 'bg-blue-100'">
						<svg class="w-9 h-9" :class="guestStore.isFullyPaid ? 'text-green-600' : 'text-blue-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
						</svg>
					</div>
					<h3 class="text-lg font-bold text-gray-900 mb-2">
						{{ isFullySettled ? __('Thank you!') : __('Payment received') }}
					</h3>
					<p class="text-sm text-gray-600 mb-1">
						{{ __('Your payment of {0} has been recorded.', [formatPrice(lastPaymentAmount)]) }}
					</p>
					<p v-if="guestStore.isFullyPaid" class="text-sm text-green-600 font-medium mt-2">
						{{ __('Thank you for your visit, we hope to see you again soon!') }}
					</p>
					<p v-else class="text-sm text-orange-600 font-medium mt-2">
						{{ __('Remaining to pay on this table: {0}', [formatPrice(guestStore.remainingAmount)]) }}
					</p>
					<button
						@click="showPaymentDialog = false"
						class="mt-5 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors"
					>{{ __('OK') }}</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				<!-- Fully Paid — show thank you, no order summary -->
				<div v-if="guestStore.isFullyPaid" class="flex-1 flex flex-col items-center justify-center p-8">
					<div class="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
						<svg class="w-9 h-9 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
						</svg>
					</div>
					<p class="text-xl font-bold text-green-700">{{ __('Payment complete') }}</p>
					<p class="text-sm text-gray-500 mt-1">{{ __('Thank you for your visit, we hope to see you again soon!') }}</p>
				</div>

				<!-- Not fully paid — show order summary + payment section -->
				<template v-else>
				<!-- Order Summary -->
				<div class="bg-white border-b border-gray-200 p-4">
					<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Order Summary') }}</h3>
					<div class="space-y-1">
						<div v-for="(oItem, idx) in orderItems" :key="idx"
							class="flex items-center justify-between text-sm">
							<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
							<span class="text-gray-900 font-medium">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
						</div>
					</div>
					<div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
						<span class="text-sm font-semibold text-gray-900">{{ __('Subtotal') }}</span>
						<span class="text-base font-bold text-gray-900">{{ formatPrice(guestStore.orderTotal) }}</span>
					</div>
				</div>
					<!-- Tips -->
					<div class="bg-white border-b border-gray-200 p-4">
						<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Tip') }}</h3>
						<div class="flex items-center gap-1.5 flex-wrap">
							<button
								v-for="pct in [5, 10, 15, 20]"
								:key="pct"
								@click="selectTipPercent(pct)"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:style="tipPercent === pct
									? 'background-color: #059669; color: white; border-color: #059669;'
									: 'background-color: #f3f4f6; color: #374151; border-color: #e5e7eb;'"
							>{{ pct }}%</button>
							<button
								@click="showCustomTip = !showCustomTip; tipPercent = null"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:style="showCustomTip && !tipPercent
									? 'background-color: #059669; color: white; border-color: #059669;'
									: 'background-color: #f3f4f6; color: #374151; border-color: #e5e7eb;'"
							>{{ __('Other') }}</button>
							<button
								v-if="tipAmount > 0"
								@click="clearTip"
								class="px-2 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border-2 border-red-200 ml-auto"
							>✕</button>
						</div>
						<div v-if="showCustomTip && !tipPercent" class="mt-2">
							<div class="relative">
								<span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-medium">{{ currencySymbol }}</span>
								<input v-model="customTipAmount" type="number" step="0.50" min="0"
									:placeholder="__('Tip amount')"
									class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
							</div>
						</div>
						<div v-if="tipAmount > 0" class="mt-2 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
							<span class="text-xs font-medium text-green-700">{{ __('Tip') }}</span>
							<span class="text-sm font-bold text-green-700">+ {{ formatPrice(tipAmount) }}</span>
						</div>
					</div>

					<!-- Amount to pay (split / partial) -->
					<div class="bg-white border-b border-gray-200 p-4">
						<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Amount to pay') }}</h3>
						<!-- Quick split buttons -->
						<div class="flex items-center gap-1.5 mb-3">
							<button
								@click="splitBy = null; customPayAmount = ''"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:style="!splitBy
									? 'background-color: #2563eb; color: white; border-color: #2563eb;'
									: 'background-color: #f3f4f6; color: #374151; border-color: #e5e7eb;'"
							>{{ __('Full') }}</button>
							<button
								v-for="n in [2, 3, 4]"
								:key="n"
								@click="splitBy = n; customPayAmount = ''"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:style="splitBy === n
									? 'background-color: #2563eb; color: white; border-color: #2563eb;'
									: 'background-color: #f3f4f6; color: #374151; border-color: #e5e7eb;'"
							>÷{{ n }}</button>
							<button
								@click="splitBy = -1"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:style="splitBy === -1
									? 'background-color: #2563eb; color: white; border-color: #2563eb;'
									: 'background-color: #f3f4f6; color: #374151; border-color: #e5e7eb;'"
							>{{ __('Custom') }}</button>
						</div>
						<!-- Custom amount input -->
						<div v-if="splitBy === -1" class="mb-3">
							<div class="relative">
								<span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-medium">{{ currencySymbol }}</span>
								<input v-model="customPayAmount" type="number" step="0.01" min="0"
									:max="remainingWithTip"
									:placeholder="remainingWithTip.toFixed(2)"
									class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
							</div>
						</div>
						<!-- Amount display -->
						<div class="flex items-center justify-between p-3 rounded-xl" :class="payableAmount < totalWithTip ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'">
							<div>
								<span class="text-sm font-bold" :class="payableAmount < totalWithTip ? 'text-blue-700' : 'text-green-700'">
									{{ formatPrice(payableAmount) }}
								</span>
								<span v-if="payableAmount < totalWithTip" class="text-xs text-gray-500 ml-2">
									{{ __('of {0}', [formatPrice(totalWithTip)]) }}
								</span>
							</div>
							<span v-if="payableAmount < totalWithTip" class="text-xs text-orange-600 font-medium">
								{{ __('Remaining: {0}', [formatPrice(totalWithTip - payableAmount)]) }}
							</span>
						</div>
						<!-- Already paid info -->
						<div v-if="guestStore.paidAmount > 0" class="mt-2 flex items-center justify-between text-xs">
							<span class="text-green-700">{{ __('Already paid') }}: {{ formatPrice(guestStore.paidAmount) }}</span>
							<span class="text-orange-600 font-semibold">{{ __('Remaining') }}: {{ formatPrice(remainingWithTip) }}</span>
						</div>
					</div>
				</template>
			</div>

			<!-- Footer (outside scroll) -->
			<div v-if="!guestStore.isFullyPaid" class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
				<!-- Account creation -->
				<div v-if="showAccountStep" class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
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

				<!-- Error -->
				<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
					<p class="text-xs text-red-600">{{ guestStore.error }}</p>
				</div>

				<!-- Payment status -->
				<div v-if="paymentState === 'pending'" class="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl flex items-center gap-2">
					<svg class="w-4 h-4 text-yellow-600 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
					</svg>
					<p class="text-sm text-yellow-700">{{ __('Payment page opened. Complete payment in the new tab.') }}</p>
				</div>

				<!-- Pay button -->
				<button
					@click="handlePay"
					:disabled="guestStore.isLoading || payableAmount === 0 || !isAccountValid || paymentState === 'pending'"
					class="w-full py-3.5 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					<svg v-if="guestStore.isLoading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
					</svg>
					<span>{{ __('Pay {0}', [formatPrice(payableAmount)]) }}</span>
				</button>
			</div>
		</template>
	</div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const emit = defineEmits(["order-confirmed"])
const guestStore = useGuestOrderStore()

const paymentState = ref(null)
const showPaymentDialog = ref(false)
const lastPaymentAmount = ref(0)

// Account fields
const accountName = ref("")
const accountEmail = ref("")
const accountPhone = ref("")

// Tip state
const tipPercent = ref(null)
const customTipAmount = ref("")
const showCustomTip = ref(false)

// Split payment state
const splitBy = ref(null) // null=full, 2/3/4=divide, -1=custom
const customPayAmount = ref("")

const orderItems = computed(() => guestStore.orderItems)

const isAccountMandatory = computed(() => guestStore.settings?.guest_account_mode === "Mandatory")
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
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: guestStore.currency || "CHF",
		}).formatToParts(0).find((p) => p.type === "currency")?.value ?? "CHF"
	} catch { return "CHF" }
})

// Tip calculation
const tipAmount = computed(() => {
	if (tipPercent.value) {
		return Math.round(guestStore.orderTotal * tipPercent.value) / 100
	}
	const custom = Number.parseFloat(customTipAmount.value)
	return Number.isNaN(custom) || custom < 0 ? 0 : custom
})

const totalWithTip = computed(() => guestStore.orderTotal + tipAmount.value)

const remainingWithTip = computed(() => Math.max(0, totalWithTip.value - guestStore.paidAmount))

const isFullySettled = computed(() => guestStore.paidAmount >= totalWithTip.value && totalWithTip.value > 0)

// Payable amount based on split
const payableAmount = computed(() => {
	if (splitBy.value === -1) {
		const v = Number.parseFloat(customPayAmount.value)
		return Number.isNaN(v) ? remainingWithTip.value : Math.min(Math.max(0, v), remainingWithTip.value)
	}
	if (splitBy.value && splitBy.value > 1) {
		return Math.ceil((remainingWithTip.value / splitBy.value) * 100) / 100
	}
	return remainingWithTip.value
})

function selectTipPercent(pct) {
	tipPercent.value = tipPercent.value === pct ? null : pct
	showCustomTip.value = false
	customTipAmount.value = ""
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
	if (payableAmount.value <= 0) return
	paymentState.value = "pending"
	lastPaymentAmount.value = payableAmount.value

	try {
		const baseUrl = window.location.href.split("?")[0]
		const successUrl = `${baseUrl}?payment=success&amount=${payableAmount.value}`
		const failedUrl = `${baseUrl}?payment=failed`

		const result = await guestStore.createPayment(
			payableAmount.value, [], tipAmount.value, successUrl, failedUrl,
		)
		if (result?.payment_url) {
			window.open(result.payment_url, "_blank")
			startPaymentPolling()
		} else if (result?.success) {
			paymentState.value = "success"
			await guestStore.refreshOrderStatus()
			showPaymentDialog.value = true
			emit("order-confirmed", result.invoice || "")
		}
	} catch {
		paymentState.value = "failed"
	}
}

let _pollInterval = null
function startPaymentPolling() {
	stopPaymentPolling()
	_pollInterval = setInterval(async () => {
		await guestStore.refreshOrderStatus()
		if (guestStore.paidAmount > 0) {
			stopPaymentPolling()
			paymentState.value = "success"
			clearTip()
			showPaymentDialog.value = true
			emit("order-confirmed", "")
		}
	}, 5000)
}
function stopPaymentPolling() {
	if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null }
}

// Check URL params on mount for payment callback
onMounted(() => {
	const params = new URLSearchParams(window.location.search)
	if (params.get("payment") === "success") {
		paymentState.value = "success"
		lastPaymentAmount.value = Number.parseFloat(params.get("amount")) || 0
		clearTip()
		guestStore.refreshOrderStatus().then(() => {
			showPaymentDialog.value = true
		})
		window.history.replaceState({}, "", window.location.pathname)
	} else if (params.get("payment") === "failed") {
		paymentState.value = "failed"
		guestStore.error = __("Payment was cancelled or failed. Please try again.")
		window.history.replaceState({}, "", window.location.pathname)
	}
})
</script>
