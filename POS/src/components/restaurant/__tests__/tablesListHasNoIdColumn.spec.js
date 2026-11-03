/**
 * //// Neoffice — added file (no upstream equivalent). The « Floor and tables » list of the restaurant's space is the report view of the Restaurant Table
 * //// doctype, and a table is named by a hash (neoffice-maintenance#2163, restaurant film of 02.11.2026): its hash is not shown as an ID column, beside the table's
 * //// own name. The desk script of the list is run as the desk runs it, on a report view that builds its columns as Frappe's does.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

const SCRIPT = path.resolve(
	__dirname,
	"../../../../../pos_next/pos_next/doctype/restaurant_table/restaurant_table_list.js",
)

// The script as the desk loads it: it registers its settings on `frappe.listview_settings`
function listSettings() {
	const frappe = {
		listview_settings: {},
		db: { get_list: () => Promise.resolve([]) },
		utils: { get_link_title: () => "", add_link_title: () => {} },
	}
	new Function("frappe", readFileSync(SCRIPT, "utf8"))(frappe)
	return frappe.listview_settings["Restaurant Table"]
}

// A report view: `setup_columns` builds the columns of the fields, the name first, as Frappe's report view does
function reportView({ drawn = false } = {}) {
	const view = {
		fields: ["name", "table_name", "area", "status"],
		columns: [],
		datatable: drawn ? {} : null,
		refresh: vi.fn(),
		setup_columns: vi.fn(function () {
			this.columns = this.fields.map((id) => ({ id }))
		}),
	}
	return view
}

describe("the report view of the tables", () => {
	it("has no ID column", () => {
		const view = reportView()
		listSettings().onload(view)

		view.setup_columns()

		expect(view.columns.map((column) => column.id)).toEqual(["table_name", "area", "status"])
	})

	it("keeps no ID column when its columns are built again", () => {
		const view = reportView()
		listSettings().onload(view)

		view.setup_columns()
		view.setup_columns()

		expect(view.columns.map((column) => column.id)).not.toContain("name")
	})

	it("draws again without the ID when the columns were already drawn with it", () => {
		const view = reportView({ drawn: true })
		view.columns = view.fields.map((id) => ({ id }))

		listSettings().onload(view)

		expect(view.columns.map((column) => column.id)).toEqual(["table_name", "area", "status"])
		expect(view.refresh).toHaveBeenCalled()
	})

	it("leaves the list view alone: it hides the name column by itself", () => {
		const view = { refresh: vi.fn() }

		expect(() => listSettings().onload(view)).not.toThrow()
		expect(listSettings().hide_name_column).toBe(true)
	})
})
