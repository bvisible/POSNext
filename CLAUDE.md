# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

POS Next is a modern Point of Sale system built on ERPNext/Frappe Framework. It features a Vue 3 frontend (`POS/`) with offline-first architecture and a Python backend (`pos_next/`) that integrates with ERPNext.

## Development Commands

### Frontend (POS/)

```bash
cd POS
yarn install          # Install dependencies (ALWAYS use yarn, never npm)
yarn dev              # Start dev server (port 8080, proxies to localhost:8000)
yarn build            # Production build (outputs to ../pos_next/public/pos/)
yarn lint             # Check code with Biome
yarn lint:fix         # Auto-fix linting issues
yarn test             # Run tests in watch mode (Vitest)
yarn test:run         # Run tests once (CI mode)
yarn test:coverage    # Generate coverage report
```

### Backend (Frappe)

```bash
bench --site [site] install-app pos_next    # Install app
bench --site [site] migrate                  # Run migrations
bench build --app pos_next                   # Build assets
bench --site [site] clear-cache              # Clear cache
bench --site [site] run-tests --app pos_next # Run backend tests
```

### Pre-commit Hooks

```bash
pre-commit install    # Setup hooks (ruff, prettier, eslint)
pre-commit run --all-files  # Run all checks manually
```

## Architecture

### Frontend (Vue 3 + Vite)

- **Components**: `POS/src/components/` - Organized by feature (sale/, shift/, common/, guest/, restaurant/)
- **Composables**: `POS/src/composables/` - Reusable Vue logic (useOffline, useItems, useToast)
- **Pages**: `POS/src/pages/` - Main views (POSSale, Login, GuestOrder, TakeawayOrder, KDS, Takeaway)
- **Workers**: `POS/src/workers/` - Web Workers for offline operations
- **State**: Pinia stores in `POS/src/stores/` (including `guestOrder.js` for guest ordering)

### Backend (Frappe/Python)

- **API**: `pos_next/api/` - REST endpoints (invoices.py, items.py, offers.py, shifts.py, guest_ordering.py, etc.)
- **Doctypes**: `pos_next/pos_next/doctype/` - Custom document types
- **Fixtures**: `pos_next/fixtures/` - Default data and permissions
- **Patches**: `pos_next/patches/` - Database migrations

### Offline-First Pattern

All IndexedDB operations MUST run in the Web Worker, not the main thread:

```javascript
// CORRECT - Using worker for offline operations
import { offlineWorker } from '@/utils/offline/workerClient'
const data = await offlineWorker.searchCachedItems()

// WRONG - Blocks UI
import { searchCachedItems } from '@/utils/offline'
const data = await searchCachedItems()
```

## Code Style Rules

### API Calls

**Vue Components (.vue)** - Use `createResource` from frappe-ui:
```javascript
import { createResource } from 'frappe-ui'
const resource = createResource({ url: 'api.method', auto: false })
```

**JavaScript Utilities (.js)** - Use `window.frappe.call`:
```javascript
const response = await window.frappe.call({ method: 'api.method', args: {} })
```

**Guest components** - Use `fetch()` directly (no Frappe session):
```javascript
const response = await fetch('/api/method/pos_next.api.guest_ordering.validate_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Frappe-CSRF-Token': window.csrf_token || '' },
  body: JSON.stringify({ token })
})
```

### Translations

ALL user-facing strings must be wrapped with translation functions:

**Frontend (Vue/JS)**: Use `__()`
```javascript
__('This is a translatable string')
__('Hello {0}', [userName])  // With variables
__('Change', null, 'Coins')  // With context
```

**Backend (Python)**: Use `_()`
```python
frappe.msgprint(_("Record saved successfully"))
```

### Error Handling

**Frontend**: Use `useToast` composable (never `frappe.msgprint` or `toast.create`):
```javascript
import { useToast } from '@/composables/useToast'
const { showSuccess, showError, showWarning } = useToast()
showError(__('Something went wrong'))
```

**Backend**: Use correct `frappe.log_error` format:
```python
# CORRECT - title (max 140 chars), then message
frappe.log_error("Failed to sync instance", str(e))

# WRONG - single argument gets truncated
frappe.log_error(f"Failed to sync instance {self.name}: {str(e)}")
```

### IndexedDB Boolean Queries

Use `.filter()` for boolean values in Dexie:
```javascript
// CORRECT
const items = await db.invoice_queue.filter(inv => inv.synced === false).toArray()

// WRONG - Causes DexieError
const items = await db.invoice_queue.where('synced').equals(false).toArray()
```

## Important Conventions

- **ALL code comments in English** - Never use other languages in comments
- **Tab indentation** for both frontend and backend
- **No Claude co-author** in commit messages
- **Prefer editing existing files** over creating new ones
- **No unnecessary markdown files** - Only create when explicitly requested

## Common Gotchas

### POS Payment Method

Does NOT have `default_account` field. Get account from `Mode of Payment Account` table instead.

### Customer Group on POS Profile

May not exist on standard ERPNext. Always check with `hasattr()` before accessing.

### Service Worker

Requires HTTPS in production for offline functionality to work.

### Guest Ordering (QR / Takeaway)

