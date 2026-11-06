// //// Neoffice — added file (no upstream equivalent). The office's page of a till's settings (NeoResto lot 1, task 13b; product
// //// owner, 30.10.2026: « une seule page que nous gérons, qui cache les deux fiches d'origine »). It draws the SAME list as the
// //// till's own screen (pos_next.till_settings.registry, served by pos_next.till_settings.api.get_desk_settings): the same tabs,
// //// groups, labels and helps behind a lightbulb, a setting that depends on another one shown greyed, one Save for the whole
// //// page; and, because it is the office's, the office's own settings too (the till's identity and users, payments, loyalty,
// //// accounts, the site's negative stock), changeable only by whoever the ERP lets write their document. The values are drawn
// //// with the desk's own controls (links searched with the user's rights, tables, times). A field that was hidden on purpose
// //// is not in the list, so it is never on this page; what the till keeps on its own computer (printer, sounds) is not here.
// //// The rules that decide what is greyed, what changed and what a save sends are those of the till's screen
// //// (POS/src/components/settings/tillSettingsForm.js): a spec runs both on the same list and compares them.
(function () {
	"use strict";

	var API = "pos_next.till_settings.api.";
	var STYLE_ID = "till-settings-style";
	var LAST_TILL = "pos_next_till_settings_last_till";
	// The widths of the columns of a tab: the hours wide beside their cards, as at the till
	var COLUMN_TEMPLATES = {
		hours: "minmax(0,1fr) 300px",
		online: "minmax(0,1.2fr) minmax(0,1fr)",
		// One column of a readable width: a person sets a till up from the top down
		setup: "minmax(0,720px)",
	};
	var BULB =
		'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
		'<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
		'<path d="M9 18h6"/><path d="M10 22h4"/></svg>';

	// Ink for every action, the signal tint for what is selected (design system: the signal is a field, never a button)
	var CSS =
		".tsp{display:flex;flex-direction:column;gap:12px;padding:6px 0 24px}" +
		".tsp-sub{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;color:#6F665A;font-size:13px}" +
		".tsp-sub b{color:#141414;font-weight:600}" +
		".tsp-dirty{padding:1px 9px;border-radius:999px;background:#FFF4DB;color:#8A5A00;font-size:12px;font-weight:600}" +
		".tsp-body{display:flex;gap:18px;align-items:flex-start}" +
		".tsp-rail{flex:0 0 214px;display:flex;flex-direction:column;gap:3px;background:#F6F3ED;border:1px solid #ECE7DE;border-radius:14px;padding:10px;position:sticky;top:12px}" +
		".tsp-section{padding:8px 10px 4px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6F665A}" +
		".tsp-section:not(:first-child){margin-top:6px}" +
		".tsp-tab{display:block;width:100%;text-align:start;min-height:38px;padding:8px 12px;border:0;border-radius:10px;background:transparent;color:#6F665A;font-size:14px;font-weight:600;cursor:pointer}" +
		".tsp-tab:hover{background:#ECE7DE}" +
		".tsp-tab.on{background:#141414;color:#fff}" +
		".tsp-panel{flex:1 1 auto;min-width:0;display:grid;gap:24px;align-content:start;background:#fff;border:1px solid #ECE7DE;border-radius:14px;padding:18px 22px}" +
		".tsp-group{margin-bottom:16px;display:flex;flex-direction:column;gap:8px}" +
		".tsp-group h3{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 3px;padding-bottom:6px;border-bottom:1px solid #ECE7DE;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6F665A}" +
		".tsp-badge{border-radius:9px;padding:1px 7px;font-size:10.5px;font-weight:700;letter-spacing:0;text-transform:none;background:#F2F1ED;color:#6F665A}" +
		".tsp-badge.restaurant{background:#FFEAE2;color:#AA3700}" +
		".tsp-badge.site{background:#FFF4DB;color:#8A5A00}" +
		".tsp-setting{min-width:0}" +
		".tsp-setting.indent{margin-left:9px;padding-left:19px;border-left:2px solid #ECE7DE}" +
		".tsp-setting[data-greyed=true]{opacity:.42}" +
		".tsp-label{display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12.5px;color:#6F665A}" +
		".tsp-row{display:flex;align-items:center;gap:8px}" +
		".tsp-row .tsp-control{flex:1 1 auto;min-width:0}" +
		".tsp-bulb{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;padding:0;border:0;border-radius:5px;background:transparent;color:#6F665A;cursor:pointer}" +
		".tsp-bulb:hover,.tsp-bulb.on{background:#FFEAE2;color:#AA3700}" +
		".tsp-help{margin:6px 0 2px;padding:8px 10px;border-left:3px solid #F55D1A;border-radius:8px;background:#FFF6F1;color:#141414;font-size:12.5px;line-height:1.45}" +
		".tsp-lock{font-size:11.5px;color:#6F665A;margin-top:3px}" +
		".tsp-control .form-group{margin-bottom:0}" +
		".tsp-control .control-label,.tsp-control .help-box{display:none!important}" +
		".tsp-control .grid-footer,.tsp-control .grid-heading-row{font-size:12px}" +
		".tsp-tills{display:flex;flex-wrap:wrap;gap:6px;align-items:center}" +
		".tsp-till{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 14px;border-radius:999px;border:1px solid #DCD4C7;background:#fff;color:#141414;font-size:13px;font-weight:600;cursor:pointer}" +
		".tsp-till:hover{background:#F6F3ED}" +
		".tsp-till.on{background:#141414;border-color:#141414;color:#fff}" +
		".tsp-till.off{opacity:.55}" +
		".tsp-till small{font-size:11px;font-weight:600;opacity:.8}" +
		".tsp-ready{display:flex;flex-wrap:wrap;gap:8px;align-items:center}" +
		".tsp-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border-radius:999px;border:1px solid #DCD4C7;background:#fff;color:#141414;font-size:12.5px;font-weight:600;cursor:pointer}" +
		".tsp-chip.ok{background:#E9F7EE;border-color:#BFE3CB;color:#11663A}" +
		".tsp-chip.todo{background:#FFF4DB;border-color:#EBCB8B;color:#8A5A00}" +
		".tsp-people{margin-top:8px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:#3A342C}" +
		".tsp-people .bad{color:#8A5A00}" +
		".tsp-people .good{color:#11663A}" +
		".tsp-note{padding:8px 12px;border-radius:10px;background:#F6F3ED;color:#3A342C;font-size:13px;line-height:1.45}" +
		".tsp-empty{padding:48px 16px;text-align:center;color:#6F665A}" +
		"@media (max-width:991px){.tsp-body{flex-direction:column}.tsp-rail{flex:none;width:100%;flex-direction:row;flex-wrap:wrap;position:static}" +
		".tsp-section{display:none}.tsp-tab{width:auto}.tsp-panel{grid-template-columns:minmax(0,1fr)!important;width:100%}}";

	// ------------------------------------------------------------------------------------------------ the rules
	// Pure: the same rules as POS/src/components/settings/tillSettingsForm.js, kept equal by a spec that runs both.

	// Whether a value counts as "on" for a condition: a ticked box, a chosen link, a filled text, a non-empty list
	function isOn(value) {
		if (Array.isArray(value)) return value.length > 0;
		if (typeof value === "string") return value.trim() !== "" && value !== "0";
		return Boolean(value);
	}

	// Whether the conditions of a setting hold (it can then be set); otherwise the page shows it greyed
	function conditionsHold(setting, values) {
		return (setting.depends_on || []).every(function (when) {
			var value = values ? values[when.key] : undefined;
			if (when.off) return !isOn(value);
			if (when.equals !== null && when.equals !== undefined) {
				return String(value === null || value === undefined ? "" : value) === when.equals;
			}
			return isOn(value);
		});
	}

	// A ticked box whose setting cannot go with another one now on (a condition `off`) is unticked, in place: the
	// documents refuse the pair, and a greyed box cannot be unticked by hand. Answers the keys unticked.
	function untickExcluded(settings, values) {
		var unticked = [];
		(settings || []).forEach(function (setting) {
			if (
				setting.widget !== "check" ||
				!setting.editable ||
				!isOn(values && values[setting.key])
			)
				return;
			var excluded = (setting.depends_on || []).some(function (when) {
				return when.off && isOn(values[when.key]);
			});
			if (excluded) {
				values[setting.key] = 0;
				unticked.push(setting.key);
			}
		});
		return unticked;
	}

	// The groups of a tab in their columns, each with its settings in the order of the list
	function columnsOf(screen, tabKey) {
		if (!screen) return [];
		var columns = {};
		(screen.groups || [])
			.filter(function (group) {
				return group.tab === tabKey;
			})
			.forEach(function (group) {
				var settings = (screen.settings || []).filter(function (setting) {
					return setting.group === group.key;
				});
				if (!settings.length) return;
				(columns[group.column] = columns[group.column] || []).push(
					Object.assign({}, group, { settings: settings })
				);
			});
		return Object.keys(columns)
			.map(Number)
			.sort(function (a, b) {
				return a - b;
			})
			.map(function (column) {
				return columns[column];
			});
	}

	function sameValue(a, b) {
		return (
			JSON.stringify(a === undefined ? null : a) ===
			JSON.stringify(b === undefined ? null : b)
		);
	}

	// The values of the till's documents that changed since the page was read: what a save sends, and nothing else
	function changedValues(settings, read, draft) {
		var changed = {};
		(settings || []).forEach(function (setting) {
			if (setting.store !== "document" || !setting.editable) return;
			if (!draft || !(setting.key in draft)) return;
			if (!sameValue(read ? read[setting.key] : undefined, draft[setting.key])) {
				changed[setting.key] = draft[setting.key];
			}
		});
		return changed;
	}

	// A time of day as the server takes it: HH:MM, 00:00 to 23:59 (an unfinished field is "")
	function isTimeOfDay(value) {
		return /^([01]\d|2[0-3]):[0-5]\d$/.test(
			String(value === null || value === undefined ? "" : value)
		);
	}

	// A number kept within the bounds of its setting (a value out of them is never saved)
	function withinBounds(setting, value) {
		var number = Number(value);
		if (!isFinite(number)) return false;
		if (setting.min !== null && setting.min !== undefined && number < setting.min)
			return false;
		if (setting.max !== null && setting.max !== undefined && number > setting.max)
			return false;
		return true;
	}

	// The rail: the restaurant's tabs (a restaurant till only), the till's, the office's
	function railSections(screen) {
		var tabs = (screen && screen.tabs) || [];
		return ["setup", "restaurant", "till", "desk"]
			.map(function (key) {
				return {
					key: key,
					tabs: tabs.filter(function (tab) {
						return tab.section === key;
					}),
				};
			})
			.filter(function (section) {
				return section.tabs.length > 0;
			});
	}

	// ------------------------------------------------------------------------------------------------ the page
	function esc(value) {
		return frappe.utils.escape_html(
			value === null || value === undefined ? "" : String(value)
		);
	}

	function clone(value) {
		return JSON.parse(JSON.stringify(value === undefined ? null : value));
	}

	function section_label(key) {
		if (key === "setup") return __("This till");
		if (key === "restaurant") return __("Restaurant");
		if (key === "desk") return __("Office");
		return __("Till");
	}

	// What a group's settings apply to, when it is not plain from the tab: the restaurant's tabs say it for every group,
	// the till's tabs only for what is not the till's
	function badge_of(screen, group) {
		var restaurant_tab = (screen.tabs || []).some(function (tab) {
			return tab.key === group.tab && tab.section === "restaurant";
		});
		var badges = {
			restaurant: [__("Whole restaurant"), "restaurant"],
			till: [__("This till"), ""],
			site: [__("Whole site"), "site"],
			device: [__("This device"), ""],
			computer: [__("This computer"), ""],
		};
		if (group.scope === "till" && !restaurant_tab) return null;
		return badges[group.scope] || null;
	}

	// A group of one setting that is the group itself (the opening hours): its title carries the setting's bulb
	function title_carries_help(group) {
		return (
			group.settings.length === 1 &&
			group.settings[0].help &&
			group.settings[0].label === group.label
		);
	}

	function TillSettingsPage(page) {
		this.page = page;
		this.screen = null;
		this.read = {};
		this.draft = {};
		this.by_key = {};
		this.controls = {};
		this.active_tab = "";
		this.profile = "";
		this.make();
	}

	TillSettingsPage.prototype.make = function () {
		var self = this;
		if (!document.getElementById(STYLE_ID)) {
			$('<style id="' + STYLE_ID + '">' + CSS + "</style>").appendTo(document.head);
		}
		this.page.set_primary_action(__("Save"), function () {
			self.save();
		});
		this.page.set_secondary_action(__("New till"), function () {
			self.new_till();
		});
		this.page.add_menu_item(__("Discard the changes"), function () {
			self.load(self.profile);
		});
		this.page.add_menu_item(__("Delete this till"), function () {
			self.delete_till();
		});
		this.page.add_menu_item(__("Open the POS Settings form"), function () {
			self.open_form("POS Settings", { pos_profile: self.profile });
		});
		this.page.add_menu_item(__("Open the POS Profile form"), function () {
			if (self.profile) frappe.set_route("Form", "POS Profile", self.profile);
		});
		this.$root = $('<div class="tsp"></div>').appendTo(this.page.main);
		this.$root.on("click", "[data-new-till]", function () {
			self.new_till();
		});
		this.$root.on("click", "[data-give-role]", function () {
			self.give_role($(this).attr("data-give-role"));
		});
		// The tills side by side: one click switches (the unsaved changes are asked about first)
		this.$root.on("click", "[data-till]", function () {
			var chosen = $(this).attr("data-till");
			if (chosen && chosen !== self.profile) self.choose(chosen);
		});
		this.$root.on("click", "[data-tab]", function () {
			self.sync();
			self.active_tab = $(this).attr("data-tab");
			self.render();
		});
		this.$root.on("click", ".tsp-bulb", function () {
			var $setting = $(this).closest("[data-setting],[data-group]");
			var $help = $setting.find(".tsp-help").first();
			$(this).toggleClass("on");
			$help.toggle();
		});
		// Any edit of a control (typing, ticking, choosing, a cell of a table) bubbles up here
		this.$root.on(
			"change input click keyup awesomplete-selectcomplete",
			".tsp-control",
			frappe.utils.debounce(function () {
				self.on_change();
			}, 150)
		);
	};

	// A new till, from a short form: its name, its company, and optionally the till it copies. The rest is set on this page, in its tabs.
	TillSettingsPage.prototype.new_till = function () {
		var self = this;
		var dialog = new frappe.ui.Dialog({
			title: __("New till"),
			fields: [
				{
					fieldname: "till_name",
					fieldtype: "Data",
					label: __("Name of the till"),
					reqd: 1,
				},
				{
					fieldname: "company",
					fieldtype: "Link",
					options: "Company",
					label: __("Company"),
					default: frappe.defaults.get_user_default("Company") || "",
					depends_on: "eval:!doc.copy_from",
				},
				{
					fieldname: "copy_from",
					fieldtype: "Link",
					options: "POS Profile",
					label: __("Copy the settings of another till"),
					description: __(
						"The new till takes the company, the accounts, the payment methods and the settings of that till, but not its users nor its payment terminals."
					),
				},
			],
			primary_action_label: __("Create the till"),
			primary_action: function (values) {
				dialog.hide();
				frappe
					.call({
						method: API + "create_till",
						args: {
							till_name: values.till_name,
							company: values.company || "",
							copy_from: values.copy_from || "",
						},
						freeze: true,
						freeze_message: __("Creating the till..."),
					})
					.then(function (r) {
						if (r && r.message) frappe.set_route("till-settings", r.message);
					});
			},
		});
		dialog.show();
	};

	// Delete the open till (asked first, and in words: its settings go with it). A till that has sales is refused by the server, which says to
	// switch it off instead; the page then goes on to another till, or offers to make the first one
	TillSettingsPage.prototype.delete_till = function () {
		var self = this;
		var profile = this.profile;
		if (!profile || !this.screen) return;
		if (!(this.screen.can && this.screen.can.delete)) {
			frappe.msgprint(
				__(
					"Deleting a till needs the right to delete a POS Profile in the accounting. You can switch the till off instead: open Getting started and untick Active till."
				)
			);
			return;
		}
		frappe.confirm(
			__(
				"Delete the till {0}? Its settings go with it and this cannot be undone. A till that has sales cannot be deleted: switch it off instead.",
				[profile]
			),
			function () {
				frappe
					.call({
						method: API + "delete_till",
						args: { pos_profile: profile },
						freeze: true,
					})
					.then(function (r) {
						if (!r || !r.message) return;
						frappe.show_alert({
							message: __("The till {0} is deleted.", [profile]),
							indicator: "green",
						});
						self.profile = "";
						self.screen = null;
						try {
							window.localStorage.removeItem(LAST_TILL);
						} catch (error) {
							// A browser that keeps nothing
						}
						if (r.message.next) self.go(r.message.next);
						else self.render_empty();
					});
			}
		);
	};

	// No till at all: the first one is one click away
	TillSettingsPage.prototype.render_empty = function () {
		this.controls = {};
		this.$root.html(
			'<div class="tsp-empty"><p>' +
				esc(__("There is no till yet.")) +
				'</p><button type="button" class="btn btn-primary" data-new-till>' +
				esc(__("New till")) +
				"</button></div>"
		);
	};

	// Give a listed person the role of a cashier (asked first: it changes who may open the till); the people and the chips are read again
	// and the rest of the page stays as it is, unsaved changes included
	TillSettingsPage.prototype.give_role = function (user) {
		var self = this;
		frappe.confirm(
			__("Give the role of a cashier to {0}? They will be able to open this till.", [user]),
			function () {
				frappe
					.call({
						method: API + "give_the_cashier_role",
						args: { pos_profile: self.profile, user: user },
						freeze: true,
					})
					.then(function (r) {
						if (!r || !r.message) return;
						self.sync();
						self.screen.people = r.message.people;
						self.screen.readiness = r.message.readiness;
						self.render();
						frappe.show_alert({
							message: __("{0} can now open this till.", [user]),
							indicator: "green",
						});
					});
			}
		);
	};

	TillSettingsPage.prototype.open_form = function (doctype, filters) {
		frappe.db.get_value(doctype, filters, "name").then(function (r) {
			var name = r && r.message && r.message.name;
			if (name) frappe.set_route("Form", doctype, name);
			else frappe.set_route("List", doctype);
		});
	};

	// The till to show: the one in the address, else the last one used, else the only one there is
	TillSettingsPage.prototype.show = function () {
		var self = this;
		// Sent here by the original lists and forms to make a till (frappe.route_options.new_till)
		if (frappe.route_options && frappe.route_options.new_till) {
			delete frappe.route_options.new_till;
			setTimeout(function () {
				self.new_till();
			}, 0);
		}
		var route = frappe.get_route();
		var asked = (route && route[1] && decodeURIComponent(route[1])) || "";
		if (asked) return asked === this.profile ? Promise.resolve() : this.choose(asked);
		// Back on the page with a till already open: its draft stays as it was
		if (this.profile) return Promise.resolve();
		try {
			asked = window.localStorage.getItem(LAST_TILL) || "";
		} catch (error) {
			asked = "";
		}
		if (asked) return this.choose(asked, true);
		return this.open_the_first();
	};

	// No till asked for, none remembered (or the remembered one is gone): the first in use, else the first there is; with none at all, the
	// way to make one
	TillSettingsPage.prototype.open_the_first = function () {
		var self = this;
		return frappe.db
			.get_list("POS Profile", {
				fields: ["name"],
				order_by: "disabled asc, name asc",
				limit: 1,
			})
			.then(function (rows) {
				if (rows && rows.length) return self.go(rows[0].name);
				self.render_empty();
			});
	};

	TillSettingsPage.prototype.choose = function (profile, quiet) {
		var self = this;
		if (!quiet && this.profile && this.profile !== profile && this.is_dirty()) {
			frappe.confirm(
				__("You have changes that are not saved. Leave them?"),
				function () {
					self.go(profile);
				},
				function () {
					// Stay: the address goes back to the till that is open
					if (frappe.get_route()[1] !== self.profile)
						frappe.set_route("till-settings", self.profile);
				}
			);
			return Promise.resolve();
		}
		return this.go(profile);
	};

	TillSettingsPage.prototype.go = function (profile) {
		this.profile = profile;
		try {
			window.localStorage.setItem(LAST_TILL, profile);
		} catch (error) {
			// A browser that keeps nothing: the till is asked again next time
		}
		// The address says which till is open (a link can be copied, the back button comes back to the one before)
		var route = frappe.get_route();
		if (!route || decodeURIComponent(route[1] || "") !== profile)
			frappe.set_route("till-settings", profile);
		return this.load(profile);
	};

	TillSettingsPage.prototype.load = function (profile) {
		var self = this;
		if (!profile) return Promise.resolve();
		this.profile = profile;
		this.render_message(__("Loading settings..."));
		return frappe
			.call({ method: API + "get_desk_settings", args: { pos_profile: profile } })
			.then(function (r) {
				self.forgot_a_till = false;
				self.take(r.message);
				var tabs = (self.screen.tabs || []).map(function (tab) {
					return tab.key;
				});
				if (tabs.indexOf(self.active_tab) < 0) self.active_tab = tabs[0] || "";
				self.render();
			})
			.catch(function () {
				self.screen = null;
				// A till that is gone (deleted from elsewhere) or no longer ours to open: forget it once and open another
				if (!self.forgot_a_till) {
					self.forgot_a_till = true;
					try {
						window.localStorage.removeItem(LAST_TILL);
					} catch (error) {
						// A browser that keeps nothing
					}
					self.profile = "";
					return self.open_the_first();
				}
				self.render_message(__("Failed to load settings"));
			});
	};

	TillSettingsPage.prototype.take = function (answer) {
		this.screen = answer;
		// A person who may not make a till is not offered the button
		if (this.page.btn_secondary)
			this.page.btn_secondary.toggle(Boolean(answer.can && answer.can.create));
		this.by_key = {};
		(answer.settings || []).forEach(
			function (setting) {
				this.by_key[setting.key] = setting;
			}.bind(this)
		);
		this.read = clone(answer.values || {});
		// The lines of a table as the controls give them back (a tick as 0 or 1, an empty link as null, an hour as HH:MM): a page
		// nobody touched has nothing to save
		(answer.settings || []).forEach(
			function (setting) {
				if (setting.widget === "table" || setting.key === "opening_hours") {
					this.read[setting.key] = this.read_rows(setting, this.read[setting.key]);
				}
			}.bind(this)
		);
		this.draft = clone(this.read);
	};

	TillSettingsPage.prototype.render_message = function (text) {
		this.controls = {};
		this.$root.html('<div class="tsp-empty">' + esc(text) + "</div>");
	};

	// ---------------------------------------------------------------------------------------------- drawing
	TillSettingsPage.prototype.render = function () {
		var screen = this.screen;
		if (!screen) return;
		var self = this;
		this.controls = {};
		var role = screen.can.till ? __("Till manager") : __("Restaurant manager");
		var subtitle = screen.restaurant_name
			? screen.pos_profile + " · " + screen.restaurant_name
			: screen.pos_profile;
		var html =
			'<div class="tsp-sub"><b>' +
			esc(subtitle) +
			"</b><span>" +
			esc(role) +
			"</span>" +
			'<span class="tsp-dirty" style="display:none">' +
			esc(__("Not Saved")) +
			"</span></div>";
		html += this.tills_html(screen);
		html += this.readiness_html(screen);
		html +=
			'<div class="tsp-body"><nav class="tsp-rail" role="tablist" aria-label="' +
			esc(__("Tabs of the settings")) +
			'">';
		railSections(screen).forEach(function (section) {
			html += '<div class="tsp-section">' + esc(section_label(section.key)) + "</div>";
			section.tabs.forEach(function (tab) {
				html +=
					'<button type="button" role="tab" class="tsp-tab' +
					(tab.key === self.active_tab ? " on" : "") +
					'" data-tab="' +
					esc(tab.key) +
					'" aria-selected="' +
					(tab.key === self.active_tab) +
					'">' +
					esc(tab.label) +
					"</button>";
			});
		});
		html +=
			'</nav><div class="tsp-panel" data-panel="' + esc(this.active_tab) + '"></div></div>';
		html += '<div class="tsp-foot"></div>';
		this.$root.html(html);

		var $panel = this.$root.find(".tsp-panel");
		var columns = columnsOf(screen, this.active_tab);
		// As many columns as the room allows (the desk's side menu and this page's rail take their share), at most those of the tab
		$panel.css(
			"grid-template-columns",
			COLUMN_TEMPLATES[this.active_tab] || "repeat(auto-fit,minmax(270px,1fr))"
		);
		columns.forEach(function (groups) {
			var $column = $('<div class="tsp-column" style="min-width:0"></div>').appendTo($panel);
			groups.forEach(function (group) {
				self.render_group($column, group);
			});
		});
		this.render_foot();
		this.refresh_greying();
		this.show_state();
	};

	// The tills the user may open, side by side: the open one inked, a switched-off one pale. Nothing when there is only one.
	TillSettingsPage.prototype.tills_html = function (screen) {
		var tills = screen.tills || [];
		if (tills.length < 2) return "";
		return (
			'<div class="tsp-tills" role="tablist" aria-label="' +
			esc(__("Tills")) +
			'">' +
			tills
				.map(function (till) {
					return (
						'<button type="button" role="tab" class="tsp-till' +
						(till.name === screen.pos_profile ? " on" : "") +
						(till.disabled ? " off" : "") +
						'" data-till="' +
						esc(till.name) +
						'" aria-selected="' +
						(till.name === screen.pos_profile) +
						'">' +
						esc(till.name) +
						(till.disabled ? " <small>" + esc(__("switched off")) + "</small>" : "") +
						"</button>"
					);
				})
				.join("") +
			"</div>"
		);
	};

	// What the till needs to open: one chip each, green when it is there, amber when not; a click opens the tab that sets it
	TillSettingsPage.prototype.readiness_html = function (screen) {
		var checks = screen.readiness || [];
		if (!checks.length) return "";
		return (
			'<div class="tsp-ready" aria-label="' +
			esc(__("What this till needs to open")) +
			'">' +
			checks
				.map(function (check) {
					return (
						'<button type="button" class="tsp-chip ' +
						(check.ok ? "ok" : "todo") +
						'" data-tab="' +
						esc(check.tab) +
						'">' +
						(check.ok ? "✓ " : "! ") +
						esc(check.label) +
						"</button>"
					);
				})
				.join("") +
			"</div>"
		);
	};

	// Who can do what at the till, under the table of its users: the roles of the till each holds, or why they cannot open it
	TillSettingsPage.prototype.people_html = function () {
		var people = (this.screen && this.screen.people) || [];
		if (!people.length) return "";
		var can_give = Boolean(this.screen.can && this.screen.can.till);
		var lines = people.map(function (person) {
			var who = "<b>" + esc(person.full_name) + "</b> · ";
			if (person.can_open)
				return (
					'<div class="good">' + who + esc(person.roles.map(__).join(", ")) + "</div>"
				);
			var why = !person.enabled
				? __("is disabled: cannot open the till")
				: person.desk_account === false
				? __("is a website account: cannot open the till")
				: __(
						"has no role of the till: cannot open it (it needs the role POSNext Cashier)"
				  );
			// A person who only lacks the role gets it from here (written with the clicker's own rights)
			var give =
				person.enabled && person.desk_account !== false && can_give
					? ' <button type="button" class="tsp-give btn btn-xs btn-default" data-give-role="' +
					  esc(person.user) +
					  '">' +
					  esc(__("Give the cashier role")) +
					  "</button>"
					: "";
			return '<div class="bad">' + who + esc(why) + give + "</div>";
		});
		return '<div class="tsp-people">' + lines.join("") + "</div>";
	};

	TillSettingsPage.prototype.render_group = function ($column, group) {
		var badge = badge_of(this.screen, group);
		var carries = title_carries_help(group);
		var $group = $(
			'<section class="tsp-group" data-group="' + esc(group.key) + '"></section>'
		).appendTo($column);
		var title = "<h3>" + esc(group.label);
		if (carries)
			title +=
				' <button type="button" class="tsp-bulb" title="' +
				esc(group.settings[0].help) +
				'" aria-label="' +
				esc(__("Help")) +
				'">' +
				BULB +
				"</button>";
		if (badge)
			title += ' <span class="tsp-badge ' + badge[1] + '">' + esc(badge[0]) + "</span>";
		$group.append(title + "</h3>");
		if (carries)
			$group.append(
				'<p class="tsp-help" style="display:none">' + esc(group.settings[0].help) + "</p>"
			);
		group.settings.forEach(
			function (setting) {
				this.render_setting($group, setting);
			}.bind(this)
		);
	};

	TillSettingsPage.prototype.render_setting = function ($group, setting) {
		var is_check = setting.widget === "check";
		var carries_help = this.group_carries(setting);
		var $setting = $(
			'<div class="tsp-setting' +
				(setting.indent ? " indent" : "") +
				'" data-setting="' +
				esc(setting.key) +
				'" data-greyed="false" data-locked="' +
				(setting.editable ? "false" : "true") +
				'"></div>'
		).appendTo($group);
		var bulb =
			setting.help && !carries_help
				? '<button type="button" class="tsp-bulb" title="' +
				  esc(setting.help) +
				  '" aria-label="' +
				  esc(__("Help")) +
				  '">' +
				  BULB +
				  "</button>"
				: "";
		var $control;
		if (is_check) {
			var $row = $('<div class="tsp-row"></div>').appendTo($setting);
			$control = $('<div class="tsp-control"></div>').appendTo($row);
			$row.append(bulb);
		} else {
			$setting.append(
				'<div class="tsp-label"><label>' +
					esc(setting.label) +
					"</label>" +
					bulb +
					"</div>"
			);
			$control = $('<div class="tsp-control"></div>').appendTo($setting);
		}
		this.make_control(setting, $control);
		if (setting.key === "applicable_for_users") $setting.append(this.people_html());
		if (setting.help && !carries_help)
			$setting.append(
				'<p class="tsp-help" style="display:none">' + esc(setting.help) + "</p>"
			);
		if (!setting.editable) {
			$setting.append('<p class="tsp-lock">' + esc(this.lock_text(setting)) + "</p>");
		}
	};

	// A group of one setting whose title is the setting's: the group's own bulb carries the help
	TillSettingsPage.prototype.group_carries = function (setting) {
		var group = this.screen.groups.filter(function (candidate) {
			return candidate.key === setting.group;
		})[0];
		if (!group) return false;
		var settings = this.screen.settings.filter(function (candidate) {
			return candidate.group === group.key;
		});
		return title_carries_help(Object.assign({}, group, { settings: settings }));
	};

	TillSettingsPage.prototype.lock_text = function (setting) {
		if (setting.key === "pos_profile") {
			return __("The name of a till is changed on its POS Profile.");
		}
		if (setting.key === "allow_negative_stock") {
			return __(
				"This changes the stock settings of the whole site: it is the administrator's."
			);
		}
		if (setting.desk_only) {
			return __(
				"You can read this setting. Changing it needs the right to change {0} in the ERP.",
				[__(setting.doctype)]
			);
		}
		return __("You can read this setting. Changing it is the till manager's.");
	};

	TillSettingsPage.prototype.render_foot = function () {
		var left_out = this.screen.left_out || {};
		var lines = [];
		if (left_out.restaurant) {
			lines.push(
				__("{0} settings of a restaurant till are not shown: this till is a shop till.", [
					left_out.restaurant,
				])
			);
		}
		if (left_out.shop) {
			lines.push(
				__("{0} settings of a shop till are not shown: this till is a restaurant till.", [
					left_out.shop,
				])
			);
		}
		lines.push(
			__(
				"What this computer keeps (printer, sounds, QZ Tray) is set on the till's own screen."
			)
		);
		this.$root.find(".tsp-foot").html(
			lines
				.map(function (line) {
					return '<p class="tsp-note">' + esc(line) + "</p>";
				})
				.join("")
		);
	};

	// ---------------------------------------------------------------------------------------------- controls
	// The links the office's settings point at, kept to the till's company
	TillSettingsPage.prototype.query_of = function (setting) {
		var self = this;
		var company = function () {
			return self.draft.company || self.screen.company;
		};
		var by_company = ["taxes_and_charges", "default_loyalty_program"];
		var accounts = [
			"write_off_account",
			"account_for_change_amount",
			"income_account",
			"expense_account",
			"wallet_account",
		];
		var centres = ["write_off_cost_center", "cost_center"];
		if (setting.key === "company_address") {
			return function () {
				return {
					query: "frappe.contacts.doctype.address.address.address_query",
					filters: { link_doctype: "Company", link_name: company() },
				};
			};
		}
		if (accounts.indexOf(setting.key) >= 0 || centres.indexOf(setting.key) >= 0) {
			return function () {
				return { filters: { company: company(), is_group: 0 } };
			};
		}
		if (by_company.indexOf(setting.key) >= 0) {
			return function () {
				return { filters: { company: company() } };
			};
		}
		return null;
	};

	TillSettingsPage.prototype.column_df = function (setting, column) {
		var df = {
			fieldname: column.fieldname,
			fieldtype: column.fieldtype,
			label: column.label,
			options: column.options || undefined,
			reqd: column.reqd ? 1 : 0,
			in_list_view: 1,
			columns: column.fieldtype === "Check" ? 1 : 2,
		};
		if (setting.key === "opening_hours" && column.fieldname === "restaurant_card") {
			df.get_query = function () {
				return { filters: { is_active: 1, is_permanent: 0 } };
			};
		}
		return df;
	};

	TillSettingsPage.prototype.df_of = function (setting) {
		var choices = (this.screen.choices && this.screen.choices[setting.key]) || [];
		var df = {
			fieldname: setting.key,
			label: setting.label,
			read_only: setting.editable ? 0 : 1,
			reqd: setting.required ? 1 : 0,
			placeholder: setting.placeholder || undefined,
		};
		var as_options = function (list) {
			return list.map(function (option) {
				return { value: option.value, label: option.label };
			});
		};
		switch (setting.widget) {
			case "check":
				df.fieldtype = "Check";
				break;
			case "int":
				df.fieldtype = "Int";
				break;
			case "duration":
				df.fieldtype = "Duration";
				df.hide_days = 1;
				df.hide_seconds = 1;
				break;
			case "float":
				df.fieldtype = "Float";
				break;
			case "percent":
				df.fieldtype = "Percent";
				break;
			case "time":
				df.fieldtype = "Time";
				break;
			case "select":
			case "segmented":
				df.fieldtype = "Select";
				df.options = as_options(setting.options || []);
				break;
			case "link":
				if (setting.search || setting.link_doctype) {
					df.fieldtype = "Link";
					df.options = setting.search || setting.link_doctype;
					var query = this.query_of(setting);
					if (query) df.get_query = query;
				} else {
					// A short list worked out for this till: a choice, the empty one first
					df.fieldtype = "Select";
					df.options = [{ value: "", label: "" }].concat(as_options(choices));
				}
				break;
			case "multiselect":
				df.fieldtype = "MultiCheck";
				df.select_all = 1;
				df.columns = 1;
				df.options = choices.map(function (choice) {
					return { value: choice.value, label: choice.label, checked: 0 };
				});
				break;
			case "table":
			case "special":
				df.fieldtype = "Table";
				df.cannot_add_rows = 0;
				df.fields = (setting.columns || []).map(this.column_df.bind(this, setting));
				break;
			case "email":
				df.fieldtype = "Data";
				df.options = "Email";
				break;
			default:
				df.fieldtype = "Small Text";
		}
		return df;
	};

	// A server value as the control takes it: times with their seconds, a multiple choice as its checked options
	TillSettingsPage.prototype.control_value = function (setting, value) {
		if (setting.widget === "time") return value ? value + ":00" : "";
		if (setting.key === "opening_hours" || setting.widget === "table") {
			var times = (setting.columns || []).filter(function (column) {
				return column.fieldtype === "Time";
			});
			return (value || []).map(function (row) {
				var copy = Object.assign({}, row);
				times.forEach(function (column) {
					if (copy[column.fieldname])
						copy[column.fieldname] =
							String(copy[column.fieldname]).slice(0, 5) + ":00";
				});
				return copy;
			});
		}
		return value;
	};

	TillSettingsPage.prototype.make_control = function (setting, $parent) {
		var df = this.df_of(setting);
		var value = this.draft[setting.key];
		if (df.fieldtype === "Table") df.data = this.control_value(setting, value);
		if (df.fieldtype === "MultiCheck") {
			var chosen = Array.isArray(value) ? value : [];
			df.options.forEach(function (option) {
				option.checked = chosen.indexOf(option.value) >= 0 ? 1 : 0;
			});
		}
		var control = frappe.ui.form.make_control({ df: df, parent: $parent, render_input: true });
		if (df.fieldtype !== "Table" && df.fieldtype !== "MultiCheck") {
			var shown = this.control_value(setting, value);
			if (setting.placeholder && (shown === 0 || shown === null || shown === "")) shown = "";
			control.set_input(shown === null || shown === undefined ? "" : shown);
		}
		if (control.refresh) control.refresh();
		this.controls[setting.key] = control;
		return control;
	};

	// A control's value as the page keeps it, shaped as the server sends it
	TillSettingsPage.prototype.read_control = function (setting, control) {
		var value = control.get_value ? control.get_value() : null;
		var empty = value === null || value === undefined || value === "";
		switch (setting.widget) {
			case "check":
				return cint(value);
			case "int":
			case "duration":
				return empty ? 0 : cint(value);
			case "float":
			case "percent":
				return empty ? 0 : flt(value);
			case "time":
				return empty ? "" : String(value).slice(0, 5);
			case "multiselect":
				return this.in_read_order(setting.key, Array.isArray(value) ? value : []);
			case "table":
			case "special":
				return this.read_rows(setting, value);
			default:
				return empty ? "" : String(value);
		}
	};

	// A multiple choice lists its options in their own order, whatever order the document keeps them in: the values already
	// chosen come first, in the order the page read them, then the new ones
	TillSettingsPage.prototype.in_read_order = function (key, chosen) {
		var before = Array.isArray(this.read[key]) ? this.read[key] : [];
		return before
			.filter(function (value) {
				return chosen.indexOf(value) >= 0;
			})
			.concat(
				chosen.filter(function (value) {
					return before.indexOf(value) < 0;
				})
			);
	};

	// The rows of a table as the server takes them: the value columns only, a time as HH:MM, a tick as 0 or 1
	TillSettingsPage.prototype.read_rows = function (setting, rows) {
		var columns = setting.columns || [];
		return (rows || []).map(function (row) {
			var out = {};
			columns.forEach(function (column) {
				var value = row[column.fieldname];
				if (column.fieldtype === "Check") value = cint(value);
				else if (column.fieldtype === "Time")
					value = value ? String(value).slice(0, 5) : "";
				else if (column.fieldtype === "Link" && !value) value = null;
				else if (value === null || value === undefined) value = "";
				out[column.fieldname] = value;
			});
			return out;
		});
	};

	// What the visible controls hold goes into the draft
	TillSettingsPage.prototype.sync = function () {
		var self = this;
		Object.keys(this.controls).forEach(function (key) {
			var setting = self.by_key[key];
			if (!setting || !setting.editable) return;
			self.draft[key] = self.read_control(setting, self.controls[key]);
		});
	};

	TillSettingsPage.prototype.on_change = function () {
		this.sync();
		var self = this;
		var unticked = untickExcluded(this.screen.settings, this.draft);
		unticked.forEach(function (key) {
			if (self.controls[key]) self.controls[key].set_input(0);
		});
		this.refresh_greying();
		this.show_state();
	};

	// Greyed while a setting it depends on is off, or while the site does not allow what it is about
	TillSettingsPage.prototype.refresh_greying = function () {
		var self = this;
		Object.keys(this.controls).forEach(function (key) {
			var setting = self.by_key[key];
			var greyed = Boolean(setting.greyed) || !conditionsHold(setting, self.draft);
			var closed = greyed || !setting.editable;
			var control = self.controls[key];
			self.$root
				.find('[data-setting="' + key + '"]')
				.attr("data-greyed", greyed ? "true" : "false");
			if (Boolean(control.df.read_only) !== closed) {
				control.df.read_only = closed ? 1 : 0;
				if (control.refresh) control.refresh();
			}
		});
	};

	TillSettingsPage.prototype.changes = function () {
		this.sync();
		return changedValues(this.screen ? this.screen.settings : [], this.read, this.draft);
	};

	TillSettingsPage.prototype.is_dirty = function () {
		return Boolean(this.screen) && Object.keys(this.changes()).length > 0;
	};

	// What is not saved is said beside the till's name (the desk's own indicator is not drawn on this page's header)
	TillSettingsPage.prototype.show_state = function () {
		this.$root.find(".tsp-dirty").toggle(this.is_dirty());
	};

	// A value out of its bounds, an unfinished time or an empty required setting is never sent: the page says which
	TillSettingsPage.prototype.problem = function (changed) {
		var self = this;
		var found = "";
		Object.keys(changed).forEach(function (key) {
			var setting = self.by_key[key];
			if (found || !setting || !conditionsHold(setting, self.draft)) return;
			var value = changed[key];
			if (["int", "float", "percent"].indexOf(setting.widget) >= 0) {
				var skipped = setting.placeholder && !value;
				if (!skipped && !withinBounds(setting, value)) found = setting.label;
			} else if (setting.widget === "time" && !isTimeOfDay(value)) {
				found = setting.label;
			} else if (setting.required && (value === "" || value === null)) {
				found = setting.label;
			}
		});
		return found;
	};

	TillSettingsPage.prototype.save = function () {
		var self = this;
		if (!this.screen) return;
		var changed = this.changes();
		if (!Object.keys(changed).length) {
			frappe.show_alert({ message: __("Nothing to change"), indicator: "blue" });
			return;
		}
		var problem = this.problem(changed);
		if (problem) {
			frappe.msgprint({
				title: __("Check this setting"),
				message: esc(problem),
				indicator: "red",
			});
			return;
		}
		frappe
			.call({
				method: API + "save_desk_settings",
				args: { pos_profile: this.profile, values: changed },
				freeze: true,
				freeze_message: __("Saving..."),
			})
			.then(function (r) {
				if (!r || !r.message) return;
				self.take(r.message);
				self.render();
				frappe.show_alert({ message: __("Settings saved"), indicator: "green" });
			});
	};

	// ------------------------------------------------------------------------------------------------ the page's door
	frappe.pos_next_till_settings = {
		isOn: isOn,
		conditionsHold: conditionsHold,
		untickExcluded: untickExcluded,
		columnsOf: columnsOf,
		changedValues: changedValues,
		isTimeOfDay: isTimeOfDay,
		withinBounds: withinBounds,
		railSections: railSections,
	};

	frappe.pages["till-settings"].on_page_load = function (wrapper) {
		var page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Till settings"),
			single_column: true,
		});
		wrapper.till_settings = new TillSettingsPage(page);
	};

	frappe.pages["till-settings"].on_page_show = function (wrapper) {
		if (wrapper.till_settings) wrapper.till_settings.show();
	};
})();
