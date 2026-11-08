//// Neoffice — added file (no upstream equivalent). A line with a special note or options is a dish of its own (the product owner, 08.11.2026: « si on met une note sur un article et que l'on en
//// ajoute 1, il ne doit pas faire +1 sur l'article avec la note »): the unit more that the « + » of the cart adds is a plain one, on the plain line that waits or on a line of its own, never on the line that
//// carries the note, which would make every unit « saignant ». The rule is the one the add already has (a dish with a note merges into nothing and nothing merges into it: useInvoice.addItem).

/** Whether a cart line carries a special note or options (the same test the cart's merge makes). */
export const carriesANote = (line) => Boolean(line?.posa_special_instructions || line?.posa_item_modifiers)
