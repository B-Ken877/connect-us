# UNITED Research — Architecture

Document de décision d'architecture. Chaque choix vise l'équilibre demandé :
**simple + modulaire + fiable**, prêt pour la téléphonie réelle et le scale,
sans sur-ingénierie V1.

---

## 1. Vue d'ensemble

```
┌────────────────────────────────────────────────────────────────────┐
│  Navigateur (agent / administrateur)                                 │
│  React 19 · composants clients légers · polling court             │
└───────────────▲────────────────────────────────────────────────────┘
                │ Server Actions (mutations, CSRF-safe)
                │ GET Route Handlers (polling métriques, export CSV)
┌───────────────┴────────────────────────────────────────────────────┐
│  Next.js 16 (Vercel, serverless)                                   │
│  proxy.ts (edge)          → barrière session + rôles               │
│  server/actions           → validation Zod + exigerRole + service  │
│  server/services          → logique métier transactionnelle        │
│  lib/                     → domaine PUR (moteur, qualité, dialer…) │
└───────────────▲────────────────────────────────────────────────────┘
                │ Prisma (requêtes typées, pas de SQL concaténé)
┌───────────────┴────────────────────────────────────────────────────┐
│  PostgreSQL managé (Neon / Vercel Postgres / RDS)                  │
│  contraintes FK/UNIQUE · index · triggers d'immutabilité           │
│  SKIP LOCKED pour la file d'appels                                 │
└────────────────────────────────────────────────────────────────────┘
```

**Monolithe modulaire** : un seul déploiement, des frontières de code strictes
(`lib/` pur ⇄ `server/services` transactionnel ⇄ `app/` présentation).
Pas de microservices, pas de file d'attente externe, pas de Redis : tout l'état
durable est dans PostgreSQL, ce qui rend l'application trivialement
serverless-compatible.

---

## 2. Décisions d'architecture (ADR)

### ADR-01 — PostgreSQL obligatoire, SQLite écarté

**Décision** : PostgreSQL uniquement (y compris en dev, via un binaire embarqué
`scripts/dev-db.ts`).

**Pourquoi** : la spécification exige des garanties que SQLite ne fournit pas :
enums natifs, `String[]` (réponses de choix), `FOR UPDATE SKIP LOCKED`
(file d'appels), triggers plpgsql (immutabilité des versions). Un schéma
« compatible des deux » aurait produit un plus grand dénominateur sans
garanties. Le dev embarqué exécute le **même moteur** que la production.

### ADR-02 — Auth maison (jose + bcrypt) plutôt que NextAuth

**Décision** : sessions JWT HS256 signées, cookie HttpOnly/SameSite=Lax/Secure,
12 h, `lib/auth`.

**Pourquoi** : le besoin est strictement interne (comptes créés par l'admin,
aucun SSO/OAuth en V1). NextAuth apportait une dépendance lourde pour un flux
credentials unique. L'implémentation (~200 lignes, testable) est transparente :
proxy edge (vérification jose), Server Actions (création/destruction),
`exigerRole()` (re-vérification DB du compte actif à chaque action sensible →
révocation immédiate). Migration vers NextAuth/Auth.js possible plus tard sans
toucher aux pages (la couche `lireSession()/exigerRole()` est le seul contrat).

**Rate-limiting** : fenêtre glissante en mémoire sur la connexion. Sur
serverless, le compteur est par instance — filet best-effort assumé en V1 ;
le point d'entrée unique `verifierLimite(cle, max, fenetre)` permettra de
brancher un store partagé (Upstash) en une ligne.

### ADR-03 — Versionnage immuable garanti par la BASE, pas seulement l'appli

**Décision** : triggers plpgsql (`prisma/guards.sql`) :
- `SurveyVersion` : UPDATE interdit si statut ≠ BROUILLON (sauf transition
  PUBLIEE → ARCHIVEE)
- `Question` / `QuestionOption` : INSERT/UPDATE/DELETE interdits si la version
  parente n'est pas BROUILLON

**Pourquoi** : la règle « une version qui collecte ne peut pas être mutée » est
NON-NÉGOCIABLE. Une garde applicative seule laisse la porte ouverte à un bug
de service, un script d'admin, une future intégration. Le refus vient alors de
`raise_exception` PostgreSQL, intercepté et traduit en message français.
*Compromis* : le seed utilise `TRUNCATE` (ne déclenche pas les triggers de
ligne) pour être ré-exécutable — acceptable car réservé au développement.

**Workflow** : BROUILLON → (édition + aperçu) → PUBLIEE (immuable, `publishedAt`)
→ ARCHIVEE. « Nouvelle version » clone questions/options/config de la dernière
version en un nouveau brouillon. Chaque `Interview` référence `surveyVersionId`
— les données historiques restent exactement fidèles à ce qui a été posé.

### ADR-04 — File d'appels : SELECT … FOR UPDATE SKIP LOCKED

**Décision** : attribution transactionnelle dans
`server/services/respondent-queue.ts` :

1. libération des verrous expirés (`lockExpiresAt`)
2. reprise de l'appel/entretien en cours de l'agent (rafraîchissement de page)
3. bascule INJOIGNABLE des répondants ayant épuisé `maxTentatives`
4. `SELECT id … WHERE status='DISPONIBLE' ORDER BY "createdAt" LIMIT 1
   FOR UPDATE SKIP LOCKED` puis UPDATE d'état + création `CallAttempt`, tout
   dans la même transaction interactive Prisma.

**Pourquoi** : la contrainte « deux agents ne reçoivent jamais le même
répondant » doit être vraie au niveau base. SKIP LOCKED est le pattern canonique
des files de travail PostgreSQL : les workers concurrents se répartissent les
lignes sans attente ni double attribution. Vérifié par
`scripts/verify-concurrence.ts`. Un index partiel unique
(`agentId WHERE status='EN_COURS'`) interdit en outre deux appels actifs au
même agent.

**Verrou d'attribution** : `assignedToId/assignedAt/lockExpiresAt` sur
`Respondent`. Un agent qui ferme son onglet rend le répondant disponible au
bout de `ASSIGNMENT_LOCK_MINUTES` — pas de répondant perdu.

### ADR-05 — Réponses typées en colonnes, jamais de JSON blob

**Décision** : `Answer` porte `textValue / numberValue / dateValue / boolValue /
choiceValues[]` + `questionKey` dénormalisé, contrainte d'unicité
`(interviewId, questionId)`.

**Pourquoi** : la spécification exige des réponses **requêtables**. Une colonne
par type permet index et agrégations SQL directes (ex. distribution d'une
question : `GROUP BY "numberValue" WHERE "questionKey"='confiance'`). La
conversion valeur canonique ⇄ colonnes est centralisée dans
`survey-engine/serialization.ts` (testée).

### ADR-06 — Moteur qualité : propositions, jamais de suppression

**Décision** : 5 règles pures (`lib/quality/rules.ts`) qui reçoivent des
entrées explicites et retournent des *propositions* de signalement ; le service
d'entretien les évalue **dans la transaction de soumission** et insère des
`QualityFlag` à examiner. La revue qualité par l'administrateur (À examiner/Validé/Rejeté/Faux
positif) est auditée et met à jour `Interview.qualityStatus` — sans jamais
effacer ni réécrire des réponses.

