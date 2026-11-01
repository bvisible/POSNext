/**
 * //// Neoffice — added file (no upstream equivalent). The service rhythm as the screens read it (NeoRestau lot 1, Daniel, 01.11):
 * //// only "Prepared ahead", spelled exactly, is the kitchen preparing ahead; every other value is the room's call.
 */
import { describe, expect, it } from "vitest"
import {
	CALLED_BY_THE_ROOM,
	PREPARED_AHEAD,
	isPreparedAhead,
	rhythmOf,
} from "@/utils/serviceRhythm"

describe("the service rhythm", () => {
	it("is the stored words, in English", () => {
		expect(CALLED_BY_THE_ROOM).toBe("Called by the room")
		expect(PREPARED_AHEAD).toBe("Prepared ahead")
	})

	it("reads 'Prepared ahead' as preparing ahead", () => {
		expect(rhythmOf("Prepared ahead")).toBe(PREPARED_AHEAD)
		expect(isPreparedAhead("Prepared ahead")).toBe(true)
	})

	it("reads everything else as the room's call", () => {
		for (const other of [undefined, null, "", "Called by the room", "prepared ahead", "Ahead", 1, {}]) {
			expect(rhythmOf(other), String(other)).toBe(CALLED_BY_THE_ROOM)
			expect(isPreparedAhead(other), String(other)).toBe(false)
		}
	})
})
