//// Neoffice — added file (no upstream equivalent). The till's drawer movements made offline (NeoResto lot 1,
//// task 15): queued like an offline sale, sent once, in the order they were made, never twice.
/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => call(...args) }));
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}));
const offline = { isOffline: false };
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: offline }));

const rows = new Map();
let nextId = 1;
const settings = new Map();
vi.mock("@/utils/offline/db", () => {
	const cash_movement_queue = {
		async add(row) {
			const id = nextId++;
			rows.set(id, { ...row, id });
			return id;
		},
		async get(id) {
			return rows.get(id) ? { ...rows.get(id) } : undefined;
		},
		async delete(id) {
			rows.delete(id);
		},
		async update(id, patch) {
			if (rows.has(id)) rows.set(id, { ...rows.get(id), ...patch });
		},
		filter(predicate) {
			const found = [...rows.values()].filter(predicate).map((row) => ({ ...row }));
			return {
				async toArray() {
					return found;
				},
				async count() {
					return found.length;
				},
			};
		},
	};
	return {
		db: { cash_movement_queue },
		getSetting: async (key, fallback = null) => (settings.has(key) ? settings.get(key) : fallback),
		setSetting: async (key, value) => {
			settings.set(key, value);
			return true;
		},
	};
});

const fetchMock = vi.fn();
globalThis.fetch = (...args) => fetchMock(...args);

const {
	MAX_CASH_MOVEMENT_SERVER_ERRORS,
	canCloseShiftWithPendingCashMovements,
	cashMovementAttachmentProblem,
	cashMovementDialogCacheKey,
	countCashMovementsKeepingTheShiftOpen,
	deleteOfflineCashMovement,
	getCashMovementDialogCache,
	cacheCashMovementDialogData,
	getCashOutRemaining,
	getPendingCashMovementCount,
	getPendingCashMovements,
	getRefusedCashMovements,
	keepRefusedCashMovementForManager,
	pendingCashTotals,
	recordCashMovement,
	saveOfflineCashMovement,
	sessionUserId,
	setAsideRefusedCashMovement,
	resendRefusedCashMovement,
	syncOfflineCashMovements,
} = await import("@/utils/offline/cashMovements");

