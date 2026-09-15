# UNITED Research — CI/CD

Documentation du pipeline d'intégration continue et de déploiement.

---

## 1. Stratégie de branches

| Branche | Rôle | Déploiement Vercel |
|---|---|---|
| `main` | **Production** | Déploiement automatique → domaine principal |
| `united-research` | **Staging / preview** | Déploiement automatique → preview URL |
| `feature/*`, `fix/*` | **Développement** | Preview URL (non-mergée) |

**Règles :**
- Les pull requests vers `main` déclenchent la CI complète (qualité + build).
- Les push vers `main` ou `united-research` déclenchent aussi la CI.
- Vercel déploie automatiquement depuis GitHub — la CI ne déploie PAS.
- Les branches de feature ne sont jamais déployées en production.

---

## 2. Pipeline CI (GitHub Actions)

**Fichier :** `.github/workflows/ci.yml`

### Déclencheurs
- Pull request vers `main`
- Push sur `main` ou `united-research`

### Étapes (fail-fast)

| # | Étape | Commande | Durée ~ |
|---|---|---|---|
| 1 | Checkout | `actions/checkout@v4` | < 5 s |
| 2 | Setup Bun | `oven-sh/setup-bun@v2` | ~ 5 s |
| 3 | Installation | `bun install --frozen-lockfile` | ~ 10 s |
| 4 | Prisma generate | `bunx --bun prisma generate` | ~ 5 s |
| 5 | TypeScript | `bunx --bun tsc --noEmit` | ~ 15 s |
| 6 | ESLint | `bun run lint` | ~ 10 s |
| 7 | Tests | `bun run test` (Vitest + PostgreSQL embarqué) | ~ 30 s |
| 8 | Build | `bun run build` (Next.js standalone) | ~ 30 s |

**Durée totale :** ~ 2 min sur un runner Ubuntu standard.

### Secrets GitHub Actions requis

**Aucun secret n'est requis pour que la CI passe.** Le workflow est autonome :

- `AUTH_SECRET` — généré automatiquement avec une valeur de test CI basée sur le `run_id` (jamais un vrai secret de production)
- `DATABASE_URL` — non requis (les tests démarrent leur propre PostgreSQL embarqué `embedded-postgres`)
- `DIALER_PROVIDER` — défini à `native` dans le workflow

**Optionnel** — si vous voulez un secret CI dédié (au lieu de la valeur auto-générée) :

| Secret | Usage | Valeur |
|---|---|---|
| `CI_AUTH_SECRET` | (Optionnel) Secret JWT de test pour le build | Chaîne aléatoire quelconque |

Si `CI_AUTH_SECRET` est configuré, il remplace la valeur auto-générée. Sinon, la CI utilise `ci-test-secret-{run_id}-not-for-production` — suffisant pour le build.

---

## 3. Déploiement Vercel

Vercel reste responsable du déploiement. La CI GitHub Actions ne crée **pas** de système de déploiement concurrent.

### Flux de déploiement

```
Push/merge → main
  ↓
GitHub Actions CI (qualité + build)  ←  garde verte, bloque si échec
  ↓ (parallèle)
Vercel détecte le push → build → déploiement production
  ↓
Domaine principal mis à jour
```

### Variables d'environnement Vercel

À configurer dans **Vercel Dashboard → Settings → Environment Variables** :

| Variable | Environnement | Description |
|---|---|---|
| `DATABASE_URL` | Production + Preview | `postgresql://...neon...` |
| `AUTH_SECRET` | Production + Preview | `openssl rand -base64 48` |
| `DIALER_PROVIDER` | Production + Preview | `native` |
| `ASSIGNMENT_LOCK_MINUTES` | Optionnel | `120` (défaut) |

**⚠️ Ne jamais commit de `.env` dans le dépôt.**

---

## 4. Migrations Prisma — Sécurité

### Règle d'or

**Ne JAMAIS exécuter `prisma db push` en production.**

| Commande | Usage | Production ? |
|---|---|---|
| `bun run db:push` | Développement local (embedded-postgres) | ❌ Jamais |
| `prisma migrate dev` | Créer une migration en dev | ❌ Jamais |
| `prisma migrate deploy` | Appliquer les migrations en production | ✅ Oui (contrôlé) |

### Procédure de migration production

1. **En développement :** créer la migration
   ```bash
   bunx prisma migrate dev --name description_du_changement
   ```
2. **Revoir** le fichier SQL généré dans `prisma/migrations/`
3. **Commit + push** sur `main`
4. **Backup** de la base Neon (Neon Dashboard → Branches → Create branch)
5. **Appliquer** sur Neon :
   ```bash
   DATABASE_URL="postgresql://..." bunx prisma migrate deploy
   ```
6. **Appliquer les guards d'immutabilité** (si modifiés) :
   ```bash
   DATABASE_URL="postgresql://..." bunx prisma db execute --file prisma/guards.sql --schema prisma/schema.prisma
   ```
7. **Vérifier** que l'application fonctionne (Vercel redéploie automatiquement)

---

## 5. Rollback d'un déploiement

### Vercel (déploiement)

1. **Vercel Dashboard → Deployments**
2. Trouver le dernier déploiement **stable**
3. Menu **⋯ → Promote to Production**
4. Le domaine principal bascule immédiatement vers cette version

### Base de données (migration)

1. **Neon Dashboard → Branches** — restaurer le backup créé avant la migration
2. Ou rédiger une migration **inverse** :
   ```bash
   bunx prisma migrate dev --name rollback_xxx
   ```
3. Revoir, commit, appliquer avec `prisma migrate deploy`

---

## 6. Inspecter un run CI échoué

1. **GitHub → onglet "Actions"**
2. Cliquer sur le run échoué
3. Identifier l'étape en rouge (❌)
4. Cliquer sur l'étape → voir les logs détaillés
5. Le résumé (onglet "Summary") affiche un tableau avec le statut de chaque étape

### Causes fréquentes

| Symptôme | Cause probable | Solution |
|---|---|---|
| TypeScript échoue | Type cassé par un commit | `bunx tsc --noEmit` en local, corriger |
| Tests échouent | Logique métier cassée | `bun run test` en local, corriger |
| Build échoue | Erreur de compilation Next.js | `bun run build` en local, corriger |
| Prisma generate échoue | Schema Prisma invalide | Vérifier `prisma/schema.prisma` |

---

## 7. Ne pas commettre de secrets

### Règles

- ❌ Ne jamais committer `.env`, `.env.local`, `.env.production`
- ❌ Ne jamais mettre `DATABASE_URL` ou `AUTH_SECRET` dans un fichier du dépôt
- ❌ Ne jamais mettre des secrets dans le workflow YAML en clair
- ✅ Utiliser **GitHub Secrets** (Settings → Secrets and variables → Actions)
- ✅ Utiliser **Vercel Environment Variables** (Settings → Environment Variables)

### Fichiers ignorés (`.gitignore`)

Les fichiers suivants sont déjà ignorés par `.gitignore` :
- `.env*`
- `.pgdata*/`
- `.next/`
- `node_modules/`
- `dev.log`, `server.log`

---

## 8. Résumé des responsabilités

| Système | Rôle |
|---|---|
| **GitHub Actions** | CI — qualité, tests, build (qualité gate) |
| **Vercel** | CD — build + déploiement automatique |
| **Neon** | Base de données PostgreSQL managée |
| **Prisma** | ORM + migrations (via `migrate deploy` en production) |

La CI **ne déploie pas**. Vercel déploie. La CI garantit que le code mergé sur `main` est de qualité production.
