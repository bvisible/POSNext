<template>
	<div class="customer-display min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white">
		<!-- Not authenticated: Show auth modal -->
		<DisplayAuth v-if="!displayStore.isAuthenticated" />

		<!-- Authenticated but no active session -->
		<div
			v-else-if="!displayStore.posOpeningEntry"
			class="flex flex-col items-center justify-center min-h-screen p-8"
		>
			<div class="text-center space-y-6">
				<div class="text-6xl mb-4">
					<FeatherIcon name="monitor" class="w-24 h-24 mx-auto text-gray-400 dark:text-gray-500" />
				</div>
				<h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ __("Welcome") }}</h1>

				<!-- Profile selector -->
				<div class="max-w-md mx-auto space-y-4">
					<label class="block text-left text-gray-600 dark:text-gray-400">{{ __("Select POS Profile") }}</label>
					<select
						v-model="selectedProfile"
						class="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						@change="handleProfileSelect"
					>
						<option value="" disabled>{{ __("Choose a POS profile...") }}</option>
						<option v-for="profile in displayStore.posProfiles" :key="profile.name" :value="profile.name">
							{{ profile.name }} ({{ profile.company }})
						</option>
					</select>

					<div v-if="displayStore.connectionError" class="mt-4 p-4 bg-red-100 dark:bg-red-900/50 rounded-lg">
						<p class="text-red-700 dark:text-red-300">{{ displayStore.connectionError }}</p>
					</div>

					<button
						class="mt-4 px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
						@click="displayStore.logout()"
					>
						{{ __("Change API Key") }}
					</button>
				</div>
			</div>
		</div>

		<!-- Main display view -->
		<div v-else class="flex flex-col h-screen overflow-hidden">
			<!-- Header -->
			<DisplayHeader />

			<!-- Main content -->
			<div class="flex-1 flex overflow-hidden">
				<!-- Thank you overlay -->
				<transition
					enter-active-class="transition-opacity duration-300"
					leave-active-class="transition-opacity duration-300"
					enter-from-class="opacity-0"
					leave-to-class="opacity-0"
				>
					<div
						v-if="displayStore.showThankYou"
						class="fixed inset-0 z-50 flex items-center justify-center bg-green-600 text-white"
					>
						<div class="text-center space-y-8">
							<div class="text-8xl animate-bounce">
								<FeatherIcon name="check-circle" class="w-32 h-32 mx-auto" />
							</div>
							<h1 class="text-6xl font-bold">{{ __("Thank You!") }}</h1>
							<p class="text-3xl">{{ __("See you soon!") }}</p>
							<p v-if="displayStore.lastSaleAmount" class="text-4xl font-semibold mt-4">
								{{ formatCurrency(displayStore.lastSaleAmount) }}
							</p>
						</div>
					</div>
				</transition>

				<!-- Payment QR overlay (TWINT etc.) — shown full-screen while the
				     buyer is asked to scan. z-40 so the green Thank-You (z-50)
				     wins if both ever overlap. -->
				<transition
					enter-active-class="transition-opacity duration-300"
					leave-active-class="transition-opacity duration-300"
					enter-from-class="opacity-0"
					leave-to-class="opacity-0"
				>
					<div
						v-if="displayStore.paymentQR"
						class="fixed inset-0 z-40 flex flex-col items-center justify-center bg-white dark:bg-gray-900 px-8"
					>
						<h1 class="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 text-center">
							{{ paymentQRTitle }}
						</h1>
						<p v-if="paymentQRAmount" class="text-5xl md:text-6xl font-extrabold mb-10" style="color: #ff0039">
							{{ paymentQRAmount }}
						</p>
						<div class="bg-white p-6 rounded-3xl shadow-2xl">
							<canvas ref="qrCanvas" class="w-72 h-72 md:w-96 md:h-96"></canvas>
						</div>
						<p class="mt-10 text-2xl md:text-3xl text-gray-600 dark:text-gray-300 text-center">
							{{ __("Scan with your TWINT app") }}
						</p>
					</div>
				</transition>

				<!-- Cart display -->
				<DisplayCart class="flex-1" />

				<!-- Customer creation dialog -->
				<Teleport to="body">
					<transition
						enter-active-class="transition-all duration-200 ease-out"
						leave-active-class="transition-all duration-150 ease-in"
						enter-from-class="opacity-0"
						leave-to-class="opacity-0"
					>
						<div v-if="showCreateCustomer" class="fixed inset-0 z-50 flex items-center justify-center">
							<div class="absolute inset-0 bg-black/40" @click="showCreateCustomer = false"></div>
							<div class="relative w-full max-w-md mx-4 bg-white rounded-neo-lg shadow-neo-lg max-h-[90vh] overflow-y-auto">
								<CreateCustomerModal
									:show-address="displayStore.displaySettings.showAddressFields"
									@close="showCreateCustomer = false"
									@created="handleCustomerCreated"
								/>
							</div>
						</div>
					</transition>
				</Teleport>
			</div>

			<!-- Create Account bar (bottom) -->
			<div v-if="displayStore.displaySettings.enableAccountCreation" class="flex-shrink-0 border-t border-gray-200 bg-white">
				<button
					class="w-full flex items-center justify-center gap-3 py-4 text-base font-semibold text-blue-600 hover:bg-blue-50 active:bg-blue-100 transition-colors"
					@click="showCreateCustomer = true"
				>
					<FeatherIcon name="user-plus" class="w-5 h-5" />
					<span v-if="displayStore.displaySettings.hasLoyaltyProgram">{{ __("Create an account to earn loyalty points") }}</span>
					<span v-else>{{ __("Create an account") }}</span>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup>