const SHIFT = "POS-OPEN-1";
const PROFILE = "Till 1";
const CREATE = "pos_next.api.cash_entry.create_cash_entry";
const DIALOG = "pos_next.api.cash_entry.get_cash_movement_dialog_data";
const SET_ASIDE = "pos_next.api.cash_entry.set_aside_refused_cash_movement";
/** The calls that book a movement (a sync also reads the dialog's data again afterwards). */
const creates = () => call.mock.calls.filter(([method]) => method === CREATE);
const signIn = (user) => {
	document.cookie = user ? `user_id=${encodeURIComponent(user)}; path=/` : "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

const movement = (overrides = {}) => ({
	pos_opening_shift: SHIFT,
	pos_profile: PROFILE,
	template_name: "Supplier payment",
	direction: "out",
	amount: 30,
	remark: "Wine merchant",
	...overrides,
});

const httpError = (status, message = "Refused", excType = undefined) =>
	Object.assign(new Error(message), { status, messages: [message], exc_type: excType });
const networkError = () => new TypeError("Failed to fetch");
const okUpload = () => ({ ok: true, status: 200, json: async () => ({ message: { name: "FILE-1" } }) });
const receipt = () => ({ name: "receipt.jpg", type: "image/jpeg", size: 5, blob: new Blob(["photo"], { type: "image/jpeg" }) });

beforeEach(() => {
	rows.clear();
	settings.clear();
	nextId = 1;
	offline.isOffline = false;
	call.mockReset();
	fetchMock.mockReset();
	// A till is used signed in: no pass runs without a cashier (see « an expired session »).
	signIn("anna@example.com");
	vi.useRealTimers();
});

describe("the drawer movements' offline queue", () => {
	it("queues a movement with its own offline id and the receipt's photo", async () => {
		const saved = await saveOfflineCashMovement(movement(), receipt());
		const row = rows.get(saved.id);
		expect(saved.offline_id).toMatch(/^pos_cash_/);
		expect(row.offline_id).toBe(saved.offline_id);
		expect(row.data.offline_id).toBe(saved.offline_id);
		expect(row.synced).toBe(false);
		expect(row.attachment.blob).toBeInstanceOf(Blob);
		expect(await getPendingCashMovementCount()).toBe(1);
	});

	it("counts a queued movement in the drawer at once, and the queue's money out against the cap", async () => {
		await saveOfflineCashMovement(movement({ amount: 60 }), null, { out_limit: 100, out_total: 0 });
		await saveOfflineCashMovement(movement({ direction: "in", amount: 500 }), null, { out_limit: 100 });
		const totals = pendingCashTotals(await getPendingCashMovements(SHIFT));
		expect(totals).toEqual({ in: 500, out: 60 });
		await expect(
			saveOfflineCashMovement(movement({ amount: 50 }), null, { out_limit: 100, out_total: 0 }),
		).rejects.toMatchObject({ code: "limit", remaining: 40 });
		await expect(
			saveOfflineCashMovement(movement({ amount: 40 }), null, { out_limit: 100, out_total: 0 }),
		).resolves.toMatchObject({ offline_id: expect.stringMatching(/^pos_cash_/) });
		expect(getCashOutRemaining({ outLimit: 0, outTotal: 999 })).toBeNull();
	});

	it("checks the receipt like the server: its type, its size, not empty", () => {
		expect(cashMovementAttachmentProblem({ name: "receipt.JPG", size: 10 }, 100)).toBeNull();
		expect(cashMovementAttachmentProblem({ name: "receipt.pdf", size: 10 }, 100)).toBeNull();
		expect(cashMovementAttachmentProblem({ name: "receipt.exe", size: 10 }, 100)).toBe("type");
		expect(cashMovementAttachmentProblem({ name: "receipt.png", size: 0 }, 100)).toBe("empty");
		expect(cashMovementAttachmentProblem({ name: "receipt.png", size: 101 }, 100)).toBe("size");
	});

	it("sends the queue oldest first, once each, and keeps the shift open until then", async () => {
		const first = await saveOfflineCashMovement(movement({ amount: 10 }));
		const second = await saveOfflineCashMovement(movement({ direction: "in", amount: 20, template_name: "Pay-in" }));
		expect(canCloseShiftWithPendingCashMovements(await getPendingCashMovementCount())).toBe(false);
		call.mockImplementation(async (_method, args) => ({ name: `JE-${args.amount}`, journal_entry: `JE-${args.amount}` }));

		const result = await syncOfflineCashMovements();

		expect(result.success).toBe(2);
		expect(creates().map(([method, args]) => [method, args.offline_id])).toEqual([
			[CREATE, first.offline_id],
			[CREATE, second.offline_id],
		]);
		expect(rows.get(first.id)).toMatchObject({ synced: true, server_journal_entry: "JE-10" });
		expect(canCloseShiftWithPendingCashMovements(await getPendingCashMovementCount())).toBe(true);

		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(2);
	});

	it("stops when the server cannot be reached and sends the rest later in the same order", async () => {
		const first = await saveOfflineCashMovement(movement({ amount: 10 }));
		const second = await saveOfflineCashMovement(movement({ amount: 20 }));
		call.mockRejectedValueOnce(networkError());

		const result = await syncOfflineCashMovements();

		expect(result).toMatchObject({ success: 0, failed: 0 });
		expect(call).toHaveBeenCalledTimes(1);
		expect(rows.get(first.id).synced).toBe(false);
		expect(rows.get(second.id).synced).toBe(false);

		call.mockImplementation(async (_method, args) => ({ name: `JE-${args.amount}` }));
		await syncOfflineCashMovements();
		expect(creates().slice(1).map(([, args]) => args.offline_id)).toEqual([first.offline_id, second.offline_id]);
	});

	it("never books a resent movement twice: the entry the server already made is kept", async () => {
		const saved = await saveOfflineCashMovement(movement());
		// The first answer was lost after the server booked the movement: the resend gets the same entry back.
		call.mockResolvedValueOnce({ name: "JE-7", journal_entry: "JE-7", duplicate_prevented: true });
		await syncOfflineCashMovements();
		expect(rows.get(saved.id)).toMatchObject({ synced: true, server_journal_entry: "JE-7" });
		expect(creates()).toHaveLength(1);
		expect(creates()[0][1].offline_id).toBe(saved.offline_id);
	});

	it("marks a movement the server refuses and goes on with the next one", async () => {
		const refused = await saveOfflineCashMovement(movement({ amount: 10 }));
		const next = await saveOfflineCashMovement(movement({ amount: 20 }));
		call.mockRejectedValueOnce(httpError(417, "Cash Out Limit")).mockResolvedValueOnce({ name: "JE-20" });

		const result = await syncOfflineCashMovements();

		expect(result).toMatchObject({ success: 1, failed: 1 });
		expect(rows.get(refused.id)).toMatchObject({
			synced: false,
			sync_failed: true,
			refused: true,
			error: "Cash Out Limit",
		});
		expect(rows.get(next.id).synced).toBe(true);
	});

	it("sends the receipt to the entry once it exists, and only the receipt when the entry is already booked", async () => {
		const saved = await saveOfflineCashMovement(movement(), receipt());
		call.mockResolvedValueOnce({ name: "JE-1", journal_entry: "JE-1" });
		fetchMock.mockResolvedValueOnce(okUpload());
		await syncOfflineCashMovements();
		const body = fetchMock.mock.calls[0][1].body;
		expect(fetchMock.mock.calls[0][0]).toBe("/api/method/pos_next.api.cash_entry.attach_cash_entry_file");
		expect(body.get("journal_entry")).toBe("JE-1");
		expect(rows.get(saved.id)).toMatchObject({ synced: true, attachment: null });

		const receiptOnly = await saveOfflineCashMovement(movement({ server_journal_entry: "JE-2" }), receipt());
		fetchMock.mockResolvedValueOnce(okUpload());
		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(1);
		expect(fetchMock.mock.calls[1][1].body.get("journal_entry")).toBe("JE-2");
		expect(rows.get(receiptOnly.id).synced).toBe(true);
	});

	it("keeps a movement the server has from being deleted from the queue", async () => {
		const local = await saveOfflineCashMovement(movement());
		const booked = await saveOfflineCashMovement(movement({ server_journal_entry: "JE-3" }), receipt());
		await expect(deleteOfflineCashMovement(booked.id)).rejects.toThrow(/cancel it instead/);
		await expect(deleteOfflineCashMovement(local.id)).resolves.toBe(true);
		expect(rows.has(local.id)).toBe(false);
	});

	it("keeps the dialog's data for one till and one shift", async () => {
		await cacheCashMovementDialogData(PROFILE, SHIFT, { templates: [{ name: "Pay-in", direction: "in" }] });
		expect((await getCashMovementDialogCache(PROFILE, SHIFT)).templates).toHaveLength(1);
		expect(await getCashMovementDialogCache(PROFILE, "POS-OPEN-2")).toBeNull();
	});
});

describe("recording a movement from the dialog", () => {
	it("queues it when the till is offline", async () => {
		const result = await recordCashMovement({ movement: movement(), offline: true });
		expect(result.queued).toBe(true);
		expect(call).not.toHaveBeenCalled();
		expect(await getPendingCashMovementCount()).toBe(1);
	});

	it("queues it with the same offline id when the server cannot be reached", async () => {
		call.mockRejectedValueOnce(networkError());
		const result = await recordCashMovement({ movement: movement() });
		expect(result.queued).toBe(true);
		const [row] = await getPendingCashMovements(SHIFT);
		expect(row.offline_id).toBe(call.mock.calls[0][1].offline_id);
	});

	it("shows the server's refusal and queues nothing", async () => {
		call.mockRejectedValueOnce(httpError(403, "Not an operation of this till"));
		await expect(recordCashMovement({ movement: movement() })).rejects.toThrow("Not an operation of this till");
		expect(await getPendingCashMovementCount()).toBe(0);
	});

	it("books it at once and queues only the receipt the server could not take now", async () => {
		call.mockResolvedValueOnce({ name: "JE-9", journal_entry: "JE-9", direction: "out" });
		fetchMock.mockRejectedValueOnce(networkError());
		const result = await recordCashMovement({ movement: movement(), attachment: receipt() });
		expect(result).toMatchObject({ journal_entry: "JE-9", attachment_queued: true });
		const [row] = await getPendingCashMovements(SHIFT);
		expect(row).toMatchObject({ server_journal_entry: "JE-9" });
		expect(row.attachment.name).toBe("receipt.jpg");
		// Already counted by the server's list: not counted twice in the drawer.
		expect(pendingCashTotals([row])).toEqual({ in: 0, out: 0 });
	});
});

describe("each cashier's rows, and the rows the server refused", () => {
	it("sends only the signed-in cashier's rows, under their own session", async () => {
		signIn("anna@example.com");
		const own = await saveOfflineCashMovement(movement({ amount: 10 }));
		const others = await saveOfflineCashMovement(movement({ amount: 20, user: "ben@example.com" }));
		expect(sessionUserId()).toBe("anna@example.com");
		expect(rows.get(own.id).user).toBe("anna@example.com");
		call.mockImplementation(async (method, args) => (method === CREATE ? { name: `JE-${args.amount}` } : null));

		await syncOfflineCashMovements();

		expect(creates().map(([, args]) => args.offline_id)).toEqual([own.offline_id]);
		expect(rows.get(others.id)).toMatchObject({ synced: false, refused: false });
		expect(await getPendingCashMovementCount()).toBe(0);
		expect(await getPendingCashMovementCount({ user: "ben@example.com" })).toBe(1);
	});

	it("takes a refused row out of the sending loop, the drawer's totals and the cap", async () => {
		const refused = await saveOfflineCashMovement(movement({ amount: 60 }));
		call.mockRejectedValueOnce(httpError(417, "Shift is not open"));
		const result = await syncOfflineCashMovements();
		expect(result).toMatchObject({ failed: 1, refused: 1 });
		expect(rows.get(refused.id)).toMatchObject({ refused: true, error: "Shift is not open" });

		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(1);
		expect(await getPendingCashMovements(SHIFT)).toEqual([]);
		expect(pendingCashTotals([rows.get(refused.id)])).toEqual({ in: 0, out: 0 });
		// The 60 never left the books: the cap still allows 100.
		await expect(
			saveOfflineCashMovement(movement({ amount: 100 }), null, { out_limit: 100, out_total: 0 }),
		).resolves.toMatchObject({ offline_id: expect.stringMatching(/^pos_cash_/) });
		expect((await getRefusedCashMovements()).map((row) => row.id)).toEqual([refused.id]);
	});

	it("lets a shift close with another shift's refused row or another cashier's row on the device", async () => {
		// S1 was closed elsewhere while its out was queued offline: refused on reconnection. S2 is the
		// cashier's new shift; a second cashier of the tablet has a row of their own on it.
		signIn("anna@example.com");
		const s1 = await saveOfflineCashMovement(movement({ pos_opening_shift: "POS-OPEN-S1", amount: 40 }));
		call.mockRejectedValueOnce(httpError(417, "Shift is not open"));
		await syncOfflineCashMovements();
		expect(rows.get(s1.id).refused).toBe(true);
		await saveOfflineCashMovement(movement({ pos_opening_shift: "POS-OPEN-S2", user: "ben@example.com" }));
		expect(await countCashMovementsKeepingTheShiftOpen("POS-OPEN-S2")).toBe(0);

		const own = await saveOfflineCashMovement(movement({ pos_opening_shift: "POS-OPEN-S2", amount: 5 }));
		expect(await countCashMovementsKeepingTheShiftOpen("POS-OPEN-S2")).toBe(1);
		call.mockImplementation(async (method) => (method === CREATE ? { name: "JE-5" } : null));
		await syncOfflineCashMovements();
		expect(rows.get(own.id).synced).toBe(true);
		expect(await countCashMovementsKeepingTheShiftOpen("POS-OPEN-S2")).toBe(0);
		expect(rows.get(s1.id)).toMatchObject({ refused: true, synced: false });
	});

	it("keeps a refused row for the manager, or sets it aside with a reason the server writes on its shift", async () => {
		signIn("anna@example.com");
		const kept = await saveOfflineCashMovement(movement({ amount: 40, remark: "Wine merchant" }));
		const aside = await saveOfflineCashMovement(movement({ amount: 15 }));
		call.mockRejectedValue(httpError(417, "Shift is not open"));
		await syncOfflineCashMovements();
		call.mockReset();

		await expect(deleteOfflineCashMovement(kept.id)).rejects.toThrow(/set it aside/);
		expect(await keepRefusedCashMovementForManager(kept.id)).toBe(true);
		signIn("ben@example.com");
		expect(await getRefusedCashMovements({ user: "ben@example.com" })).toEqual([]);
		expect(
			(await getRefusedCashMovements({ user: "ben@example.com", withKeptForManager: true })).map((row) => row.id),
		).toEqual([kept.id]);

		await expect(setAsideRefusedCashMovement(aside.id, "  ")).rejects.toMatchObject({ code: "reason" });
		call.mockResolvedValueOnce({ comment: "CMT-1" });
		await setAsideRefusedCashMovement(aside.id, "Paid back to the supplier");
		const [method, args] = call.mock.calls[0];
		expect(method).toBe(SET_ASIDE);
		expect(args).toMatchObject({
			pos_opening_shift: SHIFT,
			offline_id: aside.offline_id,
			reason: "Paid back to the supplier",
			direction: "out",
			amount: 15,
			refusal: "Shift is not open",
			recorded_by: "anna@example.com",
		});
		expect(rows.has(aside.id)).toBe(false);

		// The server booked that id after all: the row is the booked entry, not set aside.
		call.mockResolvedValueOnce({ booked: "JE-40" });
		await setAsideRefusedCashMovement(kept.id, "Checked");
		expect(rows.get(kept.id)).toMatchObject({ synced: true, refused: false, server_journal_entry: "JE-40" });
	});

	it("tries a server error again, then treats it as refused: never sent forever", async () => {
		const saved = await saveOfflineCashMovement(movement());
		call.mockRejectedValue(httpError(500, "Internal Server Error"));
		for (let pass = 1; pass < MAX_CASH_MOVEMENT_SERVER_ERRORS; pass++) {
			await syncOfflineCashMovements();
			expect(rows.get(saved.id)).toMatchObject({ refused: false, retry_count: pass });
		}
		await syncOfflineCashMovements();
		expect(rows.get(saved.id)).toMatchObject({ refused: true, retry_count: MAX_CASH_MOVEMENT_SERVER_ERRORS });
		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(MAX_CASH_MOVEMENT_SERVER_ERRORS);
	});

	it("sends when the money moved, not when the network came back", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-03-31T21:00:00Z"));
		const saved = await saveOfflineCashMovement(movement());
		vi.setSystemTime(new Date("2026-04-01T05:00:00Z"));
		call.mockImplementation(async (method) => (method === CREATE ? { name: "JE-1" } : null));
		await syncOfflineCashMovements();
		expect(creates()[0][1].moved_at).toBe(Date.parse("2026-03-31T21:00:00Z"));
		expect(rows.get(saved.id).data.moved_at).toBe(Date.parse("2026-03-31T21:00:00Z"));
	});

	it("reads the dialog's offline data again after a sync, with the dialog closed", async () => {
		await cacheCashMovementDialogData(PROFILE, SHIFT, { out_total: 0, movements: [] });
		await saveOfflineCashMovement(movement({ amount: 30 }));
		call.mockImplementation(async (method) =>
			method === CREATE ? { name: "JE-30" } : { out_total: 30, movements: [{ name: "JE-30", amount: 30 }] },
		);
		await syncOfflineCashMovements();
		expect(call.mock.calls.filter(([method]) => method === DIALOG)).toEqual([[DIALOG, { pos_opening_shift: SHIFT }]]);
		expect(settings.get(cashMovementDialogCacheKey(PROFILE, SHIFT))).toMatchObject({ out_total: 30 });
	});
});

