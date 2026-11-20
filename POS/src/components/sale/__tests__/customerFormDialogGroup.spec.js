//// Neoffice — added file (no upstream equivalent). The new customer form starts in the group the site says, never in the first of the list (neoffice-maintenance#3108).
//// The form is read from its source, as the other specs of the forms of the till do (the rule itself is pinned in utils/__tests__/customerGroups.spec.js).
import { describe, expect, it } from "vitest"
import formSource from "../CustomerFormDialog.vue?raw"

describe("the group of the new customer form", () => {
	it("reads the group to start in from the shared rule, never takes the first group of the list", () => {
		expect(formSource).toContain("return preferredCustomerGroup({")
		expect(formSource).not.toContain("customerGroups.value[0]")
		expect(formSource).toContain('const defaultCustomerGroup = ref("")')
		expect(formSource).not.toContain('const defaultCustomerGroup = ref("Individual")')
	})

	it("asks the till for the site's group, and fills the field if the list came first", () => {
		expect(formSource).toContain('url: "pos_next.api.customers.get_default_customer_group",')
		expect(formSource).toContain("defaultCustomerGroupResource.reload()")
		expect(formSource).toMatch(/defaultCustomerGroup\.value = name \|\| ""\s*\/\/[^\n]*\n\s*if \(!customerGroup\.value && customerGroups\.value\.length\)/)
	})

	it("does not let the cashier save while a group has to be chosen, and says it is required", () => {
		expect(formSource).toMatch(/const isFormValid = computed\(\(\) => \{\s*\/\/[^\n]*\n\s*if \(customerGroupIsMissing\(\{ groups: customerGroups\.value, chosen: customerGroup\.value \}\)\) return false/)
		expect(formSource).toContain('{{ __("Customer Group") + " *" }}')
	})
})
