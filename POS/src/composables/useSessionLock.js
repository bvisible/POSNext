import { ref, readonly } from "vue";
import { call } from "@/utils/apiWrapper";
import { userData } from "@/data/user";
import { usePOSCartStore } from "@/stores/posCart";
import { offlineState } from "@/utils/offline/offlineState";
//// Neoffice — the personal code of the till (NeoResto lot 1, product owner, 01.11.2026): the lock also opens with a short code.
import { TILL_CODE_HASH_KEY, TILL_CODE_METHODS, forgetTillCodeState } from "@/composables/useTillCode";

// Throttle: ignore activity events within 1 second of last reset
const THROTTLE_MS = 1000;
// Defer lock retry when submission in progress
const DEFER_MS = 30 * 1000;

// Configurable settings (module-level, set via configure())
let lockEnabled = true;
let lockTimeoutMs = 5 * 60 * 1000;
//// Neoffice — whether leaving the screen (the tab hidden, the phone asleep) locks AT ONCE. True until the till's settings say
//// otherwise, which is what every lock did before this setting existed (POS Settings.session_lock_on_leave, NeoResto lot 1). When
//// false the lock waits for its delay without use: a waiter whose phone sleeps between two tables does not type a code each time.
let lockOnLeave = true;
//// Neoffice — the lock was made by the user's own hand ("Lock" in the menu): it holds whatever the auto-lock setting says, also
//// across a reload, and the till reading its settings again does not release it. An automatic lock is released when the setting is
//// switched off, as upstream does.
let lockedByHand = false;

// ---------------------------------------------------------------------------
// localStorage persistence (survives browser close, unlike sessionStorage)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "pos_session_lock";

function restoreLockState() {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const data = JSON.parse(saved);
			if (data?.locked && lockEnabled) {
				//// Neoffice — `manual`: see lockedByHand above.
				return { locked: true, user: data.user || null, manual: Boolean(data.manual) };
			}
		}
	} catch {
		localStorage.removeItem(STORAGE_KEY);
	}
	//// Neoffice — `manual` (see lockedByHand) is part of the state that is kept, and read back.
	return { locked: false, user: null, manual: false };
}

//// Neoffice — `manual`: a lock made by the user's own hand is kept as such (see lockedByHand).
function persistLock(user, manual = false) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, locked: true, manual }));
	} catch {
		// Storage full or unavailable — lock still works in-memory
	}
}

function clearPersistedLock() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Ignore
	}
}

//// Neoffice — the moment of the last use, kept across page loads (a phone drops a tab it has not shown for a while and loads it
//// again): "N minutes without use" has to hold for a page that was not there. Added with the personal code of the till (NeoResto lot 1).
const LAST_ACTIVE_KEY = "pos_last_active";

function rememberActivity(at) {
	try {
		localStorage.setItem(LAST_ACTIVE_KEY, String(at));
	} catch {
		// Storage unavailable: the page's own clock (lastActivityTime) still counts
	}
}

function lastActivityAt() {
	let stored = 0;
	try {
		stored = Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
	} catch {
		// Ignore
	}
	return Math.max(stored, lastActivityTime);
}

/** The till has been left alone for at least its delay (never true before anything was seen). */
function idleLongerThanDelay() {
	const last = lastActivityAt();
	return last > 0 && Date.now() - last >= lockTimeoutMs;
}

// ---------------------------------------------------------------------------
// Cached password hash (offline unlock fallback)
// ---------------------------------------------------------------------------
const PASSWORD_HASH_KEY = "pos_session_pwd_hash";
const ATTEMPT_KEY = "pos_lock_attempts";
const PBKDF2_ITERATIONS = 100_000;
const HASH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_OFFLINE_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000; // 1 minute lockout after max attempts

function bytesToHex(bytes) {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function hexToBytes(hex) {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
	}
	return bytes;
}

async function hashPassword(password, existingSalt = null) {
	const encoder = new TextEncoder();
	const salt = existingSalt
		? hexToBytes(existingSalt)
		: crypto.getRandomValues(new Uint8Array(16));

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"]
	);

	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		256
	);

	return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

