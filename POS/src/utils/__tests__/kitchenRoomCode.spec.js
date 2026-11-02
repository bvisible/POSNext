/**
 * //// Neoffice — added file (no upstream equivalent). The short code of a room on a kitchen ticket (NeoResto lot 1, task
 * //// 38a-1, ruling 126): a kitchen can feed several rooms, so the room opens the line of the ticket as a small chip, then the
 * //// table. The default code is « the letters of the name and the number in it on two digits »: « Salle 1 » is S01, « Salle 2 »
 * //// S02; a room with no number takes its first three letters (« Terrasse » is TER); a takeaway is EMP. The client derives it
 * //// for now; the server will send its own field (task 38b), and then this file is only the fallback.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { roomCode } from "../kitchenRoomCode"

// The table of examples the SERVER's derivation (pos_next/restaurant/room_code.py) is tested against too: the two cannot drift apart
const SHARED_CASES = JSON.parse(
	readFileSync(
		new URL("../../../../pos_next/tests/room_code_cases.json", import.meta.url),
		"utf8",
	),
).cases

describe("the code of a room with a number in its name", () => {
	it("is the first letter and the number on two digits: Salle 1 is S01, Salle 2 is S02", () => {
		expect(roomCode("Salle 1")).toBe("S01")
		expect(roomCode("Salle 2")).toBe("S02")
		expect(roomCode("Salle 12")).toBe("S12")
	})

	it("does not cut a number of three digits, and reads the number wherever it stands", () => {
		expect(roomCode("Salle 100")).toBe("S100")
		expect(roomCode("Étage 1")).toBe("E01")
		expect(roomCode("Terrasse 2")).toBe("T02")
	})

	it("reads the first number of the name", () => {
		expect(roomCode("Salle 3 - côté jardin 2")).toBe("S03")
	})
})

describe("the code of a room with no number", () => {
	it("is its first three letters in capitals: Terrasse is TER", () => {
		expect(roomCode("Terrasse")).toBe("TER")
		expect(roomCode("Bar")).toBe("BAR")
	})

	it("takes the letters of the first word, accents folded to the letter under them", () => {
		expect(roomCode("Étage")).toBe("ETA")
		expect(roomCode("Salle des fêtes")).toBe("SAL")
		expect(roomCode("Cœur")).toBe("COE")
	})

	it("is as long as the name when the name is shorter than three letters", () => {
		expect(roomCode("Ba")).toBe("BA")
	})
})

describe("the code of a takeaway", () => {
	it("is EMP, whatever its room says", () => {
		expect(roomCode("", { takeaway: true })).toBe("EMP")
		expect(roomCode("Salle 1", { takeaway: true })).toBe("EMP")
		expect(roomCode(undefined, { takeaway: true })).toBe("EMP")
	})
})

describe("the code of a room nobody named", () => {
	it("is empty: the ticket shows no chip rather than a guess", () => {
		expect(roomCode("")).toBe("")
		expect(roomCode(undefined)).toBe("")
		expect(roomCode(null)).toBe("")
		expect(roomCode("   ")).toBe("")
		expect(roomCode("---")).toBe("")
	})

	it("is the number alone, on two digits, when the name is only a number", () => {
		expect(roomCode("3")).toBe("03")
	})

	it("never grows past the room's own letters: a number of its own is never invented", () => {
		expect(roomCode("Salle")).toBe("SAL")
	})
})

describe("the table of examples the server's derivation shares (task 38b)", () => {
	it("holds the examples of this spec and gives each its code", () => {
		expect(SHARED_CASES.length).toBeGreaterThanOrEqual(20)
		for (const { name, takeaway = false, code } of SHARED_CASES) {
			expect(
				roomCode(name, { takeaway }),
				`${JSON.stringify(name)}${takeaway ? " (takeaway)" : ""}`,
			).toBe(code)
		}
	})
})
