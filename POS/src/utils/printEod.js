//// Neoffice — now also imports browserPrintDoc, used below for the browser-print-dialog
//// choice (5024c1cd, maintenance#1235).
import { browserPrintDoc, silentPrintDoc } from "./printInvoice";

const EOD_PRINT_FORMAT = "POS Next EOD Report";

//// Neoffice — the end-of-day report no longer always goes silently to the printer saved in
//// the settings: the cashier picks a QZ Tray printer or the browser's print dialog, or
//// prints later from the shift history (neoffice-maintenance#1235).
/** Value of the printer menu meaning "browser print dialog" (not a QZ Tray printer name). */
export const EOD_BROWSER_PRINTER = "__browser__";

const EOD_PRINTER_STORAGE_KEY = "pos_eod_printer";

export function getSavedEodPrinter() {
	try {
		return localStorage.getItem(EOD_PRINTER_STORAGE_KEY) || "";
	} catch {
		return "";
	}
}

export function saveEodPrinter(value) {
	try {
		localStorage.setItem(EOD_PRINTER_STORAGE_KEY, value || "");
	} catch {
		// localStorage can be blocked; the choice then only lasts for this dialog.
	}
}

/**
 * Print a POS Closing Shift end-of-day report.
 * @param {string} closingShiftName
 * @param {string} [printer] - a QZ Tray printer name, or EOD_BROWSER_PRINTER for the
 *   browser dialog. Empty falls back to the QZ Tray printer saved in the POS settings.
 */
export async function printEODReport(closingShiftName, printer = "") {
	if (printer === EOD_BROWSER_PRINTER) {
		await browserPrintDoc("POS Closing Shift", closingShiftName, EOD_PRINT_FORMAT);
		return;
	}
	await silentPrintDoc("POS Closing Shift", closingShiftName, EOD_PRINT_FORMAT, printer);
}
