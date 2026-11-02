<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026): the guest -->
	<!-- //// gives an address, a code is mailed to it, and the customer of that address is the customer of the table (a new one is made -->
	<!-- //// with its name). No password: the code is the proof. -->
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-test="account-sheet" @click.self="emit('close')">
		<div class="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 safe-area-bottom">
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-base font-bold text-gray-900">
					{{ account ? __('Your account') : __('Sign in') }}
				</h3>
				<button class="p-1 text-gray-400" :aria-label="__('Close')" data-test="account-close" @click="emit('close')">✕</button>
			</div>

			<!-- Signed in -->
			<template v-if="account">
				<p class="text-sm text-gray-700" data-test="account-name-line">
					{{ __('Hello {0}', [account.customer_name]) }}
				</p>
				<p v-if="account.source === 'till'" class="text-xs text-gray-500 mt-1">
					{{ __('Your server linked this table to your account.') }}
				</p>
				<div v-if="guestStore.settings?.has_loyalty_program && account.loyalty_program" class="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
					<p class="text-xs text-blue-700 font-medium">{{ __('Loyalty points') }}</p>
					<p class="text-2xl font-bold text-blue-900" data-test="account-points">{{ account.loyalty_points }}</p>
					<p v-if="account.loyalty_value > 0" class="text-xs text-blue-700">
						{{ __('Worth {0}', [formatPrice(account.loyalty_value)]) }}
					</p>
				</div>
				<button class="w-full mt-4 py-3 bg-blue-600 text-white font-semibold rounded-xl" data-test="account-done" @click="emit('close')">
					{{ __('Continue') }}
				</button>
			</template>

			<!-- Step 1: the address -->
			<template v-else-if="step === 'email'">
				<p class="text-sm text-gray-600 mb-3">
					{{ guestStore.settings?.has_loyalty_program
						? __('Sign in to earn and use your loyalty points. We send you a code by email, no password needed.')
						: __('Sign in with your email address. We send you a code, no password needed.') }}
				</p>
				<input
					v-model="email"
					type="email"
					inputmode="email"
					autocomplete="email"
					:placeholder="__('your@email.com')"
					data-test="account-email"
					class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					@keyup.enter="sendCode"
				/>
				<button
					class="w-full mt-3 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
					:disabled="busy || !email.trim()"
					data-test="account-send-code"
					@click="sendCode"
				>
					{{ __('Send me a code') }}
				</button>
			</template>

			<!-- Step 2: the code -->
			<template v-else-if="step === 'code'">
				<p class="text-sm text-gray-600 mb-3">{{ __('We sent a code to {0}.', [email]) }}</p>
				<input
					v-model="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength="6"
					:placeholder="__('Code')"
					data-test="account-code"
					class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
					@keyup.enter="confirmCode"
				/>
				<button
					class="w-full mt-3 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
					:disabled="busy || code.trim().length < 6"
					data-test="account-confirm"
					@click="confirmCode"
				>
					{{ __('Confirm') }}
				</button>
				<div class="flex items-center justify-between mt-3 text-xs">
					<button class="text-gray-500 underline" data-test="account-other-address" @click="goBack">{{ __('Use another address') }}</button>
					<button class="text-gray-500 underline" :disabled="busy" data-test="account-resend" @click="sendCode">{{ __('Send a new code') }}</button>
				</div>
			</template>

			<!-- Step 3: the name of a new customer -->
			<template v-else-if="step === 'register'">
				<p class="text-sm text-gray-600 mb-3">{{ __('Welcome! Tell us your name to create your account.') }}</p>
				<input
					v-model="customerName"
					type="text"
					autocomplete="name"
					:placeholder="__('Your name')"
					data-test="account-name"
					class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				<input
					v-model="mobileNo"
					type="tel"
					autocomplete="tel"
					:placeholder="__('Phone (optional)')"
					data-test="account-phone"
					class="w-full mt-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
				<button
					class="w-full mt-3 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
					:disabled="busy || !customerName.trim()"
					data-test="account-register"
					@click="register"
				>
					{{ __('Create my account') }}
				</button>
			</template>

			<p v-if="message" class="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600" data-test="account-error">
				{{ message }}
			</p>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

const emit = defineEmits(["close"])
const guestStore = useGuestOrderStore()

const account = computed(() => guestStore.account)
const step = ref("email") // email | code | register
const email = ref("")
const code = ref("")
const customerName = ref("")
const mobileNo = ref("")
const busy = ref(false)
const message = ref("")

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

// One step of the sign-in: the page shows what the server said when it refuses, and stays where it is
async function run(action) {
	busy.value = true
	message.value = ""
	try {
		await action()
	} catch (error) {
		message.value = error?.message || __("Something went wrong. Please try again.")
	} finally {
		busy.value = false
	}
}

function sendCode() {
	return run(async () => {
		await guestStore.requestCode(email.value.trim())
		code.value = ""
		step.value = "code"
	})
}

function confirmCode() {
	return run(async () => {
		const result = await guestStore.confirmCode(email.value.trim(), code.value.trim())
		if (result?.status === "needs_registration") step.value = "register"
	})
}

function register() {
	return run(() => guestStore.registerAccount(email.value.trim(), customerName.value.trim(), mobileNo.value.trim()))
}

function goBack() {
	message.value = ""
	step.value = "email"
}
</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
}
</style>
