/**
 * //// Neoffice — added file (no upstream equivalent). Which pages a visitor with no session opens, where the till asks the server nothing that
 * //// wants a session (maintenance#1975).
 */
import { describe, expect, it } from "vitest";
import { hasNoSession, isAVisitorWithoutSession, isVisitorPage } from "@/utils/visitorPage";

describe("a visitor's page", () => {
	it("is the sign-in page and the pages of the customers", () => {
		for (const path of [
			"/pos/account/login",
			"/pos/order",
			"/pos/reservation",
			"/pos/guest/abc",
			"/pos/menu/Bistro",
			"/pos/shop/k1",
		])
			expect(isVisitorPage(path), path).toBe(true);
	});

	it("is never the till, the kitchen, the runner nor a screen a device pairs with", () => {
		for (const path of [
			"/pos",
			"/pos/",
			"/pos/kds",
			"/pos/runner",
			"/pos/display",
			"/pos/cfd",
			"/pos/pair",
			"/pos/takeaway",
			"/pos/orders",
		])
			expect(isVisitorPage(path), path).toBe(false);
	});
});

describe("no session", () => {
	it("is a browser with no user, or Frappe's Guest", () => {
		expect(hasNoSession("")).toBe(true);
		expect(hasNoSession("user_id=Guest; system_user=no")).toBe(true);
		expect(hasNoSession("full_name=Ana; user_id=ana%40example.com; system_user=yes")).toBe(
			false
		);
	});

	it("on a visitor's page asks nothing that wants a session; a signed-in cashier on it is asked as before", () => {
		expect(isAVisitorWithoutSession({ pathname: "/pos/order", cookie: "user_id=Guest" })).toBe(
			true
		);
		expect(
			isAVisitorWithoutSession({
				pathname: "/pos/account/login",
				cookie: "user_id=ana%40example.com",
			})
		).toBe(false);
		expect(isAVisitorWithoutSession({ pathname: "/pos/kds", cookie: "user_id=Guest" })).toBe(
			false
		);
	});
});
