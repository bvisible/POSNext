//// Neoffice — added file (no upstream equivalent). The till writes a 24-hour clock, like the desk: Frappe v15's
//// System Settings only offer 24-hour time formats (HH:mm:ss, HH:mm). Upstream's helpers wrote "8:53 PM"
//// (hour12: true), in the till header and after every date that carries a time (see TIME_OPTIONS in currency.js).
import { createPinia, setActivePinia } from "pinia"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePOSShiftStore } from "../../stores/posShift"
import { formatDateTime, formatTime, setLocale } from "../currency"

// The header clock lives in the shift store; the shift composable it builds on is not under test here.
vi.mock("@/composables/useShift", () => ({
	shiftState: { value: {} },
	useShift: () => ({
		currentProfile: { value: null },
		currentShift: { value: null },
		hasOpenShift: { value: false },
		checkOpeningShift: { fetch: async () => {} },
	}),
}))

const EVENING = new Date(2026, 2, 28, 20, 53, 12)
const JUST_AFTER_MIDNIGHT = new Date(2026, 2, 28, 0, 7, 5)

describe("24-hour clock", () => {
	afterAll(() => setLocale("en"))

	it("formats 20:53 as 20:53 in French, not as 8:53 PM", () => {
		expect(formatTime(EVENING, "fr")).toBe("20:53")
		setLocale("fr")
		expect(formatTime(EVENING)).toBe("20:53")
		expect(formatTime("20:53:10")).toBe("20:53")
		expect(formatTime("2026-03-28 20:53:10")).toBe("20:53")
	})

	it("writes a date followed by a 24-hour time, never AM or PM", () => {
		setLocale("fr")
		const text = formatDateTime("2026-03-28 20:53:00")
		expect(text).toMatch(/^28 mars 2026\D+20:53$/)
		expect(text).not.toMatch(/AM|PM/i)
	})

	it("keeps the hour on two digits and reads just after midnight as 00:07", () => {
		setLocale("fr")
		expect(formatTime(JUST_AFTER_MIDNIGHT)).toBe("00:07")
		expect(formatTime("09:05")).toBe("09:05")
	})

	it("is the same in every language the till is used in", () => {
		for (const language of ["fr", "en", "de", "it", "pt-br", "ar"]) {
			setLocale(language)
			expect(formatTime(EVENING), language).toBe("20:53")
			expect(formatDateTime(EVENING), language).toMatch(/\D20:53$/)
		}
	})

	describe("the clock in the till header", () => {
		beforeEach(() => {
			setActivePinia(createPinia())
			vi.useFakeTimers()
			vi.setSystemTime(EVENING)
			setLocale("fr")
		})
		afterEach(() => vi.useRealTimers())

		it("shows 20:53 at 20:53", () => {
			const shift = usePOSShiftStore()
			shift.updateCurrentTime()
			expect(shift.currentTime).toBe("20:53")
		})
	})
})
