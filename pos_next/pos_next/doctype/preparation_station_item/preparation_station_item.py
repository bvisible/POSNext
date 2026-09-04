#//// Neoffice — added file (no upstream equivalent). Child table holding a station's items with
#//// prep time, priority and workflow. The station↔item relation lives HERE and not as a custom
#//// field on Item, because a field on Item pollutes an ERPNext master on every non-restaurant
#//// client (831857f2, 2026-03-21 "move station-item relation into Preparation Station child table,
#//// add per-item KDS status").
from frappe.model.document import Document


class PreparationStationItem(Document):
	pass
