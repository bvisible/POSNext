/**
 * //// Neoffice — added file (no upstream equivalent). A table of direct service (a bar, a counter) is opened again once a ticket is paid at it, to type the next ticket (the product owner,
 * //// 08.11.2026). No other table is: after a table with guests is paid the till goes back to the floor, as it always did.
 */
import { describe, expect, it, vi } from "vitest"
import { isDirectService, reopenDirectTable } from "../directService"

const BAR = { name: "t-bar", table_name: "Bar", direct_service: 1, status: "Empty" }
const T1 = { name: "t1", table_name: "T1", direct_service: 0, status: "Cleaning" }

describe("a table of direct service", () => {
	it("is a table whose Check is on", () => {
		expect(isDirectService(BAR)).toBe(true)
		expect(isDirectService({ direct_service: true })).toBe(true)
	})

	it("is no table with the Check off, nor without it (a site not migrated yet), nor none", () => {
		expect(isDirectService(T1)).toBe(false)
		expect(isDirectService({ name: "t2" })).toBe(false)
		expect(isDirectService(null)).toBe(false)
		expect(isDirectService(undefined)).toBe(false)
	})
})

describe("once a ticket is paid", () => {
	it("opens the table of direct service again, in the version the floor holds now", async () => {
		const open = vi.fn(async () => true)
		const fresh = { ...BAR, status: "Empty", capacity: 6 }

		const opened = await reopenDirectTable(BAR, [T1, fresh], open)

		expect(opened).toBe(true)
		expect(open).toHaveBeenCalledWith(fresh)
	})

	it("opens the table the ticket was paid at when the floor does not list it any more", async () => {
		const open = vi.fn(async () => true)

		await reopenDirectTable(BAR, [T1], open)

		expect(open).toHaveBeenCalledWith(BAR)
	})

	it("opens nothing after a table with guests, which goes back to the floor", async () => {
		const open = vi.fn(async () => true)

		for (const table of [T1, null, undefined, { name: "t2" }]) {
			expect(await reopenDirectTable(table, [BAR, T1], open)).toBe(false)
		}
		expect(open).not.toHaveBeenCalled()
	})

	it("says it did not when the table could not be opened, so that the till goes back to the floor", async () => {
		const open = vi.fn(async () => false)

		expect(await reopenDirectTable(BAR, [BAR], open)).toBe(false)
	})
})
