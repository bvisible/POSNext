//// Neoffice — added file (no upstream equivalent). The offline side of the till's drawer movements
//// (« Entrées/Sorties de caisse », pos_next.api.cash_entry), NeoResto lot 1 task 15. It follows the till's
//// own offline machinery: the same IndexedDB database (db.js, its `cash_movement_queue` store), the same
//// coalescing mutex and API wrapper as the offline sales and upstream's offline expenses, the same trigger
//// (posSync.syncPending on the way back online), and the same server-side guarantee: each movement carries an
//// offline id the server books once, so a resend after a lost answer returns the entry already made. A
//// movement made offline counts in the drawer at once (the dialog adds the queue to its totals) and the shift
//// cannot be closed while one of its cashier's is still queued (countCashMovementsKeepingTheShiftOpen).
//// Each row is its cashier's: the sync sends only the signed-in cashier's rows, under their own session. A
//// row the server refuses (its shift closed meanwhile, the cap, a right) leaves the sending loop: it is shown
//// as refused with the reason, kept for the manager or set aside with a reason the server writes on its
//// shift (set_aside_refused_cash_movement), so the money that moved stays traceable; it is never sent again.
/**
 * @module utils/offline/cashMovements
 */
import { call } from "@/utils/apiWrapper";
import { logger } from "@/utils/logger";
import { CoalescingMutex } from "@/utils/mutex";
import { db, getSetting, setSetting } from "./db";
import { offlineState } from "./offlineState";
import { generateUUID } from "./uuid";

const log = logger.create("CashMovements");
const syncMutex = new CoalescingMutex({ timeout: 60000, name: "CashMovementSync" });

const CREATE_METHOD = "pos_next.api.cash_entry.create_cash_entry";
const SET_ASIDE_METHOD = "pos_next.api.cash_entry.set_aside_refused_cash_movement";
const DIALOG_METHOD = "pos_next.api.cash_entry.get_cash_movement_dialog_data";
const ATTACH_URL = "/api/method/pos_next.api.cash_entry.attach_cash_entry_file";

/**
 * The answers that are the server's refusal of the movement itself (a ValidationError such as « Shift is not
 * open » or the cap, a PermissionError, a record that no longer exists): sending it again changes nothing.
 */
const REFUSAL_STATUSES = new Set([403, 404, 409, 417, 422]);

/**
 * A movement the server keeps failing on with another error (neither a refusal nor an unreachable server) is
 * treated as refused after this many tries: never sent again and again.
 */
export const MAX_CASH_MOVEMENT_SERVER_ERRORS = 5;

/**
 * The signed-in user, as the server sees the session (the `user_id` cookie Frappe sets), or null.
 * @returns {string|null}
 */
export const sessionUserId = () => {
	let user = null;
	try {
		const cookie = String(globalThis.document?.cookie || "")
			.split("; ")
			.find((part) => part.startsWith("user_id="));
		user = cookie ? decodeURIComponent(cookie.slice("user_id=".length)) : null;
	} catch {
		user = null;
	}
	user = user || globalThis.window?.frappe?.session?.user || null;
	return user && user !== "Guest" ? user : null;
};

/** A row is its cashier's; a row queued before rows carried their cashier belongs to whoever signs in. */
const belongsTo = (row, user) => !user || !row.user || row.user === user;

/** Waiting to be sent: neither booked nor refused. */
const isWaiting = (row) => !row.synced && !row.refused;

/** Refused by the server and not set aside yet. */
const isRefused = (row) => !row.synced && Boolean(row.refused);

/** The receipt files the server accepts (pos_next.api.cash_entry.ATTACHMENT_EXTENSIONS). */
export const CASH_MOVEMENT_ATTACHMENT_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".pdf",
	".txt",
	".csv",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".odt",
	".ods",
];

/** The site's maximum file size when the dialog has not read it yet. */
export const DEFAULT_CASH_MOVEMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** A movement's id in the offline queue, the one the server dedups on. */
export const generateOfflineCashMovementId = () => `pos_cash_${generateUUID()}`;

