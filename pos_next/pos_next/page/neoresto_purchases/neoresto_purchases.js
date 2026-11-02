// //// Neoffice — added file (no upstream equivalent). The Achats page of NeoResto (purchases, lot A; study: Obsidian
// //// `Neoffice/NeoResto/14-…` and `18-…`, mock-up plate 1 and 7). The restaurant's regular purchases: the articles, who sells
// //// each, in which packaging, at what price. Nothing is stored here: every call goes to pos_next.api.supplies, which reads and
// //// writes the ERP's own fiches (units, suppliers, buying prices) under the ERP's own rights.
(function () {
	"use strict";

	var API = "pos_next.api.supplies.";
	var STYLE_ID = "neoresto-purchases-style";
	// Ink for every action, the signal tint for what is selected (design system: the signal is a field, never a button)
	var CSS =
		".npp{display:flex;flex-direction:column;gap:14px;padding:6px 0 24px}" +
		".npp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}" +
		".npp-bar .npp-search{flex:1 1 280px;min-height:40px;border:0;border-radius:10px;background:#F2F1ED;padding:0 14px}" +
		".npp-bar select{min-height:40px;border:1px solid #DCD4C7;border-radius:10px;background:#fff;padding:0 10px}" +
		".npp-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
		".npp-chip{min-height:36px;padding:0 14px;border-radius:10px;border:1px solid #DCD4C7;background:#fff;color:#141414;font-weight:500;cursor:pointer}" +
		".npp-chip.on{border-color:#F55D1A;background:#FFEAE2;color:#AA3700}" +
		".npp-chip small{color:#6F665A;font-weight:400;margin-left:4px}" +
		".npp-label{font-size:13px;color:#6F665A;margin-right:2px}" +
		".npp-sep{width:1px;height:26px;background:#DCD4C7;margin:0 6px}" +
		".npp-table{border:1px solid #ECE7DE;border-radius:14px;overflow:hidden;background:#fff}" +
		".npp-head,.npp-row{display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(320px,3fr) 190px;gap:14px;align-items:start;padding:12px 16px}" +
		".npp-head{background:#F6F3ED;font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6F665A}" +
		".npp-row{border-top:1px solid #F6F3ED}" +
		".npp-name{font-weight:600}" +
		".npp-pill{display:inline-block;margin-top:3px;font-size:12px;font-weight:600;color:#3A342C;border-radius:999px;padding:1px 10px;background:#F2F1ED;border:1px solid #F2F1ED}" +
		".npp-pill.supply{background:#fff;border-color:#DCD4C7}" +
		".npp-place{display:block;font-size:12.5px;color:#6F665A;margin-top:2px}" +
		".npp-pack{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(120px,1.2fr) 1fr;gap:10px;padding:3px 0;font-size:14px}" +
		".npp-pack .sub{display:block;font-size:12.5px;color:#6F665A}" +
		".npp-pack .price{text-align:right;font-variant-numeric:tabular-nums}" +
		".npp-usual{display:inline-block;margin-left:6px;font-size:11.5px;font-weight:600;color:#11663A;background:#E9F7EE;border-radius:999px;padding:0 8px}" +
		".npp-none{color:#6F665A;font-size:14px}" +
		".npp-btn{min-height:36px;padding:0 14px;border-radius:10px;border:1px solid #141414;background:#fff;color:#141414;font-weight:600;cursor:pointer}" +
		".npp-empty{padding:32px 16px;text-align:center;color:#6F665A}" +
		".npp-foot{display:flex;justify-content:space-between;padding:12px 16px;border-top:1px solid #ECE7DE;font-size:14px;color:#6F665A}";

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

	function NeorestoPurchases(page) {
		this.page = page;
		this.state = { search: "", supplier: "", family: "", scope: "" };
		this.data = { rows: [], families: [], suppliers: [], total: 0 };
		this.make();
	}

	NeorestoPurchases.prototype.make = function () {
		var self = this;
		if (!document.getElementById(STYLE_ID)) {
			$('<style id="' + STYLE_ID + '">' + CSS + "</style>").appendTo(document.head);
		}
		this.page.set_primary_action(__("Add an article to buy"), function () {
			self.add_item();
		});
		this.$root = $('<div class="npp"></div>').appendTo(this.page.main);
		this.$root.on(
			"input",
			".npp-search",
			frappe.utils.debounce(function () {
				self.state.search = $(this).val();
				self.refresh();
			}, 300)
		);
		this.$root.on("change", ".npp-supplier", function () {
			self.state.supplier = $(this).val();
			self.refresh();
		});
		this.$root.on("click", "[data-scope]", function () {
			self.state.scope = $(this).attr("data-scope");
			self.refresh();
		});
		this.$root.on("click", "[data-family]", function () {
			self.state.family = $(this).attr("data-family");
			self.refresh();
		});
		this.$root.on("click", "[data-add-pack]", function () {
			var item = self.find($(this).attr("data-add-pack"));
			if (item) self.add_pack(item);
		});
		this.render();
		this.refresh();
	};

	NeorestoPurchases.prototype.find = function (code) {
		return this.data.rows.filter(function (row) {
			return row.item === code;
		})[0];
	};

	NeorestoPurchases.prototype.refresh = function () {
		var self = this;
		return frappe
			.call({
				method: API + "get_supply_catalogue",
				args: {
					search: this.state.search,
					supplier: this.state.supplier,
					item_group: this.state.family,
					scope: this.state.scope,
				},
			})
			.then(function (r) {
				self.data = r.message || self.data;
				self.render();
			});
	};

	NeorestoPurchases.prototype.render = function () {
		var s = this.state;
		var focus = this.$root.find(".npp-search").is(":focus");
		var caret = focus ? this.$root.find(".npp-search")[0].selectionStart : 0;
		var scopes = [
			["", __("All")],
			["menu", __("On the menu")],
			["supplies", __("Ingredients and supplies")],
		];
		var scopeChips = scopes
			.map(function (x) {
				return (
					'<button type="button" class="npp-chip' +
					(s.scope === x[0] ? " on" : "") +
					'" data-scope="' +
					esc(x[0]) +
					'">' +
					esc(x[1]) +
					"</button>"
				);
			})
			.join("");
		var families = [{ name: "", label: __("All families") }]
			.concat(
				this.data.families.map(function (f) {
					return { name: f.name, label: f.name, count: f.count };
				})
			)
			.map(function (f) {
				return (
					'<button type="button" class="npp-chip' +
					(s.family === f.name ? " on" : "") +
					'" data-family="' +
					esc(f.name) +
					'">' +
					esc(f.label) +
					(f.count ? " <small>" + esc(f.count) + "</small>" : "") +
					"</button>"
				);
			})
			.join("");
		var suppliers =
			'<option value="">' +
			esc(__("All suppliers")) +
			"</option>" +
			this.data.suppliers
				.map(function (x) {
					return (
						'<option value="' +
						esc(x.name) +
						'"' +
						(s.supplier === x.name ? " selected" : "") +
						">" +
						esc(x.name) +
						" (" +
						esc(x.count) +
						")</option>"
					);
				})
				.join("");
		var rows = this.data.rows.length
			? this.data.rows.map(this.row_html, this).join("")
			: '<div class="npp-empty">' +
			  esc(__("No article yet. Add the first one you buy.")) +
			  "</div>";
		this.$root.html(
			'<div class="npp-bar"><input class="npp-search" type="search" value="' +
				esc(s.search) +
				'" placeholder="' +
				esc(__("An article, a supplier, a packaging…")) +
				'">' +
				'<label class="npp-label">' +
				esc(__("Supplier")) +
				' <select class="npp-supplier">' +
				suppliers +
				"</select></label></div>" +
				'<div class="npp-chips"><span class="npp-label">' +
				esc(__("What we buy")) +
				"</span>" +
				scopeChips +
				'<span class="npp-sep"></span>' +
				families +
				"</div>" +
				'<div class="npp-table"><div class="npp-head"><span>' +
				esc(__("Article")) +
				"</span><span>" +
				esc(__("Who sells it, in which packaging")) +
				"</span><span></span></div>" +
				rows +
				'<div class="npp-foot"><span>' +
				esc(__("{0} articles", [this.data.total])) +
				"</span><span>" +
				esc(
					__(
						"Prices in the company currency; the last price paid, else the catalogue price"
					)
				) +
				"</span></div></div>"
		);
		if (focus) {
			var input = this.$root.find(".npp-search");
			input.focus();
			try {
				input[0].setSelectionRange(caret, caret);
			} catch (e) {
				// the field cannot take a caret: it keeps the one it has
			}
		}
	};

	NeorestoPurchases.prototype.row_html = function (row) {
		// A supplier's packagings sit together, its name and its « usual » mark said once
		var order = [];
		row.packs.forEach(function (pack) {
			if (order.indexOf(pack.supplier) < 0) order.push(pack.supplier);
		});
		var grouped = [];
		order.forEach(function (supplier) {
			row.packs.forEach(function (pack) {
				if (pack.supplier === supplier) grouped.push(pack);
			});
		});
		var previous = null;
		var packs = grouped.length
			? grouped
					.map(function (pack) {
						var first = pack.supplier !== previous;
						previous = pack.supplier;
						return this.pack_html(pack, first);
					}, this)
					.join("")
			: '<span class="npp-none">' +
			  esc(__("Nobody yet: add a packaging and its supplier.")) +
			  "</span>";
		return (
			'<div class="npp-row"><div><span class="npp-name">' +
			esc(row.item_name) +
			"</span><br>" +
			'<span class="npp-pill' +
			(row.sold ? "" : " supply") +
			'">' +
			esc(row.sold ? __("On the menu") : __("Ingredient")) +
			"</span>" +
			(row.place ? '<span class="npp-place">' + esc(row.place) + "</span>" : "") +
			"</div>" +
			"<div>" +
			packs +
			"</div>" +
			'<div><button type="button" class="npp-btn" data-add-pack="' +
			esc(row.item) +
			'">' +
			esc(__("Add a packaging")) +
			"</button></div></div>"
		);
	};

	NeorestoPurchases.prototype.pack_html = function (pack, first) {
		var price = "—";
		var sub = "";
		if (pack.price !== null && pack.price !== undefined) {
			price = money(pack.price);
			sub =
				pack.price_source === "invoice"
					? __("paid on {0}", [frappe.datetime.str_to_user(pack.paid_on)])
					: __("catalogue price");
			if (pack.unit_price !== null && pack.unit_price !== undefined)
				sub += " · " + money(pack.unit_price) + " / " + __("unit");
		}
		return (
			'<div class="npp-pack"><span>' +
			(first
				? esc(pack.supplier) +
				  (pack.usual ? '<span class="npp-usual">' + esc(__("Usual")) + "</span>" : "")
				: "") +
			"</span>" +
			"<span>" +
			esc(pack.uom || "—") +
			(pack.content
				? '<span class="sub">' + esc(__("{0} units", [pack.content])) + "</span>"
				: "") +
			"</span>" +
			'<span class="price">' +
			esc(price) +
			(sub ? '<span class="sub">' + esc(sub) + "</span>" : "") +
			"</span></div>"
		);
	};

	NeorestoPurchases.prototype.add_item = function () {
		var self = this;
		var d = new frappe.ui.Dialog({
			title: __("Add an article to buy"),
			fields: [
				{ fieldname: "item_name", fieldtype: "Data", label: __("Name"), reqd: 1 },
				{
					fieldname: "item_group",
					fieldtype: "Link",
					options: "Item Group",
					label: __("Family"),
					reqd: 1,
					get_query: function () {
						return { filters: { is_group: 0 } };
					},
				},
				{
					fieldname: "stock_uom",
					fieldtype: "Link",
					options: "UOM",
					label: __("Unit you use it in"),
					reqd: 1,
					description: __(
						"A bottle, a kilogram, a piece: the packagings are counted in it."
					),
				},
			],
			primary_action_label: __("Add the article"),
			primary_action: function (values) {
				frappe
					.call({ method: API + "create_supply_item", args: values, freeze: true })
					.then(function (r) {
						d.hide();
						// Whatever was searched or filtered, the new article is shown: its packaging is the next thing to say
						self.state = { search: "", supplier: "", family: "", scope: "" };
						return self.refresh().then(function () {
							var row = self.find(r.message);
							if (row) self.add_pack(row);
						});
					});
			},
		});
		d.show();
	};

	NeorestoPurchases.prototype.add_pack = function (row) {
		var self = this;
		var d = new frappe.ui.Dialog({
			title: __("Add a packaging"),
			fields: [
				{
					fieldname: "article",
					fieldtype: "Data",
					label: __("Article"),
					read_only: 1,
					default: row.item_name,
				},
				{
					fieldname: "supplier",
					fieldtype: "Link",
					options: "Supplier",
					label: __("Supplier"),
					reqd: 1,
				},
				{
					fieldname: "pack_name",
					fieldtype: "Data",
					label: __("Name of the packaging"),
					reqd: 1,
					description: __("For example: Carton of 6, Net of 5 kg"),
				},
				{
					fieldname: "content",
					fieldtype: "Float",
					label: __("Content, in {0}", [row.stock_uom]),
					reqd: 1,
					default: 1,
				},
				{
					fieldname: "price",
					fieldtype: "Currency",
					label: __("Purchase price of the packaging"),
					description: __("Optional: the last price paid replaces it."),
				},
				{
					fieldname: "supplier_part_no",
					fieldtype: "Data",
					label: __("Supplier's reference"),
					description: __("Optional"),
				},
				{
					fieldname: "make_usual",
					fieldtype: "Check",
					label: __("Make this supplier the usual one for this article"),
				},
			],
			primary_action_label: __("Add the packaging"),
			primary_action: function (values) {
				frappe
					.call({
						method: API + "add_supply_pack",
						args: {
							item: row.item,
							supplier: values.supplier,
							pack_name: values.pack_name,
							content: values.content,
							price: values.price || null,
							supplier_part_no: values.supplier_part_no || null,
							make_usual: values.make_usual ? 1 : 0,
						},
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

	frappe.pages["neoresto-purchases"].on_page_load = function (wrapper) {
		var page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Purchases"),
			single_column: true,
		});
		wrapper.neoresto_purchases = new NeorestoPurchases(page);
	};

	frappe.pages["neoresto-purchases"].on_page_show = function (wrapper) {
		if (wrapper.neoresto_purchases) wrapper.neoresto_purchases.refresh();
	};
})();
