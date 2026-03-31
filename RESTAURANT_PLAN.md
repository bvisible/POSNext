# POS Next — Restaurant Module Plan

## Vision

Transformer POS Next en un POS restaurant complet avec : plan de salle visuel, gestion multi-salles, stations de préparation (bar/cuisine), cartes restaurant, modificateurs d'articles structurés, menus composés, et Preparation Display par station.

---

## Statut des phases

| Phase | Description | Statut |
|-------|-------------|--------|
| P0/P1 | Fondations + Toggle + UI | **TERMINÉ** |
| P2 | Plan de salle visuel | **TERMINÉ** |
| P3 | Stations de préparation | **TERMINÉ** |
| P4A | Modificateurs structurés | **TERMINÉ** |
| P4B | Menus composés | **TERMINÉ** |
| Stations sur plan | Stations visuelles + gestion areas | **TERMINÉ** |
| Workflow complet | Valider → KDS → Retour table → Payer | **TERMINÉ** |
| Cartes restaurant | Système de cartes avec catégories | **TERMINÉ** |
| Preparation Display | Refonte KDS en grille post-it | **TERMINÉ** |
| Realtime | Socket.IO pour plan + KDS | **TERMINÉ** |
| P5 | Transfert table, Split/Fusion, Réservations | À FAIRE |

---

## Ce qui a été implémenté

### P0/P1 — Fondations

- Toggle restaurant mode (switch on/off dans le header, localStorage)
- 2 boutons en mode restaurant : **Valider** (vert) + **Payer** (bleu)
- Dialog de purge quand on toggle avec des tables occupées
- Multi-salles avec onglets + badge compteur tables occupées
- Sélecteur de langue déplacé dans le menu utilisateur

### P2 — Plan de salle visuel

- `FloorPlanEditor.vue` : tables en absolute, drag-and-drop, resize
- Grille subtile en fond, zoom +/- avec boutons (persisté localStorage)
- Sièges carrés autour des tables, auto-layout en grille
- Bouton crayon/poubelle pour éditer tables/areas
- Drag-and-drop des onglets areas pour réordonner (champ `sort_order`)
- Badges sur tables occupées : nb articles, heure d'ouverture, initiales serveur
- Mise à jour temps réel via Socket.IO (`table_update` event)

### P3 — Stations de préparation

- DocType `Preparation Station` : station_name, station_type (Kitchen/Bar/Other), color, is_active, items (child table avec prep_time et priority)
- Stations visibles sur le plan de salle (draggable, clic → ouvre KDS filtré)
- Auto-assignation station à l'ajout d'un item via `stationItemsMap`
- Mapping robuste : lookup par name, item_code ET item_name

### P4A — Modificateurs structurés

- DocType `Item Modifier Group` : group_name, selection_type, required, max_selections, options, applicable_items
- Dialog `ItemModifiersDialog.vue` : groupes radio/checkbox, auto-ouverture si required
- Stockage JSON `posa_item_modifiers` sur Sales Invoice Item
- Affichage dans le panier + KDS (badges amber)

### P4B — Menus composés

- DocType `Restaurant Menu` : menu_name, price, courses (child table)
- `MenuSelectionDialog.vue` : sélection multi-courses
- API `get_active_menus()` avec filtrage dates

### Cartes restaurant

- DocType `Restaurant Card` : card_name, description, image, is_active, available_from/to, items (child table)
- DocType `Restaurant Card Item` : item_type (Category/Item/Menu), label, item, menu, price override
- Client script JS : masque le prix pour les Category dans la vue table
- Affichage POS : onglets cartes remplacent la grille produits quand actives
- Filtres catégories cliquables, recherche, toggle grille/liste
- Design identique au ItemsSelector standard (mêmes CSS classes)
- Clic sur Item → ajoute au panier avec prix override
- Clic sur Menu → ouvre MenuSelectionDialog
- API `get_active_cards()` avec enrichissement images/prix depuis Item/Menu masters

### Preparation Display (ex-KDS)