/** The database's own failures that a second try clears (MariaDB 1213 deadlock, 1205 lock wait). */
const TRANSIENT_EXCEPTIONS = new Set(["QueryDeadlockError", "QueryTimeoutError"]);

/**
 * Whether a failed call never got an answer from the server (no network, a gateway down): such a movement
 * is kept in the queue and sent again; any other failure is the server's refusal, shown as it is.
 * @param {Error} error
 * @returns {boolean}
 */
export const isTransientError = (error) => {
	const status = Number(error?.status) || 0;
	if (status === 0 || status === 502 || status === 503 || status === 504) return true;
	// Two capped tills taking money out at the same moment can deadlock in the database, or wait too long
	// for a lock: Frappe answers 500 with these types. The movement was not booked; sending it again is safe.
	return TRANSIENT_EXCEPTIONS.has(error?.exc_type);
};

/**
 * Whether a refusal means the till's session is over (it expired while the till was offline): Frappe then
 * answers the request as a visitor (401, or 403 « Not permitted ») and clears the session cookies. The
 * movement was not refused; it waits for the cashier to sign in again.
 * @param {Error} error
 * @returns {boolean}
 */
export const isSessionEnded = (error) => {
	const status = Number(error?.status) || 0;
	return status === 401 || (status === 403 && !sessionUserId());
};

/**
 * Whether the server refused the movement itself (see REFUSAL_STATUSES).
 * @param {Error} error
 * @returns {boolean}
 */
export const isRefusal = (error) => REFUSAL_STATUSES.has(Number(error?.status) || 0);

/**
 * Why a receipt cannot be queued or sent: "type", "empty" or "size", or null when it can.
 * @param {{name?: string, size?: number, blob?: Blob}} file
 * @param {number} [maxFileSize]
 * @returns {"type"|"empty"|"size"|null}
 */
export const cashMovementAttachmentProblem = (file, maxFileSize = DEFAULT_CASH_MOVEMENT_MAX_FILE_SIZE) => {
	const name = String(file?.name || "").toLowerCase();
	const dot = name.lastIndexOf(".");
	if (dot < 0 || !CASH_MOVEMENT_ATTACHMENT_EXTENSIONS.includes(name.slice(dot))) return "type";
	const size = Number(file?.size ?? file?.blob?.size ?? 0);
	if (!Number.isFinite(size) || size <= 0) return "empty";
	if (size > (Number(maxFileSize) > 0 ? Number(maxFileSize) : DEFAULT_CASH_MOVEMENT_MAX_FILE_SIZE)) return "size";
	return null;
};

/** The settings key of the dialog's data for one till and one shift: a shift never reads another's totals. */
export const cashMovementDialogCacheKey = (posProfile, posOpeningShift) =>
	`cash_movement_dialog:${posProfile}:${posOpeningShift}`;

/**
 * Keep the dialog's data (get_cash_movement_dialog_data) for offline use.
 * @returns {Promise<boolean>}
 */
export const cacheCashMovementDialogData = async (posProfile, posOpeningShift, payload) => {
	if (!posProfile || !posOpeningShift || !payload) return false;
	return Boolean(
		await setSetting(cashMovementDialogCacheKey(posProfile, posOpeningShift), {
			...payload,
			pos_profile: posProfile,
			pos_opening_shift: posOpeningShift,
			cached_at: Date.now(),
		}),
	);
};

/** @returns {Promise<Object|null>} */
export const getCashMovementDialogCache = async (posProfile, posOpeningShift) => {
	if (!posProfile || !posOpeningShift) return null;
	const cache = await getSetting(cashMovementDialogCacheKey(posProfile, posOpeningShift), null);
	if (!cache || cache.pos_opening_shift !== posOpeningShift || cache.pos_profile !== posProfile) return null;
	return cache;
};

/**
 * Read the dialog's data once the shift is open and keep it, so a movement can be recorded offline before
 * the dialog was ever opened online. A failure only means the dialog reads it when it opens.
 * @returns {Promise<boolean>}
 */
