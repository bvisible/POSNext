/**
 * //// Neoffice — added file (no upstream equivalent). The office's page of a till's settings opens on the tills its user may set and offers
 * //// what he may do, nothing more (neoffice-maintenance#3283). Seen on screen (24.11): an account holding only « POSNext Manager », or only
 * //// « Restaurant Manager », opened the page with no till named and saw « New till » and « Save » with nothing else: the page asked
 * //// Frappe's own list of POS Profiles, which refuses both (neither holds a rule on POS Profile, and neither needs one). It now asks its
 * //// own server method (pos_next.till_settings.api.get_desk_tills, whose rights the Python suite plays with one-role accounts), and its
 * //// header shows « New till » only when the server says the user may make one, « Save » only while a setting is his to change, and the
 * //// ERP's forms only to whoever may read them. Seen again on 25.11: both managers were offered « Delete this till » and refused;
 * //// it is shown once the server said the user may delete the till.
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const PAGE = fileURLToPath(
	new URL(
		"../../../../../pos_next/pos_next/page/till_settings/till_settings.js",
		import.meta.url
	)
);
const API = "pos_next.till_settings.api.";

// An element of the desk, as much of jQuery as the page's opening uses: what it was given to show, and whether it is shown
function element() {
	const el = { markup: "", shown: true };
	el.appendTo = () => el;
	el.on = () => el;
	el.html = (markup) => {
		el.markup = markup;
		return el;
	};
	el.find = () => element();
	el.closest = () => el;
	el.toggle = (shown) => {
		el.shown = Boolean(shown);
		return el;
	};
	return el;
}

const SETTINGS = {
	pos_profile: "Bar",
	can: { till: false, restaurant: true, create: false, delete: false },
	tabs: [{ key: "restaurant", label: "Restaurant", section: "restaurant" }],
	groups: [],
	settings: [{ key: "enable_takeaway", widget: "check", store: "document", editable: true }],
	values: { enable_takeaway: 0 },
};

/** The page made for a user whose server answers `tills`, who may read the doctypes `readable`; not shown yet. */
function mount({ tills = [], create = false, readable = [], settings = SETTINGS } = {}) {
	let route = ["till-settings"];
	const menu = [];
	const items = {};
	const page = {
		main: element(),
		btn_primary: element(),
		btn_secondary: element(),
		set_primary_action() {},
		set_secondary_action() {},
		add_menu_item: (label) => {
			menu.push(label);
			items[label] = element();
			return items[label];
		},
	};
	const answers = {
		get_desk_tills: () => ({ tills, can: { create } }),
		get_desk_settings: () => settings,
	};
	const frappe = {
		pages: { "till-settings": {} },
		ui: { make_app_page: () => page },
		model: { can_read: (doctype) => readable.includes(doctype) },
		call: vi.fn(({ method }) =>
			Promise.resolve({ message: answers[method.replace(API, "")]() })
		),
		// Frappe's own list of POS Profiles refuses a till manager and a restaurant's manager
		db: { get_list: vi.fn(() => Promise.reject(new Error("Not permitted"))) },
		get_route: () => route,
		set_route: (...parts) => {
			route = parts;
		},
		route_options: null,
		utils: { escape_html: (text) => text, debounce: (fn) => fn },
	};
	const window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
	new Function("frappe", "__", "$", "window", "document", readFileSync(PAGE, "utf8"))(
		frappe,
		(text) => text,
		() => element(),
		window,
		{ getElementById: () => null, head: element() }
	);
	const wrapper = {};
	frappe.pages["till-settings"].on_page_load(wrapper);
	const shown = wrapper.till_settings;
	// The settings themselves are drawn with the desk's controls: not here
	shown.render = vi.fn();
	return { frappe, page, menu, items, shown };
}

/** The page shown, as the desk shows it when its address names no till. */
async function open(options) {
	const mounted = mount(options);
	await mounted.shown.show();
	return mounted;
}

describe("the office's page of a till, opened with no till named", () => {
	it("asks its own server method for the tills, never Frappe's list of POS Profiles, and opens the first", async () => {
		const { frappe, shown } = await open({ tills: [{ name: "Bar" }, { name: "Shop" }] });

		expect(frappe.db.get_list).not.toHaveBeenCalled();
		expect(frappe.call).toHaveBeenCalledWith({ method: API + "get_desk_tills" });
		expect(frappe.call).toHaveBeenCalledWith({
			method: API + "get_desk_settings",
			args: { pos_profile: "Bar" },
		});
		expect(shown.render).toHaveBeenCalled();
	});

	it("offers neither New till nor Save before the server said what the user may do", () => {
		const { page } = mount({ tills: [{ name: "Bar" }], create: true });

		expect(page.btn_primary.shown).toBe(false);
		expect(page.btn_secondary.shown).toBe(false);
	});

	it("offers Save for what is his to change, and no New till to whoever may make none", async () => {
		const { page } = await open({ tills: [{ name: "Bar" }] });

		expect(page.btn_primary.shown).toBe(true);
		expect(page.btn_secondary.shown).toBe(false);
	});

	it("offers New till to whoever may make one", async () => {
		const settings = { ...SETTINGS, can: { ...SETTINGS.can, till: true, create: true } };
		const { page } = await open({ tills: [{ name: "Bar" }], create: true, settings });

		expect(page.btn_secondary.shown).toBe(true);
	});

	it("with no till of his, says so, and offers neither New till nor Save to whoever may make none", async () => {
		const { page, shown } = await open({ tills: [] });

		expect(shown.$root.markup).toContain("There is no till yet.");
		expect(shown.$root.markup).not.toContain("data-new-till");
		expect(page.btn_primary.shown).toBe(false);
		expect(page.btn_secondary.shown).toBe(false);
	});

	it("with no till at all, offers the first one to whoever may make it", async () => {
		const { page, shown } = await open({ tills: [], create: true });

		expect(shown.$root.markup).toContain("data-new-till");
		expect(page.btn_secondary.shown).toBe(true);
	});

	it("offers Delete this till only once the server said the user may delete it", async () => {
		const before = mount({ tills: [{ name: "Bar" }] });
		expect(before.items["Delete this till"].shown).toBe(false);

		const refused = await open({ tills: [{ name: "Bar" }] });
		expect(refused.items["Delete this till"].shown).toBe(false);

		const settings = { ...SETTINGS, can: { ...SETTINGS.can, till: true, delete: true } };
		const allowed = await open({ tills: [{ name: "Bar" }], settings });
		expect(allowed.items["Delete this till"].shown).toBe(true);
	});

	it("offers the ERP's forms of a till only to whoever may read them", () => {
		const none = mount();
		expect(none.menu).not.toContain("Open the POS Profile form");
		expect(none.menu).not.toContain("Open the POS Settings form");

		const both = mount({ readable: ["POS Profile", "POS Settings"] });
		expect(both.menu).toContain("Open the POS Profile form");
		expect(both.menu).toContain("Open the POS Settings form");
	});
});
