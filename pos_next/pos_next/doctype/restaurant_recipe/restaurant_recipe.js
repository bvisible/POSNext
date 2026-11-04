//// Neoffice — added file (no upstream equivalent). The desk form of a recipe (NeoResto, « Nora au restaurant », lot R3): the portions changed without touching the
//// recipe, the ingredients linked to the articles the restaurant buys (board 6 of the plan, note 29), and the approval. The rules live on the server
//// (pos_next/restaurant/recipes.py); this form only asks and shows. The dialogs use the classes of the desk and its colour variables, so that they follow the dark theme.
const API = "pos_next.api.recipes.";
const STYLE_ID = "restaurant-recipe-link-style";

function ensure_style() {
	if (document.getElementById(STYLE_ID)) return;
	const css = `
	.rcl { display: flex; flex-direction: column; gap: 14px; }
	.rcl-eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-muted); }
	.rcl-progress { display: flex; align-items: center; gap: 14px; font-weight: 600; }
	.rcl-progress .progress { flex: 1; max-width: 260px; height: 6px; margin: 0; }
	.rcl-table { border: 1px solid var(--border-color); border-radius: 12px; background: var(--card-bg); max-height: 46vh; overflow-y: auto; }
	.rcl-row { display: grid; grid-template-columns: minmax(190px, 1.2fr) minmax(220px, 1.6fr) 190px; gap: 16px; align-items: start; padding: 12px 16px; border-top: 1px solid var(--border-color); }
	.rcl-row.head { border-top: 0; background: var(--control-bg); font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); align-items: center; padding-top: 10px; padding-bottom: 10px; }
	.rcl-name { font-weight: 600; font-size: 14.5px; }
	.rcl-qty { font-size: 13px; color: var(--text-muted); }
	.rcl-convert { margin-top: 6px; font-size: 12.5px; line-height: 1.4; color: var(--text-on-orange, #a16207); }
	.rcl-convert .form-control { display: inline-block; width: 90px; height: 28px; margin: 6px 6px 0 0; }
	.rcl-state { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; }
	.rcl .alert { margin: 0; }
	.rcl .link-field { margin: 0; }
	`;
	$("<style>").attr("id", STYLE_ID).text(css).appendTo(document.head);
}

function esc(text) {
	return frappe.utils.escape_html(text == null ? "" : String(text));
}

function chip(text, tone) {
	return `<span class="indicator-pill ${tone} ml-1">${esc(text)}</span>`;
}

function ingredient_line(row) {
	const quantity = row.qty ? `${row.qty} ${esc(row.unit || "")}` : "";
	const flags = [];
	if (row.without_quantity) flags.push(chip(__("Without quantity"), "gray"));
	if (row.to_complete) flags.push(chip(__("To complete"), "orange"));
	if (row.to_convert) flags.push(chip(__("To convert"), "orange"));
	if (row.item_name) flags.push(chip(row.item_name, "blue"));
	return `<tr><td>${esc(
		row.name
	)}</td><td class="text-right">${quantity.trim()}</td><td>${flags.join("")}</td></tr>`;
}

function show_portions(frm) {
	const dialog = new frappe.ui.Dialog({
		title: __("Quantities for another number of portions"),
		fields: [
			{
				fieldname: "portions",
				fieldtype: "Int",
				label: __("Portions"),
				default: frm.doc.base_portions,
				reqd: 1,
			},
			{ fieldname: "sheet", fieldtype: "HTML" },
		],
	});
	let latest = 0;
	const draw = () => {
		const portions = dialog.get_value("portions");
		if (!portions || portions < 1) return;
		const mine = ++latest;
		frappe.call({
			method: API + "get_recipe",
			args: { name: frm.doc.name, portions: portions },
			callback: (r) => {
				if (mine !== latest) return;
				const sheet = r.message;
				const rows = sheet.ingredients.map(ingredient_line).join("");
				const note = sheet.note
					? `<p class="text-muted small">${esc(sheet.note)}</p>`
					: "";
				dialog.fields_dict.sheet.$wrapper.html(
					`<table class="table table-sm"><tbody>${rows}</tbody></table>${note}`
				);
			},
		});
	};
	dialog.fields_dict.portions.$input.on("change input", draw);
	dialog.show();
	draw();
}