export const preloadCashMovementDialogData = async (posProfile, posOpeningShift) => {
	if (!posProfile || !posOpeningShift || offlineState.isOffline) return false;
	try {
		const data = await call(DIALOG_METHOD, {
			pos_opening_shift: posOpeningShift,
		});
		return data ? await cacheCashMovementDialogData(posProfile, posOpeningShift, data) : false;
	} catch (error) {
		log.warn("Cash movement dialog data not preloaded", error);
		return false;
	}
};

/**
 * Money still allowed out during the shift: the till's cap less what the server counted and what the queue
 * holds. Null when the till has no cap.
 */
export const getCashOutRemaining = ({ outLimit = 0, outTotal = 0, pendingOut = 0 } = {}) => {
	const limit = Number(outLimit) || 0;
	if (limit <= 0) return null;
	return Math.max(0, Math.round((limit - (Number(outTotal) || 0) - (Number(pendingOut) || 0)) * 100) / 100);
};

/** The shift cannot be closed while a movement (or its receipt) is still in the queue. */
export const canCloseShiftWithPendingCashMovements = (pendingCount) => !(Number(pendingCount) > 0);

/**
 * The queue's rows waiting to be sent (refused rows are not), oldest first; those of one shift when it is
 * named, those of one cashier when `user` is given.
 * @param {string} [posOpeningShift]
 * @param {{user?: string|null}} [options]
 * @returns {Promise<Array>}
 */
export const getPendingCashMovements = async (posOpeningShift = null, { user = null } = {}) => {
	try {
		const rows = await db.cash_movement_queue.filter(isWaiting).toArray();
		return rows
			.filter((row) => !posOpeningShift || row.data?.pos_opening_shift === posOpeningShift)
			.filter((row) => belongsTo(row, user))
			.sort((a, b) => a.id - b.id);
	} catch (error) {
		log.error("Failed to read the cash movement queue", error);
		return [];
	}
};

/**
 * The rows waiting to be sent by the signed-in cashier's session (the header badge), or by `user`.
 * @param {{user?: string|null}} [options]
 * @returns {Promise<number>}
 */
export const getPendingCashMovementCount = async ({ user = sessionUserId() } = {}) => {
	try {
		return await db.cash_movement_queue.filter((row) => isWaiting(row) && belongsTo(row, user)).count();
	} catch (error) {
		log.error("Failed to count the cash movement queue", error);
		return 0;
	}
};

/**
 * What keeps a shift from closing: its cashier's movements still waiting to be sent. Another shift's rows
 * (refused when that shift was closed elsewhere), another cashier's rows and refused rows never do: they do
 * not belong in this closing, and the till could not send them anyway.
 * @param {string} posOpeningShift
 * @param {string|null} [user]
 * @returns {Promise<number>}
 */
export const countCashMovementsKeepingTheShiftOpen = async (posOpeningShift, user = sessionUserId()) =>
	posOpeningShift ? (await getPendingCashMovements(posOpeningShift, { user })).length : 0;

/**
 * The movements the server refused, not set aside yet, oldest first: a cashier's own (`user`), or every
 * cashier's when `user` is null (a till manager); `withKeptForManager` adds those any cashier kept for the
 * manager (the closing lists them).
 * @param {{user?: string|null, withKeptForManager?: boolean}} [options]
 * @returns {Promise<Array>}
 */
export const getRefusedCashMovements = async ({ user = null, withKeptForManager = false } = {}) => {
	try {
		const rows = await db.cash_movement_queue.filter(isRefused).toArray();
		return rows
			.filter((row) => belongsTo(row, user) || (withKeptForManager && row.kept_for_manager))
			.sort((a, b) => a.id - b.id);
	} catch (error) {
		log.error("Failed to read the refused cash movements", error);
		return [];
	}
};

/**
 * What the queue still has to book in the drawer, by direction: a row whose entry the server already made
 * (only its receipt is waiting) is counted by the server's list instead, and a refused row was never booked.
 * @param {Array} rows
 * @returns {{in: number, out: number}}
 */