function getCurrentUserId() {
	return userData.userId || window.frappe?.session?.user || null;
}

function cachePasswordHash(user, hash, salt) {
	try {
		localStorage.setItem(
			PASSWORD_HASH_KEY,
			JSON.stringify({ user, hash, salt, ts: Date.now() })
		);
	} catch {
		// Storage full or unavailable
	}
}

function getCachedPasswordHash() {
	try {
		const raw = localStorage.getItem(PASSWORD_HASH_KEY);
		if (!raw) return null;

		const data = JSON.parse(raw);

		// Reject if data is malformed
		if (!data?.hash || !data?.salt || !data?.user || !data?.ts) {
			localStorage.removeItem(PASSWORD_HASH_KEY);
			return null;
		}

		// Reject if we can't identify the current user (can't verify ownership)
		const currentUser = getCurrentUserId();
		if (!currentUser) {
			return null;
		}

		// Reject if hash belongs to a different user
		if (data.user !== currentUser) {
			localStorage.removeItem(PASSWORD_HASH_KEY);
			return null;
		}

		// Reject if expired
		if (Date.now() - data.ts > HASH_TTL_MS) {
			localStorage.removeItem(PASSWORD_HASH_KEY);
			return null;
		}

		return { hash: data.hash, salt: data.salt };
	} catch {
		localStorage.removeItem(PASSWORD_HASH_KEY);
		return null;
	}
}

function clearCachedPasswordHash() {
	try {
		localStorage.removeItem(PASSWORD_HASH_KEY);
	} catch {
		// Ignore
	}
}

async function cachePasswordHashFromLogin(password) {
	//// Neoffice — a fresh sign-in is a use of the till: the moment of the last use is now, so that a page that waits for its delay
	//// does not lock a person who has just typed their password because the last use was yesterday's.
	lastActivityTime = Date.now();
	rememberActivity(lastActivityTime);
	// Web Crypto exists only in secure contexts; plain http reaches here only in dev mode (see canLogin)
	if (!globalThis.crypto?.subtle) return;
	const user = getCurrentUserId();
	const { hash, salt } = await hashPassword(password);
	cachePasswordHash(user, hash, salt);
}

// ---------------------------------------------------------------------------
// Offline brute-force protection
// ---------------------------------------------------------------------------
function checkOfflineAttemptLimit() {
	try {
		const raw = localStorage.getItem(ATTEMPT_KEY);
		if (!raw) return { allowed: true };

		const data = JSON.parse(raw);
		if (data.count >= MAX_OFFLINE_ATTEMPTS) {
			// Escalating lockout: doubles each time the limit is hit again
			// level 1 = 60s, level 2 = 120s, level 3 = 240s, capped at 15 min
			const level = data.level || 1;
			const lockoutDuration = Math.min(LOCKOUT_MS * Math.pow(2, level - 1), 15 * 60 * 1000);
			const elapsed = Date.now() - data.lastAttempt;
			if (elapsed < lockoutDuration) {
				const remaining = Math.ceil((lockoutDuration - elapsed) / 1000);
				return { allowed: false, remaining };
			}
			// Lockout expired — reset count but escalate level for next lockout
			data.count = 0;
			data.level = level + 1;
			localStorage.setItem(ATTEMPT_KEY, JSON.stringify(data));
			return { allowed: true };
		}
		return { allowed: true };
	} catch {
		return { allowed: true };
	}
}

function recordFailedAttempt() {
	try {
		const raw = localStorage.getItem(ATTEMPT_KEY);
		const data = raw ? JSON.parse(raw) : { count: 0, level: 1 };
		data.count += 1;
		data.lastAttempt = Date.now();
		localStorage.setItem(ATTEMPT_KEY, JSON.stringify(data));
	} catch {
		// Ignore
	}
}

function clearAttemptCounter() {
	try {
		localStorage.removeItem(ATTEMPT_KEY);
	} catch {
		// Ignore
	}
}

