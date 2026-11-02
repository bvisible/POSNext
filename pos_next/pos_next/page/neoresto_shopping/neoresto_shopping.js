// //// Neoffice — added file (no upstream equivalent). The shopping list page of NeoResto (purchases, lot B; study: Obsidian
// //// `Neoffice/NeoResto/14-…` and `18-…`, mock-up plate 2). What the restaurant is going to buy, grouped by supplier, with an
// //// estimate that says on how many lines it rests. Nothing is stored here: every call goes to pos_next.api.shopping.
(function () {
	"use strict";

	var API = "pos_next.api.shopping.";
	var SUPPLIES = "pos_next.api.supplies.";
	var STYLE_ID = "neoresto-shopping-style";
	var CSS =
		".nps{display:flex;flex-direction:column;gap:14px;padding:6px 0 24px}" +
		".nps-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}" +
		".nps-bar select{min-height:40px;border:1px solid #DCD4C7;border-radius:10px;background:#fff;padding:0 10px}" +
		".nps-btn{min-height:40px;padding:0 16px;border-radius:10px;border:1px solid #141414;background:#fff;color:#141414;font-weight:600;cursor:pointer}" +
		".nps-btn.ink{background:#141414;color:#fff}" +
		".nps-head{display:flex;flex-wrap:wrap;gap:18px;align-items:baseline;padding:14px 18px;border:1px solid #DCD4C7;border-radius:14px;background:#FDFBF7}" +
		".nps-head .big{font-size:26px;font-variant-numeric:tabular-nums}" +
		".nps-head .sub{color:#6F665A;font-size:13.5px}" +
		".nps-card{border:1px solid #DCD4C7;border-radius:16px;background:#fff;overflow:hidden}" +
		".nps-card>header{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 16px;background:#F6F3ED}" +
		".nps-card h3{margin:0;font-size:17px}" +
		".nps-mode{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:1px 10px;background:#fff;border:1px solid #DCD4C7;margin-left:8px}" +
		".nps-line{display:grid;grid-template-columns:minmax(160px,2fr) minmax(130px,1.2fr) 130px 120px 150px 150px;gap:10px;align-items:center;padding:10px 16px;border-top:1px solid #F6F3ED}" +
		".nps-line .label{font-weight:600}" +
		".nps-line .sub{display:block;font-size:12.5px;color:#6F665A;font-weight:400}" +
		".nps-line.aside .label{text-decoration:line-through;color:#6F665A}" +
		".nps-step{display:inline-flex;align-items:center;border:1px solid #DCD4C7;border-radius:10px;height:36px}" +
		".nps-step button{width:34px;height:34px;border:0;background:transparent;font-size:17px;cursor:pointer}" +
		".nps-step span{min-width:28px;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}" +
		".nps-pill{display:inline-block;font-size:12px;font-weight:600;border-radius:999px;padding:2px 10px;background:#F2F1ED}" +
		".nps-pill.done{background:#E9F7EE;color:#11663A}" +
		".nps-pill.aside{background:#ECE7DE;color:#524B41}" +
		".nps-pill.lost{background:#FFEAE2;color:#AA3700}" +
		".nps-price{text-align:right;font-variant-numeric:tabular-nums}" +
		".nps-empty{padding:28px 16px;text-align:center;color:#6F665A}";

	var DONE = ["Bought", "Ordered"];
	var ASIDE = ["Not needed", "Already in stock"];

	function esc(value) {
		return frappe.utils.escape_html(
			value === null || value === undefined ? "" : String(value)
		);
	}

	function money(value) {
		var currency =
			(frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.currency) || "CHF";
		return format_currency(value, currency);
	}

	function stateLabel(state) {
		return (
			{
				"To order": __("To order"),
				Ordered: __("Ordered"),
				"To buy": __("To buy"),
				Bought: __("Bought"),
				"Not needed": __("Not needed"),
				"Already in stock": __("Already in stock"),
				"Not found": __("Not found"),
			}[state] || state
		);
	}

	function modeLabel(mode) {
		return (
			{ Email: __("By e-mail"), Phone: __("By phone"), "On site": __("On site") }[mode] ||
			mode
		);
	}

	function NeorestoShopping(page) {
		this.page = page;
		this.list = null;
		this.view = null;
		this.lists = [];
		this.make();
	}

	NeorestoShopping.prototype.make = function () {
		var self = this;
		if (!document.getElementById(STYLE_ID)) {
			$('<style id="' + STYLE_ID + '">' + CSS + "</style>").appendTo(document.head);
		}
		this.page.set_primary_action(__("Add an article"), function () {
			self.add_article();
		});
		this.page.add_inner_button(__("Add a free line"), function () {
			self.add_free();
		});
		this.page.add_inner_button(__("Add a dish"), function () {
			self.add_dish();
		});
		this.page.add_inner_button(__("Stores round"), function () {
			self.stores_round();
		});
		this.$root = $('<div class="nps"></div>').appendTo(this.page.main);
		this.$root.on("change", ".nps-list", function () {
			self.list = $(this).val() || null;
			self.refresh();
		});
		this.$root.on("click", "[data-new-list]", function () {
			frappe.call({ method: API + "new_list", freeze: true }).then(function (r) {
				self.list = r.message;
				return self.load_lists().then(function () {
					return self.refresh();
				});
			});
		});
		this.$root.on("click", "[data-act]", function () {
			self.act($(this).attr("data-act"), $(this).attr("data-row"), $(this).attr("data-arg"));
		});
		this.$root.on("change", ".nps-more", function () {
			var value = $(this).val();
			var row = $(this).attr("data-row");
			$(this).val("");
			if (value) self.act(value, row);
		});
		this.render();
	};

	NeorestoShopping.prototype.load_lists = function () {
		var self = this;
		return frappe.db
			.get_list("Restaurant Shopping List", {
				fields: ["name", "list_date", "status"],
				filters: { status: ["!=", "Done"] },
				order_by: "list_date desc, creation desc",
				limit: 30,
			})
			.then(function (rows) {
				self.lists = rows || [];
				if (!self.list && self.lists.length) self.list = self.lists[0].name;
			});
	};

	NeorestoShopping.prototype.refresh = function () {
		var self = this;
		if (!this.list) {
			this.view = null;
			return $.Deferred()
				.resolve()
				.promise()
				.then(function () {
					self.render();
				});
		}
		return frappe
			.call({ method: API + "get_list", args: { list_name: this.list } })
			.then(function (r) {
				self.view = r.message;
				self.render();
			});
	};

	NeorestoShopping.prototype.act = function (what, row, arg) {
		var self = this;
		var args = { list_name: this.list, row_name: row };
		var call = function (method, extra) {
			return frappe
				.call({
					method: API + method,
					args: Object.assign(args, extra || {}),
					freeze: true,
				})
				.then(function () {
					return self.refresh();
				});
		};
		if (what === "plus" || what === "minus") {
			var line = this.find(row);
			var qty = Math.max(1, (line ? line.qty : 1) + (what === "plus" ? 1 : -1));
			return call("set_quantity", { qty: qty });
		}
		if (what === "state") return call("set_state", { state: arg });
		if (what === "Not needed" || what === "Already in stock" || what === "Not found")
			return call("set_state", { state: what });
		if (what === "remove") return call("remove_line");
		if (what === "elsewhere") return this.buy_elsewhere(row);
	};

	NeorestoShopping.prototype.find = function (row) {
		var found = null;
		((this.view && this.view.blocks) || []).forEach(function (block) {
			block.lines.forEach(function (line) {
				if (line.name === row) found = line;
			});
		});
		return found;
	};

	NeorestoShopping.prototype.render = function () {
		var self = this;
		var options =
			'<option value="">' +
			esc(this.lists.length ? __("Choose a list") : __("No list yet")) +
			"</option>" +
			this.lists
				.map(function (l) {
					return (
						'<option value="' +
						esc(l.name) +
						'"' +
						(l.name === self.list ? " selected" : "") +
						">" +
						esc(frappe.datetime.str_to_user(l.list_date)) +
						" · " +
						esc(l.name) +
						"</option>"
					);
				})
				.join("");
		var bar =
			'<div class="nps-bar"><select class="nps-list">' +
			options +
			"</select>" +
			'<button type="button" class="nps-btn" data-new-list="1">' +
			esc(__("New list")) +
			"</button></div>";
		var body = "";
		if (!this.view) {
			body =
				'<div class="nps-empty">' +
				esc(__("Start a list, then add what you are going to buy.")) +
				"</div>";
		} else {
			var v = this.view;
			var estimate = v.priced_lines ? money(v.estimated_total) : "—";
			var rest = v.priced_lines
				? __("estimated on {0} of {1} lines", [v.priced_lines, v.counted_lines])
				: __("no price known yet: no estimate");
			var head =
				'<div class="nps-head"><span class="big">' +
				esc(estimate) +
				'</span><span class="sub">' +
				esc(rest) +
				"</span>" +
				'<span class="sub">' +
				esc(frappe.datetime.str_to_user(v.list_date)) +
				" · " +
				esc(v.name) +
				"</span></div>";
			var blocks = v.blocks.length
				? v.blocks.map(this.block_html, this).join("")
				: '<div class="nps-empty">' + esc(__("The list is empty.")) + "</div>";
			body = head + blocks;
		}
		this.$root.html(bar + body);
	};

	NeorestoShopping.prototype.block_html = function (block) {
		var title = block.supplier || __("No supplier yet");
		var mode = block.supplier
			? '<span class="nps-mode">' + esc(modeLabel(block.mode)) + "</span>"
			: "";
		var sub = block.priced
			? money(block.subtotal) +
			  " · " +
			  esc(__("{0} of {1} lines priced", [block.priced, block.counted]))
			: esc(__("{0} lines", [block.counted]));
		var delivery = block.delivery ? " · " + esc(block.delivery) : "";
		return (
			'<section class="nps-card"><header><h3>' +
			esc(title) +
			mode +
			"</h3><span>" +
			sub +
			delivery +
			"</span></header>" +
			block.lines.map(this.line_html, this).join("") +
			"</section>"
		);
	};

	NeorestoShopping.prototype.line_html = function (line) {
		var aside = ASIDE.indexOf(line.state) >= 0;
		var tone =
			DONE.indexOf(line.state) >= 0
				? " done"
				: aside
				? " aside"
				: line.state === "Not found"
				? " lost"
				: "";
		var unit = line.free ? line.unit_text || "" : line.uom || "";
		var price = line.rate ? esc(money(line.rate * line.qty)) : "—";
		var tick =
			line.state === "To order" || line.state === "To buy"
				? '<button type="button" class="nps-btn ink" data-act="state" data-arg="' +
				  (line.state === "To order" ? "Ordered" : "Bought") +
				  '" data-row="' +
				  esc(line.name) +
				  '">' +
				  esc(line.state === "To order" ? __("Mark ordered") : __("Mark bought")) +
				  "</button>"
				: '<span class="nps-pill' + tone + '">' + esc(stateLabel(line.state)) + "</span>";
		var more =
			'<select class="nps-more" data-row="' +
			esc(line.name) +
			'"><option value="">' +
			esc(__("More…")) +
			"</option>" +
			'<option value="Not needed">' +
			esc(__("Not needed")) +
			"</option>" +
			'<option value="Already in stock">' +
			esc(__("Already in stock")) +
			"</option>" +
			'<option value="Not found">' +
			esc(__("Not found")) +
			"</option>" +
			(line.free
				? ""
				: '<option value="elsewhere">' + esc(__("Buy it elsewhere…")) + "</option>") +
			'<option value="remove">' +
			esc(__("Remove from the list")) +
			"</option></select>";
		return (
			'<div class="nps-line' +
			(aside ? " aside" : "") +
			'"><div class="label">' +
			esc(line.label) +
			(line.free ? '<span class="sub">' + esc(__("Free line")) + "</span>" : "") +
			"</div>" +
			"<div>" +
			esc(unit || "—") +
			"</div>" +
			'<div class="nps-step"><button type="button" data-act="minus" data-row="' +
			esc(line.name) +
			'" aria-label="' +
			esc(__("Less")) +
			'">−</button><span>' +
			esc(line.qty) +
			'</span><button type="button" data-act="plus" data-row="' +
			esc(line.name) +
			'" aria-label="' +
			esc(__("More")) +
			'">+</button></div>' +
			'<div class="nps-price">' +
			price +
			"</div><div>" +
			tick +
			"</div><div>" +
			more +
			"</div></div>"
		);
	};

	NeorestoShopping.prototype.ensure_list = function () {
		var self = this;
		if (this.list) return $.Deferred().resolve().promise();
		return frappe.call({ method: API + "new_list", freeze: true }).then(function (r) {
			self.list = r.message;
			return self.load_lists();
		});
	};

	NeorestoShopping.prototype.add_article = function () {
		var self = this;
		var packs = [];
		var d = new frappe.ui.Dialog({
			title: __("Add an article"),
			fields: [
				{
					fieldname: "item",
					fieldtype: "Link",
					options: "Item",
					label: __("Article"),
					reqd: 1,
					get_query: function () {
						return { filters: { is_restaurant_supply: 1, disabled: 0 } };
					},
					change: function () {
						var code = d.get_value("item");
						if (!code) return;
						frappe
							.call({
								method: SUPPLIES + "get_supply_catalogue",
								args: { search: code },
							})
							.then(function (r) {
								var row = ((r.message && r.message.rows) || []).filter(function (
									x
								) {
									return x.item === code;
								})[0];
								packs = row ? row.packs : [];
								var labels = packs.map(function (p, i) {
									return {
										value: String(i),
										label:
											p.supplier +
											" — " +
											(p.uom || "") +
											(p.price !== null && p.price !== undefined
												? " · " + money(p.price)
												: ""),
									};
								});
								d.set_df_property(
									"choice",
									"options",
									labels.length
										? labels
										: [{ value: "", label: __("No packaging yet") }]
								);
								d.set_value("choice", labels.length ? "0" : "");
							});
					},
				},
				{
					fieldname: "qty",
					fieldtype: "Float",
					label: __("Quantity"),
					default: 1,
					reqd: 1,
				},
				{
					fieldname: "choice",
					fieldtype: "Select",
					label: __("Supplier and packaging"),
					options: [],
				},
			],
			primary_action_label: __("Add to the list"),
			primary_action: function (values) {
				var pack =
					values.choice !== "" && values.choice !== undefined
						? packs[Number(values.choice)]
						: null;
				self.ensure_list().then(function () {
					frappe
						.call({
							method: API + "add_article_line",
							args: {
								list_name: self.list,
								item: values.item,
								qty: values.qty,
								supplier: pack ? pack.supplier : null,
								uom: pack ? pack.uom : null,
							},
							freeze: true,
						})
						.then(function () {
							d.hide();
							self.refresh();
						});
				});
			},
		});
		d.show();
	};

	NeorestoShopping.prototype.add_free = function () {
		var self = this;
		var d = new frappe.ui.Dialog({
			title: __("Add a free line"),
			fields: [
				{
					fieldname: "text",
					fieldtype: "Data",
					label: __("What to buy"),
					reqd: 1,
					description: __("Something that is not an article: written as you say it."),
				},
				{
					fieldname: "qty",
					fieldtype: "Float",
					label: __("Quantity"),
					default: 1,
					reqd: 1,
				},
				{
					fieldname: "unit_text",
					fieldtype: "Data",
					label: __("Unit"),
					description: __("Optional: rolls, pieces…"),
				},
				{
					fieldname: "supplier",
					fieldtype: "Link",
					options: "Supplier",
					label: __("Supplier"),
					description: __("Optional"),
				},
			],
			primary_action_label: __("Add to the list"),
			primary_action: function (values) {
				self.ensure_list().then(function () {
					frappe
						.call({
							method: API + "add_free_line",
							args: {
								list_name: self.list,
								text: values.text,
								qty: values.qty,
								unit_text: values.unit_text || null,
								supplier: values.supplier || null,
							},
							freeze: true,
						})
						.then(function () {
							d.hide();
							self.refresh();
						});
				});
			},
		});
		d.show();
	};

	NeorestoShopping.prototype.buy_elsewhere = function (row) {
		var self = this;
		var d = new frappe.ui.Dialog({
			title: __("Buy it elsewhere"),
			fields: [
				{
					fieldname: "supplier",
					fieldtype: "Link",
					options: "Supplier",
					label: __("Supplier"),
					reqd: 1,
				},
			],
			primary_action_label: __("Change the supplier"),
			primary_action: function (values) {
				frappe
					.call({
						method: API + "change_supplier",
						args: { list_name: self.list, row_name: row, supplier: values.supplier },
						freeze: true,
					})
					.then(function () {
						d.hide();
						self.refresh();
					});
			},
		});
		d.show();
	};

	// « I am making lasagnes »: the dish's ingredients (a reminder kept on the dish) are put on the list, worked out when the dish says how
	// much each portion takes, one packaging each when it does not
	NeorestoShopping.prototype.add_dish = function () {
		var self = this;
		var d = new frappe.ui.Dialog({
			title: __("Add a dish"),
			size: "large",
			fields: [
				{
					fieldname: "dish",
					fieldtype: "Link",
					options: "Item",
					label: __("Dish"),
					reqd: 1,
					get_query: function () {
						return { filters: { is_sales_item: 1, disabled: 0 } };
					},
					change: function () {
						var dish = d.get_value("dish");
						if (!dish) return;
						frappe
							.call({ method: API + "get_dish_ingredients", args: { dish: dish } })
							.then(function (r) {
								d.set_value("ingredients", r.message || []);
							});
					},
				},
				{
					fieldname: "portions",
					fieldtype: "Float",
					label: __("Portions"),
					default: 1,
					reqd: 1,
				},
				{
					fieldname: "ingredients",
					fieldtype: "Table",
					label: __("Ingredients"),
					description: __(
						"What the dish needs, from what you buy. The quantity per portion is optional."
					),
					data: [],
					fields: [
						{
							fieldname: "item",
							fieldtype: "Link",
							options: "Item",
							label: __("Ingredient"),
							in_list_view: 1,
							reqd: 1,
							get_query: function () {
								return { filters: { is_restaurant_supply: 1, disabled: 0 } };
							},
						},
						{
							fieldname: "qty_per_portion",
							fieldtype: "Float",
							label: __("Quantity per portion"),
							in_list_view: 1,
						},
					],
				},
			],
			primary_action_label: __("Add the ingredients to the list"),
			primary_action: function (values) {
				var rows = (values.ingredients || []).map(function (r) {
					return { item: r.item, qty_per_portion: r.qty_per_portion || null };
				});
				self.ensure_list().then(function () {
					frappe
						.call({
							method: API + "set_dish_ingredients",
							args: { dish: values.dish, ingredients: JSON.stringify(rows) },
							freeze: true,
						})
						.then(function () {
							return frappe.call({
								method: API + "add_dish",
								args: {
									list_name: self.list,
									dish: values.dish,
									portions: values.portions,
								},
								freeze: true,
							});
						})
						.then(function (r) {
							d.hide();
							var said = (r.message || [])
								.map(function (x) {
									return (
										"<li>" +
										esc(x.item_name) +
										": " +
										(x.calculated
											? esc(__("{0} {1} needed", [x.needed, x.unit || ""])) +
											  " → " +
											  esc(x.packs) +
											  " × " +
											  esc(x.uom || "")
											: esc(__("1 packaging, to complete"))) +
										"</li>"
									);
								})
								.join("");
							frappe.msgprint({
								title: __("Added to the list"),
								message: "<ul>" + said + "</ul>",
								indicator: "green",
							});
							self.refresh();
						});
				});
			},
		});
		d.show();
	};

	// « Ça je commande, ça j'ai, ça c'est bon »: the regular articles one after the other, two answers each
	NeorestoShopping.prototype.stores_round = function () {
		var self = this;
		var rows = [];
		var d = new frappe.ui.Dialog({
			title: __("Stores round"),
			size: "large",
			fields: [
				{
					fieldname: "place",
					fieldtype: "Select",
					label: __("Where"),
					options: [{ value: "", label: __("All places") }],
					change: function () {
						draw();
					},
				},
				{ fieldname: "body", fieldtype: "HTML" },
			],
			primary_action_label: __("Done"),
			primary_action: function () {
				d.hide();
				self.refresh();
			},
		});
		function draw() {
			var place = d.get_value("place") || "";
			var html = rows
				.filter(function (r) {
					return !place || (r.place || "") === place;
				})
				.map(function (r) {
					var usual =
						r.packs.filter(function (p) {
							return p.usual;
						})[0] ||
						r.packs[0] ||
						{};
					return (
						'<div class="nps-round" data-item="' +
						esc(r.item) +
						'" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #F6F3ED">' +
						'<div style="flex:1"><strong>' +
						esc(r.item_name) +
						"</strong>" +
						(usual.uom
							? '<span style="display:block;color:#6F665A;font-size:12.5px">' +
							  esc(usual.supplier + " · " + usual.uom) +
							  "</span>"
							: "") +
						"</div>" +
						(r.answer
							? '<span class="nps-pill done">' +
							  esc(r.answer === "order" ? __("To order") : __("Already in stock")) +
							  "</span>"
							: '<button type="button" class="nps-btn" data-answer="order">' +
							  esc(__("To order")) +
							  "</button>" +
							  '<button type="button" class="nps-btn" data-answer="enough">' +
							  esc(__("I have enough")) +
							  "</button>") +
						"</div>"
					);
				})
				.join("");
			d.fields_dict.body.$wrapper.html(
				html || '<div class="nps-empty">' + esc(__("No article yet.")) + "</div>"
			);
		}
		d.show();
		self.ensure_list().then(function () {
			frappe
				.call({ method: SUPPLIES + "get_supply_catalogue", args: {} })
				.then(function (r) {
					rows = (r.message && r.message.rows) || [];
					var places = [];
					rows.forEach(function (x) {
						if (x.place && places.indexOf(x.place) < 0) places.push(x.place);
					});
					d.set_df_property(
						"place",
						"options",
						[{ value: "", label: __("All places") }].concat(
							places.map(function (x) {
								return { value: x, label: x };
							})
						)
					);
					draw();
				});
		});
		d.$wrapper.on("click", "[data-answer]", function () {
			var $row = $(this).closest(".nps-round");
			var item = $row.attr("data-item");
			var answer = $(this).attr("data-answer");
			frappe
				.call({
					method: API + "round_answer",
					args: { list_name: self.list, item: item, answer: answer },
				})
				.then(function () {
					rows.forEach(function (x) {
						if (x.item === item) x.answer = answer;
					});
					draw();
				});
		});
	};

	frappe.pages["neoresto-shopping"].on_page_load = function (wrapper) {
		var page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Shopping list"),
			single_column: true,
		});
		wrapper.neoresto_shopping = new NeorestoShopping(page);
		wrapper.neoresto_shopping.load_lists().then(function () {
			return wrapper.neoresto_shopping.refresh();
		});
	};

	frappe.pages["neoresto-shopping"].on_page_show = function (wrapper) {
		if (wrapper.neoresto_shopping && wrapper.neoresto_shopping.list)
			wrapper.neoresto_shopping.refresh();
	};
})();
