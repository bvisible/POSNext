/**
 //// rebrand: rename POS Next to Neopos — 771950b
 * Currency Utility for Neopos
 * Handles formatting and rounding with ERPNext System Settings compatibility
 *
 * Rounding Methods (matches frappe/utils/data.py):
 * - Banker's Rounding: Rounds .5 to nearest even number
 * - Commercial Rounding: Rounds .5 away from zero
 */

// =============================================================================
// Settings (initialized from bootstrap)
// =============================================================================

//// Neoffice — the till writes amounts the way the SITE writes them (System Settings › Number
//// Format, as the desk does: CHF 1'234.50 on a Swiss site), never in the user's language nor the
//// device's: upstream develop moved to Intl with the user's language, so a French user saw
//// "1 234,50" (product owner's decision, 2026-10-28). The format comes with the bootstrap
//// (initPrecision); until it is there, a Desk boot's sysdefaults, else the Swiss pattern.
export const SWISS_NUMBER_FORMAT = "#'###.##";

/** Frappe's number formats and their separators (frappe/public/js/frappe/utils/number_format.js) */
const NUMBER_FORMATS = {
	"#,###.##": { decimal: ".", group: "," },
	"#.###,##": { decimal: ",", group: "." },
	"# ###.##": { decimal: ".", group: " " },
	"# ###,##": { decimal: ",", group: " " },
	"#'###.##": { decimal: ".", group: "'" },
	"#, ###.##": { decimal: ".", group: ", " },
	"#,##,###.##": { decimal: ".", group: ",", indian: true },
	"#,###.###": { decimal: ".", group: "," },
	"#.###": { decimal: "", group: "." },
	"#,###": { decimal: "", group: "," },
};

function siteNumberFormat(format) {
	const candidate = format || globalThis.frappe?.boot?.sysdefaults?.number_format;
	return NUMBER_FORMATS[candidate] ? candidate : SWISS_NUMBER_FORMAT;
}

let settings = {
	currency: 2,
	float: 3,
	rounding_method: "Banker's Rounding",
	//// Neoffice — the site's format, see SWISS_NUMBER_FORMAT above (upstream: "#,###.##").
	number_format: siteNumberFormat(),
	//// Neoffice — added default. Upstream's precision settings stop at ERPNext's decimal
	//// places; a Swiss till also needs the currency's smallest fraction (0.05 for CHF) or
	//// the grand total cannot be paid in coins. Defaulted to 0 so a currency without one
	//// behaves exactly as upstream (4fdb5df4, 2026-04-04 "rounding total, tips visibility,
	//// cash quick amounts"); initPrecision() below fills it from the bootstrap payload.
	//// rounding total, tips visibility, cash quick amounts — 4fdb5df
	smallest_currency_fraction: 0,
};

/** Initialize settings from bootstrap data */
export function initPrecision(data) {
	if (!data) return;
	settings = {
		currency: data.currency ?? 2,
		float: data.float ?? 3,
		rounding_method: data.rounding_method || "Banker's Rounding",
		//// Neoffice — the site's format, see SWISS_NUMBER_FORMAT above (upstream: "#,###.##").
		number_format: siteNumberFormat(data.number_format),
		//// Neoffice — Swiss cash has no coin under 0.05, so a grand total of CHF 12.37 cannot be
		//// tendered. Upstream carried only ERPNext's decimal precision, so we also read the
		//// Currency doctype's smallest_currency_fraction out of the bootstrap payload and keep it
		//// in the POS precision settings — that is what lets roundTotal() below snap the total to
		//// the 0.05 step (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash quick
		//// amounts").
		smallest_currency_fraction: data.smallest_currency_fraction || 0,
	};
	_formatterCache.clear();
}

/** Get current settings */
export function getPrecision() {
	return { ...settings };
}

// =============================================================================
// Currency Symbols
// =============================================================================

export const DEFAULT_CURRENCY = "USD";
const FALLBACK_LOCALE = "en-US";

/** BCP 47 locale for a language code, with Latin digits (e.g. "ar" → "ar-EG-u-nu-latn") */
function toLocale(lang) {
	const tag = { ar: "ar-EG", en: "en-US" }[lang?.toLowerCase()] || lang;
	try {
		return tag ? Intl.getCanonicalLocales(`${tag}-u-nu-latn`)[0] : FALLBACK_LOCALE;
	} catch {
		return FALLBACK_LOCALE;
	}
}

/** User's locale from boot/session, falling back to en-US; updated by setLocale() */
export let DEFAULT_LOCALE = toLocale(
	globalThis.frappe?.boot?.lang || globalThis.localStorage?.getItem("pos_next_language")
);

