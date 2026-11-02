<!--
  BVISIBLE-FORK divergence markers vs upstream BrainWise-DEV/POSNext.
  Each line corresponds to a logical block of fork-specific change in this file.
  Grep the sha7 to find the originating commit via `git log`.
  //// Neoffice — nothing behavioural in this file. Its only divergence from upstream
  //// is the Biome reformat that 458d81a9 (2026-03-20, "remove BrainWise branding,
  //// add restaurant mode, and code formatting") ran over the whole POS source.
  //// Here: one 80-column wrap on the useSessionLock destructuring.
  //// At the next upstream merge take upstream's file as is and re-run the Biome
  //// formatter over it, rather than resolving these hunks by hand.
  //// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
-->
<template>
	<Teleport to="body">
		<Transition name="lock-overlay">
			<div v-if="isLocked" class="fixed inset-0 z-[10000] flex items-center justify-center">
				<!-- Backdrop -->
				<div class="absolute inset-0 bg-black/70 backdrop-blur-md"></div>

				<!-- Lock Card -->
				<div class="relative z-10 w-full max-w-sm mx-4">
					<div class="bg-white rounded-2xl shadow-2xl p-8">
						<!-- Lock Icon -->
						<div class="flex justify-center mb-5">
							<div
								class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center"
							>
								<FeatherIcon
									name="lock"
									class="w-8 h-8 text-amber-600"
									:stroke-width="2"
								/>
							</div>
						</div>

						<!-- User Info -->
						<div class="text-center mb-6">
							<!-- Avatar -->
							<div class="flex justify-center mb-3">
								<img
									v-if="lockedUser?.image"
									:src="lockedUser.image"
									:alt="lockedUser.name"
									class="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
								/>
								<div
									v-else
									class="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg border-2 border-blue-500"
								>
									{{ lockedUser?.initials || "??" }}
								</div>
							</div>
							<h3 class="text-lg font-bold text-gray-900">
								{{ lockedUser?.name || __("User") }}
							</h3>
							<p class="text-sm text-gray-500 mt-1">
								{{ __("Session Locked") }}
							</p>
							<!-- Offline Badge -->
							<div
								v-if="isOffline"
								class="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium"
							>
								<FeatherIcon
									name="wifi-off"
									class="w-3.5 h-3.5"
									:stroke-width="2"
								/>
								{{ __("Offline") }}
							</div>
						</div>

						<!-- //// Neoffice — the personal code of the till (NeoResto lot 1, product owner, 01.11.2026): a user who has a code -->
						<!-- //// opens the lock with a big keypad (block below) and falls back to this password form by a plain link; a user -->
						<!-- //// who has none sees this form alone, as upstream shows it. -->
						<!-- Password Form -->
						<form
							v-if="!showKeypad"
							data-test="password-form"
							@submit.prevent="handleUnlock"
							class="space-y-4"
						>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1.5">
									{{ __("Password") }}
								</label>
								<div class="relative">
									<input
										ref="passwordInputRef"
										v-model="password"
										:type="showPassword ? 'text' : 'password'"
										:placeholder="__('Enter your password')"
										:disabled="isVerifying"
										class="block w-full rounded-lg border px-3 py-2.5 pe-10 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
										:class="
											verifyError
												? 'border-red-400 bg-red-50'
												: 'border-gray-300'
										"
										autocomplete="current-password"
									/>
									<button
										type="button"
										@click="showPassword = !showPassword"
										class="absolute inset-y-0 end-0 flex items-center pe-3 text-gray-500 hover:text-gray-700 transition-colors focus:outline-none"
										:disabled="isVerifying"
										tabindex="-1"
										:aria-label="
											showPassword
												? __('Hide password')
												: __('Show password')
										"
									>
										<FeatherIcon
											:name="showPassword ? 'eye-off' : 'eye'"
											class="w-4.5 h-4.5"
											:stroke-width="2"
										/>
									</button>
								</div>
								<!-- Error Message -->
								<p v-if="verifyError" class="mt-1.5 text-sm text-red-600">
									{{ verifyError }}
								</p>
							</div>

							<!-- Unlock Button -->
							<button
								type="submit"
								:disabled="!password || isVerifying"
								class="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
							>
								<span
									v-if="isVerifying"
									class="flex items-center justify-center gap-2"
								>
									<FeatherIcon name="loader" class="h-4 w-4 animate-spin" />
									{{ __("Verifying...") }}
								</span>
								<span v-else>{{ __("Unlock") }}</span>
							</button>
						</form>

						<!-- //// Neoffice — the keypad of the personal code: dots for the digits, ten keys and a delete key of 56 px (a finger needs 44), the code is sent by itself at its last digit. -->
						<div v-else data-test="code-keypad">
							<p class="text-center text-sm text-gray-600 mb-4">
								{{ __("Enter your till code") }}
							</p>
							<div
								data-test="code-dots"
								role="img"
								:aria-label="__('Code')"
								class="flex justify-center gap-4 mb-3"
								:class="{ 'lock-shake': shaking }"
							>
								<span
									v-for="n in codeLength"
									:key="n"
									data-test="code-dot"
									:data-filled="n <= entry.length ? 'true' : 'false'"
									class="w-4 h-4 rounded-full border-2 transition-colors"
									:class="
										n <= entry.length
											? 'bg-blue-600 border-blue-600'
											: 'border-gray-300'
									"
								></span>
							</div>
							<p
								v-if="codeError"
								data-test="lock-error"
								class="text-center text-sm text-red-600 mb-3"
							>
								{{ codeError }}
							</p>
							<div v-else-if="isVerifying" class="flex justify-center mb-3">
								<FeatherIcon name="loader" class="h-4 w-4 animate-spin text-gray-500" />
							</div>
							<div class="grid grid-cols-3 gap-3 mt-4">
								<button
									v-for="digit in KEYPAD_DIGITS"
									:key="digit"
									type="button"
									:data-test="`key-${digit}`"
									:disabled="keysOff"
									@click="press(digit)"
									class="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-900 touch-manipulation transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
								>
									{{ digit }}
								</button>
								<span></span>
								<button
									type="button"
									data-test="key-0"
									:disabled="keysOff"
									@click="press('0')"
									class="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-xl font-semibold text-gray-900 touch-manipulation transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
								>
									0
								</button>
								<button
									type="button"
									data-test="key-delete"
									:aria-label="__('Erase')"
									:disabled="keysOff"
									@click="backspace()"
									class="h-14 rounded-xl text-gray-600 hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center touch-manipulation transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
								>
									<FeatherIcon name="delete" class="w-6 h-6" :stroke-width="2" />
								</button>
							</div>
							<div class="mt-4 text-center">
								<button
									type="button"
									data-test="use-password"
									:disabled="isVerifying"
									@click="usePassword = true"
									class="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
								>
									{{ __("Use my password") }}
								</button>
							</div>
						</div>

						<!-- //// Neoffice — back to the keypad from the password form, for a user who has a code and can use it here. -->
						<div v-if="!showKeypad && keypadAvailable" class="mt-3 text-center">
							<button
								type="button"
								data-test="use-code"
								:disabled="isVerifying"
								@click="usePassword = false"
								class="text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
							>
								{{ __("Use my code") }}
							</button>
						</div>

						<!-- Divider -->
						<div class="relative my-5">
							<div class="absolute inset-0 flex items-center">
								<div class="w-full border-t border-gray-200"></div>
							</div>
							<div class="relative flex justify-center text-xs">
								<span class="bg-white px-3 text-gray-400">{{ __("or") }}</span>
							</div>
						</div>

						<!-- Sign Out Button -->
						<button
							@click="handleSignOut"
							:disabled="isVerifying"
							class="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
						>
							{{ __("Sign Out") }}
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup>
//// Neoffice — computed and the two lifecycle hooks join the import, for the keypad of the personal code (NeoResto lot 1, 01.11.2026).
import { ref, watch, nextTick, computed, onMounted, onBeforeUnmount } from "vue";
import { FeatherIcon } from "frappe-ui";
import { useSessionLock } from "@/composables/useSessionLock";
//// Neoffice — the personal code of the till (NeoResto lot 1, product owner, 01.11.2026).
import { useTillCode } from "@/composables/useTillCode";
import { useOfflineStatus } from "@/composables/useOfflineStatus";
import { session } from "@/data/session";
import { cleanupUserSession } from "@/utils/sessionCleanup";

