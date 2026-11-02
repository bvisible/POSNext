//// Neoffice — added file (no upstream equivalent). The personal code of the till (NeoResto lot 1, product owner, 01.11.2026):
//// what this device knows about the signed-in user's code, and the three calls that change it. A waiter's phone stays signed
//// in for 30 days, and the counterpart is a lock that a SHORT CODE opens instead of the long account password.
////
//// The code itself is never kept here, only whether the user has one and how long it is (the lock screen needs both before
//// it can show a keypad, also offline, after a reload). That is cached per USER in localStorage, so that a second user of the
//// same browser never inherits the first one's keypad. The server (pos_next.api.till_code) is the authority: the state is
//// read again whenever the lock screen or the user's menu opens, and replaced by every answer.
import { userData } from "@/data/user";
import { call } from "@/utils/apiWrapper";
import { offlineState } from "@/utils/offline/offlineState";
import { computed, reactive, ref } from "vue";

export const TILL_CODE_METHODS = {
	has: "pos_next.api.till_code.has_till_code",
	set: "pos_next.api.till_code.set_till_code",
	clear: "pos_next.api.till_code.clear_till_code",
	verify: "pos_next.api.till_code.verify_till_code",
};

// What a code may be (the server holds the same rule, pos_next.api.till_code)
export const MIN_CODE_LENGTH = 4;
export const MAX_CODE_LENGTH = 6;

export const TILL_CODE_STATE_KEY = "pos_till_code_state";
// The PBKDF2 hash of the code for offline use is made and read by useSessionLock; the key is here so that both know it
export const TILL_CODE_HASH_KEY = "pos_till_code_hash";

function currentUser() {
	return userData.userId || window.frappe?.session?.user || null;
}

function readStoredState(user) {
	if (!user) return { user, has: false, length: 0 };
	try {
		const data = JSON.parse(localStorage.getItem(TILL_CODE_STATE_KEY));
		if (data && data.user === user && data.has) {
			return { user, has: true, length: Number(data.length) || 0 };
		}
	} catch {
		// Unreadable or no storage: nothing is known yet
	}
	return { user, has: false, length: 0 };
}

const state = ref(readStoredState(currentUser()));

// The dialog of the user's menu ("set" or "remove"); it lives outside the menu, which closes on every click
const dialog = reactive({ open: false, mode: "set" });

/** The state belongs to the user who is signed in now: another user starts from what the device knows of THEM. */
function sync() {
	const user = currentUser();
	if (state.value.user !== user) state.value = readStoredState(user);
}

function apply(answer) {
	const user = currentUser();
	const has = Boolean(answer?.has_code);
	state.value = { user, has, length: has ? Number(answer.length) || 0 : 0 };
	try {
		if (has && user) {
			localStorage.setItem(
				TILL_CODE_STATE_KEY,
				JSON.stringify({ user, has: true, length: state.value.length })
			);
		} else {
			localStorage.removeItem(TILL_CODE_STATE_KEY);
		}
	} catch {
		// Storage full or unavailable: the answer still holds for this page
	}
}

function forget() {
	state.value = { user: currentUser(), has: false, length: 0 };
	try {
		localStorage.removeItem(TILL_CODE_STATE_KEY);
	} catch {
		// Ignore
	}
}

/** The sign-out forgets what the device knew of the user's code (useSessionLock.clearLock). */
export function forgetTillCodeState() {
	forget();
}

/** The message of a failed call, as the server wrote it (already in the user's language), without markup. */
export function messageOfError(error, fallback) {
	const message = error?.messages?.find?.(Boolean);
	if (!message) return fallback || __("Something went wrong. Please try again.");
	return String(message).replace(/<[^>]*>/g, "").trim();
}

/** Ask the server whether the signed-in user has a code. Never throws: offline, or a failure, leaves what is known. */
async function refresh() {
	sync();
	if (offlineState.isOffline) return;
	try {
		const answer = await call(TILL_CODE_METHODS.has, {});
		const data = answer?.message || answer;
		if (data && typeof data.has_code === "boolean") apply(data);
	} catch {
		// The till is never blocked by this: the device keeps what it knew
	}
}

/**
 * Set (or replace) the user's code. Needs the CURRENT account password. Rejects with the server's error when the password is
 * wrong or the code is refused; the caller shows `messageOfError(error)`.
 */
async function setCode(password, code) {
	const answer = await call(TILL_CODE_METHODS.set, { password, code });
	apply(answer?.message || answer);
	// A hash made for the old code must not open the lock offline
	try {
		localStorage.removeItem(TILL_CODE_HASH_KEY);
	} catch {
		// Ignore
	}
}

/** Remove the user's code (needs the current account password). */
async function clearCode(password) {
	const answer = await call(TILL_CODE_METHODS.clear, { password });
	apply(answer?.message || answer);
	try {
		localStorage.removeItem(TILL_CODE_HASH_KEY);
	} catch {
		// Ignore
	}
}

function openDialog(mode = "set") {
	dialog.mode = mode === "remove" ? "remove" : "set";
	dialog.open = true;
}

function closeDialog() {
	dialog.open = false;
}

export function useTillCode() {
	sync();
	return {
		hasCode: computed(() => state.value.has),
		// 0 when this device does not know the length yet: the lock screen then asks for the password until it does
		codeLength: computed(() => state.value.length),
		dialog,
		refresh,
		setCode,
		clearCode,
		openDialog,
		closeDialog,
		forget,
	};
}
