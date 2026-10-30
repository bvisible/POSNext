//// Neoffice — added file (no upstream equivalent). How a card of the restaurant is named on a screen (NeoRestau lot 1,
//// task 9, fix round 1). The permanent card, the one every restaurant keeps for the items that are always available, is
//// made by the server under a name the system chose (get_or_create_permanent_card: "Permanent items", else "Permanent
//// items - <restaurant>" when another restaurant took the first, else a number), in the language of whoever made it. An
//// English name of the system's is not data a person typed, so a person who reads another language is shown the
//// translated label instead. The name the card is stored under does not change: the card is linked by it. A card a
//// person renamed keeps the name they gave it.

// The forms of the system's name, as `_free_card_name` of pos_next/api/restaurant.py writes them
const NAMED_BY_THE_SYSTEM = /^Permanent items(?: - .+?)?(?: \d+)?$/

/**
 * The name to show for a card.
 *
 * @param {{card_name?: string, is_permanent?: number|boolean}|null|undefined} card - A card as the server lists it
 * @returns {string} The label of the permanent card while it carries the system's name, else the name it is stored under
 */
export function cardLabel(card) {
	if (!card) return ""
	const name = card.card_name || ""
	return card.is_permanent && NAMED_BY_THE_SYSTEM.test(name)
		? __("Permanent items")
		: name
}
