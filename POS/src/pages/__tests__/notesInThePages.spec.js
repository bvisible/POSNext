/**
 * //// Neoffice — added file (no upstream equivalent). The groups of a table (.1, .2, .3), in the till's page and the runner's page (NeoResto lot 1, notes). POSSale.vue is too large to mount here (a dozen stores, the offline
 * //// workers, sockets), so this reads what the page wires from its source, as the neighbouring page specs do: the header bar and the phone's screen are bound to the one composable that reads and drives the groups, its two
 * //// dialogs are mounted once, putting the order back and a guest's update read the group in front of the waiter (never the table's lowest one), a guest's order leaves a cart on another group alone, and paying leaves the
 * //// floor as it did (the cleaning dialog opens only from a table the server says is paid or being cleaned). The runner's page titles each card with its group and keeps one block per group at a station.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const page = read("../POSSale.vue")
const runner = read("../Runner.vue")
const floor = read("../../components/pos/FloorPlanEditor.vue")
const opening = read("../../composables/useOpenTable.js")

describe("the header of the open table, in the till's page", () => {
	it("is titled by the groups' label, « Table 5.2 · Dupont », else by the table's name", () => {
		expect(page).toMatch(/<TableHeaderBar\b[^>]*:title="[^"]*\(notes\.label\.value \|\| cartStore\.restaurantTable\?\.table_name\)/s)
	})

	it("offers « ＋ Group » when the composable says so and adds a group when it is pressed", () => {
		expect(page).toMatch(/<TableHeaderBar\b[^>]*:can-add-note="notes\.showAddGroup\.value"/s)
		expect(page).toMatch(/<TableHeaderBar\b[^>]*@add-note="notes\.add"/s)
	})

	it("draws the row of pills in the bar's notes slot only from two notes on, handed the bar's width", () => {
		expect(page).toMatch(/<template v-if="notes\.showPills\.value" #notes="\{ wide \}">\s*<TableNotePills/)
		const pills = page.slice(page.indexOf("<TableNotePills"), page.indexOf("/>", page.indexOf("<TableNotePills")))
		expect(pills).toMatch(/:pills="notes\.pills\.value"/)
		expect(pills).toMatch(/:can-add="notes\.canAdd\.value"/)
		expect(pills).toMatch(/:caption="wide"/)
		expect(pills).toMatch(/@select="notes\.select"/)
		expect(pills).toMatch(/@add="notes\.add"/)
		expect(pills).toMatch(/@rename="notes\.askName"/)
	})

	it("keeps the handlers and the covers of the bar it had", () => {
		expect(page).toMatch(/<TableHeaderBar\b[^>]*@qr="handleQRButtonClick"[^>]*@back="closeTable"/s)
		expect(page).toMatch(/<TableHeaderBar\b[^>]*@covers="covers\.ask\('change'\)"/s)
	})
})

describe("the phone's screen, in the till's page", () => {
	it("tells the composable which group was tapped, that a group is added, and that a name is asked", () => {
		const tag = page.slice(page.indexOf("<PhoneOrderScreen"), page.indexOf("/>", page.indexOf("@covers=\"covers.ask('change')\"", page.indexOf("<PhoneOrderScreen"))))
		expect(tag).toMatch(/@note-select="notes\.select"/)
		expect(tag).toMatch(/@note-add="notes\.add"/)
		expect(tag).toMatch(/@note-rename="notes\.askName"/)
	})
})

describe("the two questions, in the till's page", () => {
	it("are mounted once, beside the question about the people, while the cart's question is open", () => {
		expect(page).toMatch(/<MoveLinesDialog\b[^>]*v-if="notes\.moveAsk\.value"/s)
		expect(page).toMatch(/<NoteNameDialog\b[^>]*v-if="notes\.nameAsk\.value"/s)
		expect(page.indexOf("<MoveLinesDialog")).toBeGreaterThan(page.indexOf("<CoversDialog"))
		expect(page.match(/<MoveLinesDialog/g)).toHaveLength(1)
		expect(page.match(/<NoteNameDialog/g)).toHaveLength(1)
	})

	it("hand the move question the lines, where they are and where they would go, and the answers of the composable", () => {
		expect(page).toMatch(/<MoveLinesDialog\b[^>]*:count="notes\.moveAsk\.value\.count"[^>]*:from="notes\.fromLabel\.value"[^>]*:to="notes\.toLabel\.value"/s)
		expect(page).toMatch(/<MoveLinesDialog\b[^>]*@move="notes\.moveThem"[^>]*@keep="notes\.keepThem"/s)
	})

	it("hand the name question the group and the name it has, and the answers of the composable", () => {
		expect(page).toMatch(/<NoteNameDialog\b[^>]*:label="notes\.namedPill\.value\?\.label \|\| ''"[^>]*:current="notes\.namedPill\.value\?\.name \|\| ''"/s)
		expect(page).toMatch(/<NoteNameDialog\b[^>]*@save="notes\.saveName"[^>]*@cancel="notes\.cancelName"/s)
	})

	it("take the composable once, for the header, the phone and the dialogs", () => {
		expect(page.match(/useTableNotes\(\)/g)).toHaveLength(1)
		expect(page).toMatch(/import \{ useTableNotes \} from "@\/composables\/useTableNotes"/)
	})
})

describe("putting the order back as it was, in the till's page", () => {
	it("reads the group in front of the waiter again, not the table's lowest one", () => {
		expect(page).toMatch(/openTable\(cartStore\.restaurantTable, noteToReadAgain\(cartStore\)\)/)
	})
})

describe("a guest's update of the order, in the till's page", () => {
	it("reads the group in front of the waiter", () => {
		expect(page).toMatch(/get_table_order", \{\s*table_name: table\.name,[^}]*\.\.\.noteToReadAgain\(cartStore\),/s)
	})

	it("leaves the cart alone, and refreshes the table's groups, when the waiter is not on the lowest open group (where a guest's order lands)", () => {
		expect(page).toMatch(
			/if \(orderData\?\.items && !isTheLowestNote\(orderData\.notes, cartStore\.restaurantNote\)\) \{\s*cartStore\.setRestaurantNotes\(orderData\.notes\);\s*return;\s*\}/,
		)
		expect(page.indexOf("isTheLowestNote(orderData.notes")).toBeLessThan(page.indexOf("await cartStore.clearCart();", page.indexOf("get_table_order")))
	})

	it("puts the group read back in the cart as an opening does, after the rebuild", () => {
		expect(page).toMatch(/const keptNote = cartStore\.restaurantNote;/)
		expect(page).toMatch(/keepTheNotesOfTheOrder\(cartStore, orderData, keptNote\);/)
		const rebuild = page.indexOf("await cartStore.clearCart();", page.indexOf("get_table_order"))
		expect(page.indexOf("keepTheNotesOfTheOrder(cartStore, orderData, keptNote)")).toBeGreaterThan(rebuild)
	})
})

describe("paying, in the till's page", () => {
	it("goes back to the floor as it did, reading the tables again", () => {
		expect(page).toMatch(/if \(restaurantTableName\) \{\s*restaurantStore\.fetchFromNetwork\(\);\s*\}/)
	})

	it("opens the cleaning dialog from nowhere but a table the server says is paid or being cleaned", () => {
		expect(page.match(/showCleaningDialog\.value = true/g)).toHaveLength(1)
		const opener = page.indexOf("async function handleCleaningTableClicked")
		expect(page.indexOf("showCleaningDialog.value = true")).toBeGreaterThan(opener)
		expect(page.indexOf("showCleaningDialog.value = true")).toBeLessThan(page.indexOf("async function confirmTableCleaning"))
	})
})

describe("every way of opening a table", () => {
	it("keeps the group the server opened, through the one function that reads the table", () => {
		expect(opening).toMatch(/keepTheNotesOfTheOrder\(cartStore, res, note \?\? NOTE_MIN\)/)
		expect(opening).toMatch(/\.\.\.\(note \? \{ note \} : \{\}\)/)
	})
})

describe("the floor's list", () => {
	it("is narrowed by the search the page keeps, which the list tells it", () => {
		expect(floor).toMatch(/<TablesList\b[^>]*:search="listSearch"[^>]*@update:search="\(text\) => \(listSearch = text\)"/s)
		expect(floor).toMatch(/search: listSearch\.value,/)
	})

	it("counts the groups of a table on its tile from the order summary", () => {
		expect(floor).toMatch(/tableNotesInfo\(table\)\.count > 1/)
	})
})

describe("the runner's page", () => {
	it("writes the card's title and group name from the order", () => {
		expect(runner).toMatch(/title: orderTableParts\(order\)\.title,\s*noteName: orderTableParts\(order\)\.name,/)
	})

	it("names the group in the labels of a station's card", () => {
		expect(runner).toMatch(/_tableName: orderTableLabel\(order\)/)
		expect(runner).toMatch(/tableName: orderTableLabel\(order\)/)
	})

	it("keeps one block per group at a station when the table has several, and one per table otherwise", () => {
		expect(runner).toMatch(/Number\(order\.notes_count\) > 1\s*\?\s*`\$\{order\.restaurant_table\}\\u0000\$\{order\.note\}`\s*:\s*order\.restaurant_table/)
	})
})
