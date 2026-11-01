/**
 * //// Neoffice — added file (no upstream equivalent). The floor alerts in the till's page (NeoRestau lot 1, Daniel, 01.11: « regarde comment la caisse sommelier reçoit l'info (popup et autre) »), read in the sources:
 * //// the notices stand between the header and the work (never over them), « View table » goes through the one function that opens a table, the chip that asks for a touch is drawn by the header, a user who leaves leaves
 * //// his notices, and only the till has them: the kitchen's and the runner's tablets never start the listeners nor draw a notice.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file) => readFileSync(path.resolve(__dirname, "..", "..", file), "utf8")
const SALE = read("pages/POSSale.vue")
const HEADER = read("components/pos/POSHeader.vue")

/** The opening tag of the first element of that name, attributes included */
function tag(source, name) {
	const start = source.indexOf(`<${name}`)
	expect(start, `<${name}>`).toBeGreaterThan(-1)
	let quote = false
	for (let at = start; at < source.length; at++) {
		if (source[at] === '"') quote = !quote
		if (source[at] === ">" && !quote) return source.slice(start, at + 1)
	}
	throw new Error(`unterminated <${name}>`)
}

describe("the notices in the till's page", () => {
	it("stand between the header and the work, in the page's column", () => {
		const header = SALE.indexOf("</POSHeader>")
		const notices = SALE.indexOf("<FloorNotices")
		const work = SALE.indexOf("Main Content: Responsive Layout")

		expect(header).toBeGreaterThan(-1)
		expect(notices).toBeGreaterThan(header)
		expect(work).toBeGreaterThan(notices)
	})

	it("are drawn for a restaurant till, from the store of the notices, and name a table by its label", () => {
		const notices = tag(SALE, "FloorNotices")

		expect(notices).toMatch(/v-if="restaurantStore\.isEnabled"/)
		expect(notices).toMatch(/:notices="floorNotices\.notices"/)
		expect(notices).toMatch(/:label-of="restaurantStore\.tableLabel"/)
		expect(notices).toMatch(/:open-table="cartStore\.restaurantTable\?\.name \|\| ''"/)
		expect(notices).toMatch(/@dismiss="floorNotices\.dismiss"/)
	})

	it("open a table through the one function that opens a table, and send a paid table to the payment summary", () => {
		expect(tag(SALE, "FloorNotices")).toMatch(/@see="seeFloorNotice"/)
		expect(SALE).toMatch(/useSeeFloorNotice\(\{\s*onPaid: handleCleaningTableClicked,\s*onOpened: handleTableSelected,?\s*\}\)/)
	})

	it("start the listeners of the guest alerts when the till is a restaurant till, wherever the waiter is", () => {
		expect(SALE).toMatch(/\(\) => restaurantStore\.isEnabled,\s*\(enabled\) => \{\s*if \(enabled\) restaurantStore\.startStatusPolling\(\);/)
	})

	it("hand the header whether the till has a sound to ring, for its chip", () => {
		expect(tag(SALE, "POSHeader")).toMatch(/:floor-sound-on="Boolean\(restaurantStore\.isEnabled\) && floorNotices\.soundOn"/)
	})
})

describe("the chip that asks for a touch", () => {
	it("is drawn by the header while the till has a sound, and only from 640 px (a phone's header has no room)", () => {
		const chip = tag(HEADER, "SoundUnlockChip")

		expect(chip).toMatch(/:enabled="floorSoundOn"/)
		expect(chip).toMatch(/max-sm:!hidden/)
		expect(HEADER).toMatch(/floorSoundOn: \{\s*type: Boolean,\s*default: false,/)
	})
})

describe("a user who leaves", () => {
	it("leaves his notices and their timers", () => {
		const cleanup = read("utils/sessionCleanup.js")

		expect(cleanup).toMatch(/import \{ useFloorNoticesStore \} from "@\/stores\/floorNotices"/)
		expect(cleanup).toMatch(/useFloorNoticesStore\(\)\.clear\(\)/)
	})
})

describe("the tablets of the kitchen and the runner", () => {
	it("never start the till's listeners nor draw its notices: the alerts are the till's", () => {
		for (const file of ["pages/KDS.vue", "pages/Runner.vue", "pages/Takeaway.vue"]) {
			let source
			try {
				source = read(file)
			} catch {
				continue
			}
			expect(source, file).not.toMatch(/startStatusPolling|useFloorNoticesStore|FloorNotices/)
		}
	})

	it("have no call of window.frappe.show_alert left in the till's restaurant store: this single-page app does not have it", () => {
		expect(read("stores/restaurant.js")).not.toMatch(/show_alert\s*\(|\?\.show_alert/)
	})
})
