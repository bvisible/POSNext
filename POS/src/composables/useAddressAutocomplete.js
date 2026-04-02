import { ref } from "vue"

// Swiss Federal Geoportal API — free, no auth required
const API_URL = "https://api3.geo.admin.ch/rest/services/ech/SearchServer"
const MIN_CHARS = 3
const DEBOUNCE_MS = 300
const MAX_RESULTS = 10

const CANTON_MAP = {
	ag: "Aargau",
	ai: "Appenzell Innerrhoden",
	ar: "Appenzell Ausserrhoden",
	be: "Bern",
	bl: "Basel-Landschaft",
	bs: "Basel-Stadt",
	fr: "Fribourg",
	ge: "Genève",
	gl: "Glarus",
	gr: "Graubünden",
	ju: "Jura",
	lu: "Luzern",
	ne: "Neuchâtel",
	nw: "Nidwalden",
	ow: "Obwalden",
	sg: "St. Gallen",
	sh: "Schaffhausen",
	so: "Solothurn",
	sz: "Schwyz",
	tg: "Thurgau",
	ti: "Ticino",
	ur: "Uri",
	vd: "Vaud",
	vs: "Valais",
	zg: "Zug",
	zh: "Zürich",
}

const FRENCH_LOWER_WORDS = [
	"de", "du", "la", "le", "les", "des", "au", "aux", "en", "sur", "sous", "et",
]

function smartCapitalize(str, isFirstWord = false) {
	if (!str) return str
	if (str.includes("-")) {
		return str
			.split("-")
			.map((part, idx) => {
				if (idx === 0) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
				if (FRENCH_LOWER_WORDS.includes(part.toLowerCase())) return part.toLowerCase()
				return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
			})
			.join("-")
	}
	if (!isFirstWord && FRENCH_LOWER_WORDS.includes(str.toLowerCase())) return str.toLowerCase()
	return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

function capitalizeWords(str) {
	return str
		.split(" ")
		.map((word, idx) => smartCapitalize(word, idx === 0))
		.join(" ")
}

function parseGeoAdminResult(attrs) {
	const detail = attrs.detail
	const label = attrs.label || ""
	const parts = detail.split(" ")

	// Extract location name from label for underscore/place results
	let labelLocation = ""
	const isPlaceResult = label.includes("<i>Lieu</i>")
	if (detail.includes("_") && label.includes("<b>")) {
		const match = label.match(/<b>([^<]+)<\/b>/)
		if (match) labelLocation = match[1]
	}

	let postalCode = ""
	let city = ""
	const streetParts = []
	let cantonCode = ""
	let foundPostal = false

	const chIndex = parts.indexOf("ch")
	if (chIndex !== -1 && chIndex < parts.length - 1) {
		cantonCode = parts[chIndex + 1].toLowerCase()
	}

	for (let i = 0; i < parts.length; i++) {
		if (/^\d{4}$/.test(parts[i]) && !foundPostal) {
			postalCode = parts[i]
			const cityParts = []
			for (let j = i + 1; j < parts.length; j++) {
				if (/^\d+$/.test(parts[j]) || parts[j] === "ch") break
				cityParts.push(parts[j])
			}
			city = cityParts.join(" ")
			foundPostal = true
		} else if (!foundPostal) {
			streetParts.push(parts[i])
		}
	}

	let street = capitalizeWords(streetParts.join(" "))
	if (isPlaceResult && labelLocation) {
		city = labelLocation
		street = ""
	} else {
		city = labelLocation || capitalizeWords(city)
	}

	return {
		address_line1: street,
		pincode: postalCode,
		city,
		state: CANTON_MAP[cantonCode] || "",
		country: "Switzerland",
	}
}

/**
 * Composable for Swiss address autocomplete using GeoAdmin API.
 * Returns suggestions array, search/select functions, and loading state.
 */
export function useAddressAutocomplete() {
	const suggestions = ref([])
	const isLoading = ref(false)
	let debounceTimer = null

	async function fetchSuggestions(query) {
		if (!query || query.length < MIN_CHARS) {
			suggestions.value = []
			return
		}

		isLoading.value = true
		try {
			const url = `${API_URL}?sr=2056&searchText=${encodeURIComponent(query)}&lang=fr&type=locations`
			const response = await fetch(url)
			const data = await response.json()

			if (data.results?.length > 0) {
				suggestions.value = data.results.slice(0, MAX_RESULTS).map((r) => ({
					label: r.attrs.label,
					parsed: parseGeoAdminResult(r.attrs),
				}))
			} else {
				suggestions.value = []
			}
		} catch (err) {
			console.error("GeoAdmin API error:", err)
			suggestions.value = []
		} finally {
			isLoading.value = false
		}
	}

	function search(query) {
		clearTimeout(debounceTimer)
		debounceTimer = setTimeout(() => fetchSuggestions(query), DEBOUNCE_MS)
	}

	function clear() {
		clearTimeout(debounceTimer)
		suggestions.value = []
	}

	return { suggestions, isLoading, search, clear }
}
