/**
 * //// Neoffice — added file (no upstream equivalent). What a guest's order or payment makes of a notice on the till (NeoRestau lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info »),
 * //// written once and tested without a screen: the notice a realtime event makes (what it says, what it names), ONE notice per table (a newer one replaces the older; two orders waiting for the waiter's
 * //// validation on one table are one notice that counts them), the lines a notice names (three, then « +N »), and when a notice waiting for validation is handled.
 */
import { describe, expect, it } from "vitest"
import {
	KIND_ORDER,
	KIND_PAYMENT,
	KIND_PENDING,
	LINES_SHOWN,
	linesOf,
	noticeOf,
	putNotice,
	settleNotices,
} from "../floorNotices"

const WINE = { item_name: "Verre de vin", qty: 3 }
const SOUP = { item_name: "Soupe", qty: 1 }
const order = (over = {}) => ({
	restaurant: "The Bistro",
	table: "t-2",
	invoice: "ACC-1",
	items_count: 2,
	items: [WINE, SOUP],
	count: 2,
	validation_mode: "Direct to Kitchen",
	...over,
})

describe("the notice of a guest's order", () => {
	it("names the table and the lines of this order", () => {
		const notice = noticeOf("order", order(), 1)

		expect(notice).toMatchObject({ kind: KIND_ORDER, table: "t-2", items: [WINE, SOUP], count: 2, orders: 1 })
	})

	it("is a notice of an order to validate where the restaurant has its guest orders validated", () => {
		const notice = noticeOf("order", order({ validation_mode: "Server Approval" }), 1)

		expect(notice.kind).toBe(KIND_PENDING)
	})

	it("is a notice of an order for any other mode, and for an alert that does not say (an older server)", () => {
		expect(noticeOf("order", order({ validation_mode: undefined }), 1).kind).toBe(KIND_ORDER)
		expect(noticeOf("order", order({ validation_mode: "Direct to Kitchen" }), 1).kind).toBe(KIND_ORDER)
	})

	it("is no news when the order added no line (the same dish sent again)", () => {
		expect(noticeOf("order", order({ items: [], count: 0 }), 1)).toBeNull()
	})

	it("still says that a guest orders when the alert names no line (an older server)", () => {
		const notice = noticeOf("order", { table: "t-2", items_count: 2 }, 1)

		expect(notice).toMatchObject({ kind: KIND_ORDER, items: [], count: 0 })
	})

	it("counts the lines the alert counts, however many it names", () => {
		const many = Array.from({ length: 5 }, (_, at) => ({ item_name: `Dish ${at}`, qty: 1 }))

		const notice = noticeOf("order", order({ items: many, count: 8 }), 1)

		expect(notice.items).toHaveLength(5)
		expect(notice.count).toBe(8)
	})

	it("ignores a line that has no name or no quantity, and reads a quantity sent as text", () => {
		const notice = noticeOf("order", order({ items: [{ qty: 1 }, { item_name: "", qty: 1 }, { item_name: "Pain", qty: "2" }, { item_name: "Vin" }], count: 4 }), 1)

		expect(notice.items).toEqual([{ item_name: "Pain", qty: 2 }, { item_name: "Vin", qty: 1 }])
	})

	it("gives each notice a key of its own, whatever the table", () => {
		expect(noticeOf("order", order(), 1).key).not.toBe(noticeOf("order", order(), 2).key)
	})

	it("is no notice for an alert that names no table", () => {
		expect(noticeOf("order", order({ table: "" }), 1)).toBeNull()
		expect(noticeOf("order", order({ table: undefined }), 1)).toBeNull()
	})
})

describe("the notice of a guest's payment", () => {
	it("names the table, and says the bill is settled when the payment submitted the invoice", () => {
		const notice = noticeOf("payment", { table: "t-2", invoice: "ACC-1", paid_amount: 30, grand_total: 30, submitted: true }, 1)

		expect(notice).toMatchObject({ kind: KIND_PAYMENT, table: "t-2", partial: false, items: [], count: 0 })
	})

	it("says only a part is paid when it is", () => {
		const notice = noticeOf("payment", { table: "t-2", paid_amount: 10, grand_total: 30, submitted: false }, 1)

		expect(notice.partial).toBe(true)
	})
})

