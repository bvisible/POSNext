<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The diner pays from their own phone: -->
	<!-- //// tip selection, split payment (free amount or per-item), Wallee redirect, receipt -->
	<!-- //// with VAT and PDF download. Upstream POSNext only knows the cashier-side payment -->
	<!-- //// dialog. (3939a848, 2026-03-28 "QR self-ordering and takeaway web ordering"; bb9d0c56 -->
	<!-- //// tips + Wallee redirect, 03ec3d48 split payment, 02f74451 defers recording the -->
	<!-- //// payment until Wallee confirms so nothing reads as Paid too early, 6963d8cf redirects -->
	<!-- //// in the same tab to keep the session cookie, 2a0b109b updates the existing payment -->
	<!-- //// row instead of duplicating it, 823304dd applies pricing rules and fixes -->
	<!-- //// paid_amount.) -->
	<div class="flex flex-col h-full bg-gray-50 overflow-hidden">
		<!-- //// Neoffice — the page says what it is doing while a payment is on its way (product owner, 06.11.2026: « la page se rafraîchit avant que le paiement soit passé et on croit
		     //// que le paiement n'a pas passé »). Back from the payment page the guest met the order as unpaid, with the Pay button live, for the seconds the provider takes to settle
		     //// (23 s measured on a real card payment, the provider's word being the only thing that books it: no webhook reaches the site), and nothing said why. A veil over the page,
		     //// from the first paint of the return until the provider has answered, and a veil too between the tap on Pay and the provider's page. -->
		<div
			v-if="checkingPayment || paymentState === 'pending'"
			data-test="payment-wait"
			role="status"
			aria-live="polite"
			class="fixed inset-0 z-[60] flex items-center justify-center bg-gray-50/95 p-6"
		>
			<div class="w-full max-w-xs text-center">
				<svg class="w-10 h-10 text-gray-900 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
				</svg>
				<h3 class="text-lg font-bold text-gray-900">
					{{ checkingPayment ? __('Checking your payment...') : __('Opening the secure payment page...') }}
				</h3>
				<p class="text-sm text-gray-600 mt-2">
					{{ checkingPayment
						? __('This can take up to a minute. Please keep this page open and do not pay again.')
						: __('Please wait and keep this page open.') }}
				</p>
			</div>
		</div>

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
						:class="guestStore.isFullyPaid ? 'bg-green-100' : 'bg-gray-100'">
						<svg class="w-9 h-9" :class="guestStore.isFullyPaid ? 'text-green-600' : 'text-gray-900'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
						class="mt-5 w-full py-3 bg-gray-900 dark:bg-[#f3f3f3] dark:text-[#171717] text-white font-semibold rounded-xl active:bg-gray-800 transition-colors"
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
					<p class="text-lg font-bold text-green-700 dark:text-green-200">{{ __('Payment complete') }}</p>
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
								data-test="guest-receipt-line"
								class="flex items-center justify-between text-sm">
								<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
								<!-- An offered line (NeoResto lot 1, task 24) reads « Offert », in the guest's language -->
								<span v-if="oItem.posa_is_offered" class="font-semibold text-[#137949] dark:text-[#86E0A8]">{{ oItem.offered_label }}</span>
								<span v-else class="flex items-center gap-1.5">
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
								<span class="text-lg font-bold text-green-700 dark:text-green-200">{{ formatPrice(guestStore.orderTotal) }}</span>
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
						<span class="text-sm font-semibold text-green-800 dark:text-green-200">{{ __('Already paid') }}</span>
						<span class="text-sm font-bold text-green-700 dark:text-green-200">{{ formatPrice(guestStore.paidAmount) }}</span>
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
							data-test="guest-bill-line"
							class="flex items-center justify-between text-sm">
							<div class="flex items-center gap-1.5">
								<span class="text-gray-700">{{ oItem.qty }}× {{ oItem.item_name }}</span>
								<span v-if="oItem.discount_percentage > 0 && !oItem.posa_is_offered" class="text-[10px] font-semibold text-green-700 dark:text-green-200 bg-green-100 px-1.5 py-0.5 rounded">-{{ oItem.discount_percentage }}%</span>
							</div>
							<!-- An offered line (NeoResto lot 1, task 24) reads « Offert », read only, in the guest's language -->
							<span v-if="oItem.posa_is_offered" class="font-semibold text-[#137949] dark:text-[#86E0A8]">{{ oItem.offered_label }}</span>
							<span v-else class="flex items-center gap-1.5">
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
					<!-- //// Neoffice — a takeaway order is paid whole, with no tip: nobody served it, and the server says what it owes (neoffice-maintenance#2132) -->
					<!-- Tips -->
					<div v-if="!guestStore.isTakeaway" class="bg-white border-b border-gray-200 p-4">
						<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Tip') }}</h3>
						<div v-if="guestStore.paidTipAmount > 0" class="mb-3 flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg">
							<span class="text-xs font-medium text-green-700 dark:text-green-200">{{ __('Tip already paid') }}</span>
							<span class="text-sm font-bold text-green-700 dark:text-green-200">{{ formatPrice(guestStore.paidTipAmount) }}</span>
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
							<span class="text-xs font-medium text-green-700 dark:text-green-200">{{ __('Tip') }}</span>
							<span class="text-sm font-bold text-green-700 dark:text-green-200">+ {{ formatPrice(tipAmount) }}</span>
						</div>
					</div>

					<!-- Amount to pay (split / partial) -->
					<div v-if="!guestStore.isTakeaway" class="bg-white border-b border-gray-200 p-4">
						<h3 class="text-sm font-semibold text-gray-700 mb-2">{{ __('Amount to pay') }}</h3>
						<!-- Quick split buttons -->
						<div class="flex items-center gap-1.5 mb-3">
							<button
								@click="splitBy = null; customPayAmount = ''"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:class="!splitBy ? SPLIT_CHOSEN : SPLIT_OTHER"
							>{{ __('Full') }}</button>
							<button
								v-for="n in [2, 3, 4]"
								:key="n"
								@click="splitBy = n; customPayAmount = ''"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:class="splitBy === n ? SPLIT_CHOSEN : SPLIT_OTHER"
							>÷{{ n }}</button>
							<button
								@click="splitBy = -1"
								class="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all"
								:class="splitBy === -1 ? SPLIT_CHOSEN : SPLIT_OTHER"
							>{{ __('Custom') }}</button>
						</div>
						<!-- Custom amount input -->
						<div v-if="splitBy === -1" class="mb-3">
							<div class="relative">
								<span class="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-medium">{{ currencySymbol }}</span>
								<input v-model="customPayAmount" type="number" step="0.01" min="0"
									:max="orderRemaining"
									:placeholder="orderRemaining.toFixed(2)"
									class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 focus:border-transparent" />
							</div>
						</div>
						<!-- Amount display -->
						<div class="flex items-center justify-between p-3 rounded-xl" :class="basePayment < orderRemaining ? 'bg-gray-100 border border-gray-200' : 'bg-green-50 border border-green-200'">
							<div>
								<span class="text-sm font-bold" :class="basePayment < orderRemaining ? 'text-gray-900' : 'text-green-700 dark:text-green-200'">
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
				<!-- //// Neoffice — the sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026) replaces the form that collected a name, an address and a phone and kept them nowhere: the sheet of the page proves the address with a code -->
				<div v-if="guestStore.canSignIn && !guestStore.account" class="mb-3">
					<button
						class="w-full flex items-center justify-between px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm transition-colors active:bg-gray-100"
						data-test="checkout-sign-in"
						@click="emit('sign-in')"
					>
						<span class="text-gray-900 font-medium">
							{{ guestStore.mustSignIn
								? __('Sign in to pay')
								: guestStore.settings?.has_loyalty_program
									? __('Sign in to earn loyalty points')
									: __('Sign in for next time') }}
						</span>
						<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
						</svg>
					</button>
				</div>

				<!-- //// Neoffice — a payment the provider has not settled after a minute is not a failed one: the guest is told so, and asks again without reloading (a reload without the
				     //// return's address would have found nothing to check) -->
				<div v-if="paymentUnconfirmed" data-test="payment-unconfirmed" class="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
					<p class="text-sm font-semibold text-amber-900">{{ __('Your payment is not confirmed yet.') }}</p>
					<p class="text-xs text-amber-800 mt-1">
						{{ __('If you have paid, nothing is lost: it is recorded as soon as your bank answers. Please do not pay again.') }}
					</p>
					<button
						type="button"
						data-test="payment-check-again"
						class="mt-2 px-4 py-2 bg-gray-900 dark:bg-[#f3f3f3] dark:text-[#171717] text-white text-sm font-semibold rounded-lg active:bg-gray-800"
						@click="checkPaymentAgain"
					>{{ __('Check again') }}</button>
				</div>

				<!-- Error -->
				<div v-if="guestStore.error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
					<p class="text-xs text-red-600">{{ guestStore.error }}</p>
				</div>

				<!-- Pay button -->
				<button
					@click="handlePay"
					:disabled="guestStore.isLoading || payableAmount === 0 || guestStore.mustSignIn || paymentState === 'pending' || checkingPayment || paymentUnconfirmed"
					class="w-full py-3.5 bg-gray-900 dark:bg-[#f3f3f3] dark:text-[#171717] text-white font-semibold rounded-xl active:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					<svg v-if="guestStore.isLoading || paymentState === 'pending'" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