export const pendingCashTotals = (rows) =>
	(rows || []).reduce(
		(totals, row) => {
			if (row.synced || row.server_journal_entry || row.refused) return totals;
			const amount = Number(row.data?.amount) || 0;
			if (row.data?.direction === "in") totals.in += amount;
			else totals.out += amount;
			return totals;
		},
		{ in: 0, out: 0 },
	);

/**
 * The queue's rows that the server's list does not already show. After a lost answer (a 504) a movement is queued
 * under the same `offline_id` although the server booked it: the dialog then holds it twice, once in the server's
 * list and once in the queue, and counts it twice until the next sync resends it. A row whose `offline_id` the
 * server's movements carry is dropped. A row that already has its `server_journal_entry` stays: only its receipt
 * is waiting, the dialog says so, and its amount is not counted from the queue anyway.
 * @param {Array} rows - the queue's waiting rows
 * @param {Array} movements - the server's movements of the shift (each may carry the `offline_id` that booked it)
 * @returns {Array}
 */
export const withoutBookedRows = (rows, movements) => {
	const booked = new Set((movements || []).map((movement) => movement?.offline_id).filter(Boolean));
	return (rows || []).filter((row) => row.server_journal_entry || !row.offline_id || !booked.has(row.offline_id));
};

/**
 * Put a movement (and its receipt) in the queue. A movement the server already booked comes with its
 * `server_journal_entry`: only its receipt waits, and the cap is not checked again. The row keeps its cashier
 * (`user`, the signed-in one by default) and when the money moved (`moved_at`, now by default), which the
 * server books it on.
 * @param {Object} movement - pos_opening_shift, pos_profile, template_name, direction, amount, remark, no_vat, offline_id, user, moved_at
 * @param {{name: string, type?: string, size?: number, blob: Blob}|null} [attachment]
 * @param {{out_limit?: number, out_total?: number, max_file_size?: number}} [limits]
 * @returns {Promise<{id: number, offline_id: string}>}
 */
export const saveOfflineCashMovement = async (movement, attachment = null, limits = {}) => {
	const amount = Number(movement?.amount);
	if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
	if (!movement?.pos_opening_shift || !movement?.pos_profile || !movement?.template_name) {
		throw new Error("The shift, the till and the operation are required");
	}
	if (!movement.server_journal_entry && movement.direction === "out") {
		// The rows the server's list (`limits.movements`, when the dialog gives it) already holds are in `out_total`: not counted twice.
		const pending = withoutBookedRows(
			await getPendingCashMovements(movement.pos_opening_shift),
			limits.movements,
		);
		const remaining = getCashOutRemaining({
			outLimit: limits.out_limit,
			outTotal: limits.out_total,
			pendingOut: pendingCashTotals(pending).out,
		});
		if (remaining !== null && amount > remaining + 0.000001) {
			const error = new Error("Amount exceeds the cash out still allowed during this shift");
			error.code = "limit";
			error.remaining = remaining;
			throw error;
		}
	}
	let stored = null;
	if (attachment) {
		const blob = attachment.blob || (attachment instanceof Blob ? attachment : null);
		const file = { name: attachment.name || blob?.name || "", size: attachment.size ?? blob?.size, blob };
		const problem = cashMovementAttachmentProblem(file, limits.max_file_size);
		if (problem || !blob) {
			const error = new Error(`Receipt refused: ${problem || "missing"}`);
			error.code = problem || "missing";
			throw error;
		}
		stored = { name: file.name, type: attachment.type || blob.type || "", size: file.size, blob };
	}
	const offlineId = movement.offline_id || generateOfflineCashMovementId();
	const now = Date.now();
	const id = await db.cash_movement_queue.add({
		offline_id: offlineId,
		user: movement.user || sessionUserId(),
		data: {
			pos_opening_shift: movement.pos_opening_shift,
			pos_profile: movement.pos_profile,
			template_name: movement.template_name,
			template_title: movement.template_title || movement.template_name,
			direction: movement.direction === "in" ? "in" : "out",
			amount,
			remark: String(movement.remark || "").trim(),
			no_vat: movement.no_vat ? 1 : 0,
			offline_id: offlineId,
			moved_at: Number(movement.moved_at) > 0 ? Number(movement.moved_at) : now,
		},
		attachment: stored,
		server_journal_entry: movement.server_journal_entry || null,
		timestamp: now,
		synced: false,
		refused: false,
		retry_count: 0,
	});
	log.info("Cash movement queued", { offline_id: offlineId, receipt: Boolean(stored) });
	return { id, offline_id: offlineId };
};

