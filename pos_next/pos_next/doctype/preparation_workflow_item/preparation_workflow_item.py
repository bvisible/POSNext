# //// Neoffice — added file (no upstream equivalent). Child table listing the products a workflow
# //// applies to: a product-level workflow wins over the station's and over the default, so a dish
# //// needing a different pass can have one (b07723a8, 2026-03-24 "Runner toggle, workflow per
# //// product, edit station improvements").
from frappe.model.document import Document


class PreparationWorkflowItem(Document):
	pass
