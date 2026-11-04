/**
 * //// Neoffice — added file (no upstream equivalent). data/user.js watches the cookie with a module-level timer.
 * //// In the test runner a spec's jsdom is torn down while that timer still runs, and its next tick threw
 * //// « document is not defined » outside any test, which failed a whole vitest run of frontend-tests.yml where all
 * //// 4,380 tests passed (2026-11-04). The timer now stops once there is no document.
 * @vitest-environment jsdom
 */
import { expect, it, vi } from "vitest"

vi.mock("@/router", () => ({ default: {} }))
vi.mock("frappe-ui", () => ({ createResource: () => ({}) }))

it("stops watching the cookie once the document is gone, instead of throwing outside any test", async () => {
	vi.useFakeTimers()
	await import("@/data/user")
	const document = globalThis.document
	try {
		vi.advanceTimersByTime(600) // the document is there: the watch runs
		delete globalThis.document // what the end of a spec's jsdom does
		expect(globalThis.document).toBeUndefined()
		expect(() => vi.advanceTimersByTime(600)).not.toThrow()
		expect(vi.getTimerCount()).toBe(0)
	} finally {
		globalThis.document = document
		vi.useRealTimers()
	}
})
