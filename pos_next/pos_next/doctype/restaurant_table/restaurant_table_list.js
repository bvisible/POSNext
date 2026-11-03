// //// Neoffice — added file (no upstream equivalent). The list of the tables names their rooms (neoffice-maintenance#2163,
// //// the restaurant film of 02.11.2026: the « Floor and tables » list of the restaurant's space showed raw codes). A room
// //// and a table are named by a hash since NeoResto lot 1; the desk shows a room's label for its link only once it holds
// //// that label in its cache of link titles, which the report view does not fill on its own (its collection of the
// //// links to look up stays empty), so the « Area » column read the room's hash on a desk that had not met the room
// //// before. The rooms are few: their labels are read once as the list opens, then the list draws again.
// //// The ID column too (#2163): the report view ignores « hide_name_column », which only the list view reads, so a table
// //// named by a hash showed that hash as its ID, beside its own « Table name ». The report view's columns are built again
// //// without the name, as the list view draws its rows (see hideTheNameColumn).
frappe.listview_settings["Restaurant Table"] = {
	// The list view: the table's label is its title, its hash name says nothing to a restaurant
	hide_name_column: true,

	onload(listview) {
		hideTheNameColumn(listview);
		frappe.db
			.get_list("Restaurant Area", { fields: ["name", "area_name"], limit: 500 })
			.then((rooms) => {
				let learnt = false;
				for (const room of rooms || []) {
					if (
						!room.area_name ||
						frappe.utils.get_link_title("Restaurant Area", room.name) ===
							room.area_name
					) {
						continue;
					}
					frappe.utils.add_link_title("Restaurant Area", room.name, room.area_name);
					learnt = true;
				}
				if (learnt) listview.refresh();
			})
			.catch(() => {
				// A reader who may not list the rooms keeps their names, as before
			});
	},
};

// The report view builds its columns in `setup_columns`, which its callers read on the next line: the name column is taken out
// of what it built. A view that has no `setup_columns` (the list view) is left alone: it hides the name column itself.
function hideTheNameColumn(listview) {
	if (typeof listview.setup_columns !== "function") return;
	const setupColumns = listview.setup_columns.bind(listview);
	listview.setup_columns = function () {
		setupColumns();
		this.columns = (this.columns || []).filter((column) => column.id !== "name");
	};
	// The columns already drawn were built with the name: build them again, and draw
	if (listview.datatable) {
		listview.setup_columns();
		listview.refresh();
	}
}
