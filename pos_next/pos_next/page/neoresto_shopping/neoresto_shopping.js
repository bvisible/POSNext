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
		".nps-btn.sm{min-height:32px;padding:0 12px;font-size:13px}" +
		".nps-card>header .nps-right{display:flex;flex-wrap:wrap;gap:12px;align-items:center}" +
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
		".nps-empty{padding:28px 16px;text-align:center;color:#6F665A}" +
		".nps-pick-search{width:100%;min-height:40px;border:1px solid #DCD4C7;border-radius:10px;padding:0 12px;margin-bottom:10px}" +
		".nps-pick-bar{display:flex;gap:10px;align-items:center;margin-bottom:10px}" +
		".nps-pick-bar select{min-height:40px;max-width:280px;border:1px solid #DCD4C7;border-radius:10px;background:#fff;padding:0 10px}" +
		".nps-pick-bar .nps-pick-search{flex:1;width:auto;margin-bottom:0}" +
		".nps-pick-bar label{display:flex;gap:8px;align-items:center;margin:0;font-size:13px;color:#6F665A}" +
		".nps-tag{display:inline-block;margin-left:8px;padding:0 8px;border-radius:999px;background:#E9F7EE;color:#11663A;font-size:11.5px;font-weight:600}" +
		".nps-pick{border:1px solid #DCD4C7;border-radius:12px;max-height:46vh;overflow:auto}" +
		".nps-pick-row{display:grid;grid-template-columns:34px minmax(150px,2fr) minmax(170px,2fr) 90px 100px;gap:10px;align-items:center;padding:8px 14px;border-top:1px solid #F6F3ED}" +
		".nps-pick-row:first-child{border-top:0}" +
		".nps-pick-row.head{position:sticky;top:0;background:#F6F3ED;font-size:12px;font-weight:600;color:#6F665A;text-transform:uppercase;letter-spacing:.04em}" +
		".nps-pick-row.on{background:#FFF6EF}" +
		".nps-pick-row .label{font-weight:600}" +
		".nps-pick-row .p-step{justify-self:end}" +
		".nps-pick-row .sub{display:block;font-size:12.5px;color:#6F665A;font-weight:400}" +
		".nps-pick-row select,.nps-pick-row input[type=number]{width:100%;min-height:34px;border:1px solid #DCD4C7;border-radius:8px;background:#fff;padding:0 8px}" +
		".nps-pick-row input[type=checkbox]{width:18px;height:18px}" +
		".nps-pick-row .price{text-align:right;font-variant-numeric:tabular-nums}" +
		".nps-pick-none{padding:28px 16px;text-align:center;color:#6F665A}" +
		"@media (max-width:1100px),(pointer:coarse){" +
		'.nps-line{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:"label label price" "unit unit unit" "step tick more";gap:8px 12px;padding:12px 16px}' +
		".nps-line .c-label{grid-area:label}.nps-line .c-unit{grid-area:unit;color:#6F665A;font-size:13.5px}.nps-line .c-price{grid-area:price}" +
		".nps-line .c-step{grid-area:step;justify-self:start}.nps-line .c-tick{grid-area:tick}.nps-line .c-more{grid-area:more}" +
		".nps-step{height:46px}.nps-step button{width:46px;height:44px;font-size:22px}.nps-step span{min-width:34px;font-size:17px}" +
		".nps-btn{min-height:46px}.nps-btn.sm{min-height:40px}" +
		".nps-line .c-tick .nps-btn,.nps-line .c-tick .nps-pill{width:100%;text-align:center}" +
		".nps-line .nps-more,.nps-bar select{min-height:46px}" +
		".nps-pick{max-height:52vh}" +
		".nps-pick-bar{flex-wrap:wrap}.nps-pick-bar select,.nps-pick-bar .nps-pick-search{flex:1 1 100%;max-width:none}" +
		".nps-pick-bar label{flex:1 1 100%}.nps-pick-bar label select{flex:1}" +
		'.nps-pick-row{grid-template-columns:34px minmax(0,1fr) auto;grid-template-areas:"tick label step" ". pack pack";gap:6px 12px;padding:12px}' +
		".nps-pick-row.head,.nps-pick-row .p-price{display:none}" +
		".nps-pick-row .p-tick{grid-area:tick;width:24px;height:24px}.nps-pick-row .p-label{grid-area:label}" +
		".nps-pick{overflow-x:hidden}.nps-pick-row>*{min-width:0}.nps-pick-row select{max-width:100%}" +
		".nps-pick-row .p-pack{grid-area:pack}.nps-pick-row .p-step{grid-area:step}.nps-pick-row select{min-height:44px}" +
		"}" +
		"@media (max-width:560px){" +
		'.nps-line{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"label price" "unit unit" "step more" "tick tick"}' +
		".nps-line .c-more{justify-self:end}.nps-line .nps-more{min-width:130px}" +
		"}";

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
		this.$root.on("click", "[data-add-to]", function () {
			self.add_article($(this).attr("data-add-to"));
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
			'</h3><span class="nps-right"><span>' +
			sub +
			delivery +
			"</span>" +
			(block.supplier
				? '<button type="button" class="nps-btn sm" data-add-to="' +
				  esc(block.supplier) +
				  '">+ ' +
				  esc(__("Add")) +
				  "</button>"
				: "") +
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
			'"><div class="label c-label">' +
			esc(line.label) +
			(line.free ? '<span class="sub">' + esc(__("Free line")) + "</span>" : "") +
			"</div>" +
			'<div class="c-unit">' +
			esc(unit || "—") +
			"</div>" +
			'<div class="nps-step c-step"><button type="button" data-act="minus" data-row="' +
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
			'<div class="nps-price c-price">' +
			price +
			'</div><div class="c-tick">' +
			tick +
			'</div><div class="c-more">' +
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

	// The picker: the articles the restaurant buys, a select of suppliers to filter by, a search, a tick and a quantity on each line,
	// and one button that puts every ticked one on the list - the table that ticks lines on a new order. The owner may choose a
	// supplier, tick what he needs from him, choose another, tick again: what is ticked stays ticked while the filter changes, and
	// each supplier's option says how many are ticked under it. An article ticked under two suppliers goes on twice, once at each.
	// `preset` is the supplier whose block's « Add » opened it, chosen in the select. A packaging is chosen where an article has several (the usual
	// one first), else it is the only one.
	NeorestoShopping.prototype.add_article = function (preset) {
		var self = this;
		var rows = [];
		var suppliers = [];
		var chosen = {}; // key -> {item, pack, qty}
		var quantities = {}; // key -> the quantity typed, ticked or not
		var picks = {}; // article -> the packaging shown on its line, among those of the supplier in view
		var on_list = {}; // articles already on the list the lines will join
		var supplier = preset || "";

		((self.view && self.view.blocks) || []).forEach(function (block) {
			block.lines.forEach(function (line) {
				if (line.item) on_list[line.item] = true;
			});
		});

		var d = new frappe.ui.Dialog({
			title: __("Add an article"),
			size: "extra-large",
			fields: [{ fieldname: "picker", fieldtype: "HTML" }],
			primary_action_label: __("Add to the list"),
			primary_action: function () {
				var lines = Object.keys(chosen).map(function (key) {
					var entry = chosen[key];
					return {
						item: entry.item,
						qty: entry.qty,
						supplier: entry.pack ? entry.pack.supplier : null,
						uom: entry.pack ? entry.pack.uom : null,
					};
				});
				if (!lines.length) return;
				self.ensure_list().then(function () {
					frappe
						.call({
							method: API + "add_article_lines",
							args: { list_name: self.list, lines: JSON.stringify(lines) },
							freeze: true,
						})
						.then(function () {
							d.hide();
							self.refresh();
						});
				});
			},
			secondary_action_label: __("Create an article"),
			secondary_action: function () {
				d.hide();
				frappe.route_options = { create_article: 1 };
				frappe.set_route("neoresto-purchases");
			},
		});
		var $box = d.fields_dict.picker.$wrapper;

		function keyOf(code, pack) {
			return code + "|" + (pack ? pack.supplier : "");
		}

		function visiblePacks(row) {
			return supplier
				? row.packs.filter(function (p) {
						return p.supplier === supplier;
				  })
				: row.packs;
		}

		function ticked(name) {
			return Object.keys(chosen).filter(function (key) {
				var pack = chosen[key].pack;
				return name === null ? true : pack && pack.supplier === name;
			}).length;
		}

		function sync() {
			var n = ticked(null);
			d.get_primary_btn()
				.prop("disabled", n === 0)
				.text(__("Add to the list") + (n ? " (" + n + ")" : ""));
		}

		function packLabel(pack, withSupplier) {
			return (
				(withSupplier ? pack.supplier + " — " : "") +
				(pack.uom || "") +
				(pack.price !== null && pack.price !== undefined ? " · " + money(pack.price) : "")
			);
		}

		// The suppliers as the options of a select, each with what is ticked under it: it holds however many there are
		function optionsHtml() {
			function option(name, label) {
				var n = name === "" ? ticked(null) : ticked(name);
				return (
					'<option value="' +
					esc(name) +
					'"' +
					(supplier === name ? " selected" : "") +
					">" +
					esc(label) +
					(n ? " (" + n + ")" : "") +
					"</option>"
				);
			}
			return (
				option("", __("All suppliers")) +
				suppliers
					.map(function (s) {
						return option(s.name, s.name);
					})
					.join("")
			);
		}

		function rowHtml(row) {
			var packs = visiblePacks(row);
			var pick = Math.min(picks[row.item] || 0, Math.max(packs.length - 1, 0));
			var pack = packs[pick] || null;
			var key = keyOf(row.item, pack);
			var entry = chosen[key];
			var qty = entry ? entry.qty : quantities[key] || 1;
			var choice = !packs.length
				? '<span class="sub">' + esc(__("No packaging yet")) + "</span>"
				: packs.length === 1
				? esc(packLabel(packs[0], !supplier))
				: '<select data-pick-pack="' +
				  esc(row.item) +
				  '">' +
				  packs
						.map(function (p, i) {
							return (
								'<option value="' +
								i +
								'"' +
								(i === pick ? " selected" : "") +
								">" +
								esc(packLabel(p, !supplier)) +
								"</option>"
							);
						})
						.join("") +
				  "</select>";
			return (
				'<div class="nps-pick-row' +
				(entry ? " on" : "") +
				'"><input type="checkbox" class="p-tick" data-pick-tick="' +
				esc(row.item) +
				'"' +
				(entry ? " checked" : "") +
				'><span class="label p-label">' +
				esc(row.item_name) +
				(on_list[row.item]
					? '<span class="nps-tag">' + esc(__("Already on the list")) + "</span>"
					: "") +
				'<span class="sub">' +
				esc(row.item_group || "") +
				'</span></span><span class="p-pack">' +
				choice +
				'</span><span class="price p-price">' +
				(pack && pack.price !== null && pack.price !== undefined
					? esc(money(pack.price))
					: "") +
				'</span><div class="nps-step p-step"><button type="button" data-pick-minus="' +
				esc(row.item) +
				'" aria-label="' +
				esc(__("Less")) +
				'">−</button><span>' +
				esc(qty) +
				'</span><button type="button" data-pick-plus="' +
				esc(row.item) +
				'" aria-label="' +
				esc(__("More")) +
				'">+</button></div></div>'
			);
		}

		function draw() {
			var needle = ($box.find(".nps-pick-search").val() || "").toLowerCase();
			var shown = rows.filter(function (row) {
				if (supplier && !visiblePacks(row).length) return false;
				if (!needle) return true;
				var haystack = [row.item_name, row.item, row.item_group]
					.concat(
						visiblePacks(row).map(function (p) {
							return p.supplier + " " + (p.uom || "");
						})
					)
					.join(" ")
					.toLowerCase();
				return haystack.indexOf(needle) >= 0;
			});
			$box.find(".nps-pick-supplier").html(optionsHtml());
			var scrolled = $box.find(".nps-pick-body").scrollTop();
			$box.find(".nps-pick-body").html(
				rows.length
					? shown.length
						? '<div class="nps-pick-row head"><span></span><span>' +
						  esc(__("Article")) +
						  "</span><span>" +
						  esc(__("Who sells it, in which packaging")) +
						  "</span><span></span><span>" +
						  esc(__("Quantity")) +
						  "</span></div>" +
						  shown.map(rowHtml).join("")
						: '<div class="nps-pick-none">' + esc(__("Nothing matches.")) + "</div>"
					: '<div class="nps-pick-none">' +
							esc(__("No article yet. Add the first one you buy.")) +
							'<div style="margin-top:12px"><button type="button" class="nps-btn ink" data-pick-create>' +
							esc(__("Create an article")) +
							"</button></div></div>"
			);
			$box.find(".nps-pick-body").scrollTop(scrolled);
			sync();
		}

		function row_of(code) {
			return rows.filter(function (row) {
				return row.item === code;
			})[0];
		}

		// The packaging on an article's line, among those of the supplier in view
		function current(code) {
			var packs = visiblePacks(row_of(code));
			return packs[Math.min(picks[code] || 0, Math.max(packs.length - 1, 0))] || null;
		}

		$box.html(
			'<div class="nps-pick-bar"><label><span>' +
				esc(__("Supplier")) +
				'</span><select class="nps-pick-supplier"></select></label><input type="search" class="nps-pick-search" placeholder="' +
				esc(__("An article, a supplier, a packaging…")) +
				'"></div><div class="nps-pick nps-pick-body"></div>'
		);
		$box.on("input", ".nps-pick-search", draw);
		$box.on("change", ".nps-pick-supplier", function () {
			supplier = $(this).val() || "";
			picks = {};
			draw();
		});
		$box.on("change", "[data-pick-tick]", function () {
			var code = $(this).attr("data-pick-tick");
			var pack = current(code);
			var key = keyOf(code, pack);
			if (this.checked) chosen[key] = { item: code, pack: pack, qty: quantities[key] || 1 };
			else delete chosen[key];
			draw();
		});
		// A quantity changed ticks its line: the owner who touches a number means it. One less than one takes the tick off.
		function bump(code, delta) {
			var pack = current(code);
			var key = keyOf(code, pack);
			var qty = (chosen[key] ? chosen[key].qty : quantities[key] || 1) + delta;
			if (qty < 1) {
				delete chosen[key];
				quantities[key] = 1;
			} else {
				quantities[key] = qty;
				chosen[key] = { item: code, pack: pack, qty: qty };
			}
			draw();
		}
		$box.on("click", "[data-pick-plus]", function () {
			bump($(this).attr("data-pick-plus"), 1);
		});
		$box.on("click", "[data-pick-minus]", function () {
			bump($(this).attr("data-pick-minus"), -1);
		});
		$box.on("change", "[data-pick-pack]", function () {
			var code = $(this).attr("data-pick-pack");
			var before = keyOf(code, current(code));
			var was = chosen[before];
			picks[code] = Number($(this).val());
			var pack = current(code);
			if (was) {
				// A ticked line that changes packaging follows it, with its quantity
				delete chosen[before];
				chosen[keyOf(code, pack)] = { item: code, pack: pack, qty: was.qty };
			}
			draw();
		});
		$box.on("click", "[data-pick-create]", function () {
			d.get_secondary_btn().trigger("click");
		});

		d.show();
		sync();
		frappe.call({ method: SUPPLIES + "get_supply_catalogue", args: {} }).then(function (r) {
			var data = r.message || {};
			// The usual packaging first, so that the one the picker proposes is the one the owner usually buys
			rows = (data.rows || []).map(function (row) {
				var packs = row.packs.slice().sort(function (a, b) {
					return (b.usual ? 1 : 0) - (a.usual ? 1 : 0);
				});
				return $.extend({}, row, { packs: packs });
			});
			suppliers = data.suppliers || [];
			draw();
			$box.find(".nps-pick-search").trigger("focus");
		});
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
		// What the dish said when it was chosen: written back only when the owner changed it, and never as an empty table
		var loaded = [];
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
								loaded = (r.message || []).map(function (x) {
									return {
										item: x.item,
										qty_per_portion: x.qty_per_portion || null,
									};
								});
								var field = d.fields_dict.ingredients;
								field.df.data = loaded.map(function (x) {
									return Object.assign({}, x);
								});
								field.grid.refresh();
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
				var changed = rows.length && JSON.stringify(rows) !== JSON.stringify(loaded);
				self.ensure_list().then(function () {
					(changed
						? frappe.call({
								method: API + "set_dish_ingredients",
								args: { dish: values.dish, ingredients: JSON.stringify(rows) },
								freeze: true,
						  })
						: $.Deferred().resolve().promise()
					)
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
