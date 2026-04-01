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
						{{ guestStore.isFullyPaid ? __('Thank you!') : __('Payment received') }}
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
						@click="dismissPaymentDialog"
						class="mt-5 w-full py-3 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 transition-colors"
					>{{ __('OK') }}</button>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto">
				<!-- Fully Paid — receipt with TVA -->
				<div v-if="guestStore.isFullyPaid" class="flex flex-col items-center p-6">
					<div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-3">
						<svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
						</svg>
					</div>
					<p class="text-lg font-bold text-green-700">{{ __('Payment complete') }}</p>
					<p class="text-sm text-gray-500 mt-1 mb-5">{{ __('Thank you for your visit, we hope to see you again soon!') }}</p>

					<!-- Receipt card -->
					<div class="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-5">
						<!-- Company + date -->
						<div class="text-center mb-3 pb-3 border-b border-dashed border-gray-200">
							<p v-if="guestStore.companyName" class="text-sm font-bold text-gray-900">{{ guestStore.companyName }}</p>
							<p class="text-[10px] text-gray-400 mt-0.5">{{ guestStore.invoiceName }} — {{ formatDate(guestStore.postingDate) }}</p>
						</div>

						<!-- Items -->
						<div class="space-y-1.5">
							<div v-for="(oItem, idx) in orderItems" :key="idx"
								class="flex items-center justify-between text-sm">
								<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
								<span class="flex items-center gap-1.5">
									<span v-if="oItem.discount_percentage > 0" class="text-gray-400 line-through text-xs">{{ formatPrice(oItem.qty * oItem.price_list_rate) }}</span>
									<span class="text-gray-500">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
								</span>
							</div>
						</div>

						<!-- Subtotal + TVA + Total -->
						<div class="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-1">
							<div v-if="guestStore.taxAmount > 0" class="flex items-center justify-between text-sm text-gray-500">
								<span>{{ __('Subtotal') }}</span>
								<span>{{ formatPrice(guestStore.orderTotal - guestStore.taxAmount) }}</span>
							</div>
							<div v-if="guestStore.taxAmount > 0" class="flex items-center justify-between text-sm text-gray-500">
								<span>{{ __('TVA') }}</span>
								<span>{{ formatPrice(guestStore.taxAmount) }}</span>
							</div>
							<div class="flex items-center justify-between pt-1">
								<span class="text-sm font-bold text-gray-900">{{ __('Total') }}</span>
								<span class="text-lg font-bold text-green-700">{{ formatPrice(guestStore.orderTotal) }}</span>
							</div>
						</div>
					</div>

					<!-- Download receipt -->
					<button
						@click="downloadReceipt"
						class="mt-4 flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors text-sm"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
						</svg>
						{{ __('Download receipt') }}
					</button>
				</div>

				<!-- Not fully paid — show order summary + payment section -->
				<template v-else>
				<!-- Payment progress (when partially paid) -->
				<div v-if="guestStore.paidAmount > 0" class="bg-green-50 border-b border-green-200 p-4">
					<div class="flex justify-between items-center mb-2">
						<span class="text-sm font-semibold text-green-800">{{ __('Already paid') }}</span>
						<span class="text-sm font-bold text-green-700">{{ formatPrice(guestStore.paidAmount) }}</span>
					</div>
					<div class="w-full bg-green-200 rounded-full h-2 mb-2">
						<div class="bg-green-600 h-2 rounded-full transition-all" :style="{ width: Math.min(100, (guestStore.paidAmount / guestStore.orderTotal) * 100) + '%' }"></div>
					</div>
					<div class="flex justify-between text-xs text-gray-600">
						<span>{{ __('Remaining: {0}', [formatPrice(guestStore.remainingAmount)]) }}</span>
						<span>{{ __('Total: {0}', [formatPrice(guestStore.orderTotal)]) }}</span>
					</div>
				</div>

				<!-- Order Summary -->
				<div class="bg-white border-b border-gray-200 p-4">
					<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Order Summary') }}</h3>
					<div class="space-y-1">
						<div v-for="(oItem, idx) in orderItems" :key="idx"
							class="flex items-center justify-between text-sm">
							<div class="flex items-center gap-1.5">
								<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
								<span v-if="oItem.discount_percentage > 0" class="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">-{{ oItem.discount_percentage }}%</span>
							</div>
							<span class="flex items-center gap-1.5">
								<span v-if="oItem.discount_percentage > 0" class="text-gray-400 line-through text-xs">{{ formatPrice(oItem.qty * oItem.price_list_rate) }}</span>
								<span class="text-gray-900 font-medium">{{ formatPrice(oItem.amount ?? oItem.qty * oItem.rate) }}</span>
							</span>
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
						<div v-if="guestStore.paidTipAmount > 0" class="mb-3 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
							<span class="text-xs font-medium text-green-700">{{ __('Tip already paid') }}</span>
							<span class="text-sm font-bold text-green-700">{{ formatPrice(guestStore.paidTipAmount) }}</span>
						</div>
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
									:max="orderRemaining"
									:placeholder="orderRemaining.toFixed(2)"
									class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
							</div>
						</div>
						<!-- Amount display -->
						<div class="flex items-center justify-between p-3 rounded-xl" :class="basePayment < orderRemaining ? 'bg-blue-50 border border-blue-200' : 'bg-green-50 border border-green-200'">
							<div>
								<span class="text-sm font-bold" :class="basePayment < orderRemaining ? 'text-blue-700' : 'text-green-700'">
									{{ formatPrice(payableAmount) }}
								</span>
								<span v-if="basePayment < orderRemaining" class="text-xs text-gray-500 ml-2">
									{{ __('of {0}', [formatPrice(orderRemaining)]) }}
								</span>
							</div>
							<span v-if="basePayment < orderRemaining" class="text-xs text-orange-600 font-medium">
								{{ __('Remaining: {0}', [formatPrice(orderRemaining - basePayment)]) }}
							</span>
						</div>
					</div>
				</template>
			</div>

			<!-- Footer (outside scroll) -->
			<div v-if="!guestStore.isFullyPaid" class="bg-white border-t border-gray-200 p-4 flex-shrink-0">
				<!-- Account creation CTA (collapsible) -->
				<div v-if="showAccountStep" class="mb-3">
					<!-- Collapsed: CTA button -->
					<button v-if="!showAccountForm && !isAccountMandatory"
						@click="showAccountForm = true"
						class="w-full flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm transition-colors active:bg-blue-100">
						<div class="flex items-center gap-2">
							<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
							</svg>
							<span class="text-blue-700 font-medium">
								{{ guestStore.settings?.has_loyalty_program
									? __('Create an account to earn loyalty points')
									: __('Create an account for next time') }}
							</span>
						</div>
						<svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
						</svg>
					</button>
					<!-- Expanded: form fields -->
					<div v-if="showAccountForm || isAccountMandatory" class="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
						<div class="flex items-center justify-between">
							<p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
								{{ isAccountMandatory ? __('Account (required)') : __('Account (optional)') }}
							</p>
							<button v-if="!isAccountMandatory" @click="showAccountForm = false; accountName = ''; accountEmail = ''; accountPhone = ''"
								class="text-gray-400 hover:text-gray-600">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
								</svg>
							</button>
						</div>
						<input v-model="accountName" type="text" :placeholder="__('Your name')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
						<input v-model="accountEmail" type="email" :placeholder="__('Email')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
						<input v-model="accountPhone" type="tel" :placeholder="__('Phone (optional)')"
							class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
					</div>
				</div>

				<!-- Error -->
				<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
					<p class="text-xs text-red-600">{{ guestStore.error }}</p>
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
const showAccountForm = ref(false)
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