//// Neoffice — formatting only, no behaviour change: Biome 80-column wrap from the
//// whole-source formatter pass (458d81a9, 2026-03-20 "remove BrainWise branding, add
//// restaurant mode, and code formatting").
const { isLocked, isVerifying, verifyError, lockedUser, unlock, unlockWithCode, canCheckCodeOffline, codeWaitUntil } =
	useSessionLock();
const { isOffline } = useOfflineStatus();
//// Neoffice — what this device knows of the user's code (whether there is one, and how long): the keypad needs both.
const { hasCode, codeLength, refresh: refreshTillCode } = useTillCode();

const password = ref("");
const showPassword = ref(false);
const passwordInputRef = ref(null);

//// Neoffice — the keypad of the personal code. This lock screen is a UI lock for a device in a passer-by's hands (see the block
//// above unlockWithCode in useSessionLock): the real credential is the session cookie, the real protection the phone's own screen lock.
const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const entry = ref("");
const usePassword = ref(false);
const shaking = ref(false);
const now = ref(Date.now());
let ticker = null;

// A code can be used here when the user has one, its length is known, and (offline) a hash of it was made on this device
const keypadAvailable = computed(
	() => hasCode.value && codeLength.value > 0 && (!isOffline.value || canCheckCodeOffline())
);
const showKeypad = computed(() => keypadAvailable.value && !usePassword.value);
const waitLeft = computed(() => Math.max(0, Math.ceil((codeWaitUntil.value - now.value) / 1000)));
const keysOff = computed(() => isVerifying.value || waitLeft.value > 0);
// While a wait runs the line counts it down; once it is over the line goes with it
const codeError = computed(() => {
	if (codeWaitUntil.value) {
		return waitLeft.value > 0
			? __("Too many wrong codes. Try again in {0} seconds.", [waitLeft.value])
			: "";
	}
	return verifyError.value;
});

