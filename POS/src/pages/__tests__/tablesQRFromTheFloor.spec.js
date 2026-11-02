/**
 * //// Neoffice — added file (no upstream equivalent). A table's QR code from the floor (NeoResto lot 1, task 26): the
 * //// list's QR button and a long press on the plan ask for it, and the page shows it through the order view's own
 * //// entry (handleQRButtonClick), for the table pressed, which is not the cart's (no table is open on the floor). One
 * //// function of the page, handleShowTableQR, is that way in: at the merge with useTableQR (Task 9d+9e) it is the one
 * //// line to reconnect. The page is too large to mount in a test; its wiring is read from its source.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(path.resolve(__dirname, "../POSSale.vue"), "utf8")
const composable = readFileSync(path.resolve(__dirname, "../../composables/useTableQR.js"), "utf8")

/** The body of a function of the page's script, by its name */
function bodyOf(name) {
	const start = source.search(new RegExp(`(?:async )?function ${name}\\(`))
	expect(start, `function ${name}`).toBeGreaterThan(-1)
	let depth = 0
	for (let at = source.indexOf("{", start); at < source.length; at += 1) {
		if (source[at] === "{") depth += 1
		if (source[at] === "}") depth -= 1
		if (depth === 0) return source.slice(start, at + 1)
	}
	throw new Error(`unterminated ${name}`)
}

describe("a table's QR code asked for from the floor", () => {
	it("is heard from the floor plan, which is told the user's name for a phone's top", () => {
		const floor = source.match(/<FloorPlanEditor[\s\S]*?\/>/)?.[0] || ""

		expect(floor).toMatch(/@show-table-qr="handleShowTableQR"/)
		expect(floor).toMatch(/:user-name="userName"/)
	})

	it("tells the floor plan the site's time zone, which the server's times are written in (fix round 1)", () => {
		const floor = source.match(/<FloorPlanEditor[\s\S]*?\/>/)?.[0] || ""

		expect(floor).toMatch(
			/:site-timezone="bootstrapStore\.data\?\.system_timezone \|\| ''"/,
		)
	})

	it("goes through the order view's own entry, for the table pressed: one line", () => {
		const body = bodyOf("handleShowTableQR")

		expect(body).toMatch(/handleQRButtonClick\(table\)/)
		expect(
			body
				.split("\n")
				.filter((line) => /\S/.test(line) && !/^\s*\/\//.test(line)),
		).toHaveLength(3)
	})

	it("takes the table it is handed, else the cart's open table: the click path is the composable's, which the page and the header bar share", () => {
		expect(composable).toMatch(/async function handleQRButtonClick\(pressed = null\)/)
		expect(composable).toMatch(/const openTable = isATable\(pressed\) \? pressed : table\(\)/)
	})

	it("is reached by the header bar's button for the cart's table: its click event is no table", () => {
		expect(source).toMatch(/@qr="handleQRButtonClick"/)
		// an event carries a `target`: the composable takes it for no table
		expect(composable).toMatch(/!\("target" in value\)/)
	})
})
