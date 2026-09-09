/**
 * DIALER ABSTRACTION — V1 uses the device/browser native dialer (tel: scheme).
 * A future TelephonyApiDialerProvider will initiate calls server-side without
 * ANY change to surveys, interviews, supervision or the data model.
 */

export type ModeDialer = "client" | "serveur";

export interface DialerMeta {
  id: string;
  label: string;
  mode: ModeDialer;
}

export interface ResultatInitiation {
  statut: "INITIE" | "NON_SUPPORTE" | "ERREUR";
  message?: string;
}

export interface DialerProvider {
  meta: DialerMeta;
  /** Client-side initiation (native dialer). Only present for mode "client". */
  initierCoteClient?(numero: string): ResultatInitiation;
  /** Server-side initiation (future telephony API). Only for mode "serveur". */
  initierCoteServeur?(params: {
    numero: string;
    callAttemptId: string;
  }): Promise<ResultatInitiation>;
}