Guest components (`POS/src/components/guest/`, `POS/src/stores/guestOrder.js`) must NEVER import offline workers, IndexedDB, or heavy POS stores. They use `fetch()` for API calls, not `createResource` or `window.frappe.call`. Guest routes use `meta: { allowGuest: true }` in the router. Realtime sync uses room `guest_table_{table_name}` matching the server-side `_broadcast_order_update` in `guest_ordering.py`.

## Build pipeline (commit-the-build)

⚠️ **Ne jamais lancer `yarn build` ou `bench build --app pos_next` localement sur un serveur Neoffice** (4 GB RAM → OOM-kill garanti). Le build se fait UNIQUEMENT sur GitHub Actions (ubuntu-latest, 16 GB RAM).

### Comment ça marche

1. Modif d'un fichier source (`POS/...`) en local → `git commit` → `git push origin version-15`. **Ne pas builder localement.**
2. Le workflow `.github/workflows/build-frontend.yml` détecte le push, lance `yarn build` sur ubuntu-latest (~1-2 min) et commit les artefacts back avec un commit `[skip-build] frontend artifacts for <SHA>` (par `github-actions[bot]`).
3. Sur les instances clients, le pipeline d'update fait `git pull` (ramène ton commit + le commit du bot). Quand `bench build --app pos_next` tourne, il appelle `yarn build` à la racine — **le `package.json` voit les artefacts déjà présents et skip vite** (gate). Plus d'OOM-kill.

### Paths spécifiques

- **Source frontend** : `POS/`
- **Artefacts vite (commités)** : `pos_next/public/pos/`
- **SPA HTML(s) (commités)** : `pos_next/www/pos.html`
- **Build script root** : `yarn (`cd POS && yarn build`, frontend dans `POS/`)`

### Forcer un rebuild local (si vraiment nécessaire)

```bash
FORCE_REBUILD=1 yarn build
```

### Documentation complète

- Doc canonique : `bvisible/neoffice-devops:main` → `docs/COMMIT-BUILD-PATTERN.md`
- Doc batch migration (12 apps) : même fichier, sections "Apps that have adopted the pattern" + "Edge cases discovered"
- Vault Obsidian : `[[NORA/04-savoir-faire/drive-frontend-build-pattern]]`

### Edge cases spécifiques à pos_next

- ⚠️ Frontend dans `POS/` (majuscules), artefacts dans `pos_next/public/pos/`.
- ⚠️ Repo GitHub : `bvisible/POSNext` (différent du nom du package `pos_next`).
- `POS/yarn.lock` reste dans `.gitignore` (re-généré à chaque install).

## Annotations fork (`////` markers)

Ce repo est un **fork** de `BrainWise-DEV/POSNext`. Chaque fichier issu de l'upstream et que nous avons modifié porte un commentaire `//// <raison> — <sha7>` au-dessus de chaque bloc divergent. Cette discipline permet de résoudre les futurs merges upstream avec le contexte directement visible.

### Convention

- **Fichiers concernés** : ceux listés dans `.bvisible-tracked-files` (~145 fichiers issus de l'upstream et modifiés chez nous).
- **Format** : `//// <raison courte ≤70 chars> — <sha7>` (JS/Vue script), `# //// …` (Python), `<!-- //// … -->` (Vue template/HTML), `/* //// … */` (CSS/Vue style).
- **Granularité** : un marker par bloc logique = un par commit porteur dans le fichier, placé au-dessus du premier hunk du commit. Les hunks suivants du même commit ne sont pas annotés (le SHA reste greppable dans `git log`).
- **Fichiers JSON / lockfiles** : interdiction d'annoter inline → mettre à jour `BVISIBLE-MODS.md` (registre central).

### Outillage

```bash
# Régénérer / mettre à jour les annotations (idempotent via .bvisible-annotations.json)
python3 scripts/annotate_fork.py --dry-run        # prévisualise
python3 scripts/annotate_fork.py --apply          # applique sur tous les fichiers trackés
python3 scripts/annotate_fork.py --apply --file <path>

# Régénérer le registre des divergences JSON
python3 scripts/json_diff_to_registry.py --apply

# Hook pre-commit (vérifie que tout fichier tracké modifié dans le commit
# contient au moins une nouvelle ligne ////)
pre-commit run check-fork-annotations
```

### Bypass officiel pour commits triviaux

Si un commit modifie un fichier tracké pour une raison réellement triviale (renames de variables non-fonctionnels, whitespace, suppression de blank line), ajouter le trailer dans le message :

```
fix: rename internal var

Annotate: skip
```

**Ne JAMAIS bypasser via `--no-verify`** — c'est interdit par convention. Si une situation légitime nécessite un bypass, utiliser le trailer.

### Après un merge upstream

1. Résoudre les conflits comme d'habitude — les `////` aident à identifier nos modifications volontaires vs. simples updates upstream.
2. Re-générer les annotations affectées : `python3 scripts/annotate_fork.py --apply` (le manifest skip les blocs déjà annotés et inchangés).
3. Pour les fichiers JSON modifiés par le merge : `python3 scripts/json_diff_to_registry.py --apply`.
4. Commit avec le trailer `Annotate: skip` si aucun nouveau bloc ne nécessite d'annotation, sinon laissé le pré-commit hook valider normalement.

### Documentation complète

Plan d'origine : `/Users/jeremy/.claude/plans/en-fait-il-faudrait-indexed-widget.md`.
