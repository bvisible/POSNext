/**
 * //// Neoffice — added file (no upstream equivalent). The size a ticket opened FULL SCREEN draws its dishes in (NeoRestau lot 1, task 38a-3, ruling 107 layer 3): one step above the
 * //// screen's, never below Large, Extra large staying where it is; with the head and the buttons of a panel (the table at 34 px, the timer at 26 px, buttons 56 px high), each a floor that a
 * //// bigger size keeps. The panel is teleported out of the screen's root, where the size's variables do not reach, so these are the ones it carries itself.
 */
import { describe, expect, it } from "vitest"
import {
	DEFAULT_TEXT_SIZE,
	fullScreenTextSize,
	fullScreenVariables,
	TEXT_SIZES,
	textSizeVariables,
} from "@/utils/kitchenTextSize"

describe("the size of the dishes of a ticket opened full screen", () => {
	it("is one step above the screen's, and never below Large", () => {
		expect(fullScreenTextSize("compact")).toBe("large")
		expect(fullScreenTextSize("normal")).toBe("large")
		expect(fullScreenTextSize("large")).toBe("xl")
	})

	it("stays Extra large on a screen that is: there is no step above it", () => {
		expect(fullScreenTextSize("xl")).toBe("xl")
	})

	it("takes a size nobody knows for the default's: Compact, so Large", () => {
		expect(DEFAULT_TEXT_SIZE).toBe("compact")
		expect(fullScreenTextSize("tiny")).toBe("large")
		expect(fullScreenTextSize(undefined)).toBe("large")
	})

	it("is always a size of the table, and never smaller than the screen's", () => {
		for (const size of TEXT_SIZES) {
			const wanted = fullScreenTextSize(size)
			expect(TEXT_SIZES).toContain(wanted)
			expect(TEXT_SIZES.indexOf(wanted)).toBeGreaterThanOrEqual(
				TEXT_SIZES.indexOf(size),
			)
		}
	})
})

describe("the variables of the panel", () => {
	it("are those of the size it is drawn in for the dishes: Large's 18 px text on a Compact screen", () => {
		const variables = fullScreenVariables("compact")

		expect(variables["--kds-fs"]).toBe(textSizeVariables("large")["--kds-fs"])
		expect(variables["--kds-fs"]).toBe("18px")
		expect(variables["--kds-py"]).toBe("7px")
		// The width a column of dishes is made from (utils/ticketLayout FULLSCREEN_FRAME)
		expect(variables["--kds-card-w"]).toBe("330px")
	})

	it("have the head of a panel: the table at 34 px, the timer at 26 px, the number and the room's chip bigger", () => {
		const variables = fullScreenVariables("compact")

		expect(variables["--kds-fs-table"]).toBe("34px")
		expect(variables["--kds-fs-timer"]).toBe("26px")
		expect(variables["--kds-fs-num"]).toBe("17px")
		expect(variables["--kds-fs-ref"]).toBe("15px")
		// The table's total time is always shown in the panel, where there is room
		expect(variables["--kds-tt-d"]).toBe("inline")
		expect(variables["--kds-fs-tt"]).toBe("15px")
	})

	it("have buttons 56 px high with 20 px words: more than the 44 px of a touch target", () => {
		const variables = fullScreenVariables("compact")

		expect(variables["--kds-btn-h"]).toBe("56px")
		expect(variables["--kds-fs-btn"]).toBe("20px")
		expect(Number.parseFloat(variables["--kds-btn-h"])).toBeGreaterThanOrEqual(
			44,
		)
	})

	it("have the paddings of a panel, not of a card", () => {
		const variables = fullScreenVariables("compact")

		expect(variables["--kds-pad-x"]).toBe("16px")
		expect(variables["--kds-head-py"]).toBe("10px")
		expect(variables["--kds-body-py"]).toBe("4px")
	})

	it("keep a size's own value where it is bigger than the panel's floor: Extra large's room chip (16 px) is not made smaller", () => {
		const variables = fullScreenVariables("xl")

		expect(variables["--kds-fs"]).toBe("22px")
		expect(variables["--kds-fs-ref"]).toBe("16px")
		expect(variables["--kds-card-w"]).toBe("390px")
		expect(variables["--kds-fs-table"]).toBe("34px")
	})

	it("do not change the table of sizes the screen uses", () => {
		const before = JSON.stringify(textSizeVariables("compact"))
		fullScreenVariables("compact")
		expect(JSON.stringify(textSizeVariables("compact"))).toBe(before)
		expect(textSizeVariables("compact")["--kds-btn-h"]).toBe("44px")
	})
})
