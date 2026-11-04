/**
 * //// Neoffice — added file (no upstream equivalent). Broken on purpose, removed by the next commit: frontend-tests.yml must
 * //// go red on a red spec (2026-11-04).
 */
import { describe, expect, it } from "vitest"

describe("frontend-tests.yml", () => {
	it("goes red on a red spec", () => {
		expect(1 + 1).toBe(3)
	})
})