- `DUREE_TROP_COURTE` — max(durée minimale globale, secondes/question × questions visibles)
- `DOUBLON` — répondant déjà TERMINÉ sur la même version
- `REPETITION_REPONSES` — signature déterministe des questions fermées
  (excluant le texte libre) identique ≥ seuil chez un même agent
- `ACTIVITE_EXCESSIVE` — z-score du volume du jour **vs. le reste de l'équipe**
  (baseline excluant l'agent évalué, sinon l'outlier masque son propre σ)
- `INCOHERENCE` — règles d'incompatibilité déclaratives de la version
  (`config.reglesCoherence`), évaluées par le moteur d'enquête

### ADR-07 — Composeur : abstraction, aucune fausse téléphonie

**Décision** : interface `DialerProvider` (registry serveur sans `window` +
`initierAppel()` client). V1 = `native` : le numéro est normalisé en E.164
(`lib/dialer/numero.ts`, règles Haïti déterministes) puis l'URI `tel:` est
transmise au système par clic d'ancre — le geste utilisateur standard, sans
navigation ni minuteur. Poste cible : Windows + Phone Link.

**Pourquoi** : pas d'API téléphonie en V1 — la plateforme ne doit **ni simuler
des appels, ni inventer des états d'appel**. L'agent compose, parle, puis
enregistre l'issue réelle (`TERMINE`, `SANS_REPONSE`, `OCCUPE`,
`NUMERO_INCORRECT`, `REFUS`, `RAPPEL`, `ABANDONNE`). La future intégration
serveur (`telephony-api`) implémentera `initierCoteServeur` + la route
`/api/appels/[id]/composer` : événements de statut, durée réelle, méta de
recording — **sans changer** enquêtes, entretiens, supervision, qualité ni
modèle de données.

### ADR-08 — Supervision en polling court, pas de WebSocket

**Décision** : `GET /api/supervision/metrics` (10 s) et
`GET /api/session/etat` (15 s, sert aussi de heartbeat de présence).

