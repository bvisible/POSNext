# //// Neoffice — added file (no upstream equivalent). What a cook knows about the options of a dish: a steak has a cooking, a
# //// grilled fish or a meat has a side. Used by option_plan.py when Nora sets the options of the card with the owner (NeoResto,
# //// « Nora au restaurant », lot R1). Study: Obsidian `Neoffice/NeoResto/22-…`.
"""The small, fixed knowledge of the kitchen that decides which option groups a dish needs.

It is data, not a model's memory: the same words give the same answer, a cook can read it and change it, and nothing here invents a
price (an option costs nothing unless the owner says otherwise). Two option groups are known:

- the COOKING of a meat that is served to the customer's taste: a steak, an entrecôte, a duck breast, a lamb rack, a burger. Not a
  chicken, not a pork chop, not a stew, which are always cooked through: asking their cooking would be asking nonsense;
- the SIDE of a dish that is served with one: the meats and the fish, the grills, the burgers, the poultry. Not the pasta, the pizzas,
  the starters or the desserts.

The cooking goes on the dishes themselves (a family of meats holds a steak and a sausage), the side on the whole family (every dish of it
has one). A restaurant that already has such a group under its own name (« Cuissons », « Garniture ») keeps it: the names below are
what a group is called when there is none, and what an existing one is recognised by.
"""

import re
import unicodedata

COOKING = {
	"key": "cooking",
	"group_name": "Cuisson",
	"known_as": ("cuisson", "cuissons", "point de cuisson", "points de cuisson"),
	"selection_type": "Single",
	"required": 1,
	"options": ("Bleu", "Saignant", "À point", "Bien cuit"),
}

SIDE = {
	"key": "side",
	"group_name": "Accompagnement",
	"known_as": ("accompagnement", "accompagnements", "garniture", "garnitures"),
	"selection_type": "Single",
	"required": 1,
	"options": ("Frites", "Riz", "Pommes de terre sautées", "Légumes de saison", "Salade verte"),
}

GROUPS = {COOKING["key"]: COOKING, SIDE["key"]: SIDE}

# The dishes that are served cooked to the customer's taste, as the words of their name (folded: no accent, no capital). « Pork chop » is
# not here on purpose: only « côtelette d'agneau » is.
COOKED_TO_ORDER = (
	"entrecote",
	"faux filet",
	"filet de boeuf",
	"filet boeuf",
	"cote de boeuf",
	"pave de boeuf",
	"bavette",
	"onglet",
	"hampe",
	"rumsteck",
	"tournedos",
	"t bone",
	"steak",
	"magret",
	"carre d agneau",
	"cotelette d agneau",
	"cotelettes d agneau",
	"burger",
	"hamburger",
	"cheeseburger",
)

# A word that says the dish is not a piece of meat served to taste, whatever else its name holds (« bavettes » are a pasta too)
NOT_A_STEAK = (
	"pate",
	"pasta",
	"tagliatelle",
	"spaghetti",
	"penne",
	"ravioli",
	"risotto",
	"salade",
	"soupe",
	"potage",
	"pizza",
)

# The families (as the words of an item group's name) whose every dish is served with a side
FAMILIES_WITH_A_SIDE = ("viande", "poisson", "grillade", "burger", "volaille")


def fold(text) -> str:
	"""Lower case, no accents, nothing but letters and digits: « Entrecôte de bœuf » is « entrecote de boeuf »."""
	plain = unicodedata.normalize("NFKD", (text or "").replace("œ", "oe").replace("Œ", "OE"))
	plain = plain.encode("ascii", "ignore").decode().lower()
	return re.sub(r"[^a-z0-9]+", " ", plain).strip()


def _stem(word: str) -> str:
	return word[:-1] if len(word) > 3 and word.endswith(("s", "x")) else word


def _words(text) -> list[str]:
	return [_stem(word) for word in fold(text).split()]


def _holds(words: list[str], phrase: str) -> bool:
	"""Whether the words of a name hold the phrase as consecutive words (« steak haché » holds « steak »)."""
	wanted = [_stem(word) for word in phrase.split()]
	size = len(wanted)
	return any(words[start : start + size] == wanted for start in range(len(words) - size + 1))


def is_cooked_to_order(item_name) -> bool:
	"""Whether a dish is served cooked to the customer's taste (and so has a cooking to ask)."""
	words = _words(item_name)
	if any(word in words for word in NOT_A_STEAK):
		return False
	return any(_holds(words, phrase) for phrase in COOKED_TO_ORDER)


def family_has_a_side(group_name) -> bool:
	"""Whether the dishes of a family are served with a side (meats, fish, grills, burgers, poultry)."""
	words = _words(group_name)
	return any(word in words for word in FAMILIES_WITH_A_SIDE)


def is_known_as(kind: dict, group_name) -> bool:
	"""Whether an option group of the restaurant is the one of this kind, under whatever name its owner gave it."""
	name = fold(group_name)
	return name in {fold(known) for known in kind["known_as"]}
