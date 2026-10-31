/**
 * //// Neoffice — added file (no upstream equivalent). The size of the text of the kitchen screen (NeoRestau lot 1, task 38a-1, ruling
 * //// 109): DENSE by default, because a cook who can read small wants many tickets on the screen, and a cook who needs glasses wants
 * //// them big. Four sizes (Compact, Normal, Large, Extra large), kept on the device, applied by CSS variables on the page's root:
 * //// font sizes, paddings, button heights. These are the rules of the choice and the table of the variables, read without a screen.
 */
import { describe, expect, it } from "vitest"
import {
	DEFAULT_TEXT_SIZE,
	nextTextSize,
	readTextSize,
	saveTextSize,
	TEXT_SIZE_STORAGE_KEY,
	TEXT_SIZES,
	textSizeVariables,
} from "../kitchenTextSize"

/** A storage in memory, or one that refuses, as a private window or blocked site data does. */
function memory(initial = {}) {
	const data = { ...initial }
	return {
		data,
		getItem: (key) => (key in data ? data[key] : null),
		setItem: (key, value) => {
			data[key] = String(value)
		},
	}
}
const refusing = () => ({
	getItem() {
		throw new Error("denied")
	},
	setItem() {
		throw new Error("denied")
	},
})

describe("the sizes", () => {
	it("are Compact, Normal, Large and Extra large, in that order, and the shipped default is the dense one", () => {
		expect(TEXT_SIZES).toEqual(["compact", "normal", "large", "xl"])
		expect(DEFAULT_TEXT_SIZE).toBe("compact")
	})

	it("cycle: each size leads to the next, and the last back to the first", () => {
		expect(nextTextSize("compact")).toBe("normal")
		expect(nextTextSize("normal")).toBe("large")
		expect(nextTextSize("large")).toBe("xl")
		expect(nextTextSize("xl")).toBe("compact")
	})

	it("cycle from a size nobody knows to the one after the default, and never get stuck", () => {
		expect(nextTextSize("gigantic")).toBe("normal")
		expect(nextTextSize(undefined)).toBe("normal")
	})
})

describe("the variables a size sets on the screen", () => {
	const px = (value) => Number.parseFloat(value)

	it("copy the scale of the mockup the product owner approved: Compact 13 px dishes, Large 18 px, Extra large 22 px", () => {
		const compact = textSizeVariables("compact")
		const normal = textSizeVariables("normal")
		const large = textSizeVariables("large")
		const xl = textSizeVariables("xl")

		expect([compact, normal, large, xl].map((v) => v["--kds-fs"])).toEqual([
			"13px",
			"15px",
			"18px",
			"22px",
		])
		expect(
			[compact, normal, large, xl].map((v) => v["--kds-fs-table"]),
		).toEqual(["15px", "17px", "20px", "24px"])
		expect([compact, normal, large, xl].map((v) => v["--kds-py"])).toEqual([
			"3px",
			"5px",
			"7px",
			"9px",
		])
		expect([compact, normal, large, xl].map((v) => v["--kds-btn-h"])).toEqual([
			"44px",
			"44px",
			"44px",
			"52px",
		])
	})

	it("set the same variables for every size: the screen is never left with a hole in it", () => {
		const names = Object.keys(textSizeVariables("compact")).sort()
		for (const size of TEXT_SIZES)
			expect(Object.keys(textSizeVariables(size)).sort(), size).toEqual(names)
	})

	it("never shrink as the size grows: text, paddings and the table's name all grow or stay", () => {
		for (const name of [
			"--kds-fs",
			"--kds-fs-sub",
			"--kds-py",
			"--kds-fs-table",
			"--kds-fs-ref",
			"--kds-fs-timer",
			"--kds-fs-btn",
			"--kds-btn-h",
		]) {
			let before = 0
			for (const size of TEXT_SIZES) {
				const value = px(textSizeVariables(size)[name])
				expect(value, `${name} at ${size}`).toBeGreaterThanOrEqual(before)
				before = value
			}
		}
	})

	it("keep the buttons at least 44 px high, whatever the size: a finger must hit them", () => {
		for (const size of TEXT_SIZES)
			expect(
				px(textSizeVariables(size)["--kds-btn-h"]),
				size,
			).toBeGreaterThanOrEqual(44)
	})

	it("write the options and remarks at most one step under the dish in Compact, and the same size as the dish from Normal on", () => {
		expect(px(textSizeVariables("compact")["--kds-fs-sub"])).toBe(12)
		for (const size of ["normal", "large", "xl"])
			expect(textSizeVariables(size)["--kds-fs-sub"], size).toBe(
				textSizeVariables(size)["--kds-fs"],
			)
	})

	it("show the table's second timer from Large on only: Compact and Normal have no room for it", () => {
		expect(textSizeVariables("compact")["--kds-tt-d"]).toBe("none")
		expect(textSizeVariables("normal")["--kds-tt-d"]).toBe("none")
		expect(textSizeVariables("large")["--kds-tt-d"]).toBe("inline")
		expect(textSizeVariables("xl")["--kds-tt-d"]).toBe("inline")
	})

	it("are the default's for a size nobody knows", () => {
		expect(textSizeVariables("gigantic")).toEqual(textSizeVariables("compact"))
		expect(textSizeVariables(undefined)).toEqual(textSizeVariables("compact"))
	})
})

describe("the size kept on the device", () => {
	it("is read from the storage under one key, and is the default when nothing is kept", () => {
		expect(readTextSize(memory())).toBe("compact")
		expect(readTextSize(memory({ [TEXT_SIZE_STORAGE_KEY]: "large" }))).toBe(
			"large",
		)
		expect(TEXT_SIZE_STORAGE_KEY).toBe("pos_kds_text_size")
	})

	it("is the default when what is kept is not one of the sizes", () => {
		expect(readTextSize(memory({ [TEXT_SIZE_STORAGE_KEY]: "enormous" }))).toBe(
			"compact",
		)
		expect(readTextSize(memory({ [TEXT_SIZE_STORAGE_KEY]: "" }))).toBe(
			"compact",
		)
	})

	it("is kept by saving, and only a size is kept", () => {
		const storage = memory()

		expect(saveTextSize("xl", storage)).toBe(true)
		expect(storage.data[TEXT_SIZE_STORAGE_KEY]).toBe("xl")
		expect(saveTextSize("huge", storage)).toBe(false)
		expect(storage.data[TEXT_SIZE_STORAGE_KEY]).toBe("xl")
	})

	it("never breaks the screen when the storage refuses: the default is read, and a save says it did not keep", () => {
		expect(readTextSize(refusing())).toBe("compact")
		expect(saveTextSize("large", refusing())).toBe(false)
		expect(readTextSize(null)).toBe("compact")
		expect(saveTextSize("large", null)).toBe(false)
	})
})
