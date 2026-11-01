<!-- //// Neoffice — added file (no upstream equivalent). The small dialog of the user's menu (NeoRestau lot 1, product owner,
     01.11.2026): "Set my till code" asks the CURRENT account password, the new code and the code again; "Remove my code" asks the
     password. The server checks both (pos_next.api.till_code); nothing typed here is kept once the dialog is done, written to the
     console or stored. It is mounted once by the page, outside the user's menu, and opened through useTillCode. -->
<template>
	<div
		v-if="dialog.open"
		data-test="till-code-dialog"
		role="dialog"
		aria-modal="true"
		:aria-label="title"
		class="fixed inset-0 z-[450] flex items-center justify-center bg-black/50 p-4"
		@click.self="cancel"
	>
		<form
			class="w-full max-w-sm rounded-xl bg-white shadow-xl dark:bg-gray-800"
			@submit.prevent="submit"
		>
			<div class="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ title }}</h3>
				<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ intro }}</p>
			</div>

			<div class="space-y-4 px-5 py-4">
				<div>
					<label
						for="till-code-password"
						class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
						>{{ __("Current password") }}</label
					>
					<input
						id="till-code-password"
						ref="passwordInput"
						v-model="password"
						data-test="till-code-password"
						type="password"
						autocomplete="current-password"
						:disabled="saving"
						class="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
					/>
				</div>

				<template v-if="dialog.mode === 'set'">
					<div>
						<label
							for="till-code-new"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>{{ __("New code") }}</label
						>
						<input
							id="till-code-new"
							data-test="till-code-new"
							type="password"
							inputmode="numeric"
							pattern="[0-9]*"
							autocomplete="off"
							:maxlength="MAX_CODE_LENGTH"
							:value="code"
							:disabled="saving"
							class="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-xl tracking-[0.5em] dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
							@input="code = digitsOnly($event)"
						/>
					</div>
					<div>
						<label
							for="till-code-again"
							class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
							>{{ __("Repeat the code") }}</label
						>
						<input
							id="till-code-again"
							data-test="till-code-again"
							type="password"
							inputmode="numeric"
							pattern="[0-9]*"
							autocomplete="off"
							:maxlength="MAX_CODE_LENGTH"
							:value="again"
							:disabled="saving"
							class="w-full rounded-lg border px-3 py-2.5 text-center text-xl tracking-[0.5em] dark:bg-gray-700 dark:text-gray-100"
							:class="
								mismatch
									? 'border-red-400 dark:border-red-500'
									: 'border-gray-300 dark:border-gray-600'
							"
							@input="again = digitsOnly($event)"
						/>
						<p v-if="mismatch" class="mt-1.5 text-sm text-red-600">
							{{ __("The two codes are different.") }}
						</p>
					</div>
				</template>

				<p
					v-if="errorMessage"
					data-test="till-code-error"
					class="text-sm text-red-600"
					role="alert"
				>
					{{ errorMessage }}
				</p>
			</div>

			<div
				class="flex justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700"
			>
				<button
					type="button"
					data-test="till-code-cancel"
					class="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
					@click="cancel"
				>
					{{ __("Cancel") }}
				</button>
				<button
					type="submit"
					data-test="till-code-save"
					:disabled="!canSave"
					class="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
					:class="
						dialog.mode === 'remove'
							? 'bg-red-600 hover:bg-red-700'
							: 'bg-blue-600 hover:bg-blue-700'
					"
				>
					{{ saving ? __("Saving...") : dialog.mode === "remove" ? __("Remove my code") : __("Save") }}
				</button>
			</div>
		</form>
	</div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { useSessionLock } from "@/composables/useSessionLock";
import { MAX_CODE_LENGTH, MIN_CODE_LENGTH, messageOfError, useTillCode } from "@/composables/useTillCode";
import { useToast } from "@/composables/useToast";
import { offlineState } from "@/utils/offline/offlineState";

const { dialog, setCode, clearCode, closeDialog } = useTillCode();
const { isLocked } = useSessionLock();
const { showSuccess } = useToast();

const password = ref("");
const code = ref("");
const again = ref("");
const errorMessage = ref("");
const saving = ref(false);
const passwordInput = ref(null);

const title = computed(() =>
	dialog.mode === "remove" ? __("Remove my code") : __("Set my till code")
);
const intro = computed(() =>
	dialog.mode === "remove"
		? __("The lock screen will ask for your password again.")
		: __("Four to six digits. The lock screen asks for it instead of your password.")
);
// Said once the second entry is as long as the first: not while it is still being typed
const mismatch = computed(
	() =>
		dialog.mode === "set" &&
		again.value.length > 0 &&
		again.value.length >= code.value.length &&
		again.value !== code.value
);
const canSave = computed(() => {
	if (saving.value || !password.value) return false;
	if (dialog.mode === "remove") return true;
	return (
		code.value.length >= MIN_CODE_LENGTH &&
		code.value.length <= MAX_CODE_LENGTH &&
		again.value === code.value
	);
});

// Only digits are kept, at most as many as a code has; what the browser shows follows
function digitsOnly(event) {
	const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, MAX_CODE_LENGTH);
	event.target.value = digits;
	return digits;
}

// Nothing typed here outlives the dialog
function wipe() {
	password.value = "";
	code.value = "";
	again.value = "";
	errorMessage.value = "";
	saving.value = false;
}

function cancel() {
	wipe();
	closeDialog();
}

watch(
	() => dialog.open,
	async (open) => {
		wipe();
		if (open) {
			await nextTick();
			passwordInput.value?.focus();
		}
	}
);

// A locked till shows no dialog, and keeps no password behind the lock screen
watch(isLocked, (locked) => {
	if (locked) cancel();
});

async function submit() {
	if (!canSave.value) return;
	if (offlineState.isOffline) {
		errorMessage.value = __("A code can only be set or removed online.");
		return;
	}
	saving.value = true;
	errorMessage.value = "";
	try {
		if (dialog.mode === "remove") {
			await clearCode(password.value);
			showSuccess(__("Till code removed"));
		} else {
			await setCode(password.value, code.value);
			showSuccess(__("Till code saved"));
		}
		cancel();
	} catch (error) {
		// The server says what is wrong (the password, a code too easy to guess, a wait); the password is asked again
		errorMessage.value = messageOfError(error);
		password.value = "";
		saving.value = false;
	}
}
</script>
