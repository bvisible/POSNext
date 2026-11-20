//// Neoffice — added file (no upstream equivalent). The words of a « busy » block of the agenda (neoffice-maintenance#3185).
//// The block of an appointment the cashier may not read said « Busy — A colleague's appointment » even where the appointment has nobody: it belongs to nobody, and says so.
import { describe, expect, it } from "vitest"

globalThis.__ = (text) => text
const { busyWordsOf } = await import("@/utils/appointments")

const busyOf = (person) => ({ busy: true, steps: [{ sales_person: person, sales_person_name: person }] })

describe("the words of a busy block", () => {
	it("say a colleague's appointment where it has a person", () => {
		expect(busyWordsOf(busyOf("Maya"))).toEqual({ title: "Busy", note: "A colleague's appointment" })
	})

	it("say to assign where it has nobody: it belongs to nobody, not to a colleague", () => {
		expect(busyWordsOf(busyOf(null))).toEqual({ title: "To assign", note: "An appointment without a person" })
		expect(busyWordsOf({ busy: true, steps: [] })).toEqual({ title: "To assign", note: "An appointment without a person" })
	})

	it("look at the person of any step, as the column of the grid does", () => {
		expect(busyWordsOf({ busy: true, steps: [{ sales_person: null }, { sales_person: "Maya" }] }).title).toBe("Busy")
	})
})