**Pourquoi** : Vercel = fonctions sans état ; des WebSockets exigeraient un
serveur persistant dédié (infra interdite en V1). Le polling de données
agrégées SQL est fiable, simple, et largement suffisant pour un plateau
d'appels. La fraîcheur de présence dérive de `lastActivityAt` (heartbeat +
chaque action) : un agent sans battement apparaît « Hors ligne » après 90 s.

### ADR-09 — Séparation PII / réponses

**Décision** : la seule table portant identité/contact est `Respondent`.
`Interview` et `Answer` la référencent par identifiant. La vue « Entretiens »
(agrégée) n'affiche que l'ID interne ; l'export CSV masque la référence
externe sauf `inclureIdentite=1` (journalisé). Il est donc possible de donner
un accès analytique aux réponses sans exposer le téléphone des répondants.

### ADR-10 — Sécurité en profondeur

1. **Middleware edge** : redirige `/` selon le rôle, bloque les routes non
   publiques sans session, applique la matrice rôles→routes.
2. **Server Actions / Route Handlers** : `exigerRole([rôles])` re-vérifie la
   session **et** le statut actif en base (révocation immédiate).
3. **Base** : FK, contraintes d'unicité, triggers d'immutabilité.
4. Entrées validées par Zod ; sorties jamais brutes (messages français, traces
   serveur uniquement) ; ORM = pas d'injection ; audit des actions sensibles.

### ADR-11 — Tests sur la logique critique, UI exclue

**Décision** : Vitest sur le domaine pur (moteur d'enquête, qualité,
autorisation, export, sérialisation) — 50 tests. Les scripts
`scripts/verify-*.ts` jouent les garanties **contre la vraie base** (slice
verticale, immutabilité, concurrence). La vérification de bout en bout des
parcours UI est faite manuellement/par navigateur au moment de la livraison.

---

## 3. Flux critiques

### Passation d'un entretien (parcours agent — workspace unifié)

```
Commencer la session → DISPONIBLE
   │ attribuerProchainRepondant()          [transaction SKIP LOCKED]
   │   répondant réservé + CallAttempt EN_COURS + Interview EN_COURS
   │   (surveyVersionId figé = version publiée active À L'ATTRIBUTION)
   ▼
/session/entretien/[id] — le questionnaire est DÉJÀ à l'écran
   │ EnteteRepondant : répondant + téléphone + « ☎ Appeler » (initierAppel, aucune navigation)
   ▼
tel: (composeur natif) — l'agent revient : le questionnaire reste où il était
   │
   │ autosave par réponse (upsert, 700 ms debounced + navigation)
   ▼
« Terminer l'entretien » → validation moteur → PanneauDisposition
   ├─ « Entretien complété » [TRANSACTION]
   │     réponses upsertées + interview TERMINE + appel TERMINE
   │     + répondant INTERROGE + présence DISPONIBLE + signalements qualité
   └─ Sans réponse / Occupé / Refus / Numéro incorrect / Rappel [TRANSACTION]
         interview ABANDONNE (JAMAIS comptée comme terminée) + appel clôturé
         avec l'issue réelle + répondant remis en file / planifié / exclu
   ▼
« Répondant suivant » → nouvelle attribution → workspace suivant
```

Notes :
- L'écran `/session/appel/[id]` subsiste comme **couche de compatibilité**
  (données en vol antérieures au refactor) : dès qu'un entretien vivant
  existe pour l'appel, il redirige vers `/session/entretien/[id]`.
- L'index partiel `uq_appel_actif_par_agent` rend un double « répondant
  suivant » impossible au niveau base (un seul appel EN_COURS par agent).

### Publication d'une nouvelle version

```
Enquête PUBLIEE (v1) ──« Nouvelle version »──▶ v2 BROUILLON (clone v1)
      v2 : édition libre (le trigger bloque toute modification de v1)
      ──« Publier »──▶ v2 PUBLIEE (publishedAt) — immuable à vie
      les nouveaux entretiens prennent la dernière version publiée
      les entretiens v1 restent rattachés à v1 (intégrité historique)
```

---

## 4. Limites connues V1 (assumées)

- Un seul questionnaire « en passation » à la fois côté agent (dernière version
  publiée). Multi-enquêtes simultanées : sélection à l'ouverture d'appel (V2).
- Rate-limit login en mémoire (par instance).
- Rapports d'analyse avancés et export XLSX : prévus par la couche export,
  non implémentés.
- La reprise d'un entretien interrompu repose sur le verrou + l'autosave ; un
  agent « disparu » sans fermer libère son répondant au bout du verrou.
- Pas d'enregistrement audio/métadonnées d'appel (aucun opérateur téléphonie
  retenu en V1).

Chacune de ces limites est isolée derrière une frontière claire (service,
registry, couche export) et ne compromet pas le modèle de données.
