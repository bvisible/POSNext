/**
 //// rebrand: rename POS Next to Neopos — 771950b
 * @fileoverview Translation system for Neopos with offline support.
 *
 * This module provides:
 * - Vue plugin for global `__()` translation function
 * - IndexedDB-backed caching via translationCache
 * - Stale-while-revalidate loading strategy
 * - Reactive version counter for component re-renders
 *
 * Usage:
 * ```ts
 * // In templates (via Vue plugin)
 * {{ __('Hello') }}
 *
 * // In scripts
 * import { __ } from '@/utils/translation'
 * const msg = __('Hello')
 *
 * // With placeholders
 * __('Hello {0}', { 0: 'World' })
 * ```
 *
 * @module translation
 */
import { createResource } from "frappe-ui"
//// Neoffice — Biome/TypeScript lint only: `import { App }` became `import { type App }`,
//// an explicit type-only import. Nothing changes in the emitted code (458d81a9, 2026-03-20
//// "remove BrainWise branding, add restaurant mode, and code formatting").
//// remove BrainWise branding, add restaurant mode, and code formatting — 458d81a
import { type App, ref } from "vue"
import { call } from "./apiWrapper"
import { translationCache } from "./offline/translationCache"
import { logger } from "./logger"

const log = logger.create("Translation")

/** Translation dictionary type: source string → translated string */
type Messages = Record<string, string>

// Extend Window interface with translation globals
declare global {
	//// Neoffice — from here down, every hunk of this file that is not already marked is the
	//// "code formatting" third of 458d81a9 (2026-03-20 "remove BrainWise branding, add
	//// restaurant mode, and code formatting"): the repo-wide Biome pass re-indented this file
	//// from two spaces to tabs and reflowed its long signatures and calls. `git blame -w`
	//// ignores whitespace and therefore still credits the upstream authors for these lines —
	//// the change is ours, and it changes nothing but layout.
	interface Window {
		/** Global translation function */
		__: typeof translate
		/** Current translation dictionary */
		translatedMessages?: Messages
		/** Language switcher function */
		$changeLanguage?: typeof changeLanguage
	}
}

/**
 * Reactive counter that increments when translations change.
 * Watch this to trigger re-renders when language changes.
 * Debounced to avoid multiple remounts during stale-while-revalidate
 * (cache hit + network refresh can fire applyMessages 2-3 times rapidly).
 */
export const translationVersion = ref(0)
let _versionDebounce: ReturnType<typeof setTimeout> | null = null

/** Default locale when none is configured */
const FALLBACK_LOCALE = "en"

/** Options for locale loading behavior */
type LoadOptions = {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	/** Try cached translations first before network */
	preferCache?: boolean
	/** Force network fetch even if cache is fresh */
	forceNetwork?: boolean
}

/**
 * Vue plugin that installs translation helpers globally.
 * Adds `__` to component instances and window object.
 *
 * @param app - Vue application instance
 * @example
 * // In main.ts
 * import translationPlugin from '@/utils/translation'
 * app.use(translationPlugin)
 */
export default function translationPlugin(app: App) {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	app.config.globalProperties.__ = translate
	window.__ = translate
	window.$changeLanguage = changeLanguage
	init()
}

/**
 * Resolves a translation for the provided key.
 * Supports indexed placeholders and contextual translations.
 *
 * @param msg - Source string to translate
 * @param replace - Indexed placeholder values (e.g., {0}, {1})
 * @param ctx - Optional context for disambiguation
 * @returns Translated string, or original if no translation found
 *
 * @example
 * // Simple translation
 * __('Save')  // → "حفظ" (in Arabic)
 *
 * // With placeholders
 * __('Hello {0}', { 0: 'Ahmed' })  // → "مرحبا Ahmed"
 *
 * // With context (for same source with different meanings)
 * __('Save', null, 'button')  // Uses key "Save:button"
 */
//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
export function translate(
	msg: string,
	replace?: Record<string, string>,
	ctx?: string | null,
): string {
	const messages = window.translatedMessages || {}
	const key = ctx ? `${msg}:${ctx}` : msg
	let translated = messages[key] || messages[msg] || msg

	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	if (replace) {
		translated = translated.replace(/{(\d+)}/g, (_, n) => replace[n] ?? _)
	}

	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	return translated
}

