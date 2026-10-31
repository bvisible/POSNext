# Copyright (c) 2026, BrainWise and contributors
# For license information, please see license.txt


# //// Neoffice — `cash_movement` is ours: the « Void Cash Movement » action of the till's drawer movements
# //// (pos_next.api.cash_entry) registers here, where the registry loads the shipped actions.
# //// Neoffice — offered_item: « Offer an item » (NeoRestau lot 1, task 24), the opt-in PIN for the lines a cashier
# //// offers, an action of ours loaded with upstream's.
from pos_next.authorization.actions import cash_movement, offered_item, pos_expense, sales_invoice
