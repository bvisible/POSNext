/**
 * //// Neoffice — added file (no upstream equivalent). The first calls of a page wait for its token (maintenance#2929, the audit of 18.11): Frappe puts none in the till's page, so the user, the dictionary's stamp
 * //// and the colour mode went out without one, were refused (400, CSRFTokenError) and sent again after a refresh: two refusals in the browser's log on every load of /pos. The wrappers ask for the token
 * //// once and send the call with it; a page with no session asks nothing; the token endpoint refused once is not asked again at every call.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sent = vi.hoisted(() => ({ log: [], tokenAtSend: [] }))

vi.mock("../frappeRequest", () => ({
	call: vi.fn(async (method) => {
		sent.log.push(`call ${method}`)
		sent.tokenAtSend.push(window.csrf_token || null)
		return { ok: method }
	}),
}))

const tokenEndpoint = (answer) =>
	vi.fn(async () => {
		sent.log.push("token")
		return answer
	})
const okToken = (token) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ message: { csrf_token: token } }) })
const refused = { ok: false, status: 403, headers: { get: () => "application/json" }, json: async () => ({}) }

async function load() {
	vi.resetModules()
	const { call } = await import("../apiWrapper")
	const { createCSRFAwareRequest } = await import("../csrf")
	return { call, createCSRFAwareRequest }
}

beforeEach(() => {
	sent.log.length = 0
	sent.tokenAtSend.length = 0
	window.csrf_token = undefined
	document.cookie = "user_id=cashier%40example.com; path=/"
	window.history.pushState({}, "", "/pos")
})
afterEach(() => {
	vi.unstubAllGlobals()
	document.cookie = "user_id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/"
})

describe("the first call of a page", () => {
	it("is sent with the page's token, once, after asking for it: no refusal, no second sending", async () => {
		vi.stubGlobal("fetch", tokenEndpoint(okToken("TOKEN-1")))
		const { call } = await load()

		const answer = await call("frappe.auth.get_logged_user", {})

		expect(answer).toEqual({ ok: "frappe.auth.get_logged_user" })
		expect(sent.log).toEqual(["token", "call frappe.auth.get_logged_user"])
		expect(sent.tokenAtSend).toEqual(["TOKEN-1"])
	})

	it("asks the token once for the calls that start together", async () => {
		const fetcher = tokenEndpoint(okToken("TOKEN-2"))
		vi.stubGlobal("fetch", fetcher)
		const { call } = await load()

		await Promise.all([call("a.one", {}), call("b.two", {}), call("c.three", {})])

		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(sent.tokenAtSend).toEqual(["TOKEN-2", "TOKEN-2", "TOKEN-2"])
	})

	it("asks nothing when the page has its token already", async () => {
		const fetcher = tokenEndpoint(okToken("OTHER"))
		vi.stubGlobal("fetch", fetcher)
		window.csrf_token = "HELD"
		const { call } = await load()

		await call("a.one", {})

		expect(fetcher).not.toHaveBeenCalled()
		expect(sent.tokenAtSend).toEqual(["HELD"])
	})

	it("asks nothing of a visitor with no session: his page has no token to give", async () => {
		const fetcher = tokenEndpoint(okToken("NEVER"))
		vi.stubGlobal("fetch", fetcher)
		document.cookie = "user_id=Guest; path=/"
		window.history.pushState({}, "", "/pos/menu/CARD-1")
		const { call } = await load()

		await call("a.one", {})

		expect(fetcher).not.toHaveBeenCalled()
		expect(sent.log).toEqual(["call a.one"])
	})

	it("is sent all the same when the token is refused, and the token is not asked again at every call", async () => {
		const fetcher = tokenEndpoint(refused)
		vi.stubGlobal("fetch", fetcher)
		const { call } = await load()

		await call("a.one", {})
		await call("b.two", {})

		expect(fetcher).toHaveBeenCalledTimes(1)
		expect(sent.log.filter((entry) => entry.startsWith("call"))).toHaveLength(2)
	})

	it("is the same for the requests of the resources (the user), which wait for the token too", async () => {
		vi.stubGlobal("fetch", tokenEndpoint(okToken("TOKEN-3")))
		const { createCSRFAwareRequest } = await load()
		const original = vi.fn(async () => {
			sent.log.push("request")
			sent.tokenAtSend.push(window.csrf_token || null)
			return "answer"
		})

		const answer = await createCSRFAwareRequest(original, { silent: true })({ url: "frappe.auth.get_logged_user" })

		expect(answer).toBe("answer")
		expect(sent.log).toEqual(["token", "request"])
		expect(sent.tokenAtSend).toEqual(["TOKEN-3"])
	})
})