/** Alias for translate function */
export const __ = translate

/**
 * Determines the preferred locale for the current session.
 * Priority: Frappe boot config → localStorage → fallback ("en")
 * @returns Lowercase locale code
 */
const getLocale = (): string => {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	if (typeof window === "undefined") return FALLBACK_LOCALE

	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	return (
		(window as any)?.frappe?.boot?.lang?.toLowerCase() ||
		window.localStorage?.getItem("pos_next_language")?.toLowerCase() ||
		FALLBACK_LOCALE
	)
}

/**
 * Initializes translations on app startup.
 * Uses stale-while-revalidate: shows cached immediately, refreshes in background.
 */
async function init() {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	const locale = getLocale()
	const loaded = await loadLocale(locale, { preferCache: true })
	if (!loaded) fallbackFetch(locale)
}

/**
 * Applies new translations and triggers reactivity update.
 * @param messages - New translation dictionary
 */
function applyMessages(messages: Messages) {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	window.translatedMessages = messages
	// Debounce: coalesce rapid calls (cache hit + network refresh)
	// into a single version bump to avoid multiple component remounts
	if (_versionDebounce) clearTimeout(_versionDebounce)
	_versionDebounce = setTimeout(() => {
		translationVersion.value++
		_versionDebounce = null
	}, 100)
}

/**
 * Fetches translations from Frappe API.
 * @returns Translation dictionary or null on failure
 */
async function requestTranslations() {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	const messages = await call(
		"pos_next.api.localization.get_app_translations",
		{},
	)
	return (messages as Messages) || null
}

/**
 * Loads translations for a locale using cache-first strategy.
 *
 * Flow:
 * 1. If preferCache: apply cached translations immediately (fast initial render)
 * 2. If cache is stale or forceNetwork: fetch fresh from API
 * 3. Update cache and re-apply if new translations received
 *
 * @param locale - Target locale code
 * @param options - Loading behavior options
 * @returns True if translations were successfully applied
 */
async function loadLocale(locale: string, options: LoadOptions = {}) {
	const { preferCache = false, forceNetwork = false } = options
	const target = locale || FALLBACK_LOCALE
	let appliedFromCache = false

	if (preferCache) {
		const cached = await translationCache.get(target)
		if (cached?.messages) {
			applyMessages(cached.messages)
			appliedFromCache = true

			//// Neoffice — pass the cached build stamp: without it this path
			//// short-circuits on age alone and an always-open till keeps the
			//// dictionary it was opened with, however many deploys go by.
			if (
				!translationCache.isStale(cached.timestamp, undefined, cached.build) &&
				!forceNetwork
			) {
				return true
			}
		}
	}

	const entry = await translationCache.getFresh(
		target,
		() => requestTranslations(),
		{
			force: forceNetwork,
		},
	)

	if (entry?.messages) {
		applyMessages(entry.messages)
		return true
	}

	return appliedFromCache
}

/**
 * Fallback translation loader using frappe-ui's createResource.
 * Used when direct API calls fail (e.g., CORS issues, auth problems).
 * @param locale - Locale code for logging
 */
function fallbackFetch(locale?: string) {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	createResource({
		url: "pos_next.api.localization.get_app_translations",
		method: "GET",
		cache: "translations",
		auto: true,
		transform: (messages: Messages) => applyMessages(messages),
		onError: () =>
			log.warn(`Failed to load translations for ${locale || FALLBACK_LOCALE}`),
	})
}

/**
 * Public API to switch the application language.
 * Persists to cache and triggers UI re-render.
 *
 * @param locale - Target locale code (e.g., "ar", "en")
 * @returns Promise that resolves when translations are loaded
 *
 * @example
 * await changeLanguage('ar')
 */
export async function changeLanguage(locale: string): Promise<void> {
	//// Neoffice — same Biome re-indent/reflow pass (458d81a9): layout only.
	const success = await loadLocale(locale, {
		preferCache: true,
		forceNetwork: true,
	})
	if (!success) fallbackFetch(locale)
}