/** Switch formatting to the given language code (null resets to en-US) */
export function setLocale(lang) {
	DEFAULT_LOCALE = toLocale(lang);
	_formatterCache.clear();
}

const isArabic = (locale) => locale.startsWith("ar");

const SYMBOLS = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	JPY: "¥",
	CNY: "¥",
	INR: "₹",
	EGP: "E£",
	SAR: "\u00EA",
	AED: "د.إ",
};

const _symbolCache = new Map();

function getSymbol(currency, locale = DEFAULT_LOCALE) {
	if (!currency) return SYMBOLS[DEFAULT_CURRENCY];
	if (currency === "EGP" && isArabic(locale)) return "ج.م";
	if (SYMBOLS[currency]) return SYMBOLS[currency];
	const key = `${locale}:${currency}`;
	if (_symbolCache.has(key)) return _symbolCache.get(key);

	try {
		const parts = new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
			currencyDisplay: "narrowSymbol",
		}).formatToParts(0);
		const symbol = parts.find((p) => p.type === "currency")?.value || currency;
		_symbolCache.set(key, symbol);
		return symbol;
	} catch {
		_symbolCache.set(key, currency);
		return currency;
	}
}

export { getSymbol as getCurrencySymbol };

// =============================================================================
// Number Formatting
// =============================================================================

const _formatterCache = new Map();
//// Neoffice — a deletion: upstream's getFormatter() (an Intl.NumberFormat in the user's language)
//// is gone, amounts are written by formatSiteNumber() below; _formatterCache above is kept only for
//// upstream's two clear() calls (initPrecision, setLocale).

//// Neoffice — the digits of an amount follow the site's number format (separators from
//// System Settings, decimals from its currency precision), rounded with the site's rounding
//// method (round() below, as roundCurrency() does), so the till shows what it stores.
/** Absolute value written with the site's separators, e.g. 1234567.891 → "1'234'567.89" */
function formatSiteNumber(abs, precision) {
	const { decimal, group, indian } = NUMBER_FORMATS[settings.number_format] || NUMBER_FORMATS[SWISS_NUMBER_FORMAT];
	const digits = decimal ? Math.max(0, precision ?? 2) : 0;
	const [integer, fraction] = round(abs, digits).toFixed(digits).split(".");
	const grouped = indian
		? integer.replace(/(\d)(?=(\d{2})+\d$)/g, `$1${group}`)
		: integer.replace(/\B(?=(\d{3})+(?!\d))/g, group);
	return fraction ? `${grouped}${decimal}${fraction}` : grouped;
}

/** Format value as currency string with symbol (after the amount in Arabic: "1,234.50 ج.م") */
export function formatCurrency(value, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
	if (typeof value !== "number" || Number.isNaN(value)) return "";
	const abs = Math.abs(value);
	//// Neoffice — site format (see formatSiteNumber); no minus sign on an amount that shows as 0.
	const number = formatSiteNumber(abs, settings.currency);
	const negative = value < 0 && /[1-9]/.test(number);
	// LTR isolate keeps the minus sign left of the digits in RTL text
	if (isArabic(locale)) {
		//// Neoffice — `negative` instead of `value < 0` (no "-0.00"), see above.
		return `${negative ? `\u2066-${number}\u2069` : number} ${getSymbol(currency, locale)}`;
	}
	//// Neoffice — a negative amount is written like the desk (frappe format_currency): symbol first,
	//// then the minus sign, "CHF -1'234.50" (upstream: "-CHF 1'234.50"; product owner, 2026-10-28).
	return `${getSymbol(currency, locale)} ${negative ? "-" : ""}${number}`;
}

/** Format value as number string (no symbol) */
export function formatCurrencyNumber(value, locale = DEFAULT_LOCALE) {
	//// Neoffice — site format (see formatSiteNumber), the locale argument is no longer used;
	//// a value that is not a number reads as 0 in that format, and "-0.00" is never written.
	if (typeof value !== "number" || Number.isNaN(value)) return formatSiteNumber(0, settings.currency);
	const number = formatSiteNumber(Math.abs(value), settings.currency);
	return value < 0 && /[1-9]/.test(number) ? `-${number}` : number;
}

// =============================================================================
// Date Formatting
// =============================================================================

const DATE_OPTIONS = { day: "numeric", month: "short", year: "numeric" };
const TIME_OPTIONS = { hour: "numeric", minute: "2-digit", hour12: true };

