//// Neoffice — added file (no upstream equivalent). The till's drawer movements made offline (NeoRestau lot 1,
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
	canCloseShiftWithPendingCashMovements,
	cashMovementAttachmentProblem,
	deleteOfflineCashMovement,
	getCashMovementDialogCache,
	cacheCashMovementDialogData,
	getCashOutRemaining,
	getPendingCashMovementCount,
	getPendingCashMovements,
	pendingCashTotals,
	recordCashMovement,
	saveOfflineCashMovement,
	syncOfflineCashMovements,
} = await import("@/utils/offline/cashMovements");

const SHIFT = "POS-OPEN-1";
const PROFILE = "Till 1";

const movement = (overrides = {}) => ({
	pos_opening_shift: SHIFT,
	pos_profile: PROFILE,
	template_name: "Supplier payment",
	direction: "out",
	amount: 30,
	remark: "Wine merchant",
	...overrides,
});

const httpError = (status, message = "Refused") => Object.assign(new Error(message), { status, messages: [message] });
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
		expect(call.mock.calls.map(([method, args]) => [method, args.offline_id])).toEqual([
			["pos_next.api.cash_entry.create_cash_entry", first.offline_id],
			["pos_next.api.cash_entry.create_cash_entry", second.offline_id],
		]);
		expect(rows.get(first.id)).toMatchObject({ synced: true, server_journal_entry: "JE-10" });
		expect(canCloseShiftWithPendingCashMovements(await getPendingCashMovementCount())).toBe(true);

		await syncOfflineCashMovements();
		expect(call).toHaveBeenCalledTimes(2);
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
		expect(call.mock.calls.slice(1).map(([, args]) => args.offline_id)).toEqual([first.offline_id, second.offline_id]);
	});

	it("never books a resent movement twice: the entry the server already made is kept", async () => {
		const saved = await saveOfflineCashMovement(movement());
		// The first answer was lost after the server booked the movement: the resend gets the same entry back.
		call.mockResolvedValueOnce({ name: "JE-7", journal_entry: "JE-7", duplicate_prevented: true });
		await syncOfflineCashMovements();
		expect(rows.get(saved.id)).toMatchObject({ synced: true, server_journal_entry: "JE-7" });
		expect(call).toHaveBeenCalledTimes(1);
		expect(call.mock.calls[0][1].offline_id).toBe(saved.offline_id);
	});

	it("marks a movement the server refuses and goes on with the next one", async () => {
		const refused = await saveOfflineCashMovement(movement({ amount: 10 }));
		const next = await saveOfflineCashMovement(movement({ amount: 20 }));
		call.mockRejectedValueOnce(httpError(417, "Cash Out Limit")).mockResolvedValueOnce({ name: "JE-20" });

		const result = await syncOfflineCashMovements();

		expect(result).toMatchObject({ success: 1, failed: 1 });
		expect(rows.get(refused.id)).toMatchObject({ synced: false, sync_failed: true, error: "Cash Out Limit" });
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
		expect(call).toHaveBeenCalledTimes(1);
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
