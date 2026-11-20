//// Neoffice — added file (no upstream equivalent). The group a new customer of the till starts in (neoffice-maintenance#3108): never a group taken at random.
//// The form fell back on the FIRST group of the list when none of the names it guessed existed: a salon customer was filed among the resellers, and pays another price.
import { describe, expect, it } from "vitest"
import { customerGroupIsMissing, preferredCustomerGroup } from "@/utils/customerGroups"

const resellersFirst = ["Association", "Entreprise", "Particulier", "Revendeur 20%"]

describe("the group a new customer starts in", () => {
	it("is the site's group where the site says one and the list has it", () => {
		expect(preferredCustomerGroup({ type: "Individual", groups: resellersFirst, siteDefault: "Particulier" })).toBe("Particulier")
	})

	it("is the group of the type where the site names one (« Individuel » for a person, « Commercial » for a company), before the site's", () => {
		expect(preferredCustomerGroup({ type: "Individual", groups: ["Commercial", "Individuel", "Zeta"], siteDefault: "Zeta" })).toBe("Individuel")
		expect(preferredCustomerGroup({ type: "Company", groups: ["Commercial", "Individuel", "Zeta"], siteDefault: "Zeta" })).toBe("Commercial")
	})

	it("is NONE where the site says none: the first group of the list is never taken", () => {
		expect(preferredCustomerGroup({ type: "Individual", groups: resellersFirst, siteDefault: "" })).toBe("")
		expect(preferredCustomerGroup({ type: "Company", groups: resellersFirst, siteDefault: "" })).toBe("")
	})

	it("is NONE where the site's group is not among those the cashier can choose", () => {
		expect(preferredCustomerGroup({ type: "Individual", groups: resellersFirst, siteDefault: "Gone" })).toBe("")
	})

	it("is NONE where the list was not read", () => {
		expect(preferredCustomerGroup({ type: "Individual", groups: [], siteDefault: "Particulier" })).toBe("")
		expect(preferredCustomerGroup({ type: "Individual", groups: undefined, siteDefault: "Particulier" })).toBe("")
	})
})

describe("whether the cashier still has to choose a group", () => {
	it("has to where there is a choice and none was made", () => {
		expect(customerGroupIsMissing({ groups: resellersFirst, chosen: "" })).toBe(true)
	})

	it("has not once one is chosen", () => {
		expect(customerGroupIsMissing({ groups: resellersFirst, chosen: "Particulier" })).toBe(false)
	})

	it("has not where the list could not be read: the server applies the site's default itself", () => {
		expect(customerGroupIsMissing({ groups: [], chosen: "" })).toBe(false)
		expect(customerGroupIsMissing({ groups: undefined, chosen: "" })).toBe(false)
	})
})
