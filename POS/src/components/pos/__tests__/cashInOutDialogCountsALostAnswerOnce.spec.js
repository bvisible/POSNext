/**
 * //// Neoffice — added file (no upstream equivalent). The till's Cash In/Out dialog (NeoResto lot 1, task 15): when the answer to a movement
 * //// was lost (a 504) the movement was queued under the offline id the server had booked it with, and the dialog showed it twice, once in
 * //// the server's list and once in the queue, and counted it twice in its totals and in the cash-out cap until the next sync
 * //// (neoffice-maintenance#2072). The server's movements now carry the offline id that booked them, and the dialog drops the queued row
 * //// the server's list already shows. The real queue module is used, over a stubbed local database.
 * @vitest-environment jsdom
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ref } from "vue"

vi.hoisted(() => {
	globalThis.__ = (s, args) =>
		args ? s.replace(/\{(\d+)\}/g, (_m, i) => args[i]) : s
})

const serverCall = vi.fn()
vi.mock("frappe-ui", () => ({
	Button: { template: "<button><slot /></button>" },
	Dialog: {
		props: ["modelValue", "options"],
		template:
			"<section v-if='modelValue' :data-title='options?.title'><slot name='body-content' /><slot name='actions' /></section>",
	},
	FeatherIcon: { template: "<i />" },
	call: (...args) => serverCall(...args),
}))
vi.mock("@/utils/apiWrapper", () => ({ call: (...args) => serverCall(...args) }))
vi.mock("@/utils/logger", () => ({
	logger: { create: () => new Proxy({}, { get: () => vi.fn() }) },
}))
vi.mock("@/utils/offline/offlineState", () => ({ offlineState: { isOffline: false } }))
vi.mock("@/composables/useAuthorization", () => ({
	useAuthorization: () => ({ requireAuthorization: vi.fn() }),
}))
vi.mock("@/composables/useOfflineStatus", () => ({
	useOfflineStatus: () => ({ isOffline: ref(false) }),
}))
vi.mock("@/composables/useToast", () => ({
	useToast: () => ({
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showWarning: vi.fn(),
	}),
}))
vi.mock("@/stores/posSync", () => ({
	usePOSSyncStore: () => ({ updatePendingCount: vi.fn() }),
}))
vi.mock("@/utils/currency", () => ({
	formatCurrencyNumber: (value) => Number(value).toFixed(2),
}))

// The local queue: the rows the stubbed database holds
const queued = vi.hoisted(() => ({ rows: [] }))
vi.mock("@/utils/offline/db", () => ({
	db: {
		cash_movement_queue: {
			filter: (predicate) => ({
				toArray: async () => queued.rows.filter(predicate).map((row) => ({ ...row })),
				count: async () => queued.rows.filter(predicate).length,
			}),
		},
	},
	getSetting: async (_key, fallback = null) => fallback,
	setSetting: async () => true,
}))

const { default: CashInOutDialog } = await import("../CashInOutDialog.vue")

const SHIFT = "POS-OPEN-S2"
const PURCHASE = {
	name: "Goods purchase",
	template_title: "Goods purchase",
	direction: "out",
	account: "4200 Goods",
	vat_applies: true,
	no_vat_allowed: true,
}
// What the server booked for the movement whose answer was lost
const BOOKED = {
	name: "ACC-JV-0001",
	journal_entry: "ACC-JV-0001",
	direction: "out",
	amount: 30,
	template: "Goods purchase",
	note: "",
	no_vat: 0,
	offline_id: "pos_cash_lost",
}
// The same movement, queued on the device with the offline id it was sent under
const queuedRow = (offlineId, amount = 30) => ({
	id: offlineId === "pos_cash_lost" ? 1 : 2,
	offline_id: offlineId,
	user: "anna@example.com",
	synced: false,
	refused: false,
	data: {
		pos_opening_shift: SHIFT,
		pos_profile: "Till 1",
		template_name: "Goods purchase",
		template_title: "Goods purchase",
		direction: "out",
		amount,
		offline_id: offlineId,
	},
})

async function openDialog(movements) {
	serverCall.mockResolvedValue({
		pos_profile: "Till 1",
		shift_open: true,
		templates: [PURCHASE],
		unusable: [],
		movements,
		out_limit: 100,
		out_total: movements.reduce((sum, m) => sum + m.amount, 0),
		is_till_manager: false,
		user: "anna@example.com",
	})
	const wrapper = mount(CashInOutDialog, {
		props: { modelValue: false, posProfile: "Till 1", company: "Co", posOpeningShift: SHIFT },
		global: { mocks: { __: globalThis.__ } },
	})
	await wrapper.setProps({ modelValue: true })
	await flushPromises()
	return wrapper
}

beforeEach(() => {
	serverCall.mockReset()
	queued.rows = []
})

describe("the Cash In/Out dialog after a movement whose answer was lost", () => {
	it("shows it once and counts it once, although the queue still holds it", async () => {
		queued.rows = [queuedRow("pos_cash_lost")]
		const wrapper = await openDialog([BOOKED])

		const text = wrapper.text()
		expect(text).not.toContain("Waiting to be sent")
		expect(text).toContain("Out: -30.00")
		expect(text).not.toContain("60.00")
		expect(text).toContain("Net: -30.00")
	})

	it("still shows and counts a queued movement the server does not hold", async () => {
		queued.rows = [queuedRow("pos_cash_lost"), queuedRow("pos_cash_other", 20)]
		const wrapper = await openDialog([BOOKED])

		const text = wrapper.text()
		expect(text.match(/Waiting to be sent/g)).toHaveLength(1)
		expect(text).toContain("Out: -50.00")
	})
})