// Module-level singleton state (same pattern as useToast.js)
const restored = restoreLockState();
//// Neoffice — a lock found in storage keeps being what it was: a hand lock stays one (see lockedByHand).
lockedByHand = restored.manual;
const isLocked = ref(restored.locked);
const isVerifying = ref(false);
const verifyError = ref("");
const lockedUser = ref(restored.user);
//// Neoffice — when the personal code may be tried again (ms since the epoch, 0 = now): set by a refusal of the server or of the device.
const codeWaitUntil = ref(0);

let inactivityTimer = null;
let lastActivityTime = 0;
let listenersAttached = false;

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];

function getUserInfo() {
	return {
		name: userData.getDisplayName(),
		image: userData.getImageUrl(),
		initials: userData.getInitials(),
	};
}

function resetTimer() {
	if (!lockEnabled) return;

	const now = Date.now();
	if (now - lastActivityTime < THROTTLE_MS) return;
	lastActivityTime = now;
	//// Neoffice — the moment of the last use, kept across page loads (see rememberActivity).
	rememberActivity(now);

	if (inactivityTimer) {
		clearTimeout(inactivityTimer);
	}
	inactivityTimer = setTimeout(tryLock, lockTimeoutMs);
}

function tryLock() {
	const cartStore = usePOSCartStore();
	if (cartStore.isSubmitting) {
		// Defer lock — invoice submission in progress
		inactivityTimer = setTimeout(tryLock, DEFER_MS);
		return;
	}
	lock();
}

//// Neoffice — `options.manual`: the lock is the user's own, made from the menu (see lockedByHand, lockNow).
function lock(options = {}) {
	if (isLocked.value) return;

	isLocked.value = true;
	lockedUser.value = getUserInfo();
	//// Neoffice — see lockedByHand.
	lockedByHand = Boolean(options.manual);

	persistLock(lockedUser.value, lockedByHand);

	if (inactivityTimer) {
		clearTimeout(inactivityTimer);
		inactivityTimer = null;
	}
}

function handleVisibilityChange() {
	if (!lockEnabled) return;
	if (document.hidden) {
		//// Neoffice — only when the till asks for it (lockOnLeave); otherwise the lock waits for its delay, checked below.
		// Lock immediately when tab loses focus
		if (lockOnLeave) lock();
		return;
	}
	//// Neoffice — the screen is back, and the till waits for the delay: if it was left alone for the whole delay, lock now. The
	//// timer below cannot say so alone, a phone suspends the page's timers while its screen is off.
	if (!lockOnLeave && idleLongerThanDelay()) tryLock();
}

function unlockSuccess() {
	isLocked.value = false;
	lockedUser.value = null;
	isVerifying.value = false;
	clearPersistedLock();
	//// Neoffice — a lock made by hand with the auto-lock OFF opens without arming the idle timer (it would lock the till again
	//// after the delay although the setting says the till never locks by itself); the hand is released either way.
	lockedByHand = false;
	codeWaitUntil.value = 0;
	// Restart inactivity tracking
	lastActivityTime = Date.now();
	//// Neoffice — the unlock is a use of the till, and the idle timer is armed only while the auto-lock is on (see above).
	rememberActivity(lastActivityTime);
	if (lockEnabled) inactivityTimer = setTimeout(tryLock, lockTimeoutMs);
}

async function verifyOfflinePassword(password) {
	// Brute-force protection
	const limit = checkOfflineAttemptLimit();
	if (!limit.allowed) {
		return {
			success: false,
			error: __("Too many attempts. Try again in {0} seconds.", [limit.remaining]),
		};
	}

	const cached = getCachedPasswordHash();
	if (!cached) {
		return {
			success: false,
			error: __("Cannot verify password offline. No cached credentials available."),
		};
	}

	const { hash: enteredHash } = await hashPassword(password, cached.salt);
	if (enteredHash === cached.hash) {
		clearAttemptCounter();
		return { success: true };
	}

	recordFailedAttempt();
	return { success: false, error: __("Incorrect password") };
}

