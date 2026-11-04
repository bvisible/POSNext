//// Neoffice — added file (no upstream equivalent). The list of the recipes of a restaurant (NeoResto, « Nora au restaurant », lot R3): the status of each one, and
//// the way in to the free library, whose fiches become recipes of the restaurant only when someone picks them (board 5 of the plan, note 29).
//// The dialog speaks with the classes of the desk (alert, indicator-pill, form-control) and its colour variables, so that it follows the dark theme.
const API = "pos_next.api.recipes.";
const STYLE_ID = "restaurant-recipe-library-style";

function ensure_style() {
	if (document.getElementById(STYLE_ID)) return;
	const css = `
	.rcp { display: flex; flex-direction: column; gap: 14px; }
	.rcp-eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); }
	.rcp-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.rcp-filters .form-control { flex: 1 1 220px; max-width: 360px; }
	.rcp-chip { border: 1px solid var(--border-color); border-radius: 999px; padding: 6px 13px; font-size: 13.5px; cursor: pointer; background: var(--card-bg); color: var(--text-color); user-select: none; }
	.rcp-chip.on { border-color: var(--text-color); font-weight: 600; background: var(--bg-orange, rgba(245, 93, 26, 0.12)); }
	.rcp-list { border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; background: var(--card-bg); max-height: 46vh; overflow-y: auto; }
	.rcp-row { display: grid; grid-template-columns: 28px minmax(160px, 2fr) minmax(90px, 1fr) 150px; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--border-color); cursor: pointer; }
	.rcp-row:first-child { border-top: 0; }
	.rcp-row.have { opacity: 0.6; cursor: default; }
	.rcp-row.on { background: var(--bg-orange, rgba(245, 93, 26, 0.1)); }
	.rcp-box { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--gray-500, #8d99a6); display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
	.rcp-row.on .rcp-box { background: var(--text-color); border-color: var(--text-color); color: var(--card-bg); }
	.rcp-title { font-weight: 600; font-size: 14.5px; }
	.rcp-meta { font-size: 12.5px; color: var(--text-muted); }
	.rcp-empty { padding: 22px; text-align: center; color: var(--text-muted); }
	.rcp-licences { font-size: 12.5px; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; }
	.rcp .alert { margin: 0; }
	`;
	$("<style>").attr("id", STYLE_ID).text(css).appendTo(document.head);
}

function esc(text) {
	return frappe.utils.escape_html(text == null ? "" : String(text));
}