import { FeatherIcon } from "frappe-ui"
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue"
import QRCode from "qrcode"
import { useCustomerDisplayStore } from "@/stores/customerDisplay"
import DisplayAuth from "@/components/customer-display/DisplayAuth.vue"
import DisplayHeader from "@/components/customer-display/DisplayHeader.vue"
import DisplayCart from "@/components/customer-display/DisplayCart.vue"
import CreateCustomerModal from "@/components/customer-display/CreateCustomerModal.vue"

const displayStore = useCustomerDisplayStore()

const selectedProfile = ref("")
const showCreateCustomer = ref(false)
const qrCanvas = ref(null)

// Format currency
function formatCurrency(amount) {
	const currency = displayStore.cartData.currency || "EUR"
	return new Intl.NumberFormat("fr-FR", {
		style: "currency",
		currency: currency,
	}).format(amount)
}

// ---- Payment QR overlay (TWINT etc.) ----
const paymentQRTitle = computed(() => {
	const provider = displayStore.paymentQR?.provider
	return __("Pay with {0}", [provider || "TWINT"])
})

const paymentQRAmount = computed(() => {
	const qr = displayStore.paymentQR
	if (!qr || !qr.amount) return ""
	return new Intl.NumberFormat("fr-CH", {
		style: "currency",
		currency: qr.currency || "CHF",
	}).format(qr.amount)
})

async function renderPaymentQR(token) {
	if (!token || !qrCanvas.value) return
	try {
		await QRCode.toCanvas(qrCanvas.value, token, {
			errorCorrectionLevel: "M",
			margin: 2,
			width: 384,
			color: { dark: "#000000", light: "#FFFFFF" },
		})
	} catch (e) {
		console.error("[CustomerDisplay] QR render failed", e)
	}
}

// Re-render the QR whenever the pushed pairing token changes (the canvas only
// exists while the overlay is shown, so wait a tick for v-if to mount it).
watch(
	() => displayStore.paymentQR?.pairing_token,
	async (token) => {
		if (token) {
			await nextTick()
			renderPaymentQR(token)
		}
	},
	{ immediate: true },
)

// Handle profile selection
async function handleProfileSelect() {
	if (selectedProfile.value) {
		await displayStore.selectPosProfile(selectedProfile.value)
	}
}

// Handle customer created
function handleCustomerCreated(customer) {
	showCreateCustomer.value = false
	// Immediately update cart with new customer (don't wait for realtime event)
	if (customer) {
		displayStore.cartData.customer = customer.name
		displayStore.cartData.customer_name = customer.customer_name
	}
}

// Try to restore session on mount
onMounted(async () => {
	await displayStore.tryRestoreSession()

	// Sync selected profile
	if (displayStore.posProfile) {
		selectedProfile.value = displayStore.posProfile
	}
})

// Cleanup on unmount
onUnmounted(() => {
	displayStore.stopCartSync()
})
</script>

<style scoped>
.customer-display {
	font-family: "Inter", system-ui, -apple-system, sans-serif;
}

/* Smooth animations for cart items */
.customer-display :deep(.cart-item) {
	transition: all 0.3s ease;
}
</style>
