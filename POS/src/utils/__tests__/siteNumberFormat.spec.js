/**
 * //// Neoffice — added file (no upstream equivalent). Amounts on the till are written the way the
 * //// SITE writes them (System Settings › Number Format, like the desk: CHF 1'234.50 on a Swiss
 * //// site), never in the user's language nor the device's. Product owner's decision, 2026-10-28,
 * //// after upstream develop moved currency.js to Intl with the user's language.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

// The user's language is French: before this change a French user saw "1 234,50"
vi.hoisted(() => {
	globalThis.frappe = { boot: { lang: "fr" } }
})

const {
	DEFAULT_LOCALE,
	SWISS_NUMBER_FORMAT,
	formatCurrency,
	formatCurrencyNumber,
	initPrecision,
	roundCurrency,
	setLocale,
} = await import("../currency")
const { useFormatters } = await import("../../composables/useFormatters")

const SWISS_SITE = { currency: 2, float: 3, number_format: "#'###.##" }

describe("amounts follow the site's number format", () => {
	afterEach(() => {
		delete globalThis.frappe.boot.sysdefaults
		initPrecision(SWISS_SITE)
		setLocale("fr")
	})

	it("writes #'###.## amounts as CHF 1'234.50", () => {
		initPrecision(SWISS_SITE)
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
		expect(formatCurrencyNumber(1234.5)).toBe("1'234.50")
		expect(useFormatters().formatCurrency(1234.5)).toBe("1'234.50")
	})

	it("handles negative amounts (like the desk: symbol, then the minus sign), zero and large numbers", () => {
		initPrecision(SWISS_SITE)
		expect(formatCurrency(-1234.5, "CHF")).toBe("CHF -1'234.50")
		expect(formatCurrencyNumber(-1234.5)).toBe("-1'234.50")
		expect(formatCurrency(0, "CHF")).toBe("CHF 0.00")
		expect(formatCurrency(-0.001, "CHF")).toBe("CHF 0.00")
		expect(formatCurrency(1234567.89, "CHF")).toBe("CHF 1'234'567.89")
		expect(formatCurrencyNumber(1234567.891)).toBe("1'234'567.89")
		expect(formatCurrency(999.995, "CHF")).toBe("CHF 1'000.00")
	})

	it("rounds with the site's method, so the till shows what roundCurrency stores", () => {
		initPrecision({ ...SWISS_SITE, rounding_method: "Commercial Rounding" })
		expect(roundCurrency(2.675)).toBe(2.68)
		expect(formatCurrency(2.675, "CHF")).toBe("CHF 2.68") // toFixed alone gives 2.67
		expect(formatCurrencyNumber(2.675)).toBe("2.68")
		initPrecision({ ...SWISS_SITE, rounding_method: "Banker's Rounding" })
		expect(roundCurrency(0.125)).toBe(0.12)
		expect(formatCurrency(0.125, "CHF")).toBe("CHF 0.12") // toFixed alone gives 0.13
		expect(formatCurrency(2.675, "CHF")).toBe(`CHF ${roundCurrency(2.675).toFixed(2)}`)
	})

	it("is not changed by the user's language (frappe.boot.lang = fr, then de, en)", () => {
		initPrecision(SWISS_SITE)
		expect(DEFAULT_LOCALE.startsWith("fr")).toBe(true)
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
		setLocale("de")
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
		setLocale("en")
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
	})

	it("falls back to the Swiss pattern when the bootstrap carries no format", () => {
		initPrecision({ currency: 2 })
		expect(SWISS_NUMBER_FORMAT).toBe("#'###.##")
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
		initPrecision({ currency: 2, number_format: "no such format" })
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1'234.50")
	})

	it("reads a Desk boot's sysdefaults when the bootstrap has none", () => {
		globalThis.frappe.boot.sysdefaults = { number_format: "#.###,##" }
		initPrecision({ currency: 2 })
		expect(formatCurrency(1234.5, "EUR")).toBe("€ 1.234,50")
	})

	it("is the site that decides, for any other Frappe format", () => {
		initPrecision({ currency: 2, number_format: "#,###.##" })
		expect(formatCurrency(1234.5, "CHF")).toBe("CHF 1,234.50")
		initPrecision({ currency: 2, number_format: "# ###,##" })
		expect(formatCurrencyNumber(1234.5)).toBe("1 234,50")
		initPrecision({ currency: 2, number_format: "#,##,###.##" })
		expect(formatCurrencyNumber(12345678.9)).toBe("1,23,45,678.90")
	})
})