/**
 * Remove a queued movement the server never received. Refused once the server booked it: it is then
 * cancelled at the till like any other movement.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const deleteOfflineCashMovement = async (id) => {
	const row = await db.cash_movement_queue.get(id);
	if (!row) return false;
	if (row.synced || row.server_journal_entry) {
		throw new Error("This movement already reached the server: cancel it instead");
	}
	if (row.refused) {
		// The money moved and the server said no: it leaves the device only with a trace on its shift.
		throw new Error("This movement was refused by the server: set it aside with a reason instead");
	}
	await db.cash_movement_queue.delete(id);
	return true;
};

/**
 * Keep a refused movement on this device for the manager: it stays listed (in the dialog and on the closing)
 * until someone sets it aside with a reason.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const keepRefusedCashMovementForManager = async (id) => {
	const row = await db.cash_movement_queue.get(id);
	if (!row || !isRefused(row)) return false;
	await db.cash_movement_queue.update(id, { kept_for_manager: true, kept_at: Date.now() });
	return true;
};

/**
 * Put a refused movement back in the sending loop (« Send again »), when what refused it may have changed (a
 * manager raised the cap, a right was given). Shown, like « Discard », to its cashier and to a till manager;
 * it is then sent under its own cashier's session, through every check of create_cash_entry.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export const resendRefusedCashMovement = async (id) => {
	const row = await db.cash_movement_queue.get(id);
	if (!row || !isRefused(row)) return false;
	await db.cash_movement_queue.update(id, {
		refused: false,
		refused_at: null,
		sync_failed: false,
		error: null,
		retry_count: 0,
		resent_at: Date.now(),
	});
	return true;
};

/**
 * Set a refused movement aside: the server writes what it was and why on its shift (a Comment), then the
 * device forgets it. A reason is required. When the server answers that it booked that offline id after all,
 * the row is marked as booked instead.
 * @param {number} id
 * @param {string} reason
 * @returns {Promise<Object>} The server's answer.
 */
export const setAsideRefusedCashMovement = async (id, reason) => {
	const row = await db.cash_movement_queue.get(id);
	if (!row || !isRefused(row)) throw new Error("This movement is not a refused one");
	const why = String(reason || "").trim();
	if (!why) {
		const error = new Error("A reason is required");
		error.code = "reason";
		throw error;
	}
	const response = await call(SET_ASIDE_METHOD, {
		pos_opening_shift: row.data.pos_opening_shift,
		offline_id: row.offline_id,
		reason: why,
		template_title: row.data.template_title,
		direction: row.data.direction,
		amount: row.data.amount,
		remark: row.data.remark || undefined,
		refusal: row.error || undefined,
		recorded_by: row.user || undefined,
		moved_at: row.data.moved_at || row.timestamp,
	});
	if (response?.booked) {
		await markSynced(id, response.booked, { refused: false });
	} else {
		await db.cash_movement_queue.delete(id);
	}
	return response;
};

/**
 * Send one receipt to its movement's entry. The server attaches the same file once.
 * @returns {Promise<Object>}
 */
