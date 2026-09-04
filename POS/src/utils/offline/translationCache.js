import { db } from "./db"
import { logger } from "../logger"

/** @type {import('../logger').Logger} */
const log = logger.create("TranslationCache")

/**
 * @fileoverview Lightweight IndexedDB-backed cache for translation bundles.
 *
 * This module provides a two-tier caching strategy:
 * 1. In-memory Map for instant access (lost on page refresh)
 * 2. IndexedDB persistence for offline support (survives refresh)
 *
 * Features:
 * - De-duplicated concurrent refresh requests via pendingRefreshes Map
 * - Configurable TTL (default 24 hours) for cache invalidation
 * - Automatic locale normalization (lowercase)
 *
 * @module translationCache
 */

/** @constant {number} Cache time-to-live in milliseconds (24 hours) */
const CACHE_TTL = 24 * 60 * 60 * 1000

//// Neoffice — the build this bundle came from. A cache keyed on locale alone
//// survives a deploy, so a till kept showing the OLD dictionary for up to 24 h
//// after new translations shipped — today that meant the new "already charged
//// to the customer" warnings appearing in English on a French till. Stamping
//// the build makes a deploy invalidate the dictionary immediately.
const BUILD_STAMP =
	typeof __BUILD_VERSION__ !== "undefined" ? String(__BUILD_VERSION__) : "dev"

/** @type {Map<string, TranslationEntry>} In-memory cache for fast lookups */
const memoryCache = new Map()

/** @type {Map<string, Promise<TranslationEntry|null>>} Tracks in-flight refresh requests */
const pendingRefreshes = new Map()

/**
 * @typedef {Object} TranslationEntry
 * @property {string} locale - Normalized locale code (e.g., "en", "ar")
 * @property {Record<string, string>} messages - Key-value translation pairs
 * @property {number} timestamp - Unix timestamp when cached
 */

/**
 * Normalizes locale codes to lowercase, defaulting to "en".
 * @param {string|null|undefined} locale - Raw locale code
 * @returns {string} Normalized lowercase locale
 */
const normalizeLocale = (locale) => (locale || "en").toLowerCase()

/**
 * Persists translation entry to both memory and IndexedDB.
 * @param {string} locale - Normalized locale code
 * @param {Record<string, string>} messages - Translation key-value pairs
 * @param {number} timestamp - Cache timestamp
 * @returns {Promise<TranslationEntry|null>} Stored entry or null on failure
 * @private
 */
async function persist(locale, messages, timestamp) {
	try {
		//// Neoffice — the write side of the build stamp declared at the top of this file.
		//// Reading it is useless if nothing records it: an entry persisted without `build`
		//// can never match the current bundle, so a till would refetch its dictionary on
		//// every single call instead of once per deploy. Upstream stores locale + messages
		//// + timestamp only (91864420, 2026-08-19 "une nouvelle traduction ne doit pas
		//// attendre 24 h pour arriver en caisse").
		const entry = { locale, messages, timestamp, build: BUILD_STAMP }
		memoryCache.set(locale, entry)
		await db.translations.put(entry)
		return entry
	} catch (error) {
		log.error("Failed to cache translations:", error)
		return null
	}
}

/**
 * Reads translation entry from memory cache, falling back to IndexedDB.
 * @param {string} locale - Normalized locale code
 * @returns {Promise<TranslationEntry|null>} Cached entry or null if not found
 * @private
 */
async function read(locale) {
	const memoized = memoryCache.get(locale)
	if (memoized) {
		return memoized
	}

	try {
		const stored = await db.translations.get(locale)
		if (stored) {
			memoryCache.set(locale, stored)
		}
		return stored || null
	} catch (error) {
		log.error("Failed to get cached translations:", error)
		return null
	}
}

/**
 * Translation cache API for storing and retrieving locale bundles.
 * @namespace
 */