async function unlock(password) {
	isVerifying.value = true;
	verifyError.value = "";

	// Brute-force gate — applies to both online and offline paths
	const limit = checkOfflineAttemptLimit();
	if (!limit.allowed) {
		isVerifying.value = false;
		verifyError.value = __("Too many attempts. Try again in {0} seconds.", [limit.remaining]);
		return { success: false };
	}

	// Offline fallback — verify against cached hash
	if (offlineState.isOffline) {
		const result = await verifyOfflinePassword(password);
		if (result.success) {
			unlockSuccess();
			return { success: true };
		}
		isVerifying.value = false;
		verifyError.value = result.error;
		return { success: false };
	}

	// Online — verify against server
	try {
		const res = await call("pos_next.api.auth.verify_session_password", { password });
		const data = res?.message || res;

		if (data?.verified) {
			clearAttemptCounter();
			unlockSuccess();

			// Cache hash for offline use — fire-and-forget so UI unblocks immediately
			const user = getCurrentUserId();
			hashPassword(password).then(({ hash, salt }) => {
				cachePasswordHash(user, hash, salt);
			});

			return { success: true };
		}

		// Wrong password — backend returns { verified: false, message: "..." }
		recordFailedAttempt();
		isVerifying.value = false;
		verifyError.value = data?.message || __("Incorrect password");
		return { success: false };
	} catch (error) {
		const httpStatus = error?.status;

		// Session expired — 401 or 403 from Frappe's session middleware
		if (httpStatus === 401 || httpStatus === 403) {
			isVerifying.value = false;
			return { sessionExpired: true };
		}

		// Network error — fall back to cached hash
		const result = await verifyOfflinePassword(password);
		if (result.success) {
			unlockSuccess();
			return { success: true };
		}
		if (result.error) {
			isVerifying.value = false;
			verifyError.value = result.error;
			return { success: false };
		}

		isVerifying.value = false;
		verifyError.value = __("Could not verify password. Please try again.");
		return { success: false };
	}
}

//// Neoffice — added block (no upstream equivalent): unlocking with the PERSONAL CODE of the till (NeoResto lot 1, product owner,
//// 01.11.2026). A waiter's phone stays signed in for 30 days; the counterpart is this lock, opened by four to six digits of the
//// waiter's own instead of the long account password.
////
//// WHAT THIS LOCK IS. A UI lock for a device that is in a passer-by's hands, not a security boundary: a person with the browser's
//// developer tools can clear it (it is a flag in localStorage and in memory), and the offline check below runs in the page. The
//// real credential is the session cookie, and the real protection of a lost phone is the phone's own screen lock. A code alone
//// never authorises a sensitive gesture (a refund, a discount): those keep asking a manager.
////
//// ONLINE the server checks the code (pos_next.api.till_code.verify_till_code) behind a throttle of its own, per user: five wrong
//// codes lock the user for 60 seconds, doubling up to 15 minutes. OFFLINE the code is checked against a PBKDF2 hash made on this
//// device right after a SUCCESSFUL online verification (never from a code merely typed, never from the password), with the
//// same 24 hour life and the same attempt counter as the cached password hash. The code itself is never stored anywhere.
const CODE_HASH_KEY = TILL_CODE_HASH_KEY;

function cacheCodeHash(user, hash, salt) {
	try {
		localStorage.setItem(CODE_HASH_KEY, JSON.stringify({ user, hash, salt, ts: Date.now() }));
	} catch {
		// Storage full or unavailable
	}
}

function clearCachedCodeHash() {
	try {
		localStorage.removeItem(CODE_HASH_KEY);
	} catch {
		// Ignore
	}
}

// The same checks as getCachedPasswordHash, for the code's own key: well formed, this user's, not older than the TTL
function getCachedCodeHash() {
	try {
		const raw = localStorage.getItem(CODE_HASH_KEY);
		if (!raw) return null;

		const data = JSON.parse(raw);
		if (!data?.hash || !data?.salt || !data?.user || !data?.ts) {
			clearCachedCodeHash();
			return null;
		}

		const currentUser = getCurrentUserId();
		if (!currentUser) return null;

		if (data.user !== currentUser || Date.now() - data.ts > HASH_TTL_MS) {
			clearCachedCodeHash();
			return null;
		}

		return { hash: data.hash, salt: data.salt };
	} catch {
		clearCachedCodeHash();
		return null;
	}
}