- Renommé "Kitchen Display System" → "Preparation Display"
- Grille responsive post-it : `grid-cols-2 md:3 lg:4 xl:5`
- Carte commande compacte : table + double timer + items + bouton action
- Double timer : temps depuis dernière validation (gros) + temps total table (petit, gris)
- Timer rouge clignotant > 15min, orange > 10min, vert si Ready
- Filtrage par station avec compteurs corrects (toujours basés sur All, pas le filtre actif)
- Menu contextuel par item : clic → Preparing/Ready/Delivered
- Updates optimistes (UI instantanée avant réponse serveur)
- Items Delivered : grisés + barrés (pas cachés, pour voir l'historique)
- Commandes 100% Delivered : cachées du KDS
- Commandes sans items après filtrage station : cachées
- Auto-refresh fallback 15s + Socket.IO realtime (`kds_update` + `table_update`)
- Préservation kds_status items lors de re-validation table

### Workflow complet

1. Sélectionner une table (vide ou occupée)
2. Si occupée → charge le draft serveur dans le panier (images, modifiers, kds_status préservés)
3. Ajouter des articles depuis la carte → bouton **Valider** crée/met à jour un draft
4. Retour automatique au plan de salle + refresh badges
5. La table passe en "Occupied" (rouge) avec badges (nb items, heure, initiales)
6. Le Preparation Display reçoit la commande en realtime
7. Recliquer sur la table → panier rechargé avec articles existants + kds_status
8. Items avec modifiers/instructions gardés séparément (pas fusionnés)
9. Protection anti-double-clic sur Valider
10. **Payer** → ouvre le dialog de paiement classique

### Realtime (Socket.IO)

- `frappe.publish_realtime("kds_update")` : publié sur update_kds_status, update_item_kds_status, update_invoice (restaurant), reset_all_tables
- `frappe.publish_realtime("table_update")` : publié sur update_table_status, update_invoice (restaurant), reset_all_tables
- Frontend utilise `window.frappe.realtime` (socket déjà initialisé par main.js avec le bon namespace)
- FloorPlanEditor et KDS écoutent ces events pour auto-refresh

---

## DocTypes créés

| DocType | Type | Module |
|---------|------|--------|
| Restaurant Area | Standard | POS Next |
| Restaurant Table | Standard | POS Next |
| Preparation Station | Standard | POS Next |
| Preparation Station Item | Child Table | POS Next |
| Item Modifier Group | Standard | POS Next |
| Item Modifier Option | Child Table | POS Next |
| Item Modifier Group Item | Child Table | POS Next |
| Restaurant Menu | Standard | POS Next |
| Restaurant Menu Course | Child Table | POS Next |
| Restaurant Card | Standard | POS Next |
| Restaurant Card Item | Child Table | POS Next |

## Custom Fields ajoutés

| Field | DocType | Type |
|-------|---------|------|
| restaurant_table | Sales Invoice | Link → Restaurant Table |
| kds_status | Sales Invoice | Select (Pending/Preparing/Ready/Delivered) |
| posa_special_instructions | Sales Invoice Item | Small Text |
| preparation_station | Sales Invoice Item | Link → Preparation Station |
| kds_status | Sales Invoice Item | Select (Pending/Preparing/Ready/Delivered) |
| posa_item_modifiers | Sales Invoice Item | Small Text (JSON) |

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/pos/kds` | KDS.vue | Preparation Display (toutes stations) |
| `/pos/kds?station=X` | KDS.vue | Preparation Display filtré par station |
| `/pos/cfd` | CFD.vue | Customer Facing Display |

## APIs clés (pos_next/api/restaurant.py)

| API | Description |
|-----|-------------|
| `get_tables()` | Areas + tables + stations + order summaries |
| `get_table_order(table_name)` | Draft actif d'une table avec items enrichis (images) |
| `update_table_status(table, status)` | Met à jour statut table + publie table_update |
| `reset_all_tables()` | Reset toutes tables + nettoie drafts + publie events |
| `get_kds_orders(station?)` | Commandes KDS filtrées par station |
| `update_kds_status(invoice, status)` | Met à jour statut commande + items (avance seulement) |
| `update_item_kds_status(invoice, item_code, status)` | Statut par item |
| `get_station_items_map()` | Mapping item → station (robuste: name + code + name) |
| `get_active_cards()` | Cartes actives avec items enrichis |
| `get_active_menus()` | Menus actifs avec courses groupées |
| `reorder_areas(order)` | Réordonne les areas |
| `save_table_positions(positions)` | Sauvegarde positions tables |
| `save_station_positions(positions)` | Sauvegarde positions stations |

## Fichiers Vue clés

| Fichier | Description |
|---------|-------------|
| `POS/src/components/pos/FloorPlanEditor.vue` | Plan de salle drag-and-drop + realtime |
| `POS/src/components/sale/ItemModifiersDialog.vue` | Dialog modificateurs structurés |
| `POS/src/components/sale/MenuSelectionDialog.vue` | Dialog sélection menu par courses |
| `POS/src/components/invoices/KDSOrderCard.vue` | Carte commande KDS (post-it) |
| `POS/src/pages/KDS.vue` | Preparation Display (grille) |
| `POS/src/pages/CFD.vue` | Customer Facing Display |
| `POS/src/pages/POSSale.vue` | Page POS principale (cartes, workflow restaurant) |
| `POS/src/stores/restaurant.js` | Store Pinia restaurant |
| `POS/src/stores/posCart.js` | Cart avec champs restaurant |
| `POS/src/composables/useDraggable.js` | Composable drag-and-drop |

## Bugs connus corrigés cette session

- `const` → `let` pour `_initializedKey` et `_posInitPromise` (crash production build)
- `draftsStore.saveDraft()` inexistant → supprimé
- `shiftStore.openingShift` inexistant → `cartStore.posOpeningShift`
- `startsWith("ACC-SINV")` ne matchait jamais sur FR → simplifié
- `restaurant_table` pas persisté → `set_value` + `commit` explicite
- `clearCart` async non awaité → race condition corrigée
- Station items map mismatch name/item_code → lookup robuste avec fallback
- Double-clic Valider → protection `isSendingToKitchen`
- Socket "Invalid namespace" → utiliser `window.frappe.realtime`
- Items perdent kds_status au re-validate → preservation DB + frontend
- KDS montre commandes vides après filtre station → exclusion

---

## Ce qui reste à faire (P5+)

### Transfert de table
- Déplacer une commande d'une table à une autre

### Split / Fusion de commandes
- Fusionner 2 tables en une addition
- Diviser une addition (par personne, par article)

### Nombre de couverts
- Demander le nombre de couverts à la sélection de table

### Impression tickets cuisine
- Impression auto quand "Valider"
- Format ticket : table, serveur, heure, articles par station
- Support QZ Tray

### Réservations
- Réserver une table à une heure
- Statut "Reserved" visible sur le plan

### Disponibilité produits temps réel
- Marquer un produit "épuisé" depuis le KDS
