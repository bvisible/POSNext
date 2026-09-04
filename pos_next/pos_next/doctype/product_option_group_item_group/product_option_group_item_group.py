#//// Neoffice — added file (no upstream equivalent). Child table naming the Item Groups a Product
#//// Option Group applies to. It replaced the earlier apply_to_all_items flag, which forced an
#//// all-or-nothing choice — "all drinks" was not expressible (a1da8cc0, 2026-03-23 "rename Item
#//// Modifier → Product Option Group").
from frappe.model.document import Document

class ProductOptionGroupItemGroup(Document):
	pass
