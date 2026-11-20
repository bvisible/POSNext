//// Neoffice — added file (no upstream equivalent). A held cart put back is the cart that was held: every line keeps its person, « nobody » included (neoffice-maintenance#3202).
//// The page is read from its source, as the other specs of the sale page do (it is too large to mount): the cart's own spec (stores/__tests__/posCartTheLineTakesTheServingPerson.spec.js)
//// pins what `keeps_its_person` does to a line added to the cart.
import { describe, expect, it } from "vitest"
import pageSource from "../POSSale.vue?raw"

describe("the sale page putting a held cart back", () => {
	// the block that restores the lines of a held cart: from the draft that was read to the customer it sets
	const block = () => {
		const from = pageSource.indexOf("const draftData = await draftsStore.loadDraft(draft);")
		const to = pageSource.indexOf("cartStore.setCustomer(draftData.customer);", from)
		expect(from).toBeGreaterThan(-1)
		expect(to).toBeGreaterThan(from)
		return pageSource.slice(from, to)
	}

	it("puts each line back as it was held, never as a new line that takes the person who serves", () => {
		expect(block()).toContain("cartStore.addItem({ ...item, keeps_its_person: true }, item.quantity || item.qty || 1);")
		expect(block()).not.toContain("cartStore.addItem(item,")
	})
})