// Remaining on the ORDER (tips are extras, they don't reduce the order remaining)
const orderRemaining = computed(() => guestStore.remainingAmount)

// Base payment amount (split of remaining, WITHOUT tip)
const basePayment = computed(() => {
	if (splitBy.value === -1) {
		const v = Number.parseFloat(customPayAmount.value)
		return Number.isNaN(v) ? orderRemaining.value : Math.min(Math.max(0, v), orderRemaining.value)
	}
	if (splitBy.value && splitBy.value > 1) {
		return Math.ceil((orderRemaining.value / splitBy.value) * 100) / 100
	}
	return orderRemaining.value
})

// Total to charge = base payment + tip
const payableAmount = computed(() => basePayment.value + tipAmount.value)

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

function dismissPaymentDialog() {
	showPaymentDialog.value = false
	paymentState.value = null
	clearTip()
	splitBy.value = null
	customPayAmount.value = ""
	guestStore.error = null
}

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

function formatDate(dateStr) {
	if (!dateStr) return ""
	try {
		const d = new Date(dateStr)
		return d.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" })
	} catch { return dateStr }
}

function downloadReceipt() {
	if (!guestStore.token) return
	const url = `/api/method/pos_next.api.guest_ordering.get_guest_receipt_pdf?token=${guestStore.token}`
	window.open(url, "_blank")
}

async function handlePay() {
	if (payableAmount.value <= 0) return
	paymentState.value = "pending"
	guestStore.error = null
	lastPaymentAmount.value = payableAmount.value

	try {
		const baseUrl = window.location.href.split("?")[0]
		const successUrl = `${baseUrl}?payment=success&amount=${payableAmount.value}&tip=${tipAmount.value || 0}`
		const failedUrl = `${baseUrl}?payment=failed`

		const result = await guestStore.createPayment(
			payableAmount.value, [], tipAmount.value, successUrl, failedUrl,
		)
		if (result?.payment_url) {
			// Redirect in same tab — Wallee will redirect back to success_url
			window.location.href = result.payment_url
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
onMounted(async () => {
	const params = new URLSearchParams(window.location.search)
	if (params.get("payment") === "success") {
		lastPaymentAmount.value = Number.parseFloat(params.get("amount")) || 0
		clearTip()
		// Confirm payment with backend (records the payment now that Wallee confirmed)
		await guestStore.confirmPayment(lastPaymentAmount.value, Number.parseFloat(params.get("tip")) || 0)
		paymentState.value = "success"
		showPaymentDialog.value = true
		window.history.replaceState({}, "", window.location.pathname)
	} else if (params.get("payment") === "failed") {
		paymentState.value = "failed"
		guestStore.error = __("Payment was cancelled or failed. Please try again.")
		window.history.replaceState({}, "", window.location.pathname)
	}
})
</script>
