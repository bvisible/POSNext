/**
 * //// Neoffice — added file (no upstream equivalent). A refusal answered as an HTML page (Frappe's 403 « Redirecting… » for a visitor) is read
 * //// as a refusal that says its status, never as a TypeError of the reader (maintenance#1975): the till's resource fetcher and its `call`.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// frappe-ui's own `request` and `getConfig`, reached by their paths (the package's index pulls in the whole library)
vi.mock("frappe-ui", async () => {
	const { request } = await import("../../../node_modules/frappe-ui/src/utils/request.js");
	const { getConfig } = await import("../../../node_modules/frappe-ui/src/utils/config.ts");
	return { request, getConfig };
});

const { call, errorFromAnswer, frappeRequest } = await import("@/utils/frappeRequest");

const HTML_403 =
	"<!DOCTYPE html><html><head><title>Redirecting…</title></head><body>Redirecting to /login</body></html>";

function answer(status, body, type = "text/html") {
	return new Response(body, { status, headers: { "Content-Type": type } });
}

beforeEach(() => {
	globalThis.fetch = vi.fn();
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
	vi.spyOn(console, "groupEnd").mockImplementation(() => {});
});
afterEach(() => {
	vi.restoreAllMocks();
});

describe("a refusal answered as an HTML page", () => {
	it("is a refusal with its status from `call`, not a TypeError", async () => {
		fetch.mockResolvedValue(answer(403, HTML_403));

		const error = await call("pos_next.api.localization.get_user_language").catch((e) => e);

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(TypeError);
		expect(error.status).toBe(403);
		expect(error.messages).toEqual(["Not permitted"]);
		expect(error.message).toBe("pos_next.api.localization.get_user_language");
	});

	it("is a refusal with its status from the resource fetcher, not a TypeError", async () => {
		fetch.mockResolvedValue(answer(403, HTML_403));
		const onError = vi.fn();

		const error = await frappeRequest({ url: "frappe.auth.get_logged_user", onError }).catch(
			(e) => e
		);

		expect(error).not.toBeInstanceOf(TypeError);
		expect(error.status).toBe(403);
		expect(error.messages).toEqual(["Not permitted"]);
		expect(onError).toHaveBeenCalledWith(error);
		// The method is called where frappe-ui calls it
		expect(fetch.mock.calls[0][0]).toBe("/api/method/frappe.auth.get_logged_user");
	});

	it("says a server error for any other status that brought no JSON (a proxy's 502 page)", () => {
		const error = errorFromAnswer("x", { status: 502 }, "<html>Bad gateway</html>");

		expect(error.status).toBe(502);
		expect(error.messages).toEqual(["Internal Server Error"]);
	});
});

describe("a refusal answered as Frappe's JSON", () => {
	it("keeps what frappe-ui made of it: the type, the traceback and the messages", async () => {
		const body = JSON.stringify({
			exc_type: "PermissionError",
			exc: JSON.stringify(["Traceback …"]),
			_server_messages: JSON.stringify([JSON.stringify({ message: "You are not allowed" })]),
		});
		fetch.mockResolvedValue(answer(403, body, "application/json"));

		const error = await call("pos_next.api.x.y", { a: 1 }).catch((e) => e);

		expect(error.exc_type).toBe("PermissionError");
		expect(error.exc).toBe("Traceback …");
		expect(error.status).toBe(403);
		expect(error.messages).toEqual(["You are not allowed"]);
		expect(error.message).toBe("pos_next.api.x.y PermissionError");
	});
});

describe("an answer that is OK", () => {
	it("gives the method's message, as frappe-ui does", async () => {
		fetch.mockResolvedValue(
			answer(200, JSON.stringify({ message: { locale: "fr" } }), "application/json")
		);

		expect(await call("pos_next.api.localization.get_user_language")).toEqual({
			locale: "fr",
		});
		fetch.mockResolvedValue(answer(200, JSON.stringify({ message: 42 }), "application/json"));
		expect(await frappeRequest({ url: "pos_next.api.x.y", params: { a: 1 } })).toBe(42);
		expect(fetch.mock.calls[1][1].body).toBe(JSON.stringify({ a: 1 }));
	});
});