function open_library(listview) {
	ensure_style();
	frappe.call({
		method: API + "get_library",
		callback: (r) => {
			const library = r.message;
			const fiches = library.recipes;
			const state = {
				q: "",
				vegetarian: false,
				family: "",
				selected: new Set(),
				licences: false,
			};
			const families = [...new Set(fiches.map((f) => f.family).filter(Boolean))].sort();
			const dialog = new frappe.ui.Dialog({
				title: __("Add from the free library"),
				size: "extra-large",
				fields: [{ fieldname: "body", fieldtype: "HTML" }],
			});
			const $body = dialog.fields_dict.body.$wrapper;
			const available = fiches.filter((f) => f.state === "new").length;

			const visible = () => {
				const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
				return fiches.filter((f) => {
					const hay = `${f.title} ${f.family || ""} ${f.subtitle || ""}`.toLowerCase();
					return (
						words.every((w) => hay.includes(w)) &&
						(!state.vegetarian || f.vegetarian) &&
						(!state.family || f.family === state.family)
					);
				});
			};

			const row_html = (f) => {
				const have = f.state !== "new";
				const on = state.selected.has(f.id);
				const meta = [
					f.minutes ? __("{0} min", [f.minutes]) : null,
					f.portions ? __("{0} portions", [f.portions]) : null,
				]
					.filter(Boolean)
					.join(" · ");
				const badge = have
					? `<span class="indicator-pill green">${
							f.state === "present"
								? __("Already in your recipes")
								: __("Name already used")
					  }</span>`
					: `<span class="indicator-pill gray" title="${esc(f.license)}">${__(
							"Public domain"
					  )}</span>`;
				return `<div class="rcp-row ${have ? "have" : ""} ${
					on ? "on" : ""
				}" data-id="${esc(f.id)}">
					<span class="rcp-box">${on ? "✓" : ""}</span>
					<div><div class="rcp-title">${esc(f.title)}</div><div class="rcp-meta">${esc(meta)}${
					f.family ? ` · ${esc(f.family)}` : ""
				}</div></div>
					<span class="rcp-meta">${f.vegetarian ? __("Vegetarian") : ""}</span>
					${badge}
				</div>`;
			};

			const render = () => {
				const shown = visible();
				const chips = [
					`<span class="rcp-chip ${
						state.vegetarian ? "on" : ""
					}" data-chip="vegetarian">${__("Vegetarian")}</span>`,
					`<span class="rcp-chip ${
						state.family ? "" : "on"
					}" data-chip="family" data-family="">${__("All")}</span>`,
					...families.map(
						(fam) =>
							`<span class="rcp-chip ${
								state.family === fam ? "on" : ""
							}" data-chip="family" data-family="${esc(fam)}">${esc(fam)}</span>`
					),
				].join("");
				const picked = state.selected.size;
				const licences = state.licences
					? `<div class="rcp-licences">${shown
							.map(
								(f) =>
									`<div><b>${esc(f.title)}</b> — ${esc(f.author)}, ${esc(
										f.license
									)}</div>`
							)
							.join("")}</div>`
					: "";
				$body.html(`<div class="rcp">
					<div class="rcp-eyebrow">${__("Free library · {0} fiches", [fiches.length])}</div>
					<div class="alert alert-warning">${esc(library.note)} ${__(
					"They arrive in your recipes as « To review », with their source and their licence."
				)}</div>
					<div class="rcp-filters">
						<input type="search" class="form-control rcp-q" placeholder="${__("Search the {0} fiches…", [
							fiches.length,
						])}" value="${esc(state.q)}">
						${chips}
					</div>
					<div class="rcp-list">${
						shown.length
							? shown.map(row_html).join("")
							: `<div class="rcp-empty">${__("No fiche matches.")}</div>`
					}</div>
					<div class="alert alert-info">${
						picked
							? `<b>${
									picked === 1
										? __("One recipe chosen out of {0} available.", [
												available,
										  ])
										: __("{0} recipes chosen out of {1} available.", [
												picked,
												available,
										  ])
							  }</b> `
							: ""
					}${__(
					"Quantities in cups, ounces and quarts stay in the unit of the source, marked « To convert »: Nora does not convert them for you."
				)}</div>
					<div><a href="#" class="rcp-licence-link" style="font-weight:600">${__(
						"See the licence of each fiche"
					)}</a></div>
					${licences}
				</div>`);
				dialog.set_primary_action(
					picked === 1
						? __("Add one recipe")
						: picked
						? __("Add {0} recipes", [picked])
						: __("Add to my recipes"),
					submit
				);
			};

			const submit = () => {
				const ids = [...state.selected];
				if (!ids.length) {
					frappe.msgprint(__("Tick the recipes to add."));
					return;
				}
				frappe.call({
					method: API + "add_from_library",
					args: { ids: ids },
					freeze: true,
					callback: (res) => {
						dialog.hide();
						const added = res.message.added.length;
						const skipped = res.message.skipped.length;
						frappe.show_alert({
							message:
								__("{0} recipes added, to review.", [added]) +
								(skipped ? " " + __("Left as they were: {0}.", [skipped]) : ""),
							indicator: "green",
						});
						listview.refresh();
					},
				});
			};

			$body.on("click", ".rcp-row:not(.have)", function () {
				const id = $(this).data("id");
				state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
				render();
			});
			$body.on("click", ".rcp-chip", function () {
				if ($(this).data("chip") === "vegetarian") state.vegetarian = !state.vegetarian;
				else state.family = $(this).data("family") || "";
				render();
			});
			$body.on("input", ".rcp-q", function () {
				state.q = this.value;
				const caret = this.selectionStart;
				render();
				const input = $body.find(".rcp-q")[0];
				input.focus();
				input.setSelectionRange(caret, caret);
			});
			$body.on("click", ".rcp-licence-link", function (e) {
				e.preventDefault();
				state.licences = !state.licences;
				render();
			});
			dialog.show();
			render();
		},
	});
}

frappe.listview_settings["Restaurant Recipe"] = {
	add_fields: ["status"],
	get_indicator(doc) {
		const tone =
			{ Validated: "green", "To review": "orange", Draft: "gray" }[doc.status] || "gray";
		return [__(doc.status), tone, "status,=," + doc.status];
	},
	onload(listview) {
		if (!frappe.boot.neoresto_active) return;
		// In the menu, and as a button the header keeps at every width (the inner buttons of the desk hide below 1200 px)
		listview.page.add_menu_item(__("Add from the free library"), () => open_library(listview));
		listview.page.set_secondary_action(__("Add from the free library"), () =>
			open_library(listview)
		);
	},
};
