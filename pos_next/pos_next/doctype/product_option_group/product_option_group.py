#//// Neoffice — added file (no upstream equivalent). Groups the modifiers offered on a dish (single
#//// or multi choice, required, max selections) and declares the Items and Item Groups they apply
#//// to. Upstream has no notion of a modifier at all (4df0caf1, 2026-03-21 "Phase 4A - structured
#//// item modifiers"; renamed from Item Modifier Group by a1da8cc0, 2026-03-23).
from frappe.model.document import Document

class ProductOptionGroup(Document):
	pass
