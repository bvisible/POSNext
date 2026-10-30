//// Neoffice — added file (no upstream equivalent). The till's drawer movements queued offline go through the
//// sync store like the sales and the expenses: counted in the header badge, sent on the way back online, and
//// their dialog's data preloaded once a shift is open (NeoRestau lot 1, task 15).
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncNoop = () => vi.fn(async () => ({}));
const cashMovements = {
	getPendingCashMovementCount: vi.fn(async () => 2),
	syncOfflineCashMovements: vi.fn(async () => ({ success: 2, failed: 1, skipped: 0, errors: [{ cashMovementId: 3 }] })),
	preloadCashMovementDialogData: vi.fn(async () => true),
};

vi.mock("@/utils/apiWrapper", () => ({ call: vi.fn(async () => null) }));
vi.mock("@/stores/restaurant", () => ({
	useRestaurantStore: () => ({ isEnabled: false, fetchFromNetwork: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn() }),
}));
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}));
vi.mock("@/utils/offline/offlineState", () => ({
	offlineState: { isOffline: false, getConnectionQuality: () => "good", subscribe: vi.fn() },
}));
vi.mock("@/utils/offline/workerClient", () => ({
	offlineWorker: new Proxy({}, { get: () => vi.fn(async () => 0) }),
}));
vi.mock("@/utils/offline/cashMovements", () => cashMovements);
vi.mock("@/utils/offline", () => ({
	cacheCustomersFromServer: vi.fn(async () => ({ customers: [] })),
	cachePaymentMethodsFromServer: vi.fn(async () => ({ payment_methods: [] })),
	cacheSalesPersonsFromServer: vi.fn(async () => ({ sales_persons: [] })),
	syncOfflineInvoices: vi.fn(async () => ({ success: 1, failed: 0, skipped: 0, errors: [] })),
	syncOfflineExpenses: vi.fn(async () => ({ success: 0, failed: 0, skipped: 0, errors: [] })),
	saveOfflineExpense: asyncNoop(),
	getPendingExpenses: vi.fn(async () => []),
	getPendingExpenseCount: vi.fn(async () => 0),
	deleteOfflineExpense: asyncNoop(),
	discardOfflineExpenseAttachments: asyncNoop(),
	cacheExpenseDialogData: asyncNoop(),
	cacheInvoiceHistory: asyncNoop(),
	cacheUnpaidInvoices: asyncNoop(),
	cacheUnpaidSummary: asyncNoop(),
}));

globalThis.__ = (s) => s;

const { usePOSSyncStore } = await import("../posSync");

describe("posSync: the drawer movements' offline queue", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		for (const fn of Object.values(cashMovements)) fn.mockClear();
	});

	it("counts the queued movements in the header badge and keeps the shift open", async () => {
		const store = usePOSSyncStore();
		await store.updatePendingCount();
		expect(store.pendingCashMovementsCount).toBe(2);
		expect(store.hasPendingCashMovements).toBe(true);
		expect(store.totalPendingCount).toBe(2);
	});

	it("sends them with the sales and the expenses, and adds their results", async () => {
		const result = await usePOSSyncStore().syncAllPending();
		expect(cashMovements.syncOfflineCashMovements).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ success: 3, failed: 1 });
		expect(result.errors).toContainEqual({ cashMovementId: 3 });
	});

	it("keeps the dialog's data once a shift is open, for a movement made offline", async () => {
		await usePOSSyncStore().preloadDataForOffline({ name: "Till 1" }, "POS-OPEN-1");
		expect(cashMovements.preloadCashMovementDialogData).toHaveBeenCalledWith("Till 1", "POS-OPEN-1");
	});
});