export const uploadCashMovementAttachment = async (attachment, journalEntry) => {
	const formData = new FormData();
	formData.append("file", attachment.blob, attachment.name);
	formData.append("journal_entry", journalEntry);
	let response;
	try {
		response = await fetch(ATTACH_URL, {
			method: "POST",
			headers: { "X-Frappe-CSRF-Token": window.csrf_token },
			body: formData,
		});
	} catch (networkError) {
		const error = new Error(networkError?.message || "Network error");
		error.status = 0;
		throw error;
	}
	const body = await response.json().catch(() => ({}));
	if (!response.ok || body.exc) {
		let message = body?._error_message || body?.message;
		try {
			message = message || JSON.parse(JSON.parse(body._server_messages)[0]).message;
		} catch {
			// no server message: the generic one below
		}
		const error = new Error(typeof message === "string" && message ? message : "The receipt was not attached");
		error.status = response.status || 0;
		throw error;
	}
	return body.message;
};

const markSynced = async (id, journalEntry, extra = {}) => {
	await db.cash_movement_queue.update(id, {
		synced: true,
		server_journal_entry: journalEntry,
		attachment: null,
		sync_failed: false,
		error: null,
		synced_at: Date.now(),
		...extra,
	});
};

const messageOf = (error) => error?.messages?.[0] || error?.message || String(error);

/**
 * Book one queued movement, then send its receipt. Throws when the server could not be reached (the row
 * stays queued as it was) or when it refused the movement (the row is marked failed by the caller).
 */
const syncOne = async (row) => {
	let journalEntry = row.server_journal_entry || null;
	let cancelled = false;
	if (!journalEntry) {
		const response = await call(CREATE_METHOD, {
			pos_opening_shift: row.data.pos_opening_shift,
			template_name: row.data.template_name,
			amount: row.data.amount,
			remark: row.data.remark || undefined,
			no_vat: row.data.no_vat ? 1 : 0,
			offline_id: row.offline_id,
			// When the money moved: the server books the movement on that business day, not the day it syncs.
			moved_at: row.data.moved_at || row.timestamp,
		});
		journalEntry = response?.journal_entry || response?.name;
		if (!journalEntry) throw new Error("The server answered without a journal entry");
		cancelled = Boolean(response?.cancelled);
		await db.cash_movement_queue.update(row.id, { server_journal_entry: journalEntry });
	}
	if (row.attachment && !cancelled) {
		try {
			await uploadCashMovementAttachment(row.attachment, journalEntry);
		} catch (error) {
			if (isTransientError(error) || isSessionEnded(error)) throw error;
			// Refused for good (the shift closed meanwhile, a file the server will not take): the movement
			// stands, the receipt is dropped and the reason kept for the dialog.
			await markSynced(row.id, journalEntry, { attachment_error: messageOf(error) });
			return { journal_entry: journalEntry, attachment_error: messageOf(error) };
		}
	}
	await markSynced(row.id, journalEntry);
	return { journal_entry: journalEntry, cancelled };
};

/**
 * Send the signed-in cashier's queue (or `user`'s), oldest first, one at a time: another cashier's rows wait
 * for their own session. The server books each offline id once. When the server cannot be reached the pass
 * stops, so the movements left reach it later in the order they were made. A movement the server refuses
 * leaves the loop as refused, with its reason (never sent again); another error is tried again on the next
 * passes, then treated as refused after MAX_CASH_MOVEMENT_SERVER_ERRORS tries. No pass runs without a signed-in
 * cashier, and one stops when the session ends on the way (isSessionEnded): an expired session refuses
 * nothing. A database deadlock or lock wait is treated like an unreachable server. The dialog's offline data of
 * every shift that had a movement booked is read again, so its totals and the cap's allowance stay true
 * while the dialog is closed.
 * @param {{user?: string|null}} [options]
 * @returns {Promise<{success: number, failed: number, refused: number, skipped: number, errors: Array}>}
 */
