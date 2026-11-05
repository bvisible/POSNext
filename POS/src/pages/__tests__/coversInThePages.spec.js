/**
 * //// Neoffice — added file (no upstream equivalent). The people seated at a table, in the till's page and the runner's page (NeoResto lot 1, covers). POSSale.vue is too large to mount here (a dozen stores, the offline
 * //// workers, sockets), so this reads what the page wires from its source, as the neighbouring page specs do: the header bar of the open table and the phone's screen are bound to the cart's number and ask the question
 * //// through the same composable, the dialog is mounted once and handed the composable's answers, a guest's update of the order keeps the number the waiter counted before the first « Valider », and every way of opening a
 * //// table (the plan's tile, the list, the notice of a guest's order) goes through the one function that asks. The runner's page hands the card the people and the server's count per course.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (relative) =>
	readFileSync(new URL(relative, import.meta.url), "utf8")
const page = read("../POSSale.vue")
const runner = read("../Runner.vue")
const floor = read("../../components/pos/FloorPlanEditor.vue")
const notice = read("../../composables/useSeeFloorNotice.js")
const opening = read("../../composables/useOpenTable.js")

describe("the header of the open table, in the till's page", () => {
	it("is bound to the cart's people and to the table's seats", () => {
		expect(page).toMatch(
			/<TableHeaderBar\b[^>]*:covers="cartStore\.restaurantCovers"/s,
		)
		expect(page).toMatch(
			/<TableHeaderBar\b[^>]*:seats="Number\(cartStore\.restaurantTable\?\.capacity\) \|\| null"/s,
		)
	})

	it("asks the question in the « change » mode when the pastille is pressed", () => {
		expect(page).toMatch(
			/<TableHeaderBar\b[^>]*@covers="covers\.ask\('change'\)"/s,
		)
	})

	it("draws the counter of portions per course in the bar's counter slot, only when the composable has chips", () => {
		expect(page).toMatch(
			/<template v-if="covers\.chips\.value\.length > 0" #counter>\s*<CoverCounter :chips="covers\.chips\.value" \/>/,
		)
	})

	it("keeps the QR and Back handlers it had", () => {
		expect(page).toMatch(
			/<TableHeaderBar\b[^>]*@qr="handleQRButtonClick"[^>]*@back="closeTable"/s,
		)
	})
})

describe("the phone's screen, in the till's page", () => {
	it("asks the same question in the same mode from its pastille", () => {
		// the pick handlers hold arrow functions, so the tag is read up to the end of its attributes and not up to the first `>`
		expect(page).toMatch(
			/<PhoneOrderScreen\b[\s\S]{0,900}?@covers="covers\.ask\('change'\)"[\s\S]{0,40}?\/>/,
		)
	})
})

describe("the dialog, in the till's page", () => {
	it("is mounted once, while the cart's question is open, beside the question « Back » asks", () => {
		expect(page).toMatch(/<CoversDialog\b[^>]*v-if="covers\.asking\.value"/s)
		expect(page.indexOf("<LeaveTableDialog")).toBeGreaterThan(-1)
		expect(page.indexOf("<CoversDialog")).toBeGreaterThan(
			page.indexOf("<LeaveTableDialog"),
		)
	})

	it("is handed the mode, the seats, the people already counted and the answers of the composable", () => {
		expect(page).toMatch(/<CoversDialog\b[^>]*:mode="covers\.mode\.value"/s)
		expect(page).toMatch(
			/<CoversDialog\b[^>]*:seats="Number\(cartStore\.restaurantTable\?\.capacity\) \|\| null"/s,
		)
		expect(page).toMatch(
			/<CoversDialog\b[^>]*:current="cartStore\.restaurantCovers"/s,
		)
		expect(page).toMatch(/<CoversDialog\b[^>]*:busy="covers\.busy\.value"/s)
		expect(page).toMatch(
			/<CoversDialog\b[^>]*@confirm="covers\.confirm"[^>]*@later="covers\.later"[^>]*@cancel="covers\.cancel"/s,
		)
	})

	it("takes the composable once, for the header, the phone and the dialog", () => {
		expect(page.match(/useCovers\(\)/g)).toHaveLength(1)
		expect(page).toMatch(
			/import \{ useCovers \} from "@\/composables\/useCovers"/,
		)
	})
})

describe("a guest's update of the order, in the till's page", () => {
	it("keeps the people the waiter counted before the first « Valider », and the question if it is open", () => {
		expect(page).toMatch(
			/const keptCovers = cartStore\.restaurantCovers;[\s\S]{0,200}const keptCoversAsk = cartStore\.coversAsk;[\s\S]{0,400}await cartStore\.clearCart\(\)/,
		)
		expect(page).toMatch(
			/cartStore\.setRestaurantCovers\(orderData\.covers \?\? keptCovers\)/,
		)
		expect(page).toMatch(/cartStore\.coversAsk = keptCoversAsk/)
	})

	it("gives the number the server holds the last word", () => {
		const read = page.indexOf("get_table_order")
		const restore = page.indexOf(
			"setRestaurantCovers(orderData.covers ?? keptCovers)",
		)
		expect(read).toBeGreaterThan(-1)
		expect(restore).toBeGreaterThan(read)
	})
})

describe("every way of opening a table", () => {
	it("goes through the one function that asks how many people are seated", () => {
		expect(opening).toMatch(/covers\.askOnOpen\(\)/)
		expect(opening).toMatch(/res\?\.is_new \|\| !res\?\.name/)
		// the plan's tile and the list (FloorPlanEditor), the notice of a guest's order, and « put the order back »
		expect(floor).toMatch(/useOpenTable\(\)/)
		expect(notice).toMatch(/useOpenTable\(\)/)
		expect(page).toMatch(/useOpenTable\(\)/)
	})

	it("does not ask by a copy of its own in the callers", () => {
		for (const source of [floor, notice])
			expect(source).not.toMatch(/askOnOpen|coversAsk/)
	})
})

describe("the runner's page", () => {
	it("hands each card the people seated and the server's count per course", () => {
		expect(runner).toMatch(/covers: order\.covers \?\? null,/)
		expect(runner).toMatch(/familyCounts: order\.family_counts \|\| \{\},/)
	})
})
