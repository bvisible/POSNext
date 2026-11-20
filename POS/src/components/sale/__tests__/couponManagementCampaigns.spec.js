//// Neoffice — added file (no upstream equivalent). The coupon form reads its campaigns from the till's own call (neoffice-maintenance#3186).
//// The screen read the doctype itself (`frappe.client.get_list` on Campaign, filtered on a `disabled` field that Campaign does not have): 417 for everybody, and an exception nobody caught.
//// The window is read from its source, as the other specs of the screens of the promotions do.
import { describe, expect, it } from "vitest"
import couponSource from "../CouponManagement.vue?raw"

describe("the campaigns of the coupon form", () => {
	it("are read from the till's call, never from the doctype", () => {
		expect(couponSource).toContain("url: promoApi.getCampaigns(),")
		expect(couponSource).not.toMatch(/doctype:\s*"Campaign"/)
		expect(couponSource).not.toContain("filters: { disabled: 0 }")
	})

	it("say why when they cannot be read, and leave the field empty instead of an exception nobody catches", () => {
		const resource = couponSource.slice(couponSource.indexOf("const campaignsResource = createResource({"))
		const body = resource.slice(0, resource.indexOf("\n});") + 4)
		expect(body).toContain("onError(error) {")
		expect(body).toContain('handleError(error, __("Failed to load campaigns"));')
		expect(body).toContain("campaigns.value = [];")
	})
})