describe("an expired session, a deadlock, « send again », the device's clock", () => {
	it("refuses nothing when the session expired: the pass stops, and the rows go out after signing in again", async () => {
		const rows3 = [];
		for (const amount of [10, 20, 30]) rows3.push(await saveOfflineCashMovement(movement({ amount })));
		// Offline for hours, the session expired: Frappe answers as a visitor (403) and clears the cookies.
		call.mockImplementationOnce(async () => {
			signIn(null);
			throw httpError(403, "Not permitted");
		});
		const result = await syncOfflineCashMovements({ user: "anna@example.com" });
		expect(result.stopped).toBe("session");
		expect(creates()).toHaveLength(1);
		for (const saved of rows3) expect(rows.get(saved.id)).toMatchObject({ synced: false, refused: false });
		// No pass at all while nobody is signed in.
		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(1);

		signIn("anna@example.com");
		call.mockImplementation(async (method, args) => (method === CREATE ? { name: `JE-${args.amount}` } : null));
		await syncOfflineCashMovements();
		expect(creates().slice(1).map(([, args]) => args.amount)).toEqual([10, 20, 30]);
		for (const saved of rows3) expect(rows.get(saved.id).synced).toBe(true);
	});

	it("keeps a row queued without a cashier when another cashier is not permitted to send it", async () => {
		signIn(null);
		const ownerless = await saveOfflineCashMovement(movement());
		expect(rows.get(ownerless.id).user).toBeNull();
		signIn("ben@example.com");
		call.mockRejectedValueOnce(httpError(403, "Not permitted"));
		await syncOfflineCashMovements();
		expect(rows.get(ownerless.id)).toMatchObject({ refused: false, synced: false });
		expect(await getPendingCashMovements(SHIFT)).toHaveLength(1);
	});

	it("puts a refused row back in the sending loop on « send again »", async () => {
		const saved = await saveOfflineCashMovement(movement({ amount: 60 }));
		call.mockRejectedValueOnce(httpError(417, "Cash Out Limit"));
		await syncOfflineCashMovements();
		expect(rows.get(saved.id).refused).toBe(true);
		expect(await resendRefusedCashMovement(saved.id)).toBe(true);
		expect(rows.get(saved.id)).toMatchObject({ refused: false, retry_count: 0, error: null });
		call.mockImplementation(async (method) => (method === CREATE ? { name: "JE-60" } : null));
		await syncOfflineCashMovements();
		expect(creates()).toHaveLength(2);
		expect(rows.get(saved.id).synced).toBe(true);
	});

	it("treats a database deadlock as a server to try again, never as a refusal", async () => {
		const first = await saveOfflineCashMovement(movement({ amount: 10 }));
		const second = await saveOfflineCashMovement(movement({ amount: 20 }));
		call.mockRejectedValueOnce(httpError(500, "Deadlock found", "QueryDeadlockError"));
		const result = await syncOfflineCashMovements();
		expect(result).toMatchObject({ failed: 0, refused: 0 });
		expect(creates()).toHaveLength(1);
		expect(rows.get(first.id)).toMatchObject({ refused: false, retry_count: 0 });
		expect(rows.get(second.id).synced).toBe(false);
		// Recorded online at that moment, it is queued with its offline id instead of being lost.
		call.mockRejectedValueOnce(httpError(500, "Lock wait timeout", "QueryTimeoutError"));
		await expect(recordCashMovement({ movement: movement() })).resolves.toMatchObject({ queued: true });
	});

	it("sends no time with an online movement: the server books it at its own time", async () => {
		call.mockResolvedValueOnce({ name: "JE-1", journal_entry: "JE-1" });
		await recordCashMovement({ movement: movement() });
		expect(creates()[0][1]).not.toHaveProperty("moved_at");
		const queued = await recordCashMovement({ movement: movement(), offline: true });
		expect(rows.get(queued.id).data.moved_at).toBeGreaterThan(0);
	});
});
