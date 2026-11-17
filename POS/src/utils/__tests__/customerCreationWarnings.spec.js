/**
 * //// Neoffice — added file (no upstream equivalent). What the till's customer form asks before it creates a customer
 * //// (maintenance#1109, #1120): a customer who may already exist (same name, or same company number), a customer without
 * //// an address where the till shows the address. Warnings, never a refusal: the cashier creates anyway, takes the
 * //// existing customer for the sale, or adds the address. The rules are pure (utils/customerCreationWarnings.js); how the
 * //// form uses them is read in its source, the form needing a browser to render.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { creationKey, duplicateSentence, matchReason, nextCreationQuestion } from "../customerCreationWarnings"

const FORM = readFileSync(fileURLToPath(new URL("../../components/sale/CustomerFormDialog.vue", import.meta.url)), "utf8")
const translate = (text, args) => String(text).replace(/\{(\d+)\}/g, (_, i) => (args || [])[i])
const CAFE = { name: "CUST-0042", customer_name: "Café du Marché", tax_id: "", disabled: 0, why: "name" }

describe("the question asked before a customer is created", () => {
	const base = { key: "café du marché", addressShown: true, addressGiven: true, withoutAddress: false }

	it("is the duplicate one when a customer already bears the name", () => {
		expect(nextCreationQuestion({ ...base, matches: [CAFE] })).toEqual({ kind: "duplicate", matches: [CAFE] })
	})

	it("is not asked again for a name the cashier chose to create anyway, and is for another name", () => {
		expect(nextCreationQuestion({ ...base, matches: [CAFE], createAnywayFor: "café du marché" })).toBe(null)
		expect(nextCreationQuestion({ ...base, matches: [CAFE], createAnywayFor: "café" })).toEqual({ kind: "duplicate", matches: [CAFE] })
	})

	it("is the address one when the till shows the address and no street was typed", () => {
		expect(nextCreationQuestion({ ...base, addressGiven: false })).toEqual({ kind: "address" })
		// the duplicate comes first
		expect(nextCreationQuestion({ ...base, addressGiven: false, matches: [CAFE] }).kind).toBe("duplicate")
	})

	it("is never the address one where the till takes no address, or once the cashier chose to create without", () => {
		expect(nextCreationQuestion({ ...base, addressShown: false, addressGiven: false })).toBe(null)
		expect(nextCreationQuestion({ ...base, addressGiven: false, withoutAddress: true })).toBe(null)
	})

	it("is none when there is nothing to say", () => {
		expect(nextCreationQuestion({ ...base })).toBe(null)
		expect(nextCreationQuestion({ ...base, matches: undefined })).toBe(null)
	})

	it("knows one name whatever its case and its spaces", () => {
		expect(creationKey("  Café   du MARCHÉ ")).toBe("café du marché")
		expect(creationKey(null)).toBe("")
	})
})

describe("what the cashier reads of a customer found", () => {
	it("says why each is named", () => {
		expect(matchReason(CAFE, translate)).toBe("same name")
		expect(matchReason({ ...CAFE, why: "tax_id", tax_id: "CHE-111.222.333" }, translate)).toBe("same company number CHE-111.222.333")
		expect(matchReason({ ...CAFE, why: "both", disabled: 1 }, translate)).toBe("same name and same company number · disabled")
	})

	it("says a company number already taken is most likely the same company", () => {
		expect(duplicateSentence([CAFE], translate)).toMatch(/namesake is possible/)
		expect(duplicateSentence([CAFE, { ...CAFE, why: "tax_id" }], translate)).toMatch(/most likely the same company/)
	})
})

describe("the till's customer form", () => {
	const handleCreate = FORM.slice(FORM.indexOf("const handleCreate = async () => {"), FORM.indexOf("const resetForm = () => {"))

	it("asks the server, with the cashier's rights, before it creates, and only when it creates", () => {
		expect(FORM).toContain('url: "neoffice_theme.events.find_existing_customers"')
		const asked = handleCreate.indexOf("await questionBeforeCreating()")
		expect(asked).toBeGreaterThan(handleCreate.indexOf("if (isEditMode.value) {"))
		expect(asked).toBeLessThan(handleCreate.indexOf("await createCustomerResource.submit()"))
	})

	it("never holds the cashier back when the server cannot be asked", () => {
		const question = FORM.slice(FORM.indexOf("const questionBeforeCreating = async () => {"), FORM.indexOf("const createAnyway = () => {"))
		expect(question).toMatch(/try \{[\s\S]*findExistingResource\.fetch[\s\S]*\} catch \(error\) \{\s*log\.warn/)
	})

	it("offers to take the existing customer, to create anyway, to add the address or to create without it", () => {
		for (const words of ["Use this customer", "Create anyway", "Add the address", "Create without an address"]) {
			expect(FORM).toContain(`__("${words}")`)
		}
		expect(FORM).toContain('ref="streetField"')
		expect(FORM).toMatch(/const useExistingCustomer = async \(match\) => \{[\s\S]*url: "frappe\.client\.get"[\s\S]*emit\("customer-created", customer\)/)
	})

	it("forgets the questions with the rest of the form", () => {
		const reset = FORM.slice(FORM.indexOf("const resetForm = () => {"))
		expect(reset).toMatch(/creationQuestion\.value = null\s*createAnywayFor\.value = null\s*withoutAddress\.value = false/)
	})
})