export const syncOfflineCashMovements = async ({ user = sessionUserId() } = {}) => {
	const empty = { success: 0, failed: 0, refused: 0, skipped: 0, errors: [] };
	if (offlineState.isOffline) return empty;
	// No cashier signed in (the session expired): nothing is sent, so nothing can be refused for it.
	if (!user) return { ...empty, stopped: "session" };
	return await syncMutex.withLock(async () => {
		const pending = await getPendingCashMovements(null, { user });
		const result = { ...empty, errors: [] };
		const booked = new Map();
		for (const queued of pending) {
			const row = (await db.cash_movement_queue.get(queued.id)) || queued;
			if (!isWaiting(row)) {
				result.skipped++;
				continue;
			}
			try {
				await syncOne(row);
				result.success++;
				booked.set(`${row.data.pos_profile}\u0000${row.data.pos_opening_shift}`, row.data);
			} catch (error) {
				if (isTransientError(error)) {
					log.warn("Server unreachable: the cash movement queue waits", { id: row.id });
					break;
				}
				if (isSessionEnded(error)) {
					log.warn("The session ended: the cash movement queue waits for a sign-in", { id: row.id });
					result.stopped = "session";
					break;
				}
				// A row queued before rows named their cashier is sent by whoever is signed in: refused as « not
				// permitted », it is somebody else's and waits for them, never refused for good.
				const notThisCashiers = !row.user && Number(error?.status) === 403;
				const tries = notThisCashiers ? row.retry_count || 0 : (row.retry_count || 0) + 1;
				const refused =
					!notThisCashiers && (isRefusal(error) || tries >= MAX_CASH_MOVEMENT_SERVER_ERRORS);
				log.error(refused ? "Cash movement refused by the server" : "Cash movement not booked yet", {
					id: row.id,
					error,
				});
				await db.cash_movement_queue.update(row.id, {
					sync_failed: true,
					refused,
					refused_at: refused ? Date.now() : null,
					error: messageOf(error),
					retry_count: tries,
				});
				result.failed++;
				if (refused) result.refused++;
				result.errors.push({ cashMovementId: row.id, offlineId: row.offline_id, refused, error });
			}
		}
		for (const data of booked.values()) {
			await preloadCashMovementDialogData(data.pos_profile, data.pos_opening_shift);
		}
		if ((result.success > 0 || result.failed > 0) && typeof window !== "undefined") {
			window.dispatchEvent(new CustomEvent("offlineCashMovementsSynced", { detail: result }));
		}
		return result;
	}, log.debug.bind(log));
};

/**
 * Record a movement from the dialog: straight to the server when the till is online, into the queue when
 * it is offline or the server cannot be reached (with the same offline id, so a request that did arrive is
 * not booked twice). A receipt the server could not take now is queued alone and sent with the next sync.
 * @returns {Promise<Object>} The server's answer, or `{queued: true, offline_id}`.
 */
export const recordCashMovement = async ({ movement, attachment = null, limits = {}, offline = false }) => {
	const queued = {
		...movement,
		offline_id: movement.offline_id || generateOfflineCashMovementId(),
		user: movement.user || sessionUserId(),
		// Kept only for a movement that ends up in the queue: an online call sends none, and the server books
		// it at its own time, whatever this device's clock says.
		moved_at: Number(movement.moved_at) > 0 ? Number(movement.moved_at) : Date.now(),
	};
	if (offline) {
		const saved = await saveOfflineCashMovement(queued, attachment, limits);
		return { queued: true, ...saved };
	}
	let response;
	try {
		response = await call(CREATE_METHOD, {
			pos_opening_shift: queued.pos_opening_shift,
			template_name: queued.template_name,
			amount: queued.amount,
			remark: queued.remark || undefined,
			no_vat: queued.no_vat ? 1 : 0,
			offline_id: queued.offline_id,
		});
	} catch (error) {
		if (!isTransientError(error)) throw error;
		const saved = await saveOfflineCashMovement(queued, attachment, limits);
		return { queued: true, ...saved };
	}
	const journalEntry = response?.journal_entry || response?.name;
	if (attachment && journalEntry && !response?.cancelled) {
		try {
			await uploadCashMovementAttachment(attachment, journalEntry);
		} catch (error) {
			if (!isTransientError(error)) return { ...response, attachment_error: messageOf(error) };
			await saveOfflineCashMovement({ ...queued, server_journal_entry: journalEntry }, attachment, limits);
			return { ...response, attachment_queued: true };
		}
	}
	return { ...response, queued: false };
};
