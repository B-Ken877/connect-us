"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, LoaderCircle } from "lucide-react";
import { LIBELLES_TYPE_QUESTION, LIBELLES_OPERATEUR, type TypeQuestion, type QuestionDef, type LogiqueConditionnelle } from "@/lib/survey-engine/types";

export interface DonneesFormulaireQuestion {
  key: string;
  text: string;
  helpText: string;
  type: TypeQuestion;
  required: boolean;
  configuration: Record<string, unknown>;
  validationRules: { motif?: string; message?: string } | null;
  conditionalLogic: LogiqueConditionnelle | null;
  options: { label: string; value: string; order: number }[];
}

const TYPES_AVEC_OPTIONS: TypeQuestion[] = ["CHOIX_UNIQUE", "CHOIX_MULTIPLE", "LISTE_DEROULANTE"];

function slugifier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

interface Props {
  ouvert: boolean;
  onFermer: () => void;
  onEnregistrer: (donnees: DonneesFormulaireQuestion) => Promise<void>;
  questionInitiale?: QuestionDef | null;
  questionsPrecedentes: { key: string; text: string }[];
  clesExistantes: string[];
}

/** Question editor dialog: type, options, validation config, conditional logic. */
export function EditeurQuestionDialog({
  ouvert,
  onFermer,
  onEnregistrer,
  questionInitiale,
  questionsPrecedentes,
  clesExistantes,
}: Props) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cleModifiee, setCleModifiee] = useState(Boolean(questionInitiale));

  // --- état du formulaire ---
  const [texte, setTexte] = useState(questionInitiale?.text ?? "");
  const [cle, setCle] = useState(questionInitiale?.key ?? "");
  const [aide, setAide] = useState(questionInitiale?.helpText ?? "");
  const [type, setType] = useState<TypeQuestion>(questionInitiale?.type ?? "CHOIX_UNIQUE");
  const [obligatoire, setObligatoire] = useState(questionInitiale?.required ?? false);
  const [options, setOptions] = useState<{ label: string; value: string }[]>(
    questionInitiale?.options.map((o) => ({ label: o.label, value: o.value })) ?? [{ label: "", value: "" }],
  );
  const [cfg, setCfg] = useState<Record<string, unknown>>(
    (questionInitiale?.configuration ?? {}) as Record<string, unknown>,
  );
  const [motif, setMotif] = useState(questionInitiale?.validationRules?.motif ?? "");
  const [messageMotif, setMessageMotif] = useState(questionInitiale?.validationRules?.message ?? "");
  const [logiqueActive, setLogiqueActive] = useState(Boolean(questionInitiale?.conditionalLogic));
  const [logique, setLogique] = useState<LogiqueConditionnelle>(
    questionInitiale?.conditionalLogic ?? { operateurLogique: "ET", conditions: [{ questionKey: "", operateur: "EGAL" }] },
  );

  // Reset when reopening for a different question.
  useEffect(() => {
    if (ouvert) {
      setTexte(questionInitiale?.text ?? "");
      setCle(questionInitiale?.key ?? "");
      setAide(questionInitiale?.helpText ?? "");
      setType(questionInitiale?.type ?? "CHOIX_UNIQUE");
      setObligatoire(questionInitiale?.required ?? false);
      setOptions(questionInitiale?.options.map((o) => ({ label: o.label, value: o.value })) ?? [{ label: "", value: "" }]);
      setCfg((questionInitiale?.configuration ?? {}) as Record<string, unknown>);
      setMotif(questionInitiale?.validationRules?.motif ?? "");
      setMessageMotif(questionInitiale?.validationRules?.message ?? "");
      setLogiqueActive(Boolean(questionInitiale?.conditionalLogic));
      setLogique(questionInitiale?.conditionalLogic ?? { operateurLogique: "ET", conditions: [{ questionKey: "", operateur: "EGAL" }] });
      setCleModifiee(Boolean(questionInitiale));
      setErreur(null);
    }
  }, [ouvert, questionInitiale?.id]);

  // Auto-key from text until the user edits the key manually.
  useEffect(() => {
    if (!cleModifiee && !questionInitiale) setCle(slugifier(texte));
  }, [texte]);

  const valeurRequisePourOperateur = useMemo(
    () => (op: string) => !["EST_REPONDU", "EST_VIDE"].includes(op),
    [],
  );

  async function soumettre() {
    setErreur(null);
    if (texte.trim().length < 3) return setErreur("L'intitulé de la question est requis (3 caractères minimum).");
    if (!/^[a-z0-9_]{2,60}$/.test(cle)) return setErreur("Clé invalide : minuscules, chiffres et underscores (2 à 60 caractères).");
    if (!questionInitiale && clesExistantes.includes(cle)) return setErreur("Cette clé existe déjà dans cette version.");
    if (questionInitiale && questionInitiale.key !== cle && clesExistantes.includes(cle)) {
      return setErreur("Cette clé existe déjà dans cette version.");
    }
    if (TYPES_AVEC_OPTIONS.includes(type)) {
      const valides = options.filter((o) => o.label.trim() && o.value.trim());
      if (valides.length < 2) return setErreur("Renseignez au moins deux options (libellé + valeur).");
      if (new Set(valides.map((o) => o.value)).size !== valides.length) return setErreur("Les valeurs d'options doivent être uniques.");
    }

    setEnCours(true);
    try {
      await onEnregistrer({
        key: cle,
        text: texte.trim(),
        helpText: aide.trim(),
        type,
        required: obligatoire,
        configuration: cfg,
        validationRules: motif.trim() ? { motif: motif.trim(), message: messageMotif.trim() || undefined } : null,
        conditionalLogic: logiqueActive
          ? {
              operateurLogique: logique.operateurLogique,
              conditions: logique.conditions.filter((c) => c.questionKey),
            }
          : null,
        options: options
          .filter((o) => o.label.trim() && o.value.trim())
          .map((o, i) => ({ label: o.label.trim(), value: o.value.trim(), order: i })),
      });
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setEnCours(false);
    }
  }

  function majCfg(champ: string, valeur: unknown) {
    setCfg((prec) => ({ ...prec, [champ]: valeur }));
  }

  return (
    <Dialog open={ouvert} onOpenChange={(v) => !v && onFermer()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto scroll-fin">
        <DialogHeader>
          <DialogTitle>{questionInitiale ? "Modifier la question" : "Nouvelle question"}</DialogTitle>
          <DialogDescription>
            Configurez l&apos;intitulé, le type de réponse, les options et les règles d&apos;affichage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-texte">Intitulé de la question *</Label>
            <Textarea
              id="q-texte"
              rows={2}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Ex. Travaillez-vous actuellement ?"
              maxLength={1000}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-cle">Clé stable *</Label>
              <Input
                id="q-cle"
                value={cle}
                onChange={(e) => {
                  setCleModifiee(true);
                  setCle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
                }}
                placeholder="ex. situation_emploi"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Identifiant technique (statistiques, exports, logique).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-type">Type de question</Label>
              <Select value={type} onValueChange={(v) => setType(v as TypeQuestion)}>
                <SelectTrigger id="q-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LIBELLES_TYPE_QUESTION).map(([valeur, libelle]) => (
                    <SelectItem key={valeur} value={valeur}>
                      {libelle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-aide">Aide / consigne (facultatif)</Label>
            <Input id="q-aide" value={aide} onChange={(e) => setAide(e.target.value)} maxLength={1000} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Réponse obligatoire</p>
              <p className="text-xs text-muted-foreground">L&apos;agent ne pourra pas passer sans répondre.</p>
            </div>
            <Switch checked={obligatoire} onCheckedChange={setObligatoire} aria-label="Réponse obligatoire" />
          </div>

          {TYPES_AVEC_OPTIONS.includes(type) && (
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-sm font-medium">Options de réponse</p>
              <div className="mt-3 space-y-2">
                {options.map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={option.label}
                      onChange={(e) => {
                        const copie = [...options];
                        copie[i] = { label: e.target.value, value: cleModifiee ? copie[i].value : slugifier(e.target.value) };
                        setOptions(copie);
                      }}
                      placeholder={`Libellé ${i + 1}`}
                      className="flex-1"
                    />
                    <Input
                      value={option.value}
                      onChange={(e) => {
                        const copie = [...options];
                        copie[i] = { ...copie[i], value: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_") };
                        setOptions(copie);
                      }}
                      placeholder="valeur"
                      className="w-32 font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setOptions(options.filter((_, j) => j !== i))}
                      aria-label="Supprimer l'option"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5"
                onClick={() => setOptions([...options, { label: "", value: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter une option
              </Button>
            </div>
          )}

          {type === "NOMBRE" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Min</Label>
                <Input type="number" value={(cfg.nombreMin as number) ?? ""} onChange={(e) => majCfg("nombreMin", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max</Label>
                <Input type="number" value={(cfg.nombreMax as number) ?? ""} onChange={(e) => majCfg("nombreMax", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unité</Label>
                <Input value={(cfg.unite as string) ?? ""} onChange={(e) => majCfg("unite", e.target.value || undefined)} placeholder="ans, €…" />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={(cfg.entier as boolean) ?? false} onChange={(e) => majCfg("entier", e.target.checked)} />
                  Entier
                </label>
              </div>
            </div>
          )}

          {(type === "TEXTE_COURT" || type === "TEXTE_LONG") && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Longueur min</Label>
                <Input type="number" min={0} value={(cfg.texteMin as number) ?? ""} onChange={(e) => majCfg("texteMin", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Longueur max</Label>
                <Input type="number" min={1} value={(cfg.texteMax as number) ?? ""} onChange={(e) => majCfg("texteMax", e.target.value === "" ? undefined : Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Format attendu (regex, facultatif)</Label>
                <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="ex. ^[0-9]{5}$" className="font-mono text-sm" />
                <Input value={messageMotif} onChange={(e) => setMessageMotif(e.target.value)} placeholder="Message si format invalide" className="text-sm" />
              </div>
            </div>
          )}

          {type === "ECHELLE" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Note minimale</Label>
                <Select value={String((cfg.echelleMin as number) ?? 0)} onValueChange={(v) => majCfg("echelleMin", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[0, 1].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note maximale</Label>
                <Select value={String((cfg.echelleMax as number) ?? 10)} onValueChange={(v) => majCfg("echelleMax", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[5, 7, 10].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Libellé min</Label>
                <Input value={(cfg.echelleMinLibelle as string) ?? ""} onChange={(e) => majCfg("echelleMinLibelle", e.target.value || undefined)} placeholder="Pas du tout" />
              </div>
              <div className="space-y-1.5">
                <Label>Libellé max</Label>
                <Input value={(cfg.echelleMaxLibelle as string) ?? ""} onChange={(e) => majCfg("echelleMaxLibelle", e.target.value || undefined)} placeholder="Tout à fait" />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Affichage conditionnel</p>
                <p className="text-xs text-muted-foreground">N&apos;afficher cette question que selon les réponses précédentes.</p>
              </div>
              <Switch checked={logiqueActive} onCheckedChange={setLogiqueActive} aria-label="Affichage conditionnel" />
            </div>

            {logiqueActive && (
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <span>Afficher si</span>
                  <Select
                    value={logique.operateurLogique}
                    onValueChange={(v) => setLogique({ ...logique, operateurLogique: v as "ET" | "OU" })}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ET">Toutes (ET)</SelectItem>
                      <SelectItem value="OU">Au moins une (OU)</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>des conditions suivantes :</span>
                </div>

                {logique.conditions.map((condition, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={condition.questionKey}
                      onValueChange={(v) => {
                        const conditions = [...logique.conditions];
                        conditions[i] = { ...condition, questionKey: v };
                        setLogique({ ...logique, conditions });
                      }}
                    >
                      <SelectTrigger className="w-52"><SelectValue placeholder="Question…" /></SelectTrigger>
                      <SelectContent>
                        {questionsPrecedentes.map((q) => (
                          <SelectItem key={q.key} value={q.key}>
                            {q.text.length > 44 ? `${q.text.slice(0, 44)}…` : q.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={condition.operateur}
                      onValueChange={(v) => {
                        const conditions = [...logique.conditions];
                        conditions[i] = { ...condition, operateur: v as typeof condition.operateur, valeur: valeurRequisePourOperateur(v) ? condition.valeur : undefined };
                        setLogique({ ...logique, conditions });
                      }}
                    >
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(LIBELLES_OPERATEUR).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {valeurRequisePourOperateur(condition.operateur) && (
                      <Input
                        value={String(condition.valeur ?? "")}
                        onChange={(e) => {
                          const conditions = [...logique.conditions];
                          const brut = e.target.value;
                          conditions[i] = {
                            ...condition,
                            valeur: brut !== "" && !Number.isNaN(Number(brut)) ? Number(brut) : brut,
                          };
                          setLogique({ ...logique, conditions });
                        }}
                        placeholder="Valeur (ex. oui, 18…)"
                        className="w-40"
                      />
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLogique({ ...logique, conditions: logique.conditions.filter((_, j) => j !== i) })}
                      aria-label="Supprimer la condition"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setLogique({ ...logique, conditions: [...logique.conditions, { questionKey: "", operateur: "EGAL" }] })}
                >
                  <Plus className="h-3.5 w-3.5" /> Ajouter une condition
                </Button>
                {questionsPrecedentes.length === 0 && (
                  <p className="text-xs text-amber-600">
                    Aucune question précédente : placez d&apos;abord d&apos;autres questions pour construire la logique.
                  </p>
                )}
              </div>
            )}
          </div>

          {erreur && <p className="text-sm font-medium text-red-600" role="alert">{erreur}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>Annuler</Button>
          <Button onClick={soumettre} disabled={enCours} className="gap-2">
            {enCours && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {questionInitiale ? "Enregistrer les modifications" : "Ajouter la question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
