# //// Neoffice — added file (no upstream equivalent). One selectable modifier — "no onions", "+
# //// bacon", "25 cl" — with its price adjustment. A restaurant sells the same Item in variants that
# //// are not ERPNext Item Variants; one Item per combination is unusable at the till (4df0caf1,
# //// 2026-03-21 "Phase 4A - structured item modifiers with groups, options, and price adjustments";
# //// renamed Item Modifier Option → Product Option by a1da8cc0, 2026-03-23).
from frappe.model.document import Document

class ProductOption(Document):
	pass
