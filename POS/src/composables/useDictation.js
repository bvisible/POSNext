//// Neoffice — added file (no upstream equivalent). Dictating the remark for the kitchen on the phone (NeoRestau lot 1,
//// task 27; design § G: « a remark for the kitchen (with a microphone to dictate) »). The browser's own speech
//// recognition (Web Speech API, `SpeechRecognition`, prefixed `webkitSpeechRecognition` in Chrome and Safari): offered
//// only where the browser has it, started by the waiter's press and by nothing else, stopped by a second press, cut
//// when the sheet closes. Where the browser sends the voice to be recognised is the browser's own service, and only
//// while the waiter holds the microphone open.

import { ref } from "vue"

// The Swiss forms of the till's languages; Swiss French for any other, the language of the kitchen tickets
const SWISS_FORMS = { fr: "fr-CH", de: "de-CH", it: "it-CH" }
const DEFAULT_LANGUAGE = "fr-CH"

/**
 * The language a remark is dictated in: the Swiss form of the till's language, Swiss French otherwise.
 * @param {string|null|undefined} language - The till's language ("fr", "de-CH"...)
 * @returns {string}
 */
export function dictationLanguage(language) {
	const base = String(language || "")
		.toLowerCase()
		.split(/[-_]/)[0]
	return SWISS_FORMS[base] || DEFAULT_LANGUAGE
}

// The language the page says it speaks (set by the till's language switch)
function pageLanguage() {
	return dictationLanguage(globalThis.document?.documentElement?.getAttribute("lang") || globalThis.frappe?.boot?.lang)
}

function recognitionClass() {
	return globalThis.window?.SpeechRecognition || globalThis.window?.webkitSpeechRecognition || null
}

/**
 * @param {{onText: (text: string) => void, language?: () => string}} options
 * @returns {{supported: boolean, listening: import("vue").Ref<boolean>, denied: import("vue").Ref<boolean>,
 *            toggle: Function, abort: Function}}
 */
export function useDictation({ onText, language = pageLanguage }) {
	const Recognition = recognitionClass()
	const listening = ref(false)
	const denied = ref(false)
	let recognition = null

	function start() {
		denied.value = false
		// A dictation that failed may still end later: let it go, so its end cannot stop this one
		forget()
		const current = new Recognition()
		current.lang = language()
		current.interimResults = false
		current.continuous = false
		current.maxAlternatives = 1
		// Each handler answers for its own dictation only: an earlier one is no longer heard
		current.onresult = (event) => {
			if (recognition !== current) return
			const heard = []
			for (let index = event.resultIndex || 0; index < event.results.length; index++) {
				const result = event.results[index]
				if (result.isFinal !== false && result[0]?.transcript) heard.push(result[0].transcript.trim())
			}
			const text = heard.filter(Boolean).join(" ")
			if (text) onText(text)
		}
		current.onerror = (event) => {
			if (recognition !== current) return
			if (event?.error === "not-allowed" || event?.error === "service-not-allowed") denied.value = true
			listening.value = false
		}
		current.onend = () => {
			if (recognition !== current) return
			listening.value = false
			recognition = null
		}
		recognition = current
		listening.value = true
		try {
			current.start()
		} catch {
			// The browser refused to start (one already running, a page not allowed): the microphone stays off
			recognition = null
			listening.value = false
		}
	}

	// The dictation under way is dropped: what it still hears goes nowhere
	function forget() {
		if (!recognition) return
		const previous = recognition
		recognition = null
		previous.onresult = null
		try {
			previous.abort()
		} catch {
			// Already ended
		}
	}

	// The microphone's button: open when closed, closed when open
	function toggle() {
		if (!Recognition) return
		if (listening.value && recognition) {
			recognition.stop()
			return
		}
		start()
	}

	// The sheet closes: nothing more is heard
	function abort() {
		forget()
		listening.value = false
	}

	return { supported: Boolean(Recognition), listening, denied, toggle, abort }
}
