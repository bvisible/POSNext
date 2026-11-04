/**
 * //// Neoffice — added file (no upstream equivalent). The calls of the shop's page (utils/shopScan): the tab keeps its
 * //// session, a session the server no longer takes gives way to a new one, a refusal comes back in the server's words.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	globalThis.__ = (msgid, args) =>
		args ? msgid.replace(/\{(\d+)\}/g, (_match, index) => args[Number(index)]) : msgid;
});

const { articlesIn, articlesLabel, keptSession, openShop, scanItem, serverMessage, ShopRefusal } = await import(
	"../shopScan"
);

const CART = { status: "Scanning", lines: [], grand_total: 0, currency: "CHF" };

function answer(status, body) {
	return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function refusal(message, exc_type = "ValidationError", status = 417) {
	return answer(status, {
		exc_type,
		_server_messages: JSON.stringify([JSON.stringify({ message })]),
	});
}

describe("the shop's page and the server", () => {
	let calls;

	beforeEach(() => {
		window.sessionStorage.clear();
		calls = [];
	});

	afterEach(() => vi.restoreAllMocks());

	function serve(byMethod) {
		vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
			const method = url.split(".").pop();
			calls.push({
				method,
				args: JSON.parse(options.body),
				credentials: options.credentials,
			});
			return byMethod[method](JSON.parse(options.body));
		});
	}

	it("opens a session from the key of the QR code and keeps it for the tab", async () => {
		serve({
			start_shop_session: () =>
				answer(200, { message: { token: "T1", shop_name: "The shop" } }),
			get_shop_cart: () => answer(200, { message: CART }),
		});

		const shop = await openShop("KEY");

		expect(shop).toEqual({ token: "T1", shopName: "The shop", cart: CART });
		expect(keptSession("KEY")).toEqual({ token: "T1", shopName: "The shop" });
		expect(calls.map((call) => call.method)).toEqual(["start_shop_session", "get_shop_cart"]);
		expect(calls.every((call) => call.credentials === "omit")).toBe(true);
	});

	it("takes the tab's session again while the server takes it", async () => {
		window.sessionStorage.setItem(
			"pos_next_shop_session:KEY",
			JSON.stringify({ token: "T1", shopName: "The shop" })
		);
		serve({ get_shop_cart: () => answer(200, { message: CART }) });

		const shop = await openShop("KEY");

		expect(shop.token).toBe("T1");
		expect(calls.map((call) => call.method)).toEqual(["get_shop_cart"]);
	});

	it("opens a new session when the server no longer takes the tab's", async () => {
		window.sessionStorage.setItem(
			"pos_next_shop_session:KEY",
			JSON.stringify({ token: "OLD" })
		);
		serve({
			get_shop_cart: ({ token }) =>
				token === "OLD"
					? refusal(
							"This session has expired or is no longer active.",
							"AuthenticationError",
							401
					  )
					: answer(200, { message: CART }),
			start_shop_session: () =>
				answer(200, { message: { token: "NEW", shop_name: "The shop" } }),
		});

		const shop = await openShop("KEY");

		expect(shop.token).toBe("NEW");
		expect(keptSession("KEY").token).toBe("NEW");
	});

	it("says a refusal in the server's words", async () => {
		serve({
			start_shop_session: () =>
				refusal("The shop is closed: scanning starts again when its till opens."),
		});

		await expect(openShop("KEY")).rejects.toMatchObject({
			message: "The shop is closed: scanning starts again when its till opens.",
			kind: "refused",
		});
	});

	it("says a lost connection as such", async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

		const error = await scanItem("T1", "123").catch((caught) => caught);

		expect(error).toBeInstanceOf(ShopRefusal);
		expect(error.kind).toBe("network");
	});

	it("reads the first message the server queued, and nothing from an answer with none", () => {
		expect(
			serverMessage({
				_server_messages: JSON.stringify([JSON.stringify({ message: "Not sold here." })]),
			})
		).toBe("Not sold here.");
		expect(serverMessage({})).toBe("");
		expect(serverMessage({ _server_messages: "not json" })).toBe("");
	});

	it("says one article in the singular, any other number in the plural", () => {
		expect(articlesLabel(1)).toBe("1 article");
		expect(articlesLabel(3)).toBe("3 articles");
	});

	it("counts the articles of a cart, the free ones apart", () => {
		const cart = {
			lines: [
				{ qty: 2, is_free_item: 0 },
				{ qty: 1, is_free_item: 0 },
				{ qty: 1, is_free_item: 1 },
			],
		};

		expect(articlesIn(cart)).toBe(3);
		expect(articlesIn(null)).toBe(0);
	});
});
