/**
 * //// Neoffice — added file (no upstream equivalent). The return dialog shows `tax_per_unit` (the VAT of ONE unit, like
 * //// discount_per_unit and the `@ price/uom` beside it) in a pill under the total of the line: a line of 2 units read
 * //// "incl. 1.09 tax" next to a total whose VAT is 2.17 (neoffice-maintenance#2085). The pills say "per unit", in the
 * //// desktop block and in the mobile block (a separate template). Read from the source: the dialog does not mount under
 * //// vitest (frappe-ui), and the label is what is under test.
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../..") + "/"
const source = readFileSync(SRC + "components/sale/ReturnInvoiceDialog.vue", "utf8")

// Every place the template prints the tax of one unit
const PILLS = [...source.matchAll(/formatCurrency\(\s*item\.tax_per_unit\s*\)/g)]

describe("the tax pills of the return dialog", () => {
	it("print the tax of one unit in the desktop block and in the mobile block (two pills each)", () => {
		expect(PILLS).toHaveLength(4)
	})

	it("say that the tax is per unit, never a bare 'incl. {0} tax' read as the tax of the line", () => {
		expect(source).not.toMatch(/__\(\s*["']incl\. \{0\} tax["']/)
		expect(source.match(/__\(\s*["']incl\. \{0\} tax per unit["']/g)).toHaveLength(2)
	})

	it("do not print the bare amount of the exclusive pill either", () => {
		expect(source).not.toMatch(/>\+\{\{\s*formatCurrency\(\s*item\.tax_per_unit\s*\)\s*\}\}/)
		expect(source.match(/__\(\s*["']\+\{0\} tax per unit["']/g)).toHaveLength(2)
	})

	it("every pill is built from one of the 'per unit' msgids", () => {
		for (const pill of PILLS) {
			const before = source.slice(Math.max(0, pill.index - 80), pill.index)
			expect(before).toMatch(/tax per unit["']\s*,\s*\[\s*$/)
		}
	})
})
