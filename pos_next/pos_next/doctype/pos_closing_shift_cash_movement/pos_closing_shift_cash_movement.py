# //// Neoffice — added file (no upstream equivalent). The drawer movements of a shift (« Entrées/Sorties de
# //// caisse », pos_next.cash_movement), stored on its POS Closing Shift as the ledger had them when the shift
# //// was closed, and printed on the end-of-day report (NeoRestau lot 1, task 15). Upstream stores its POS
# //// expenses the same way (POS Closing Shift Expense); our movements go in and out.
from frappe.model.document import Document


class POSClosingShiftCashMovement(Document):
	pass