import { ref, computed, onMounted, onBeforeUnmount } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const emit = defineEmits(["order-confirmed", "sign-in"])
const guestStore = useGuestOrderStore()

//// Neoffice — the split buttons of the amount to pay: the chosen one in ink, light in the dark theme (no clay on a page
//// the restaurant shows its own guests, 05.11.2026, design system §7.6)
const SPLIT_CHOSEN = "bg-gray-900 text-white border-gray-900 dark:bg-[#f3f3f3] dark:text-[#171717] dark:border-[#f3f3f3]"
const SPLIT_OTHER = "bg-gray-100 text-gray-700 border-gray-200"

const paymentState = ref(null)
//// Neoffice — the guest comes back from the payment page on `?payment=success`: the page is checking the payment from its very first paint (the veil, `data-test="payment-wait"`),
//// not from the moment the confirmation call is made, so that it never shows an unpaid order in between. `paymentUnconfirmed`: the provider has not settled it after a minute.
const checkingPayment = ref(new URLSearchParams(window.location.search).get("payment") === "success")
const paymentUnconfirmed = ref(false)
const showPaymentDialog = ref(false)
const lastPaymentAmount = ref(0)

// Tip state
const tipPercent = ref(null)
const customTipAmount = ref("")
const showCustomTip = ref(false)

