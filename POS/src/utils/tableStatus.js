//// Neoffice — added file (no upstream equivalent). What the status of a table says about tapping it (NeoRestau lot 1, Daniel, 01.11). Tapping a table opens its order (composables/useOpenTable); a table that has been
//// paid or is being cleaned has no order to load, and the cashier decides what happens to it instead (the payment summary, the cleaning). The floor's list and the notice of a guest's order share this rule.

/** Whether tapping a table does not open its order but brings up what the cashier decides for it (it has been paid, or it is being cleaned). */
export const tableNeedsCleaning = (table) => table?.status === "Paid" || table?.status === "Cleaning"
