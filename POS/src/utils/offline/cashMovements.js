//// Neoffice — added file (no upstream equivalent). The offline side of the till's drawer movements
//// (« Entrées/Sorties de caisse », pos_next.api.cash_entry), NeoRestau lot 1 task 15. It follows the till's
//// own offline machinery: the same IndexedDB database (db.js, its `cash_movement_queue` store), the same
//// coalescing mutex and API wrapper as the offline sales and upstream's offline expenses, the same trigger
//// (posSync.syncPending on the way back online), and the same server-side guarantee: each movement carries an
//// offline id the server books once, so a resend after a lost answer returns the entry already made. A
//// movement made offline counts in the drawer at once (the dialog adds the queue to its totals) and the shift
//// cannot be closed while one is still queued (canCloseShiftWithPendingCashMovements).
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
const ATTACH_URL = "/api/method/pos_next.api.cash_entry.attach_cash_entry_file";

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

/**
 * Whether a failed call never got an answer from the server (no network, a gateway down): such a movement
 * is kept in the queue and sent again; any other failure is the server's refusal, shown as it is.
 * @param {Error} error
 * @returns {boolean}
 */
export const isTransientError = (error) => {
	const status = Number(error?.status) || 0;
	return status === 0 || status === 502 || status === 503 || status === 504;
};

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
		const data = await call("pos_next.api.cash_entry.get_cash_movement_dialog_data", {
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
 * The queue's rows not yet sent, oldest first; those of one shift when it is named.
 * @param {string} [posOpeningShift]
 * @returns {Promise<Array>}
 */
export const getPendingCashMovements = async (posOpeningShift = null) => {
	try {
		const rows = await db.cash_movement_queue.filter((row) => !row.synced).toArray();
		return rows
			.filter((row) => !posOpeningShift || row.data?.pos_opening_shift === posOpeningShift)
			.sort((a, b) => a.id - b.id);
	} catch (error) {
		log.error("Failed to read the cash movement queue", error);
		return [];
	}
};

/** @returns {Promise<number>} */
export const getPendingCashMovementCount = async () => {
	try {
		return await db.cash_movement_queue.filter((row) => !row.synced).count();
	} catch (error) {
		log.error("Failed to count the cash movement queue", error);
		return 0;
	}
};

/**
 * What the queue still has to book in the drawer, by direction: a row whose entry the server already made
 * (only its receipt is waiting) is counted by the server's list instead.
 * @param {Array} rows
 * @returns {{in: number, out: number}}
 */
export const pendingCashTotals = (rows) =>
	(rows || []).reduce(
		(totals, row) => {
			if (row.synced || row.server_journal_entry) return totals;
			const amount = Number(row.data?.amount) || 0;
			if (row.data?.direction === "in") totals.in += amount;
			else totals.out += amount;
			return totals;
		},
		{ in: 0, out: 0 },
	);

/**
 * Put a movement (and its receipt) in the queue. A movement the server already booked comes with its
 * `server_journal_entry`: only its receipt waits, and the cap is not checked again.
 * @param {Object} movement - pos_opening_shift, pos_profile, template_name, direction, amount, remark, no_vat, offline_id
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
		const pending = await getPendingCashMovements(movement.pos_opening_shift);
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
	const id = await db.cash_movement_queue.add({
		offline_id: offlineId,
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
		},
		attachment: stored,
		server_journal_entry: movement.server_journal_entry || null,
		timestamp: Date.now(),
		synced: false,
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
	await db.cash_movement_queue.delete(id);
	return true;
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
			if (isTransientError(error)) throw error;
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
 * Send the queue, oldest first, one at a time. The server books each offline id once. When the server
 * cannot be reached the pass stops, so the movements left reach it later in the order they were made; a
 * movement the server refuses is marked failed with its reason and the pass goes on.
 * @returns {Promise<{success: number, failed: number, skipped: number, errors: Array}>}
 */
export const syncOfflineCashMovements = async () => {
	const empty = { success: 0, failed: 0, skipped: 0, errors: [] };
	if (offlineState.isOffline) return empty;
	return await syncMutex.withLock(async () => {
		const pending = await getPendingCashMovements();
		const result = { ...empty, errors: [] };
		for (const queued of pending) {
			const row = (await db.cash_movement_queue.get(queued.id)) || queued;
			if (row.synced) {
				result.skipped++;
				continue;
			}
			try {
				await syncOne(row);
				result.success++;
			} catch (error) {
				if (isTransientError(error)) {
					log.warn("Server unreachable: the cash movement queue waits", { id: row.id });
					break;
				}
				log.error("Cash movement refused by the server", { id: row.id, error });
				await db.cash_movement_queue.update(row.id, {
					sync_failed: true,
					error: messageOf(error),
					retry_count: (row.retry_count || 0) + 1,
				});
				result.failed++;
				result.errors.push({ cashMovementId: row.id, offlineId: row.offline_id, error });
			}
		}
		if (result.success > 0 && typeof window !== "undefined") {
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
	const queued = { ...movement, offline_id: movement.offline_id || generateOfflineCashMovementId() };
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