/** Parse a Date, timestamp, "YYYY-MM-DD" (local day), "HH:MM[:SS]" or Frappe datetime string */
function toDate(value) {
	const ymd = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const hms = typeof value === "string" && value.match(/^(\d{1,2}):(\d{2})/);
	const date = ymd
		? new Date(ymd[1], ymd[2] - 1, ymd[3])
		: hms
			? new Date(1970, 0, 1, hms[1], hms[2])
			: new Date(typeof value === "string" ? value.replace(" ", "T") : value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Format date with month name: "5 نوفمبر 2026" / "Nov 5, 2026" */
export function formatDate(value, locale = DEFAULT_LOCALE) {
	const date = value ? toDate(value) : null;
	return date ? date.toLocaleDateString(locale, DATE_OPTIONS) : "";
}

/** Format 12h time: "9:15 م" / "9:15 PM" */
export function formatTime(value, locale = DEFAULT_LOCALE) {
	const date = value ? toDate(value) : null;
	return date ? date.toLocaleTimeString(locale, TIME_OPTIONS) : "";
}

/** Format date and 12h time: "5 نوفمبر 2026، 9:15 م" / "Nov 5, 2026, 9:15 PM" */
export function formatDateTime(value, locale = DEFAULT_LOCALE) {
	const date = value ? toDate(value) : null;
	return date ? date.toLocaleString(locale, { ...DATE_OPTIONS, ...TIME_OPTIONS }) : "";
}

/** Get CSS class for positive/negative values */
export function getCurrencyClass(value) {
	return value < 0 ? "text-red-600" : "text-gray-900";
}

// =============================================================================
// Rounding (matches frappe/utils/data.py exactly)
// =============================================================================

/**
 * Banker's Rounding - rounds .5 to nearest even
 * Matches frappe _bankers_rounding()
 */
function bankersRound(num, precision) {
	const multiplier = 10 ** precision;
	// Round to 12 decimal places first to handle floating point errors
	let shifted = Number((num * multiplier).toFixed(12));

	if (shifted === 0) return 0;

	const floor = Math.floor(shifted);
	const decimal = shifted - floor;

	// Calculate epsilon for this number's magnitude
	const epsilon = 2 ** (Math.log2(Math.abs(shifted)) - 52);

	if (Math.abs(decimal - 0.5) < epsilon) {
		// Exactly .5 - round to even
		shifted = floor % 2 === 0 ? floor : floor + 1;
	} else {
		shifted = Math.round(shifted);
	}

	return shifted / multiplier;
}

/**
 * Commercial Rounding - .5 rounds away from zero
 * Matches frappe _round_away_from_zero()
 */
function commercialRound(num, precision) {
	if (num === 0) return 0;

	// Calculate epsilon for this number's magnitude
	const epsilon = 2 ** (Math.log2(Math.abs(num)) - 52);

	// Add epsilon in the direction of the sign, then round
	const adjusted = num + Math.sign(num) * epsilon;
	return Number(adjusted.toFixed(precision));
}

/**
 * Round using system rounding method
 * @param {number} value - Value to round
 * @param {number} precision - Decimal places
 * @returns {number} Rounded value
 */
function round(value, precision) {
	if (typeof value !== "number" || Number.isNaN(value)) return 0;

	// Use Frappe's flt() if available in browser context
	if (typeof window !== "undefined" && typeof window.flt === "function") {
		return window.flt(value, precision);
	}

	// Apply rounding based on system setting
	if (settings.rounding_method === "Commercial Rounding") {
		return commercialRound(value, precision);
	}
	return bankersRound(value, precision);
}

// =============================================================================
// Exported Rounding Functions
// =============================================================================

/** Round to 2 decimal places */
export function round2(value) {
	return round(value, 2);
}

/** Round to 3 decimal places */
export function round3(value) {
	return round(value, 3);
}

/** Round using system currency precision */
export function roundCurrency(value) {
	return round(value, settings.currency);
}

/** Round using system float precision */
export function roundFloat(value) {
	return round(value, settings.float);
}

//// Neoffice — added. Upstream rounds to the currency's decimal places and stops there,
//// which leaves a CHF total the till cannot be paid in coins. roundToFraction snaps a
//// value to an arbitrary step and roundTotal applies it to the grand total whenever the
//// company currency declares one (0.05 for CHF), falling back to plain decimal rounding
//// otherwise (4fdb5df4, 2026-04-04 "rounding total, tips visibility, cash quick amounts").
/** Round to nearest currency fraction step (e.g. 0.05 for CHF) */
export function roundToFraction(value, fraction) {
	if (!fraction || fraction <= 0) return roundCurrency(value);
	return Math.round(value / fraction) * fraction;
}

/** Round grand total using smallest currency fraction if configured */
export function roundTotal(value) {
	if (settings.smallest_currency_fraction > 0) {
		return roundToFraction(value, settings.smallest_currency_fraction);
	}
	return roundCurrency(value);
}
