# POS Next — Restaurant Module Plan

## Vision

Transformer POS Next en un POS restaurant complet avec : plan de salle visuel, gestion multi-salles, stations de préparation (bar/cuisine), menus composés, modificateurs d'articles structurés, et KDS par station.

**Repos d'inspiration :**
- [ury-erp/ury](https://github.com/ury-erp/ury) — workflow de préparation, KDS multi-station
- [alphabit-technology/erpnext-restaurant](https://github.com/alphabit-technology/erpnext-restaurant) — plan de salle visuel drag-and-drop, gestion salles

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
| P5 | Transfert table, Split/Fusion, Réservations | À FAIRE |

---

## Ce qui a été implémenté

### P0/P1 — Fondations (branche `version-15-resto`)

**Toggle restaurant mode dans le header :**
- Switch on/off fourchette+couteau dans `POSHeader.vue`
- Sauvegarde en localStorage (instantané au refresh)
- Champ `enable_restaurant_mode` dans POS Settings (valeur par défaut)
- `posSettings.js` : `toggleRestaurantMode()`, `initRestaurantMode()`

**Nettoyage UI en mode restaurant :**
- Toggle "Facture/Commander" masqué en mode restaurant (`InvoiceCart.vue`)
- Bouton "Hold/Attente" masqué en mode restaurant
- 2 boutons seulement : **Valider** (vert) + **Payer** (bleu)
- Bandeau table amélioré (gradient, badge KDS, compteur articles, bouton "Retour")

**Multi-salles avec onglets :**
- Onglets par area avec badge compteur (tables occupées)
- Sélection auto de la salle par défaut
- `restaurant.js` : `occupiedCountByArea`, `totalOccupiedCount`

**Fichiers clés modifiés :**
- `POS/src/components/pos/POSHeader.vue` — toggle switch
- `POS/src/components/sale/InvoiceCart.vue` — boutons restaurant, badges station/modifiers
- `POS/src/pages/POSSale.vue` — handleSendToKitchen, handleLoadServerDraft, closeTable
- `POS/src/stores/posSettings.js` — toggleRestaurantMode, initRestaurantMode
- `POS/src/stores/posCart.js` — restaurantTable, kdsStatus, hasUnsentChanges, markChangesSent, updateItemModifiers, setPosProfile, setPosOpeningShift

---

### P2 — Plan de salle visuel

**FloorPlanEditor :**
- Composant `FloorPlanEditor.vue` remplace `TableSelector.vue`
- Tables positionnées en absolute (pos_x, pos_y, width, height)
- Drag-and-drop via `useDraggable.js` composable (Pointer Events natifs)
- Resize handles aux 4 coins
- Mode édition vs mode service
- Sièges carrés autour des tables (calculés selon capacity, centrés via CSS transform)
- Auto-layout en grille quand tables à position (0,0)
- Bouton crayon pour éditer une table (nom, capacité, forme)
- Bouton "+" pour ajouter une table
- Sauvegarde positions via API `save_table_positions`

**DocType Restaurant Table enrichi :**
- Champs ajoutés : `pos_x`, `pos_y`, `width`, `height`, `shape` (Square/Round)

**Fichiers créés :**
- `POS/src/components/pos/FloorPlanEditor.vue`
- `POS/src/composables/useDraggable.js`

**Fichiers modifiés :**
- `pos_next/pos_next/doctype/restaurant_table/restaurant_table.json`
- `pos_next/api/restaurant.py` — save_table_positions, create_table
- `POS/src/stores/restaurant.js` — updateTablePosition, saveAllPositions, addTable, localTables

---

### P3 — Stations de préparation

**DocTypes créés :**
- `Preparation Station` — station_name, station_type (Kitchen/Bar/Other), color, is_active, show_on_floor_plan, area, pos_x, pos_y, width, height
- `Preparation Station Item` (child table) — item link, item_name

**Custom fields ajoutés :**
- `Sales Invoice Item-preparation_station` (Link → Preparation Station)
- `Sales Invoice Item-kds_status` (Select: Pending/Preparing/Ready/Delivered)

**KDS filtré par station :**
- `KDS.vue` : sélecteur de stations coloré (All / Bar / Cuisine)
- API `get_kds_orders(station=None)` : filtre par station
- API `get_preparation_stations()` : retourne les stations actives
- API `get_station_items_map()` : mapping item_code → station
- API `update_item_kds_status()` : status KDS par item

**Stations sur le plan de salle :**
- Stations visibles sur le FloorPlan avec couleur et icône (fourchette=cuisine, écran=bar)
- Draggable/resizable en mode édition
- Clic en mode service → ouvre `/pos/kds?station=XXX` dans un nouvel onglet
- API `save_station_positions()`

**Gestion des areas depuis le POS :**
- Bouton "+" pour créer une area
- Bouton crayon pour renommer
- Bouton poubelle pour supprimer (si pas de tables)
- APIs : `create_area`, `rename_area`, `delete_area`

**Auto-assignation station :**
- Au `addItem`, le `preparation_station` est copié depuis le `stationItemsMap`
- Badge station dans le panier (couleur dynamique)
- Badge station dans le KDS order card

**Fichiers clés :**
- `pos_next/pos_next/doctype/preparation_station/` (enrichi avec champs position)
- `pos_next/pos_next/doctype/preparation_station_item/`
- `pos_next/api/restaurant.py` — get_tables (retourne stations), save_station_positions, CRUD areas
- `POS/src/stores/restaurant.js` — floorStations, stationItemsMap, fetchStationItemsMap, getStationForItem, area CRUD
- `POS/src/pages/KDS.vue` — sélecteur stations
- `POS/src/components/invoices/KDSOrderCard.vue` — badges station + kds_status par item

---

### P4A — Modificateurs structurés

**DocTypes créés :**
- `Item Modifier Group` — group_name, selection_type (Single/Multiple), required, max_selections, apply_to_all_items, options (child), applicable_items (child)
- `Item Modifier Option` (child) — option_name, price_adjustment, is_default
- `Item Modifier Group Item` (child) — item link

**Custom field ajouté :**
- `Sales Invoice Item-posa_item_modifiers` (Small Text, hidden — JSON structuré)

**Dialog modificateurs restructuré :**
- `ItemModifiersDialog.vue` réécrit : groupes avec boutons radio/checkbox, prix affichés, validation required
- Auto-ouverture quand item a des groupes required
- Options par défaut pré-sélectionnées
- Textarea instructions libres conservé en bas
- Calcul supplément prix
- Stockage JSON : `[{"group": "Cuisson", "options": [{"name": "À point", "price": 0}]}]`

**Affichage :**
- Résumé modifiers dans le panier (texte gris)
- Tags modifiers dans le KDS (badges amber)

**APIs :**
- `get_item_modifiers(item_code)` — groupes applicables à un item
- `get_all_modifier_groups()` — tous les groupes avec options (cache frontend)

**Fichiers clés :**
- `pos_next/pos_next/doctype/item_modifier_group/`
- `pos_next/pos_next/doctype/item_modifier_option/`
- `pos_next/pos_next/doctype/item_modifier_group_item/`
- `POS/src/components/sale/ItemModifiersDialog.vue` (réécrit)
- `POS/src/stores/restaurant.js` — modifierGroups, fetchModifierGroups, getModifiersForItem
- `POS/src/stores/posCart.js` — updateItemModifiers
- `POS/src/composables/useInvoice.js` — posa_item_modifiers dans formatItemsForSubmission

---

### P4B — Menus composés

**DocTypes créés :**
- `Restaurant Menu` — menu_name, price, description, image, is_active, available_from, available_to, courses (child)
- `Restaurant Menu Course` (child) — course_name, item (Link), item_name, sort_order

**MenuSelectionDialog :**
- Dialog multi-étapes : choisir un article par course
- Affiche les courses groupées (Entrée, Plat, Dessert)
- Bouton "Add Menu" quand tous les cours sélectionnés

**Onglet Menus dans le POS :**
- Bouton "Menus" dans les filtres articles (mode restaurant)
- Grille de cartes menus (image, nom, prix, nb courses)
- Clic → ouvre MenuSelectionDialog

**API :**
- `get_active_menus()` — menus actifs avec filtrage date + courses groupées

**Fichiers clés :**
- `pos_next/pos_next/doctype/restaurant_menu/`
- `pos_next/pos_next/doctype/restaurant_menu_course/`
- `POS/src/components/sale/MenuSelectionDialog.vue`
- `POS/src/stores/restaurant.js` — activeMenus, fetchActiveMenus

---

### Workflow complet (Valider → KDS → Retour → Payer)

**Flux implémenté :**
1. Sélectionner une table (vide ou occupée)
2. Si occupée → charge le draft serveur dans le panier (via `get_table_order` API)
3. Ajouter des articles → bouton **"Valider"** crée un draft Sales Invoice serveur via `update_invoice` API
4. Retour automatique au plan de salle après validation
5. La table passe en "Occupied" (rouge)
6. Le KDS reçoit la commande en realtime (websocket `kds_update`)
7. Recliquer sur la table → panier rechargé avec les articles existants
8. **"Payer"** → ouvre le dialog de paiement classique

**APIs utilisées :**
- `update_invoice` — crée/met à jour le draft serveur
- `get_table_order(table_name)` — récupère le draft actif d'une table
- `on_invoice_update` — hook qui met à jour le statut de la table

**Fixes appliqués :**
- `$patch` au lieu d'assignations directes sur le store (bug production build)
- `setPosProfile` / `setPosOpeningShift` setters ajoutés au store
- Chargement direct du draft dans FloorPlanEditor (bypass emit propagation issue)

---

## DocTypes créés (résumé)

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

## Custom Fields ajoutés

| Field | DocType | Type |
|-------|---------|------|
| restaurant_table | Sales Invoice | Link → Restaurant Table |
| kds_status | Sales Invoice | Select (Pending/Preparing/Ready/Delivered) |
| posa_special_instructions | Sales Invoice Item | Small Text |
| preparation_station | Sales Invoice Item | Link → Preparation Station |
| kds_status | Sales Invoice Item | Select (Pending/Preparing/Ready/Delivered) |
| posa_item_modifiers | Sales Invoice Item | Small Text (JSON) |

## Routes ajoutées

| Route | Page | Description |
|-------|------|-------------|
| `/pos/kds` | KDS.vue | Kitchen Display System |
| `/pos/kds?station=X` | KDS.vue | KDS filtré par station |
| `/pos/cfd` | CFD.vue | Customer Facing Display (restaurant) |

## Fichiers Vue créés

| Fichier | Description |
|---------|-------------|
| `POS/src/components/pos/FloorPlanEditor.vue` | Éditeur plan de salle drag-and-drop |
| `POS/src/components/pos/TableSelector.vue` | Sélecteur grille (conservé comme fallback) |
| `POS/src/components/sale/ItemModifiersDialog.vue` | Dialog modificateurs structurés (réécrit) |
| `POS/src/components/sale/MenuSelectionDialog.vue` | Dialog sélection menu par courses |
| `POS/src/components/invoices/KDSOrderCard.vue` | Carte commande KDS |
| `POS/src/pages/KDS.vue` | Page Kitchen Display System |
| `POS/src/pages/CFD.vue` | Page Customer Facing Display |
| `POS/src/stores/restaurant.js` | Store Pinia restaurant |
| `POS/src/composables/useDraggable.js` | Composable drag-and-drop |

---

## Ce qui reste à faire (P5+)

### Transfert de table
- Déplacer une commande d'une table à une autre
- Met à jour `restaurant_table` sur la Sales Invoice

### Split / Fusion de commandes
- Fusionner 2 tables en une addition
- Diviser une addition (par personne, par article)

### Nombre de couverts
- Demander le nombre de couverts à la sélection de table
- Affiché sur le plan et envoyé en cuisine

### Impression tickets cuisine
- Impression auto quand "Valider"
- Format ticket : table, serveur, heure, articles par station
- Support QZ Tray (déjà intégré au fork)

### Réservations
- Réserver une table à une heure
- Statut "Reserved" visible sur le plan

### Disponibilité produits temps réel
- Marquer un produit "épuisé" depuis le KDS
- Se reflète instantanément sur le POS

### Bug connu pré-existant
- `PaymentDialog.vue` : erreur "Assignment to constant variable" au montage (bug pré-existant, pas lié au module restaurant, n'empêche pas le fonctionnement)
