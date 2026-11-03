<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The sign-in of the QR page (NeoResto lot 1, Daniel, 02.11.2026): the guest -->
	<!-- //// gives an address, a code is mailed to it, and the customer of that address is the customer of the table (a new account is -->
	<!-- //// opened with its name). No password: the code is the proof. Since 03.11.2026 the code is the frappe fork's engine's, the same -->
	<!-- //// one the shop and the desk sign in with (neoffice-maintenance#2192); `embedded` draws it as a card of the page, for the takeaway -->
	<!-- //// page, where an account is the first step and there is nothing to close. -->
	<div
		:class="embedded ? '' : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50'"
		data-test="account-sheet"
		@click.self="!embedded && emit('close')"
	>
		<div
			:class="[
				'bg-white w-full',
				embedded ? 'rounded-xl border border-gray-200 p-6 shadow-sm' : 'sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 safe-area-bottom',
			]"
		>
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-base font-bold text-gray-900">
					{{ embedded ? __('Your details') : account ? __('Your account') : __('Sign in') }}
				</h3>
				<button v-if="!embedded" class="p-1 text-gray-400" :aria-label="__('Close')" data-test="account-close" @click="emit('close')">✕</button>
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
				<button v-if="!embedded" class="w-full mt-4 py-3 bg-blue-600 text-white font-semibold rounded-xl" data-test="account-done" @click="emit('close')">
					{{ __('Continue') }}
				</button>
			</template>

			<!-- Already signed in on this phone (the link of the sign-in mail brought the guest back to the table): one tap links the account to the table -->
			<template v-else-if="step === 'continue' && guestStore.signedIn">
				<p class="text-sm text-gray-600 mb-3" data-test="account-signed-in-line">
					{{ __('You are signed in as {0}.', [guestStore.signedIn.full_name]) }}
				</p>
				<button
					class="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
					:disabled="busy"
					data-test="account-continue-as"
					@click="continueAs"
				>
					{{ __('Continue as {0}', [guestStore.signedIn.full_name]) }}
				</button>
				<button class="w-full mt-2 text-xs text-gray-500 underline" data-test="account-other-address" @click="goBack">
					{{ __('Use another address') }}
				</button>
			</template>

			<!-- Step 1: the address -->
			<template v-else-if="step === 'email'">
				<p class="text-sm text-gray-600 mb-3">
					{{ embedded
						? __('Required to receive your order') + '. ' + __('We send you a code by email, no password needed.')
						: guestStore.settings?.has_loyalty_program
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
					:value="code"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					:placeholder="__('Code')"
					data-test="account-code"
					class="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
					@input="onCode($event.target.value)"
					@keyup.enter="confirmCode"
				/>
				<button
					class="w-full mt-3 py-3 bg-blue-600 text-white font-semibold rounded-xl disabled:opacity-50"
					:disabled="busy || code.length < 6"
					data-test="account-confirm"
					@click="confirmCode"
				>
					{{ __('Confirm') }}
				</button>
				<div class="flex items-center justify-between mt-3 text-xs">
					<button class="text-gray-500 underline" data-test="account-other-address" @click="goBack">{{ __('Use another address') }}</button>
					<button class="text-gray-500 underline disabled:no-underline disabled:opacity-60" :disabled="busy || waitToResend > 0" data-test="account-resend" @click="sendCode">
						{{ waitToResend > 0 ? __('Send a new code in {0} s', [waitToResend]) : __('Send a new code') }}
					</button>
				</div>
			</template>

			<!-- Step 3: the name of a new account -->
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
import { computed, onBeforeUnmount, ref } from "vue"
import { useGuestOrderStore } from "@/stores/guestOrder"

defineProps({
	// Drawn as a card of the page, with no overlay and nothing to close (the takeaway page, where an account is the first step)
	embedded: { type: Boolean, default: false },
})
const emit = defineEmits(["close"])
const guestStore = useGuestOrderStore()

const CODE_LENGTH = 6

const account = computed(() => guestStore.account)
// continue: the browser already holds a customer's session (the link of the mail brought the guest back here): the sheet starts by offering to go on as that account
const step = ref(guestStore.signedIn && !guestStore.account ? "continue" : "email") // continue | email | code | register
const email = ref("")
const code = ref("")
// What the engine handed back for an address that has no account: the register step sends it, never the address
const proof = ref("")
const customerName = ref("")
const mobileNo = ref("")
const busy = ref(false)
const message = ref("")
// Seconds before another code may be asked for (the engine's own delay, so that the page never asks for what it would not send)
const waitToResend = ref(0)
let countdown = null

function formatPrice(amount) {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: guestStore.currency || "CHF",
		minimumFractionDigits: 2,
	}).format(amount)
}

function stopCountdown() {
	if (countdown) clearInterval(countdown)
	countdown = null
}

function startCountdown(seconds) {
	stopCountdown()
	waitToResend.value = Math.max(0, Math.ceil(Number(seconds) || 0))
	if (!waitToResend.value) return
	countdown = setInterval(() => {
		waitToResend.value -= 1
		if (waitToResend.value <= 0) stopCountdown()
	}, 1000)
}

onBeforeUnmount(stopCountdown)

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

// Nothing but the six digits, however they arrive (typed, pasted as "482 913", offered by the phone from the mail): the sixth one sends
function onCode(value) {
	code.value = String(value).replace(/\D/g, "").slice(0, CODE_LENGTH)
	if (code.value.length === CODE_LENGTH && !busy.value) confirmCode()
}

function sendCode() {
	return run(async () => {
		const answer = await guestStore.requestCode(email.value.trim())
		code.value = ""
		step.value = "code"
		startCountdown(answer?.resend_in)
	})
}

function confirmCode() {
	if (busy.value || code.value.length < CODE_LENGTH) return
	return run(async () => {
		const result = await guestStore.confirmCode(email.value.trim(), code.value)
		if (result?.status === "needs_registration") {
			proof.value = result.proof
			step.value = "register"
		}
	})
}

function register() {
	return run(() => guestStore.registerAccount(proof.value, customerName.value.trim(), mobileNo.value.trim()))
}

function continueAs() {
	return run(() => guestStore.claimSignedInAccount())
}

function goBack() {
	message.value = ""
	code.value = ""
	step.value = "email"
}
</script>

<style scoped>
.safe-area-bottom {
	padding-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px));
}
</style>
