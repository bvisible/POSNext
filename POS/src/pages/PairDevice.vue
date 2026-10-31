<template>
	<!-- //// Neoffice — added file (no upstream equivalent). The page a kitchen's or a runner's tablet opens by -->
	<!-- //// scanning the QR code a manager shows at the till (NeoRestau lot 1, task 16): it hands the token over -->
	<!-- //// by a POST, and the tablet, signed in with its own account, goes to its screen. No password is typed. -->
	<!-- //// With no code, or once its session has ended, it says how to get a code. A visitor's page: no store, -->
	<!-- //// no offline worker, plain fetch (see the guest pages). -->
	<div class="min-h-screen flex items-center justify-center bg-[#FAF8F5] px-6 py-12" data-test="pair-page">
		<div class="w-full max-w-md text-center">
			<div
				class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
				:class="TONE[state]"
				aria-hidden="true"
			>
				<svg v-if="state === 'pairing'" class="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
					<path class="opacity-90" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M12 2a10 10 0 0 1 10 10" />
				</svg>
				<svg v-else-if="state === 'waiting'" class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
					<rect x="4" y="2" width="16" height="20" rx="2" />
					<path d="M12 18h.01" />
				</svg>
				<svg v-else class="h-8 w-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
					<circle cx="12" cy="12" r="10" />
					<path d="M12 8v4M12 16h.01" />
				</svg>
			</div>

			<template v-if="state === 'pairing'">
				<h1 class="font-display text-3xl text-[#141414]" data-test="pair-title">{{ __("Opening the screen…") }}</h1>
			</template>

			<template v-else-if="state === 'refused'">
				<h1 class="font-display text-3xl text-[#141414]" data-test="pair-title">{{ __("This code no longer opens a screen") }}</h1>
				<p class="mt-3 text-base text-gray-600" data-test="pair-message">
					{{ message || __("This code has expired or was already used. Ask for a new one at the till.") }}
				</p>
			</template>

			<template v-else-if="state === 'busy'">
				<h1 class="font-display text-3xl text-[#141414]" data-test="pair-title">{{ __("Too many attempts") }}</h1>
				<p class="mt-3 text-base text-gray-600" data-test="pair-message">
					{{ __("Wait a few minutes, then scan a new code shown at the till.") }}
				</p>
			</template>

			<template v-else-if="state === 'failed'">
				<h1 class="font-display text-3xl text-[#141414]" data-test="pair-title">{{ __("The screen could not be opened") }}</h1>
				<p class="mt-3 text-base text-gray-600" data-test="pair-message">
					{{ message || __("Check the tablet's connection, then scan the code again.") }}
				</p>
			</template>

			<template v-else>
				<h1 class="font-display text-3xl text-[#141414]" data-test="pair-title">{{ __("Scan the code shown at the till") }}</h1>
				<p class="mt-3 text-base text-gray-600" data-test="pair-message">
					{{ __("A manager chooses “{0}” at the till and shows a QR code. Scan it with this tablet's camera: the kitchen or runner screen opens, with no password.", [__("Open a tablet")]) }}
				</p>
				<router-link
					:to="{ name: 'Login' }"
					class="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-[10px] px-4 text-sm font-medium text-[#A15A2E] underline-offset-4 hover:underline"
				>
					{{ __("Sign in with a password") }}
				</router-link>
			</template>
		</div>
	</div>
</template>

<script>
import { ref } from "vue"

// What the page found belongs to the page load, not to one mount (task 16, fix round 2): the app may mount the page a
// second time once the token has left the address, and that mount must show the first one's answer, not ask for a code
// the person just scanned. One state for the whole load, then.
// waiting (no token: how to get one), pairing, refused (the token opens nothing), busy (too many attempts), failed
const pageState = ref("waiting")
const pageMessage = ref("")

/** A new page load (the specs mount the page once per case). */
export function forgetThePairing() {
	pageState.value = "waiting"
	pageMessage.value = ""
}
</script>

<script setup>
import { onMounted, onUnmounted } from "vue"
import { openPage } from "@/utils/tabletSession"

const REDEEM = "/api/method/pos_next.api.restaurant_devices.redeem_pairing_code"
const CSRF_PLACEHOLDER = "{{ csrf_token }}"

// The circle above the title: clay while the screen opens, ink at rest, red on a refusal
const TONE = {
	waiting: "bg-[#F3EDE4] text-[#141414]",
	pairing: "bg-[#FCF3EA] text-[#D68A59]",
	refused: "bg-red-50 text-red-600",
	busy: "bg-amber-50 text-amber-600",
	failed: "bg-red-50 text-red-600",
}

const state = pageState
const message = pageMessage

/**
 * The token the QR code carries, in the fragment of the address; it leaves the address bar and the history at once.
 * The server names it `token` wherever it holds it (its error snapshots redact that name).
 */
function takeTheToken() {
	// A token is URL-safe as it is: nothing to decode
	const token = (window.location.hash || "").replace(/^#/, "")
	if (token) {
		window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`)
	}
	return token
}

/** The message the server gave with its refusal, in the site's language. */
function serverMessage(body) {
	try {
		return JSON.parse(body._server_messages)
			.map((entry) => JSON.parse(entry).message)
			.filter(Boolean)
			.join(" ")
	} catch {
		return ""
	}
}

async function redeem(token) {
	state.value = "pairing"
	message.value = ""
	const headers = { Accept: "application/json", "Content-Type": "application/json" }
	if (typeof window.csrf_token === "string" && window.csrf_token && window.csrf_token !== CSRF_PLACEHOLDER) {
		headers["X-Frappe-CSRF-Token"] = window.csrf_token
	}
	try {
		const response = await fetch(REDEEM, {
			method: "POST",
			credentials: "same-origin",
			headers,
			body: JSON.stringify({ token }),
		})
		const body = await response.json().catch(() => ({}))
		const screen = body?.message?.redirect
		if (response.ok && typeof screen === "string" && screen.startsWith("/pos/")) {
			// Loaded anew: the app starts again with the session the tablet now holds
			openPage(screen)
			return
		}
		if (response.status === 429) {
			state.value = "busy"
			return
		}
		message.value = serverMessage(body)
		state.value = body?.exc_type === "PairingCodeError" ? "refused" : "failed"
	} catch {
		state.value = "failed"
	}
}

/**
 * A token in the address is redeemed, once: taking it empties the address, so a second mount finds none and shows
 * what the first one found. A camera application may open the next code in the same tab: only the fragment changes,
 * nothing is loaded or mounted again, and the hashchange brings that token here.
 */
function redeemTheTokenInTheAddress() {
	const token = takeTheToken()
	if (token) redeem(token)
}

onMounted(() => {
	window.addEventListener("hashchange", redeemTheTokenInTheAddress)
	redeemTheTokenInTheAddress()
})
onUnmounted(() => window.removeEventListener("hashchange", redeemTheTokenInTheAddress))
</script>