// What a unit of a source that is not metric is to be converted into: said to the owner, who gives the figure
function conversion_target(unit) {
	const text = (unit || "").toLowerCase();
	if (/oz|lb|pound|ounce/.test(text)) return __("kilos or grams");
	if (/cup|quart|pint|gallon|tbsp|tsp|stick/.test(text)) return __("litres or decilitres");
	return __("the unit of the article");
}

function link_ingredients(frm) {
	ensure_style();
	frappe.call({
		method: API + "get_link_suggestions",
		args: { recipe: frm.doc.name },
		callback: (r) => {
			const data = r.message;
			const rows = data.ingredients.filter((row) => !row.without_quantity);
			const without = data.ingredients
				.filter((row) => row.without_quantity)
				.map((row) => row.name);
			if (!rows.length) {
				frappe.msgprint(__("There is no ingredient to link."));
				return;
			}
			const entries = rows.map((row) => ({
				row,
				initial: row.item || null,
				suggested: !row.item && row.suggestions.length ? row.suggestions[0].item : null,
				confirmed: false,
				control: null,
			}));
			const dialog = new frappe.ui.Dialog({
				title: __("Link the ingredients to articles"),
				size: "extra-large",
				fields: [{ fieldname: "body", fieldtype: "HTML" }],
				primary_action_label: __("Save the links"),
				primary_action: () => save(),
				secondary_action_label: __("Later"),
				secondary_action: () => dialog.hide(),
			});
			const $body = dialog.fields_dict.body.$wrapper;

			const value_of = (e) =>
				e.control ? e.control.get_value() || null : e.initial || e.suggested;
			// Linked: the article it was, or one the person chose or confirmed; a suggestion alone is not a link
			const is_linked = (e) => {
				const value = value_of(e);
				return !!value && (value === e.initial || e.confirmed || value !== e.suggested);
			};
			const state_of = (e) => {
				const value = value_of(e);
				if (value && value === e.initial) return { text: __("Linked"), tone: "green" };
				if (is_linked(e)) return { text: __("To save"), tone: "blue" };
				if (value && value === e.suggested)
					return { text: __("Suggested"), tone: "blue", confirm: true };
				return { text: __("To link"), tone: "orange", create: true };
			};

			const progress = () => {
				const done = entries.filter(is_linked).length;
				$body
					.find(".rcl-progress-text")
					.text(__("{0} of {1} linked", [done, entries.length]));
				$body
					.find(".rcl-progress .progress-bar")
					.css("width", `${Math.round((100 * done) / entries.length)}%`);
			};

			const refresh_states = () => {
				entries.forEach((e, i) => {
					const state = state_of(e);
					const $cell = $body.find(`.rcl-state[data-i="${i}"]`);
					const action = state.confirm
						? `<button type="button" class="btn btn-default btn-xs rcl-confirm" data-i="${i}">${__(
								"Confirm this link"
						  )}</button>`
						: state.create
						? `<a class="btn btn-default btn-xs" target="_blank" href="/app/item/new?item_name=${encodeURIComponent(
								e.row.name
						  )}">${__("Create the article «{0}»", [esc(e.row.name)])}</a>`
						: "";
					$cell.html(
						`<span class="indicator-pill ${state.tone}">${esc(
							state.text
						)}</span>${action}`
					);
				});
				progress();
			};

			const intro = __(
				"An article is what you buy: « Leek », « Cream 35 % ». This link will later tell what has to be bought for a dish. The quantities of the recipe are those of the source: {0} portions.",
				[frm.doc.base_portions]
			);
			const row_html = (e, i) => {
				const row = e.row;
				const qty = row.qty ? `${row.qty} ${esc(row.unit || "")}` : "";
				const convert = row.to_convert
					? `<div class="rcl-convert">${__(
							"To convert into {0}: Nora asks you for the value, she does not guess it.",
							[conversion_target(row.unit)]
					  )}<br>
						<input type="number" step="any" min="0" class="form-control rcl-qty-in" data-i="${i}" placeholder="${__(
							"Quantity"
					  )}">
						<input type="text" class="form-control rcl-unit-in" data-i="${i}" placeholder="${__("Unit")}">
						<span>${__("as the article is bought")}</span></div>`
					: "";
				return `<div class="rcl-row">
					<div><div class="rcl-name">${esc(row.name)}</div><div class="rcl-qty">${qty}</div>${convert}</div>
					<div class="rcl-article" data-i="${i}"></div>
					<div class="rcl-state" data-i="${i}"></div>
				</div>`;
			};
			$body.html(`<div class="rcl">
				<div class="rcl-eyebrow">${esc(frm.doc.recipe_name)} · ${__("{0} ingredients", [data.total])}</div>
				<p class="text-muted" style="margin:0">${esc(intro)}</p>
				<div class="rcl-progress"><span class="rcl-progress-text"></span><div class="progress"><div class="progress-bar" style="background: var(--text-color)"></div></div></div>
				<div class="rcl-table">
					<div class="rcl-row head"><span>${__("Ingredient of the recipe")}</span><span>${__(
				"Article you buy"
			)}</span><span>${__("Link")}</span></div>
					${entries.map(row_html).join("")}
				</div>
				${
					without.length
						? `<div class="alert alert-info">${__(
								"Without quantity, kept in the recipe without an article: {0}.",
								[esc(without.join(", "))]
						  )}</div>`
						: ""
				}
			</div>`);

			entries.forEach((e, i) => {
				e.control = frappe.ui.form.make_control({
					df: {
						fieldtype: "Link",
						options: "Item",
						fieldname: `article_${i}`,
						placeholder: __("Choose the article"),
						get_query: () => ({ filters: { disabled: 0 } }),
						change: () => refresh_states(),
					},
					parent: $body.find(`.rcl-article[data-i="${i}"]`),
					only_input: true,
					render_input: true,
				});
				const start = e.initial || e.suggested;
				if (start) e.control.set_value(start);
			});
			$body.on("click", ".rcl-confirm", function () {
				entries[$(this).data("i")].confirmed = true;
				refresh_states();
			});
			setTimeout(refresh_states, 0);

			function save() {
				const links = [];
				for (let i = 0; i < entries.length; i++) {
					const e = entries[i];
					const value = value_of(e);
					const changed = value !== e.initial;
					if (!changed) continue;
					if (!value) {
						links.push({ idx: e.row.idx, item: null });
						continue;
					}
					if (!is_linked(e)) continue;
					const link = { idx: e.row.idx, item: value };
					if (e.row.to_convert) {
						const qty = parseFloat($body.find(`.rcl-qty-in[data-i="${i}"]`).val());
						const unit = (
							$body.find(`.rcl-unit-in[data-i="${i}"]`).val() || ""
						).trim();
						if (!qty || qty <= 0 || !unit) {
							frappe.msgprint(
								__(
									"«{0}» is written in {1}: give its quantity and its unit as the article is bought.",
									[e.row.name, e.row.unit]
								)
							);
							return;
						}
						link.qty = qty;
						link.unit = unit;
					}
					links.push(link);
				}
				if (!links.length) {
					dialog.hide();
					return;
				}
				frappe.call({
					method: API + "set_ingredient_links",
					args: { recipe: frm.doc.name, links: links },
					freeze: true,
					callback: () => {
						dialog.hide();
						frm.reload_doc();
					},
				});
			}
			dialog.show();
		},
	});
}

frappe.ui.form.on("Restaurant Recipe", {
	refresh(frm) {
		if (frm.is_new()) return;
		frm.add_custom_button(__("Change the portions"), () => show_portions(frm));
		frm.add_custom_button(__("Link the ingredients to articles"), () => link_ingredients(frm));
		if (frm.doc.status !== "Validated") {
			frm.add_custom_button(__("Mark as validated"), () => {
				frm.set_value("status", "Validated");
				frm.save();
			});
		}
		if (frm.doc.status === "To review") {
			frm.dashboard.set_headline(
				__(
					"Nobody has read this recipe yet. Check the quantities and the steps, then mark it as validated."
				)
			);
		}
	},
});