export const translationCache = {
	/**
	 * Stores translations for a locale in both memory and IndexedDB.
	 * @param {string} locale - Locale code (will be normalized)
	 * @param {Record<string, string>} messages - Translation key-value pairs
	 * @param {number} [timestamp=Date.now()] - Cache timestamp
	 * @returns {Promise<TranslationEntry|null>} Stored entry or null on failure
	 */
	async set(locale, messages, timestamp = Date.now()) {
		return persist(normalizeLocale(locale), messages, timestamp)
	},

	/**
	 * Retrieves cached translations for a locale.
	 * @param {string} locale - Locale code (will be normalized)
	 * @returns {Promise<TranslationEntry|null>} Cached entry or null if not found
	 */
	async get(locale) {
		return read(normalizeLocale(locale))
	},

	/**
	 * Checks if a cached entry has exceeded its TTL.
	 * @param {number|undefined} timestamp - Entry timestamp to check
	 * @param {number} [ttl=CACHE_TTL] - Time-to-live in milliseconds
	 * @returns {boolean} True if stale or missing timestamp
	 */
	isStale(timestamp, ttl = CACHE_TTL, build = null) {
		//// Neoffice — a dictionary that does not carry THIS build's stamp is
		//// stale whatever its age. Note "does not carry", not "carries a
		//// different one": entries written before this stamp existed have none
		//// at all, and treating those as fresh would have kept the very tills
		//// we are fixing on the old dictionary. Costs one refetch per deploy.
		if (build !== BUILD_STAMP) return true
		return !timestamp || Date.now() - timestamp > ttl
	},

	/**
	 * Gets translations, refreshing from network if stale.
	 * De-duplicates concurrent refresh requests for the same locale.
	 *
	 * @param {string} locale - Locale code (will be normalized)
	 * @param {() => Promise<Record<string, string>|null>} fetcher - Async function to fetch fresh translations
	 * @param {Object} [options={}] - Refresh options
	 * @param {boolean} [options.force=false] - Force network refresh regardless of TTL
	 * @param {number} [options.ttl=CACHE_TTL] - Custom TTL for staleness check
	 * @returns {Promise<TranslationEntry|null>} Fresh or cached entry
	 *
	 * @example
	 * const entry = await translationCache.getFresh('ar', () => fetchFromAPI())
	 */
	async getFresh(locale, fetcher, options = {}) {
		const { force = false, ttl = CACHE_TTL } = options
		const normalized = normalizeLocale(locale)
		const cached = await read(normalized)

		//// Neoffice — pass the cached entry's stamp to isStale, which upstream calls with
		//// (timestamp, ttl) only. Without the third argument the staleness test falls back to
		//// age alone and the whole build-stamp mechanism is dead code — that is exactly the
		//// bug 35e5b084 had to fix on the sibling call path in translation.ts, found by
		//// checking on osiris that the new warnings still came out in English on a French
		//// till (91864420, 2026-08-19).
		if (!force && cached && !this.isStale(cached.timestamp, ttl, cached.build)) {
			return cached
		}

		if (!fetcher) return cached

		// Return existing in-flight request to avoid duplicate fetches
		const inflight = pendingRefreshes.get(normalized)
		if (inflight) return inflight

		const promise = (async () => {
			try {
				const messages = await fetcher()
				if (messages) return await persist(normalized, messages, Date.now())
			} catch (error) {
				log.error(`Failed to refresh translations for ${normalized}:`, error)
			}
			return cached
		})().finally(() => pendingRefreshes.delete(normalized))

		pendingRefreshes.set(normalized, promise)
		return promise
	},

	/**
	 * Clears cached translations from both memory and IndexedDB.
	 * @param {string} [locale] - Specific locale to clear, or all if omitted
	 * @returns {Promise<boolean>} True if cleared successfully
	 */
	async clear(locale) {
		if (!locale) {
			memoryCache.clear()
			try {
				await db.translations.clear()
				return true
			} catch (error) {
				log.error("Failed to clear translation cache:", error)
				return false
			}
		}

		const normalized = normalizeLocale(locale)
		memoryCache.delete(normalized)
		try {
			await db.translations.delete(normalized)
			return true
		} catch (error) {
			//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
			log.error(
				`Failed to clear translation cache for locale ${normalized}:`,
				error,
			)
			return false
		}
	},
}
