# UNITED Research

Plateforme professionnelle **d'appels téléphoniques et de recherche** pour centre d'appels. Interface intégralement en français. Infrastructure neutre : aucun contenu politique n'est codé en dur, le gestionnaire construit librement ses campagnes et ses scripts.

**Les quatre piliers V1 :**

1. **Conduite d'appels** — file de répondants, workflow d'appel, suivi des tentatives, planification des rappels
2. **Constructeur d'enquêtes** — création de questionnaires sans développeur, logique conditionnelle, versionnage immuable
3. **Console de supervision** — indicateurs temps quasi réel, performance par agent
4. **Qualité des données** — moteur de signalements automatiques, revue supervisée tracée

---

## Démarrage rapide (local)

### Prérequis

- [Bun](https://bun.sh) ≥ 1.3
- Node.js ≥ 20 (pour certains outils)
- Aucun serveur PostgreSQL à installer : le développement local utilise un **PostgreSQL 18 embarqué** (binaire réel, données dans `.pgdata/`, port **5433**)

### Installation

```bash
bun install

# 1. Démarrer la base embarquée (idempotent — sans effet si déjà lancée)
bun scripts/dev-db.ts

# 2. Appliquer le schéma Prisma + les gardes d'intégrité + régénérer le client
bun run db:push

# 3. Injecter les données de démonstration
bun run seed

# 4. Lancer le serveur de développement
bun run dev
```

L'application tourne sur <http://localhost:3000>.

### Comptes de démonstration

| Rôle | Identifiant | Mot de passe |
|---|---|---|
| Administrateur | `admin@united-research.ht` | `Démo2026!` |
| Agents | `agent1@united-research.ht` … `agent3@united-research.ht` | `Démo2026!` |

> Les données de démonstration (répondants, enquête « Enquête politique — Démonstration », entretiens, signalements) sont **entièrement fictives**. N'utilisez jamais de données personnelles réelles en développement.

---

## Stack technique

| Domaine | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 16 (App Router) + TypeScript 5** | Server Components, Server Actions, déploiement Vercel natif |
| Base de données | **PostgreSQL** | Enums, tableaux scalaires, `SELECT … FOR UPDATE SKIP LOCKED`, triggers d'immutabilité |
| ORM | **Prisma** | Requêtes typées, protection anti-injection SQL, migrations simples |
| UI | **Tailwind CSS 4 + shadcn/ui** | Composants accessibles, design institutionnel cohérent |
| Auth | **Sessions JWT signées (jose) en cookie HttpOnly + bcrypt** | Sans dépendance à un service externe, compatible serverless |
| Validation | **Zod** | Schemas partagés client/serveur |
| Tests | **Vitest** | Logique métier pure testée indépendamment de l'UI |

Architecture **monolithe modulaire** : simple, déployable sur Vercel (serverless), prêt à évoluer.

---

## Architecture des dossiers

```
src/
├── app/                      # Routes App Router (pages fines)
│   ├── connexion/            #   Page de connexion (publique)
│   ├── (app)/                #   Zone authentifiée (shell + navigation par rôle)
│   │   ├── session/          #   Espace agent : tableau de bord, appel, entretien
│   │   ├── enquetes/         #   Gestionnaire : liste, création, édition, aperçu
│   │   ├── supervision/      #   Console superviseur (polling 10 s)
│   │   ├── controle-qualite/ #   Revue des signalements
│   │   ├── repondants/       #   Vivier de répondants (PII isolée)
│   │   ├── entretiens/       #   Historique des entretiens
│   │   └── agents/ parametres/ # Administration (admin)
│   └── api/                  # Route Handlers : santé, métriques, export CSV
├── components/app/           # Composants applicatifs (shell, runner d'entretien…)
├── lib/                      # Couche domaine — logique métier pure et transversale
│   ├── survey-engine/        #   MOTEUR D'ENQUÊTE (pur) : visibilité, validation,
│   │                         #   progression, cohérence, sérialisation
│   ├── quality/              #   Règles qualité (pur, propositions de signalements)
│   ├── auth/                 #   Sessions, hachage, matrice d'autorisation
│   ├── dialer/               #   ABSTRACTION COMPOSEUR (provider registry)
│   ├── export/               #   Générateur CSV (RFC 4180, BOM Excel)
│   ├── validation/           #   Schemas Zod partagés
│   └── db.ts config.ts errors.ts audit.ts …
├── server/
│   ├── services/             # Logique métier transactionnelle (Prisma)
│   │   ├── respondent-queue.ts   # Attribution SKIP LOCKED
│   │   ├── interview-service.ts  # Soumission transactionnelle + moteur qualité
│   │   ├── survey-service.ts     # Versionnage immuable
│   │   └── …
│   └── actions/              # Server Actions (validation + autorisation + service)
└── proxy.ts                  # Barrière n°1 : session + matrice rôles (edge)
tests/                        # Vitest — moteur, qualité, autorisation, export
prisma/                       # schema.prisma, seed.ts, guards.sql
```

Règle : **pages fines, logique dans `lib/` (pur) et `server/services/` (transactionnel)**. Aucune duplication de logique métier entre client et serveur — le moteur d'enquête est le même code pour l'aperçu du gestionnaire, l'interface agent et la soumission serveur.

---

## Base de données

### Schéma (modèles principaux)

- `User` — comptes + rôles (`ADMINISTRATEUR`, `GESTIONNAIRE`, `SUPERVISEUR`, `AGENT`)
- `Respondent` — **PII isolée** (nom, téléphone, référence externe) ; statuts de file
- `Survey` → `SurveyVersion` (immuable une fois `PUBLIEE`) → `Question` → `QuestionOption`
- `Interview` (répondant + **version exacte** + agent + appel) → `Answer` (colonnes typées, **queryable**)
- `CallAttempt` — tentatives d'appel avec issues (`TERMINE`, `SANS_REPONSE`, `OCCUPE`, `NUMERO_INCORRECT`, `REFUS`, `RAPPEL`, `ABANDONNE`)
- `QualityFlag` — signalements qualité (5 types) avec circuit de revue
- `AgentSession` — présence agents (supervision)
- `AuditLog` — journal d'audit des actions sensibles

### Garanties d'intégrité

1. **Versionnage immuable** : les triggers `prisma/guards.sql` interdisent **au niveau PostgreSQL** toute modification de questions/options d'une version publiée (mêmes via SQL direct). Faire évoluer un questionnaire = créer une nouvelle version.
2. **Attribution concurrente** : la file utilise `SELECT … FOR UPDATE SKIP LOCKED` dans une transaction — deux agents ne peuvent jamais recevoir le même répondant. Verrou d'attribution expirable (`ASSIGNMENT_LOCK_MINUTES`).
3. **Soumission transactionnelle** : entretien + réponses + répondant + présence + signalements qualité committent **ensemble ou pas du tout**.
4. **Contraintes** : clés étrangères, index sur toutes les colonnes de filtrage, unicité `(surveyId, versionNumber)`, `(interviewId, questionId)`, `(questionId, value)`, index partiel *un seul appel actif par agent*.

### Migrations

```bash
bun run db:push        # applique le schéma + guards.sql (développement)
bunx prisma db execute --file prisma/guards.sql --schema prisma/schema.prisma  # gardes seules
```

En production : `bunx prisma db push` (ou `prisma migrate deploy` si vous préférez le mode migrations) puis appliquer `guards.sql` **une fois**.

### Seed

```bash
bun run seed   # réinitialise et injecte le jeu de démonstration complet
```

---

## Moteur d'enquête (`lib/survey-engine`)

Code **100 % pur** (aucune dépendance framework/DB), partagé par l'aperçu, l'agent et le serveur :

- **Visibilité conditionnelle** — `Question.conditionalLogic` : `{ operateurLogique: ET|OU, conditions: [{ questionKey, operateur, valeur }] }`. Opérateurs : `EGAL`, `DIFFERENT`, `CONTIENT`, `NON_CONTIENT`, `SUPERIEUR(_OU_EGAL)`, `INFERIEUR(_OU_EGAL)`, `EST_REPONDU`, `EST_VIDE`. Les conditions ne référencent que des questions antérieures.
- **Validation** — par type (9 types V1 : texte court/long, nombre, oui/non, choix unique/multiple, échelle, date, liste déroulante) : bornes, entiers, regex personnalisée, options autorisées uniquement.
- **Progression** — navigation entre questions **visibles** uniquement ; « Question 7 sur 18 » reflète le chemin réel du répondant.
- **Cohérence** — règles déclaratives d'incompatibilité (ex. âge < 16 + emploi = oui → signalement `INCOHERENCE`).

Ajouter un type de question = un cas dans `validation.ts` + `serialization.ts` + un contrôle dans `controle-reponse.tsx`. Aucune réécriture du moteur.

## Abstraction composeur (`lib/dialer`)

```ts
interface DialerProvider {
  meta: { id, label, mode: "client" | "serveur" };
  initierCoteClient?(numero): ResultatInitiation;    // V1 : schéma tel:
  initierCoteServeur?(params): Promise<ResultatInitiation>; // futur opérateur téléphonie
}
```

- **V1 = `NativeDialerProvider`** : le bouton « Appeler » délègue la composition à l'appareil via `tel:` ; la plateforme reste maîtresse du file, des tentatives, des issues et des rappels. **Aucune fausse téléphonie.**
- Le futur `TelephonyApiDialerProvider` (mode serveur) se branchera via `/api/appels/[id]/composer` et le registry — **sans toucher** aux enquêtes, entretiens, supervision, qualité ni au modèle de données.
- Normalisation déterministe (`lib/dialer/numero.ts`) : `+509 3700-0000`, `509 3700 0000`, `00509…` et les numéros locaux haïtiens à 8 chiffres sont normalisés en E.164 (`+509XXXXXXXX`) ; un format ambigu reste en chiffres nus (jamais de code pays inventé). L'URI exacte transmise au système est affichée dans la confirmation d'appel.

## Appels depuis Windows avec Microsoft Phone Link

Le bouton « Appeler » transmet le numéro au gestionnaire `tel:` du système — sur le poste de l'agent, c'est **Microsoft Phone Link** :

1. L'agent travaille sur un **PC Windows**, UNITED Research ouvert dans le navigateur.
2. **Microsoft Phone Link** (préinstallé sur Windows 10/11) est configuré.
3. Le **téléphone Android** de l'agent contient la **SIM** (réseau cellulaire de l'opérateur).
4. Le téléphone est **appairé** avec Windows via « Gestionnaire de téléphone mobile » / *Link to Windows*.
5. Windows associe le protocole **`tel:`** à Phone Link (Paramètres → Applications → Applications par défaut).
6. Dans UNITED Research, « Appeler » transmet **`tel:+509XXXXXXXX`** (numéro du répondant affiché dans l'entête, normalisé E.164). La page ne change jamais : le questionnaire reste ouvert, l'agent revient à la fenêtre et saisit les réponses.
7. **L'appel cellulaire réel est passé par le téléphone et son opérateur.** UNITED Research n'a pas d'état d'appel autoritaire : il affiche « Composition lancée » (jamais « Appel en cours ») et un chronomètre d'interface explicitement libellé comme tel.
8. L'issue réelle (réponse, refus, rappel…) est enregistrée par l'agent à la disposition, comme avant.

Si Phone Link n'est pas installé, non appairé, ou si un autre gestionnaire `tel:` est configuré, le système ouvre ce gestionnaire à la place ; l'application reste utilisable dans tous les cas (numéro affiché et copiable, message explicite si la composition échoue). Vérification rapide du poste : cliquer « Appeler » doit afficher l'URI exacte (`tel:+509…`) sous le bouton et ouvrir Phone Link avec le numéro prérempli.

## Sécurité

- Sessions **HttpOnly / SameSite=Lax / Secure (prod)**, JWT HS256 signé (`AUTH_SECRET`), expiration 12 h
- **Triple barrière d'autorisation** : proxy (edge) → garde server-side dans chaque Server Action / Route Handler (`exigerRole`) → contraintes base
- Mots de passe **bcrypt** (coût 10), jamais en clair ; anti-bruteforce (fenêtre glissante par IP sur la connexion)
- **Journal d'audit** des actions sensibles (connexions, publications, exports, revues qualité, changements de rôle)
- Validation Zod systématique des entrées ; ORM = pas d'injection SQL ; jamais de trace brute exposée à l'utilisateur
- **PII séparée** : réponses et entretiens référencent le répondant par identifiant interne ; la vue agrégée des entretiens n'expose aucun nom/téléphone ; l'export CSV masque la référence externe par défaut

## Exports

`GET /api/export/entretiens?versionId=…[&inclureIdentite=1]` — réservé `ADMINISTRATEUR`, **journalisé dans l'audit**. CSV RFC 4180 (séparateur `;`, BOM UTF-8 pour Excel), une colonne par question. La couche `lib/export` est conçue pour accueillir un export XLSX sans toucher aux services.

---

## Déploiement Vercel

1. Pousser le dépôt sur GitHub puis « Import Project » sur Vercel (aucune configuration build spéciale : `next build` standard).
2. Créer une base **PostgreSQL managée** (Vercel Postgres, Neon, Supabase…) et renseigner les variables :

   | Variable | Description |
   |---|---|
   | `DATABASE_URL` | `postgresql://…?schema=public&sslmode=require` |
   | `AUTH_SECRET` | `openssl rand -base64 48` |
   | `DIALER_PROVIDER` | `native` (défaut) |
   | `ASSIGNMENT_LOCK_MINUTES` | optionnel (défaut 120) |
   | `QUALITY_*` | optionnels (seuils du moteur qualité) |

3. Appliquer le schéma contre la base de production **une fois** :
   ```bash
   DATABASE_URL="…" bunx prisma db push
   DATABASE_URL="…" bunx prisma db execute --file prisma/guards.sql --schema prisma/schema.prisma
   ```
4. Créer les comptes (le seed est réservé au développement) via l'interface admin `/agents`.

**Compatibilité serverless** : aucun état en mémoire utile au fonctionnement (le rate-limit mémoire est un filet best-effort), aucun processus persistant, aucun fichier local, pas de WebSocket (supervision en polling court). Tout l'état durable vit dans PostgreSQL.

---

## Tests

```bash
bun test          # ou : bunx vitest run
```

50 tests couvrant la logique critique **indépendamment de l'UI** : visibilité conditionnelle (ET/OU, opérateurs, branchements), validation (9 types, bornes, regex, options fabriquées), progression/complétude, 5 règles qualité, matrice d'autorisation rôles/routes, export CSV (échappement, BOM, PII), sérialisation des réponses et signatures anti-répétition.

## Scripts utiles

| Commande | Rôle |
|---|---|
| `bun run dev` | Serveur de développement |
| `bun run db:push` | Schéma + gardes (dev) |
| `bun run seed` | Données de démonstration |
| `bun test` | Suite de tests |
| `bun run lint` | ESLint |
| `bun scripts/dev-db.ts` | PostgreSQL embarqué (idempotent) |
| `bun scripts/verify-slice.ts` | Contrôle post-passation : entretien complet en base |
| `bun scripts/verify-immutabilite.ts` | Prouve l'immutabilité des versions publiées |
| `bun scripts/verify-concurrence.ts` | Prouve l'absence de collision d'attribution |

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour les décisions d'architecture détaillées (ADR).
