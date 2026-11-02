/**
 * //// Neoffice — added file (no upstream equivalent). The till's Cash In/Out dialog (NeoResto lot 1, task 15):
 * //// a movement the server refused (its shift was closed elsewhere while the tablet was offline) is shown with
 * //// its reason and two choices, never sent again; « Without VAT » is offered only where the server allows it
 * //// (an expense paid out whose VAT is split, never an income).
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

const queue = vi.hoisted(() => ({
	refused: [],
	getRefusedCashMovements: null,
	keepRefusedCashMovementForManager: null,
	setAsideRefusedCashMovement: null,
	resendRefusedCashMovement: null,
	syncOfflineCashMovements: null,
}))
vi.mock("@/utils/offline/cashMovements", () => ({
	cacheCashMovementDialogData: vi.fn(async () => true),
	cashMovementAttachmentProblem: () => null,
	deleteOfflineCashMovement: vi.fn(),
	getCashMovementDialogCache: vi.fn(async () => null),
	getCashOutRemaining: () => null,
	getPendingCashMovements: vi.fn(async () => []),
	getRefusedCashMovements: (...args) => queue.getRefusedCashMovements(...args),
	isTransientError: () => false,
	keepRefusedCashMovementForManager: (...args) =>
		queue.keepRefusedCashMovementForManager(...args),
	pendingCashTotals: () => ({ in: 0, out: 0 }),
	recordCashMovement: vi.fn(),
	sessionUserId: () => "anna@example.com",
	setAsideRefusedCashMovement: (...args) =>
		queue.setAsideRefusedCashMovement(...args),
	resendRefusedCashMovement: (...args) =>
		queue.resendRefusedCashMovement(...args),
	syncOfflineCashMovements: (...args) =>
		queue.syncOfflineCashMovements(...args),
}))

const { default: CashInOutDialog } = await import("../CashInOutDialog.vue")

const PURCHASE = {
	name: "Goods purchase",
	template_title: "Goods purchase",
	direction: "out",
	account: "4200 Goods",
	vat_applies: true,
	no_vat_allowed: true,
}
const INCOME = {
	name: "Other income",
	template_title: "Other income",
	direction: "in",
	account: "3200 Income",
	vat_applies: true,
	no_vat_allowed: false,
}
const REFUSED_FROM_S1 = {
	id: 7,
	offline_id: "pos_cash_s1",
	user: "anna@example.com",
	refused: true,
	synced: false,
	error: "Shift is not open",
	data: {
		pos_opening_shift: "POS-OPEN-S1",
		template_title: "Goods purchase",
		direction: "out",
		amount: 40,
	},
}

async function openDialog() {
	const wrapper = mount(CashInOutDialog, {
		props: {
			modelValue: false,
			posProfile: "Till 1",
			company: "Co",
			posOpeningShift: "POS-OPEN-S2",
		},
		global: { mocks: { __: globalThis.__ } },
	})
	await wrapper.setProps({ modelValue: true })
	await flushPromises()
	return wrapper
}

const button = (wrapper, text) =>
	wrapper.findAll("button").find((b) => b.text() === text)

beforeEach(() => {
	serverCall.mockReset()
	serverCall.mockResolvedValue({
		pos_profile: "Till 1",
		shift_open: true,
		templates: [PURCHASE, INCOME],
		unusable: [],
		movements: [],
		out_limit: 0,
		out_total: 0,
		is_till_manager: false,
		user: "anna@example.com",
	})
	queue.refused = [REFUSED_FROM_S1]
	queue.getRefusedCashMovements = vi.fn(async () => queue.refused)
	queue.keepRefusedCashMovementForManager = vi.fn(async () => true)
	queue.setAsideRefusedCashMovement = vi.fn(async () => ({ comment: "CMT-1" }))
	queue.resendRefusedCashMovement = vi.fn(async () => true)
	queue.syncOfflineCashMovements = vi.fn(async () => ({ success: 1 }))
})

describe("the Cash In/Out dialog", () => {
	it("shows a refused movement of another shift with its reason, never as waiting to be sent", async () => {
		const wrapper = await openDialog()
		expect(queue.getRefusedCashMovements).toHaveBeenCalledWith({
			user: "anna@example.com",
			withKeptForManager: false,
		})
		const text = wrapper.text()
		expect(text).toContain("Refused: Shift is not open")
		expect(text).toContain("Shift POS-OPEN-S1")
		expect(text).not.toContain("Waiting to be sent")
	})

	it("keeps it for the manager, or discards it only with a reason", async () => {
		const wrapper = await openDialog()
		await button(wrapper, "Keep for the manager").trigger("click")
		expect(queue.keepRefusedCashMovementForManager).toHaveBeenCalledWith(7)

		await button(wrapper, "Discard").trigger("click")
		expect(
			wrapper.find("[data-title='Discard this refused movement?']").exists(),
		).toBe(true)
		const confirm = () =>
			wrapper
				.findAll("[data-title='Discard this refused movement?'] button")
				.find((b) => b.text() === "Discard")
		expect(confirm().attributes("disabled")).toBeDefined()
		await wrapper
			.find("#cash-movement-set-aside-reason")
			.setValue("Paid back to the supplier")
		await confirm().trigger("click")
		await flushPromises()
		expect(queue.setAsideRefusedCashMovement).toHaveBeenCalledWith(
			7,
			"Paid back to the supplier",
		)
	})

	it("sends a refused movement again, its three choices being touch-sized buttons", async () => {
		const wrapper = await openDialog()
		for (const label of ["Send again", "Keep for the manager", "Discard"]) {
			expect(button(wrapper, label).classes()).toContain("min-h-[44px]")
		}
		await button(wrapper, "Send again").trigger("click")
		await flushPromises()
		expect(queue.resendRefusedCashMovement).toHaveBeenCalledWith(7)
		expect(queue.syncOfflineCashMovements).toHaveBeenCalledTimes(1)
	})

	it("lets a till manager see every cashier's refused movements and those kept for them", async () => {
		serverCall.mockResolvedValueOnce({
			shift_open: true,
			templates: [],
			unusable: [],
			movements: [],
			is_till_manager: true,
		})
		await openDialog()
		expect(queue.getRefusedCashMovements).toHaveBeenCalledWith({
			user: null,
			withKeptForManager: true,
		})
	})

	it("offers « Without VAT » on a purchase whose VAT is split, never on an income", async () => {
		const wrapper = await openDialog()
		const pick = async (title) => {
			const card = wrapper
				.findAll("button")
				.find((b) => b.text().startsWith(title))
			await card.trigger("click")
		}
		await pick("Other income")
		expect(wrapper.find("[role='switch']").exists()).toBe(false)
		await pick("Goods purchase")
		expect(wrapper.find("[role='switch']").exists()).toBe(true)
		expect(wrapper.text()).toContain("no input VAT is claimed")
	})
})
