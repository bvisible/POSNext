# POS Next — Restaurant Module Plan

## Vision

Transformer POS Next en un POS restaurant complet avec : plan de salle visuel, gestion multi-salles, stations de préparation (bar/cuisine), menus composés, modificateurs d'articles structurés, et KDS par station.

**Repos d'inspiration :**
- [ury-erp/ury](https://github.com/ury-erp/ury) — workflow de préparation, KDS multi-station
- [alphabit-technology/erpnext-restaurant](https://github.com/alphabit-technology/erpnext-restaurant) — plan de salle visuel drag-and-drop, gestion salles

---

## Priorités

### P0 — Fondations (à faire en premier)
### P1 — Expérience restaurant complète
### P2 — Fonctionnalités avancées
### P3 — Nice-to-have

---

## P0 — Fondations

### 0.1 Switch Restaurant Mode dans le Header

**Problème :** Actuellement, il faut aller dans POS Settings pour activer le mode restaurant. Trop contraignant.

**Solution :** Un toggle dans le POSHeader qui passe la caisse en mode restaurant.

- Bouton switch visible dans le header (icône restaurant/fourchette)
- **Conditions pour activer :**
  - Panier vide (aucun article en cours)
  - Pas de facture draft en cours sur cette session
- **Conditions pour désactiver :**
  - Toutes les tables fermées (aucune commande active)
  - Panier vide
- Le toggle persiste via `posSettings` (appel API pour sauvegarder)
- Pas besoin de recharger la page — le switch est réactif (Vue computed)

**Fichiers impactés :**
- `POS/src/components/pos/POSHeader.vue` — ajout du toggle
- `POS/src/stores/posSettings.js` — action toggle
- `POS/src/pages/POSSale.vue` — réactivité conditionnelle

---

### 0.2 Nettoyage UI en mode restaurant

**Problème :** Quand on est sur une table, l'interface est identique au mode vente classique. Boutons inutiles visibles (Sales Order, etc.).

**Solution :**

- **Masquer en mode restaurant :**
  - Toggle "Sales Order / Invoice" dans le panier
  - Bouton "Sales Order" dans le menu
  - Tout ce qui concerne les commandes fournisseur
- **Rendre plus visible :**
  - Bandeau table actuel → plus grand, plus clair, avec numéro de table bien lisible
  - Bouton "Fermer la table" plus accessible
  - Indicateur KDS status visible dans le panier (Pending/Preparing/Ready)
- **Ajouter :**
  - Bouton "Envoyer en cuisine" distinct du bouton "Payer" (envoie = save draft + set KDS Pending)
  - Bouton "Ajouter des articles" pour revenir sur la commande d'une table déjà envoyée

**Fichiers impactés :**
- `POS/src/components/sale/InvoiceCart.vue`
- `POS/src/pages/POSSale.vue`

---

## P1 — Expérience restaurant complète

### 1.1 Plan de salle visuel (Floor Plan Editor)

**Inspiration :** alphabit-restaurant — canvas avec drag-and-drop + resize

**Solution :**

#### Backend — Nouveau DocType `Restaurant Table` (enrichi)
Champs supplémentaires à ajouter :
- `pos_x` (Float) — position X sur le plan (pixels ou %)
- `pos_y` (Float) — position Y sur le plan
- `width` (Int) — largeur visuelle (défaut 80)
- `height` (Int) — hauteur visuelle (défaut 80)
- `shape` (Select: Square / Round) — forme de la table
- `rotation` (Int) — rotation en degrés (0-360)

#### Frontend — Nouveau composant `FloorPlanEditor.vue`
- Canvas zoomable (CSS transform scale)
- Tables en drag-and-drop (pointer events + CSS translate)
- Resize handles aux coins
- Toggle "Mode édition" / "Mode service"
  - **Mode édition :** déplacer, redimensionner, ajouter, supprimer tables
  - **Mode service :** cliquer = ouvrir la table pour commander
- Couleurs dynamiques selon le statut (Empty=vert, Occupied=rouge, Reserved=jaune, Cleaning=bleu)
- Affichage du nombre de couverts sur chaque table
- Sauvegarde automatique des positions (debounce 500ms)

**Fichiers à créer :**
- `POS/src/components/pos/FloorPlanEditor.vue`
- `POS/src/components/pos/FloorPlanTable.vue` (composant table individuel)

**Fichiers à modifier :**
- `pos_next/pos_next/doctype/restaurant_table/restaurant_table.json` — nouveaux champs
- `POS/src/stores/restaurant.js` — gestion positions
- `POS/src/pages/POSSale.vue` — remplacer `TableSelector` par `FloorPlanEditor`

---

### 1.2 Multi-salles avec navigation

**Inspiration :** alphabit-restaurant — onglets par salle avec badge compteur

**Solution :**

- Barre d'onglets horizontale au-dessus du plan de salle
- Chaque onglet = une `Restaurant Area` (salle)
- Badge avec le nombre de tables occupées par salle
- Clic sur un onglet → affiche le plan de cette salle
- La salle par défaut est configurable (setting existant `default_restaurant_area`)

**Déjà existant :** Le `TableSelector.vue` a déjà un filtre par area. À transformer en onglets visuels intégrés au FloorPlanEditor.

---

### 1.3 Stations de préparation (Bar / Cuisine)

**Inspiration :** ury-erp — multi-station KDS, alphabit — Production Centers

**Solution :**

#### Backend — Nouveau DocType `Preparation Station`
- `station_name` (Data) — ex: "Cuisine", "Bar", "Pâtisserie"
- `station_type` (Select: Kitchen / Bar / Other)
- `display_color` (Color) — pour identification visuelle
- `printer` (Data) — imprimante associée (futur)

#### Backend — Lien Item ↔ Station
- Nouveau Custom Field sur **Item** : `preparation_station` (Link → Preparation Station)
- Quand un item est ajouté à une commande, il hérite de sa station
- Un item sans station = va partout (ou station par défaut)

#### Frontend — KDS filtré par station
- `/pos/kds` accepte un query param : `/pos/kds?station=Cuisine`
- Le KDS n'affiche que les items de cette station
- Chaque station a son propre écran KDS
- Les items sont regroupés par commande mais filtrés par station

**Fichiers à créer :**
- `pos_next/pos_next/doctype/preparation_station/` — nouveau DocType
- Custom Field `Item-preparation_station`

**Fichiers à modifier :**
- `pos_next/api/restaurant.py` — `get_kds_orders()` filtré par station
- `POS/src/pages/KDS.vue` — lecture du param `station`, sélecteur de station
- `POS/src/components/invoices/KDSOrderCard.vue` — filtrage items

---

### 1.4 Modificateurs d'articles structurés

**Problème :** Actuellement les instructions spéciales sont du texte libre. Pas de structure, pas de prix.

**Inspiration :** ury — item modifiers avec prix, alphabit — ProductItem customization

**Solution :**

#### Backend — Nouveaux DocTypes

**`Item Modifier Group`**
- `group_name` (Data) — ex: "Cuisson", "Accompagnement", "Sauce"
- `selection_type` (Select: Single / Multiple) — choix unique ou multiple
- `required` (Check) — obligatoire ou non
- `max_selections` (Int) — nombre max de choix (pour Multiple)

**`Item Modifier Option`** (child table de Item Modifier Group)
- `option_name` (Data) — ex: "Saignant", "À point", "Bien cuit"
- `price_adjustment` (Currency) — supplément de prix (0 = gratuit)
- `is_default` (Check) — option par défaut

**Lien Item ↔ Modifier Groups :**
- Nouveau DocType **`Item Modifier Assignment`** (child table de Item)
- Ou Custom Field `modifier_groups` (Table MultiSelect → Item Modifier Group)

#### Frontend — Dialog amélioré

Remplacer `ItemModifiersDialog.vue` par un dialog structuré :
- Affiche chaque groupe de modificateurs
- Choix par boutons (single) ou checkboxes (multiple)
- Affiche le supplément de prix
- Les quick modifiers texte restent disponibles en bas
- Le résultat est stocké comme JSON structuré + texte lisible

**Fichiers à créer :**
- `pos_next/pos_next/doctype/item_modifier_group/`
- `pos_next/pos_next/doctype/item_modifier_option/` (child)
- Réécriture de `POS/src/components/sale/ItemModifiersDialog.vue`

---

### 1.5 Gestion des Menus

**Problème :** Pas de notion de menu composé (entrée + plat + dessert à prix fixe).

**Solution :**

#### Backend — Nouveau DocType `Restaurant Menu`
- `menu_name` (Data) — ex: "Menu Chasse", "Menu du Jour"
- `price` (Currency) — prix du menu complet
- `available_from` (Date) — optionnel
- `available_to` (Date) — optionnel
- `is_active` (Check)
- `courses` (Table → Restaurant Menu Course)

**`Restaurant Menu Course`** (child table)
- `course_name` (Data) — ex: "Entrée", "Plat", "Dessert"
- `sort_order` (Int)
- `items` (Table MultiSelect → Item) — articles disponibles pour ce cours

#### Frontend
- Nouveau tab/section dans le panneau articles en mode restaurant
- Vue "Menus" qui affiche les menus actifs
- Clic sur un menu → dialog de sélection par course (choisir entrée, puis plat, puis dessert)
- Ajoute les articles sélectionnés au panier avec le prix menu (pas les prix individuels)

**Fichiers à créer :**
- `pos_next/pos_next/doctype/restaurant_menu/`
- `pos_next/pos_next/doctype/restaurant_menu_course/` (child)
- `POS/src/components/sale/MenuSelectionDialog.vue`

---

## P2 — Fonctionnalités avancées

### 2.1 Workflow "Envoyer en cuisine" vs "Payer"

- Bouton **"Envoyer"** = sauvegarde le draft + set KDS status Pending + notification KDS
- Bouton **"Ajouter"** = revenir sur une commande envoyée pour ajouter des articles (nouveau round)
- Bouton **"Payer"** = ouvre le dialog de paiement, soumet la facture
- Chaque "envoi" crée un horodatage (pour mesurer le temps de service)

### 2.2 Transfert de table

- Déplacer une commande d'une table à une autre
- Utile quand les clients changent de place
- Met à jour `restaurant_table` sur la Sales Invoice

### 2.3 Fusion / Split de commandes

- **Fusion :** combiner 2 tables en une seule addition
- **Split :** diviser une addition en plusieurs (par personne, par article)

### 2.4 Nombre de couverts

- À la sélection de table, demander le nombre de couverts
- Affiché sur le plan de salle et dans le panier
- Envoyé en cuisine (utile pour portions)

### 2.5 Impression tickets cuisine

- Impression automatique du ticket quand "Envoyer en cuisine"
- Format ticket cuisine : table, serveur, heure, articles par station
- Support QZ Tray (déjà intégré au fork)

---

## P3 — Nice-to-have

### 3.1 Disponibilité produits en temps réel
- Marquer un produit comme "épuisé" depuis le KDS
- Se reflète instantanément sur le POS (item grisé)

### 3.2 Gestion des réservations
- Réserver une table à une heure donnée
- Statut "Reserved" visible sur le plan

### 3.3 Historique par table
- Voir l'historique des commandes d'une table
- Statistiques : CA par table, temps moyen de service

### 3.4 Mode "terrasse" / plan extérieur
- Plans de salle multiples avec arrière-plans personnalisés (image uploadée)

---

## Architecture technique résumée

### Nouveaux DocTypes à créer

| DocType | Type | Description |
|---|---|---|
| `Preparation Station` | Standard | Station de préparation (Cuisine, Bar...) |
| `Item Modifier Group` | Standard | Groupe de modificateurs (Cuisson, Sauce...) |
| `Item Modifier Option` | Child Table | Option dans un groupe (Saignant, À point...) |
| `Restaurant Menu` | Standard | Menu composé (Menu du Jour...) |
| `Restaurant Menu Course` | Child Table | Cours dans un menu (Entrée, Plat, Dessert) |

### DocTypes existants à enrichir

| DocType | Champs à ajouter |
|---|---|
| `Restaurant Table` | `pos_x`, `pos_y`, `width`, `height`, `shape`, `rotation` |
| `Item` | `preparation_station` (Link → Preparation Station) |

### Nouveaux composants Vue

| Composant | Description |
|---|---|
| `FloorPlanEditor.vue` | Éditeur visuel du plan de salle |
| `FloorPlanTable.vue` | Table individuelle draggable |
| `MenuSelectionDialog.vue` | Sélection de menu par courses |
| `ItemModifiersDialog.vue` | Réécriture avec modificateurs structurés |

---

## Ordre d'implémentation recommandé

```
Phase 1 (Utilisable rapidement)
├── 0.1 Switch header restaurant mode
├── 0.2 Nettoyage UI restaurant
└── 1.2 Multi-salles (onglets)

Phase 2 (Plan de salle)
├── 1.1 Floor Plan Editor (drag-and-drop)
└── 2.4 Nombre de couverts

Phase 3 (Préparation)
├── 1.3 Stations de préparation
├── 2.1 Workflow Envoyer/Ajouter/Payer
└── 2.5 Impression tickets cuisine

Phase 4 (Menu & Modificateurs)
├── 1.4 Modificateurs structurés
└── 1.5 Menus composés

Phase 5 (Avancé)
├── 2.2 Transfert de table
├── 2.3 Split/Fusion
└── P3 items
```