async function verifyOfflineCode(code) {
	const cached = getCachedCodeHash();
	if (!cached) {
		return {
			success: false,
			// The code cannot work on this device offline: the lock screen offers the password
			needsPassword: true,
			error: __("Cannot verify the code offline. Use your password."),
		};
	}

	const { hash: enteredHash } = await hashPassword(code, cached.salt);
	if (enteredHash === cached.hash) {
		clearAttemptCounter();
		return { success: true };
	}

	recordFailedAttempt();
	return { success: false, error: __("Incorrect code") };
}

async function unlockOfflineWithCode(code) {
	// Web Crypto exists only in secure contexts: without it nothing could have been cached
	const result = globalThis.crypto?.subtle
		? await verifyOfflineCode(code)
		: {
				success: false,
				needsPassword: true,
				error: __("Cannot verify the code offline. Use your password."),
			};
	if (result.success) {
		unlockSuccess();
		return { success: true };
	}
	isVerifying.value = false;
	verifyError.value = result.error;
	return { success: false, needsPassword: Boolean(result.needsPassword) };
}

/** Whether a code can be checked on this device WITHOUT the network (a hash made after a successful online verification). */
function canCheckCodeOffline() {
	return Boolean(globalThis.crypto?.subtle) && getCachedCodeHash() !== null;
}

async function unlockWithCode(code) {
	isVerifying.value = true;
	verifyError.value = "";
	codeWaitUntil.value = 0;

	// Brute-force gate of the device — the same counter as the password's, online and offline
	const limit = checkOfflineAttemptLimit();
	if (!limit.allowed) {
		isVerifying.value = false;
		verifyError.value = __("Too many attempts. Try again in {0} seconds.", [limit.remaining]);
		codeWaitUntil.value = Date.now() + limit.remaining * 1000;
		return { success: false };
	}

	if (offlineState.isOffline) {
		return unlockOfflineWithCode(code);
	}

	try {
		const res = await call(TILL_CODE_METHODS.verify, { code });
		//// Neoffice — the answer of a refused attempt has a `message` of its own, so `res?.message || res` (the password's way
		//// above) would take that text for the whole answer: the answer is taken as it is when it already is one.
		const data = res?.verified !== undefined ? res : res?.message || res;

		if (data?.verified) {
			clearAttemptCounter();
			unlockSuccess();

			// Cache the hash for offline use — fire-and-forget so the UI unblocks at once
			if (globalThis.crypto?.subtle) {
				const user = getCurrentUserId();
				hashPassword(code)
					.then(({ hash, salt }) => cacheCodeHash(user, hash, salt))
					.catch(() => {});
			}
			return { success: true };
		}

		isVerifying.value = false;
		if (data?.locked) {
			// The server refused the attempt, or this wrong code made it lock the user: it is the server's wait to show,
			// and the attempt is not counted a second time on the device
			const wait = Number(data.wait_seconds) || 0;
			codeWaitUntil.value = Date.now() + wait * 1000;
			verifyError.value =
				data.message || __("Too many wrong codes. Try again in {0} seconds.", [wait]);
			return { success: false, locked: true };
		}

		recordFailedAttempt();
		verifyError.value = data?.message || __("Incorrect code");
		return { success: false };
	} catch (error) {
		const httpStatus = error?.status;

		// Session expired — 401 or 403 from Frappe's session middleware
		if (httpStatus === 401 || httpStatus === 403) {
			isVerifying.value = false;
			return { sessionExpired: true };
		}

		// Network error — fall back to the cached hash
		return unlockOfflineWithCode(code);
	}
}

function clearLock() {
	isLocked.value = false;
	lockedUser.value = null;
	verifyError.value = "";
	clearPersistedLock();
	clearCachedPasswordHash();
	clearAttemptCounter();
	//// Neoffice — the sign-out also forgets the code's hash, what the device knew of the code, and the moment of the last use.
	lockedByHand = false;
	codeWaitUntil.value = 0;
	clearCachedCodeHash();
	forgetTillCodeState();
	try {
		localStorage.removeItem(LAST_ACTIVE_KEY);
	} catch {
		// Ignore
	}
}

