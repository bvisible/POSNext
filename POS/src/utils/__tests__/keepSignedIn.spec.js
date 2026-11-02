/**
 * //// Neoffice — added file (no upstream equivalent). The till asks the server to keep its staff signed in for the days its
 * //// POS Settings say (NeoResto lot 1, product owner, 01.11.2026): once per page load for a profile, again after a sign-in
 * //// or a sign-out, fire-and-forget, and a failure never reaches the till (it is tried again the next time).
 * @vitest-environment jsdom
 */
import { flushPromises } from "@vue/test-utils"
import { beforeEach, describe, expect, it, vi } from "vitest"

const call = vi.hoisted(() => vi.fn())
const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

vi.mock("@/utils/apiWrapper", () => ({ call }))
vi.mock("@/utils/logger", () => ({ logger: { create: () => log } }))

const { KEEP_SIGNED_IN_METHOD, forgetKeepSignedIn, keepStaffSignedIn } = await import("../keepSignedIn")

describe("the till keeps its staff signed in", () => {
	beforeEach(() => {
		forgetKeepSignedIn()
		call.mockReset()
		call.mockResolvedValue({ days: 30, stamped: true })
		Object.values(log).forEach((fn) => fn.mockReset())
	})

	it("asks the server once, with the till's profile", async () => {
		keepStaffSignedIn("Till 1")
		await flushPromises()

		expect(call).toHaveBeenCalledTimes(1)
		expect(call).toHaveBeenCalledWith("pos_next.api.session.keep_signed_in", { pos_profile: "Till 1" })
		expect(KEEP_SIGNED_IN_METHOD).toBe("pos_next.api.session.keep_signed_in")
	})

	it("asks once per profile in a page load, however often the profile is loaded", async () => {
		keepStaffSignedIn("Till 1")
		keepStaffSignedIn("Till 1")
		await flushPromises()
		keepStaffSignedIn("Till 1")
		await flushPromises()
		expect(call).toHaveBeenCalledTimes(1)

		// Another till, opened later in the same page, is another profile
		keepStaffSignedIn("Till 2")
		await flushPromises()
		expect(call).toHaveBeenCalledTimes(2)
		expect(call).toHaveBeenLastCalledWith("pos_next.api.session.keep_signed_in", { pos_profile: "Till 2" })
	})

	it("asks nothing while the profile is unknown", async () => {
		for (const unknown of [undefined, null, ""]) keepStaffSignedIn(unknown)
		await flushPromises()

		expect(call).not.toHaveBeenCalled()
	})

	it("asks again after a sign-in or a sign-out", async () => {
		keepStaffSignedIn("Till 1")
		await flushPromises()

		forgetKeepSignedIn()
		keepStaffSignedIn("Till 1")
		await flushPromises()

		expect(call).toHaveBeenCalledTimes(2)
	})

	it("returns at once, without waiting for the server", () => {
		call.mockReturnValue(new Promise(() => {}))

		expect(keepStaffSignedIn("Till 1")).toBeUndefined()
	})

	it("swallows a refusal or an offline till, and asks again the next time", async () => {
		call.mockRejectedValueOnce(new Error("offline"))

		expect(() => keepStaffSignedIn("Till 1")).not.toThrow()
		await flushPromises()
		expect(log.warn).toHaveBeenCalledTimes(1)

		keepStaffSignedIn("Till 1")
		await flushPromises()
		expect(call).toHaveBeenCalledTimes(2)
		// ... and once it went through, not again
		keepStaffSignedIn("Till 1")
		await flushPromises()
		expect(call).toHaveBeenCalledTimes(2)
	})

	it("swallows a call that throws before it returns anything", async () => {
		call.mockImplementationOnce(() => {
			throw new Error("the API wrapper is not there")
		})

		expect(() => keepStaffSignedIn("Till 1")).not.toThrow()
		await flushPromises()
		expect(log.warn).toHaveBeenCalledTimes(1)
	})
})
