//// Neoffice — added file (no upstream equivalent). The service rhythm of a restaurant on the screens' side (NeoResto lot 1, Daniel, 01.11: « Oui, les deux modes »).
////
//// A restaurant chooses in its settings how the courses of a meal reach the kitchen (the Select `service_rhythm` of the Restaurant, pos_next/restaurant/service_families.py):
//// - "Called by the room" (the default): at « Valider » the drinks and the first course leave, the later courses are held back until the waiter orders them;
//// - "Prepared ahead": everything leaves at « Valider », the later courses reach the kitchen marked as ahead, and the waiter's call only tells the kitchen to serve them now.
//// The words are the stored values, in English; the screens say them in French through the catalogue. Anything that is not exactly "Prepared ahead" reads as the room's call.

export const CALLED_BY_THE_ROOM = "Called by the room"
export const PREPARED_AHEAD = "Prepared ahead"

/**
 * The rhythm a stored value means: "Prepared ahead" only when it says so exactly, the room's call for anything else (no value, an answer from a server that does not know the setting yet).
 *
 * @param {*} value
 * @returns {"Called by the room"|"Prepared ahead"}
 */
export function rhythmOf(value) {
	return value === PREPARED_AHEAD ? PREPARED_AHEAD : CALLED_BY_THE_ROOM
}

/** Whether a rhythm is the kitchen's preparing ahead. */
export function isPreparedAhead(value) {
	return rhythmOf(value) === PREPARED_AHEAD
}

/** The key under which a kitchen screen hands its restaurant's rhythm (a ref) down to the tickets it draws (provide / inject), as it hands them the size of the text. */
export const SERVICE_RHYTHM_KEY = "pos-next-service-rhythm"