describe("one notice per table", () => {
	const at = (table, seq, kind = "order", over = {}) => noticeOf("order", order({ table, validation_mode: kind === "pending" ? "Server Approval" : "Direct to Kitchen", ...over }), seq)

	it("puts the newest on top", () => {
		const list = putNotice(putNotice([], at("t-1", 1)), at("t-2", 2))

		expect(list.map((notice) => notice.table)).toEqual(["t-2", "t-1"])
	})

	it("replaces the notice a table already has, and takes the top", () => {
		let list = putNotice([], at("t-1", 1))
		list = putNotice(list, at("t-2", 2))
		list = putNotice(list, at("t-1", 3))

		expect(list.map((notice) => notice.table)).toEqual(["t-1", "t-2"])
		expect(list[0].key).toBe(at("t-1", 3).key)
	})

	it("counts the orders a table has waiting for validation in ONE notice, with all their lines", () => {
		let list = putNotice([], at("t-1", 1, "pending", { items: [WINE], count: 1 }))
		list = putNotice(list, at("t-1", 2, "pending", { items: [SOUP], count: 1 }))

		expect(list).toHaveLength(1)
		expect(list[0]).toMatchObject({ kind: KIND_PENDING, orders: 2, count: 2, items: [WINE, SOUP] })
	})

	it("keeps no more than five named lines of the orders it counts", () => {
		const five = Array.from({ length: 5 }, (_, n) => ({ item_name: `A${n}`, qty: 1 }))
		let list = putNotice([], at("t-1", 1, "pending", { items: five, count: 5 }))
		list = putNotice(list, at("t-1", 2, "pending", { items: [SOUP], count: 1 }))

		expect(list[0].items).toHaveLength(5)
		expect(list[0].count).toBe(6)
	})

	it("does not count an order to validate with a plain one, nor with a payment: the newer replaces", () => {
		let list = putNotice([], at("t-1", 1, "pending"))
		list = putNotice(list, noticeOf("payment", { table: "t-1", submitted: true }, 2))

		expect(list).toHaveLength(1)
		expect(list[0]).toMatchObject({ kind: KIND_PAYMENT, orders: 1 })
	})

	it("does not change the list it is handed", () => {
		const list = Object.freeze([at("t-1", 1)])

		expect(() => putNotice(list, at("t-2", 2))).not.toThrow()
		expect(list).toHaveLength(1)
	})
})

describe("the lines a notice names", () => {
	it("names three and counts the others", () => {
		const items = Array.from({ length: 5 }, (_, n) => ({ item_name: `Dish ${n}`, qty: n + 1 }))

		const { shown, more } = linesOf({ items, count: 7 })

		expect(LINES_SHOWN).toBe(3)
		expect(shown).toHaveLength(3)
		expect(more).toBe(4)
	})

	it("names all of them when there are three or fewer, and no count", () => {
		expect(linesOf({ items: [WINE, SOUP], count: 2 })).toEqual({ shown: [WINE, SOUP], more: 0 })
		expect(linesOf({ items: [], count: 0 })).toEqual({ shown: [], more: 0 })
	})

	it("never counts fewer than it hides", () => {
		const items = Array.from({ length: 4 }, (_, n) => ({ item_name: `Dish ${n}`, qty: 1 }))

		expect(linesOf({ items, count: 2 }).more).toBe(1)
	})
})

describe("when an order waiting for validation is handled", () => {
	const pending = (table = "t-1", seq = 1) => noticeOf("order", order({ table, validation_mode: "Server Approval" }), seq)
	const floor = (...waiting) => waiting.map(([name, qr_waiting_count]) => ({ name, qr_waiting_count }))

	it("stays while the table still has lines waiting", () => {
		const { notices, gone } = settleNotices([pending()], floor(["t-1", 2]))

		expect(gone).toEqual([])
		expect(notices).toHaveLength(1)
	})

	it("goes once the table has been seen with lines waiting and has none any more", () => {
		const first = settleNotices([pending()], floor(["t-1", 2]))
		const then = settleNotices(first.notices, floor(["t-1", 0]))

		expect(then.gone).toEqual([first.notices[0].key])
		expect(then.notices).toEqual([])
	})

	it("stays when the table was never seen with a line waiting: a reading made before the order proves nothing", () => {
		const { notices, gone } = settleNotices([pending()], floor(["t-1", 0]))

		expect(gone).toEqual([])
		expect(notices).toHaveLength(1)
	})

	it("stays while the table is not in the floor that was read", () => {
		const { notices, gone } = settleNotices([pending()], floor(["t-9", 0]))

		expect(gone).toEqual([])
		expect(notices).toHaveLength(1)
	})

	it("leaves the other notices alone: they go by their seconds or by the cashier", () => {
		const plain = noticeOf("order", order({ table: "t-3" }), 2)
		const paid = noticeOf("payment", { table: "t-4", submitted: true }, 3)

		const { notices, gone } = settleNotices([plain, paid], floor(["t-3", 0], ["t-4", 0]))

		expect(gone).toEqual([])
		expect(notices).toEqual([plain, paid])
	})

	it("does not change the notices it is handed", () => {
		const notices = Object.freeze([Object.freeze(pending())])

		expect(() => settleNotices(notices, floor(["t-1", 2]))).not.toThrow()
	})
})