watch(codeWaitUntil, (until) => {
	clearInterval(ticker);
	ticker = null;
	now.value = Date.now();
	if (until > now.value) {
		ticker = setInterval(() => {
			now.value = Date.now();
			if (now.value >= codeWaitUntil.value) {
				clearInterval(ticker);
				ticker = null;
			}
		}, 250);
	}
});

// Auto-focus password input when locked
watch(isLocked, async (locked) => {
	if (locked) {
		password.value = "";
		showPassword.value = false;
		//// Neoffice — every lock starts on the keypad (when the user has a code), and asks the server again whether they do.
		entry.value = "";
		usePassword.value = false;
		refreshTillCode();
		await nextTick();
		passwordInputRef.value?.focus();
	}
});

//// Neoffice — the physical keyboard types the code too, and a page that loads locked asks whether the user has one.
onMounted(() => {
	window.addEventListener("keydown", handleKeydown);
	// The page may load locked: ask now, so that a code set on another device is known here too
	if (isLocked.value) refreshTillCode();
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeydown);
	clearInterval(ticker);
});

function shake() {
	shaking.value = true;
	setTimeout(() => {
		shaking.value = false;
	}, 450);
}

function press(digit) {
	if (keysOff.value || entry.value.length >= codeLength.value) return;
	entry.value += digit;
	if (entry.value.length === codeLength.value) submitCode();
}

function backspace() {
	if (keysOff.value) return;
	entry.value = entry.value.slice(0, -1);
}

// A physical keyboard types the code too (a till on a desk), unless a field has the focus
function handleKeydown(event) {
	if (!isLocked.value || !showKeypad.value) return;
	if (event.target instanceof HTMLInputElement) return;
	if (/^[0-9]$/.test(event.key)) press(event.key);
	else if (event.key === "Backspace") backspace();
}

async function submitCode() {
	const result = await unlockWithCode(entry.value);

	if (result.sessionExpired) {
		await cleanupUserSession();
		session.logout.submit();
		return;
	}

	if (!result.success) {
		entry.value = "";
		shake();
		// The code cannot be checked on this device without the network: the password can
		if (result.needsPassword) usePassword.value = true;
	}
}

async function handleUnlock() {
	if (!password.value || isVerifying.value) return;

	const result = await unlock(password.value);

	if (result.sessionExpired) {
		// Session expired — full logout
		await cleanupUserSession();
		session.logout.submit();
		return;
	}

	if (!result.success) {
		// Wrong password — clear and re-focus
		password.value = "";
		await nextTick();
		passwordInputRef.value?.focus();
	}
}

async function handleSignOut() {
	await cleanupUserSession();
	session.logout.submit();
}
</script>

<style scoped>
.lock-overlay-enter-active,
.lock-overlay-leave-active {
	transition: opacity 0.3s ease;
}

.lock-overlay-enter-from,
.lock-overlay-leave-to {
	opacity: 0;
}

/* //// Neoffice — a wrong code shakes the dots (NeoResto lot 1, personal code of the till). */
.lock-shake {
	animation: lock-shake 0.45s ease-in-out;
}

@keyframes lock-shake {
	0%,
	100% {
		transform: translateX(0);
	}
	20%,
	60% {
		transform: translateX(-8px);
	}
	40%,
	80% {
		transform: translateX(8px);
	}
}
</style>
