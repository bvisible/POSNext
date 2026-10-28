import { afterAll, describe, expect, it } from "vitest"
import {
	DEFAULT_LOCALE,
	formatCurrency,
	formatCurrencyNumber,
	formatDate,
	formatDateTime,
	formatTime,
	getCurrencySymbol,
	//// Neoffice — initPrecision: the digits of an amount follow the site's number format now.
	initPrecision,
	setLocale,
} from "../currency"
import { useFormatters } from "../../composables/useFormatters"

const NO_ARABIC_DIGITS = /^[^\u0660-\u0669\u06F0-\u06F9]*$/

describe("locale formatting", () => {
	afterAll(() => setLocale("en"))

	it("follows the user's language and keeps en-US as the fallback", () => {
		setLocale(null)
		expect(DEFAULT_LOCALE).toBe("en-US")
		setLocale("ar")
		expect(DEFAULT_LOCALE).toBe("ar-EG-u-nu-latn")
		setLocale("pt-br")
		expect(DEFAULT_LOCALE).toBe("pt-BR-u-nu-latn")
	})

	it("formats Arabic dates with month names and Latin digits", () => {
		setLocale("ar")
		expect(formatDate("2026-11-05")).toBe("5 نوفمبر 2026")
		//// Neoffice — the till writes a 24-hour clock, like the desk (product owner, 2026-10-28; timeFormat24Hour.spec.js):
		//// upstream expected AM/PM here ("9:15 م").
		expect(formatTime("2026-11-05 21:15:00")).toBe("21:15")
		expect(formatTime("09:05:33.123")).toBe("09:05")
		expect(formatDateTime("2026-11-05 21:15:00")).toBe("5 نوفمبر 2026، 21:15")
		expect(formatDateTime("2026-11-05 21:15:00")).toMatch(NO_ARABIC_DIGITS)
	})

	it("formats English dates unambiguously", () => {
		setLocale("en")
		expect(formatDate("2026-11-05")).toBe("Nov 5, 2026")
		//// Neoffice — 24-hour clock, like the desk (see the Arabic case above); upstream expected "9:15 PM".
		expect(formatTime("21:15")).toBe("21:15")
		expect(formatDateTime(new Date(2026, 10, 5, 21, 15))).toBe("Nov 5, 2026, 21:15")
		expect(formatDate("")).toBe("")
		expect(formatDate("not a date")).toBe("")
	})

	it("shows ج.م after the amount in Arabic and E£ before it otherwise", () => {
		//// Neoffice — amounts are written in the SITE's number format (System Settings), not the user's
		//// language (product owner, 2026-10-28; siteNumberFormat.spec.js): this case is about where the
		//// symbol goes, so it sets a "#,###.##" site; ours falls back to "#'###.##" without one.
		initPrecision({ currency: 2, number_format: "#,###.##" })
		setLocale("ar")
		expect(getCurrencySymbol("EGP")).toBe("ج.م")
		expect(formatCurrency(1234.5, "EGP")).toBe("1,234.50 ج.م")
		expect(formatCurrency(-5, "EGP")).toBe("\u2066-5.00\u2069 ج.م")
		expect(formatCurrencyNumber(1234.5)).toBe("1,234.50")
		expect(formatCurrency(1234.5, "EGP")).toMatch(NO_ARABIC_DIGITS)
		setLocale("en")
		expect(getCurrencySymbol("EGP")).toBe("E£")
		expect(formatCurrency(1234.5, "EGP")).toBe("E£ 1,234.50")
		//// Neoffice — negatives are written like the desk (frappe format_currency): symbol, then the
		//// minus sign (product owner, 2026-10-28); upstream wrote "-E£ 5.00".
		expect(formatCurrency(-5, "EGP")).toBe("E£ -5.00")
	})

	it("routes useFormatters dates through the same helpers", () => {
		setLocale("ar")
		const f = useFormatters()
		expect(f.formatDate("2026-11-05")).toBe("5 نوفمبر 2026")
		//// Neoffice — 24-hour clock, like the desk (see the Arabic case above); upstream expected AM/PM.
		expect(f.formatTime("15:31:22.975239")).toBe("15:31")
		expect(f.formatDateTime("2026-11-05 21:15:00")).toBe("5 نوفمبر 2026، 21:15")
	})
})
