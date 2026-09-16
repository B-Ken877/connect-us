import { z } from "zod";

/**
 * Zod validation schemas — used by Server Actions and Route Handlers for
 * input validation (never trust client payloads), shared with client forms
 * where useful.
 */

export const schemaConnexion = z.object({
  email: z.string().trim().min(1, "Veuillez saisir votre identifiant.").max(200),
  motDePasse: z.string().min(1, "Veuillez saisir votre mot de passe.").max(200),
});

export const schemaEnquete = z.object({
  titre: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères.").max(200),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const schemaOption = z.object({
  label: z.string().trim().min(1, "Le libellé de l'option est requis.").max(300),
  value: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "La valeur ne peut contenir que des lettres, chiffres, tirets."),
});

const operateurCondition = z.enum([
  "EGAL",
  "DIFFERENT",
  "CONTIENT",
  "NON_CONTIENT",
  "SUPERIEUR",
  "SUPERIEUR_OU_EGAL",
  "INFERIEUR",
  "INFERIEUR_OU_EGAL",
  "EST_REPONDU",
  "EST_VIDE",
]);

export const schemaCondition = z.object({
  questionKey: z.string().trim().min(1).max(100),
  operateur: operateurCondition,
  valeur: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const schemaLogiqueConditionnelle = z.object({
  operateurLogique: z.enum(["ET", "OU"]),
  conditions: z.array(schemaCondition).min(1, "Ajoutez au moins une condition."),
});

export const schemaConfigurationQuestion = z.object({
  texteMin: z.number().int().min(0).max(5000).optional(),
  texteMax: z.number().int().min(1).max(5000).optional(),
  placeholder: z.string().max(200).optional(),
  nombreMin: z.number().optional(),
  nombreMax: z.number().optional(),
  entier: z.boolean().optional(),
  unite: z.string().max(20).optional(),
  echelleMin: z.number().int().min(0).max(5).optional(),
  echelleMax: z.number().int().min(1).max(10).optional(),
  echelleMinLibelle: z.string().max(60).optional(),
  echelleMaxLibelle: z.string().max(60).optional(),
  dateMin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateMax: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const schemaQuestion = z.object({
  key: z
    .string()
    .trim()
    .min(2, "La clé doit contenir au moins 2 caractères.")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "La clé ne peut contenir que des minuscules, chiffres et underscores."),
  text: z.string().trim().min(3, "L'intitulé de la question est requis.").max(1000),
  helpText: z.string().trim().max(1000).optional().or(z.literal("")),
  type: z.enum([
    "TEXTE_COURT",
    "TEXTE_LONG",
    "NOMBRE",
    "OUI_NON",
    "CHOIX_UNIQUE",
    "CHOIX_MULTIPLE",
    "ECHELLE",
    "DATE",
    "LISTE_DEROULANTE",
  ]),
  required: z.boolean(),
  configuration: schemaConfigurationQuestion.optional().nullable(),
  validationRules: z
    .object({
      motif: z.string().max(300).optional(),
      message: z.string().max(300).optional(),
    })
    .optional()
    .nullable(),
  conditionalLogic: schemaLogiqueConditionnelle.optional().nullable(),
  options: z.array(schemaOption).max(30).default([]),
});

export const schemaReponse = z.object({
  questionKey: z.string().trim().min(1).max(100),
  valeur: z.record(z.string(), z.unknown()),
});

export const schemaResultatAppel = z
  .object({
    statut: z.enum([
      "TERMINE",
      "SANS_REPONSE",
      "OCCUPE",
      "MESSAGERIE",
      "NUMERO_INCORRECT",
      "REFUS",
      "RAPPEL",
      "ABANDONNE",
      "NE_PAS_RAPPELER",
      "AUTRE",
    ]),
    dureeSecondes: z.number().int().min(0).max(3600 * 4).optional(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
    rappelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rappelHeure: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine((d) => d.statut !== "RAPPEL" || (d.rappelDate && d.rappelHeure), {
    message: "La date et l'heure de rappel sont obligatoires.",
    path: ["rappelDate"],
  });

export const schemaUtilisateur = z.object({
  name: z.string().trim().min(2, "Le nom est requis.").max(120),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200),
  role: z.enum(["ADMINISTRATEUR", "AGENT"]),
  motDePasse: z.string().min(8, "8 caractères minimum.").max(200).optional(),
  active: z.boolean().default(true),
});

export const schemaRepondant = z.object({
  externalRef: z.string().trim().max(100).optional().or(z.literal("")),
  name: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .min(6, "Numéro de téléphone invalide.")
    .max(25)
    .regex(/^[\d+\s().-]+$/, "Le numéro ne peut contenir que des chiffres et +, espaces, tirets."),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const schemaExamenSignalement = z.object({
  signalementId: z.string().min(1),
  statut: z.enum(["A_EXAMINER", "VALIDE", "REJETE", "FAUX_POSITIF"]),
  commentaire: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const schemaChangementEtatAgent = z.object({
  statut: z.enum(["DISPONIBLE", "EN_PAUSE", "HORS_LIGNE"]),
});

/** Type helpers shared with UI forms. */
export type DonneesConnexion = z.infer<typeof schemaConnexion>;
export type DonneesQuestion = z.infer<typeof schemaQuestion>;
export type DonneesEnquete = z.infer<typeof schemaEnquete>;
export type DonneesUtilisateur = z.infer<typeof schemaUtilisateur>;
export type DonneesRepondant = z.infer<typeof schemaRepondant>;