// Split payment state
const splitBy = ref(null) // null=full, 2/3/4=divide, -1=custom
const customPayAmount = ref("")

const orderItems = computed(() => guestStore.orderItems)

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

// //// Neoffice — what the guest's return from the payment page comes to, asked once on arrival and again by « Check again » (product owner, 06.11.2026). The address keeps
// //// `?payment=success` while the provider has not settled the payment (a reload asks again) and loses it once the answer is known, paid or refused.
async function settleTheReturn(amount, tip) {
	checkingPayment.value = true
	paymentUnconfirmed.value = false
	try {
		// Confirm payment with backend (records the payment now that Wallee confirmed)
		const confirmed = await guestStore.confirmPayment(amount, tip)
		// //// Neoffice — a payment the provider has not confirmed yet is not a success (the store says why), and no answer at all (the network) is no verdict either: the page says
		// //// « not confirmed yet » and asks again on a tap, with nothing lost. A confirmed one hands the page the number to show at pickup (neoffice-maintenance#2132)
		if (!confirmed || confirmed.status === "awaiting_payment") {
			paymentUnconfirmed.value = true
			return
		}
		window.history.replaceState({}, "", window.location.pathname)
		//// Neoffice — the provider did not settle the payment the guest came back from (failed or cancelled): it is not a success (neoffice-maintenance#1973)
		if (confirmed.status === "failed") {
			paymentState.value = "failed"
			guestStore.error = __("Payment was cancelled or failed. Please try again.")
			return
		}
		paymentState.value = "success"
		showPaymentDialog.value = true
		if (confirmed.ticket) emit("order-confirmed", confirmed.ticket)
	} finally {
		checkingPayment.value = false
	}
}

async function checkPaymentAgain() {
	guestStore.error = null
	const params = new URLSearchParams(window.location.search)
	await settleTheReturn(lastPaymentAmount.value, Number.parseFloat(params.get("tip")) || 0)
}

// //// Neoffice — the browser's back button from the payment page restores this page as it was left, veil and disabled Pay button included (the page is kept whole, not reloaded):
// //// nothing is on its way any more, the guest chose to come back
function onPageShow(event) {
	if (!event.persisted) return
	if (paymentState.value === "pending") paymentState.value = null
	guestStore.isLoading = false
}

// Check URL params on mount for payment callback
onMounted(async () => {
	window.addEventListener("pageshow", onPageShow)
	const params = new URLSearchParams(window.location.search)
	if (params.get("payment") === "success") {
		lastPaymentAmount.value = Number.parseFloat(params.get("amount")) || 0
		clearTip()
		await settleTheReturn(lastPaymentAmount.value, Number.parseFloat(params.get("tip")) || 0)
	} else if (params.get("payment") === "failed") {
		paymentState.value = "failed"
		guestStore.error = __("Payment was cancelled or failed. Please try again.")
		window.history.replaceState({}, "", window.location.pathname)
	}
})

onBeforeUnmount(() => {
	window.removeEventListener("pageshow", onPageShow)
})
</script>