function handlePageHide() {
	//// Neoffice — a lock that waits for its delay does not lock a page that is merely put away (lockOnLeave); the moment of the last
	//// use, kept across page loads, is what locks a page that comes back late.
	if (!lockEnabled || !lockOnLeave) return;
	// Persist lock state on browser close / navigate away so the session
	// starts locked on reload even if it wasn't locked at the moment of closing
	if (!isLocked.value) {
		persistLock(getUserInfo());
	}
}

function startActivityTracking() {
	if (!lockEnabled) return;
	if (listenersAttached) return;

	for (const event of ACTIVITY_EVENTS) {
		document.addEventListener(event, resetTimer, { passive: true, capture: true });
	}
	document.addEventListener("visibilitychange", handleVisibilityChange);
	window.addEventListener("pagehide", handlePageHide);

	listenersAttached = true;
	//// Neoffice — a page that is loaded again after the delay, whose predecessor was the last to see a hand on the till, starts locked.
	if (!lockOnLeave && !isLocked.value && idleLongerThanDelay()) lock();
	lastActivityTime = Date.now();
	rememberActivity(lastActivityTime);
	if (!isLocked.value) inactivityTimer = setTimeout(tryLock, lockTimeoutMs);
}

function stopActivityTracking() {
	if (!listenersAttached) return;

	for (const event of ACTIVITY_EVENTS) {
		document.removeEventListener(event, resetTimer, { capture: true });
	}
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	window.removeEventListener("pagehide", handlePageHide);

	if (inactivityTimer) {
		clearTimeout(inactivityTimer);
		inactivityTimer = null;
	}

	listenersAttached = false;
}

//// Neoffice — the user's own "Lock": at once, whatever the auto-lock setting says, and it holds across a reload.
function lockNow() {
	lock({ manual: true });
}

/**
 * Configure the session lock behavior.
 * @param {Object} options
 * @param {boolean} options.enabled - Whether session lock is enabled
 * @param {number} options.timeoutMinutes - Inactivity timeout in minutes
 */
//// Neoffice — `lockOnLeave` joins the options: lock at once on leaving the screen, or only after the delay (see lockOnLeave above).
function configure({ enabled, timeoutMinutes, lockOnLeave: leaveLocks }) {
	lockEnabled = Boolean(enabled);
	lockTimeoutMs = (Number.parseInt(timeoutMinutes) || 5) * 60 * 1000;
	//// Neoffice — left as it was when the caller does not say (a caller written before the setting existed locks on leaving).
	if (leaveLocks !== undefined) lockOnLeave = Boolean(leaveLocks);

	if (!lockEnabled) {
		// Disable: stop tracking, clear any active lock
		stopActivityTracking();
		//// Neoffice — except a lock the user made with their own hand: switching the AUTOMATIC lock off must not undo it.
		if (isLocked.value && !lockedByHand) {
			isLocked.value = false;
			lockedUser.value = null;
			verifyError.value = "";
		}
		//// Neoffice — a lock that was kept (a hand lock) is kept in storage too.
		if (!isLocked.value) clearPersistedLock();
	} else if (listenersAttached) {
		// Already tracking — restart timer with new timeout
		if (inactivityTimer) {
			clearTimeout(inactivityTimer);
		}
		lastActivityTime = Date.now();
		inactivityTimer = setTimeout(tryLock, lockTimeoutMs);
	}
}

export function useSessionLock() {
	return {
		isLocked: readonly(isLocked),
		isVerifying: readonly(isVerifying),
		verifyError: readonly(verifyError),
		lockedUser: readonly(lockedUser),
		lock,
		//// Neoffice — "Lock" in the user's menu (whatever the auto-lock setting says) and the unlock with the personal code.
		lockNow,
		unlockWithCode,
		canCheckCodeOffline,
		codeWaitUntil: readonly(codeWaitUntil),
		unlock,
		clearLock,
		configure,
		startActivityTracking,
		stopActivityTracking,
		cachePasswordHashFromLogin,
	};
}
