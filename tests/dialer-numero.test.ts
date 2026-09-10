import { describe, it, expect } from "vitest";
import { normaliserNumeroTel, construireUriTel } from "@/lib/dialer/numero";

describe("Normalisation téléphone → URI tel:", () => {
  it("conserve un numéro déjà en E.164 (aucune réécriture aveugle)", () => {
    expect(normaliserNumeroTel("+50937123456")).toBe("+50937123456");
    expect(normaliserNumeroTel("+33612345678")).toBe("+33612345678");
  });

  it("nettoie espaces, tirets et parenthèses d'un numéro international saisi", () => {
    expect(normaliserNumeroTel("+509 3700-0000")).toBe("+50937000000");
    expect(normaliserNumeroTel("(+509) 3700 0000")).toBe("+50937000000");
  });

  it("convertit le préfixe international 00 en +", () => {
    expect(normaliserNumeroTel("0050937123456")).toBe("+50937123456");
  });

  it("préfixe pays 509 sans + (11 chiffres) → +509…", () => {
    expect(normaliserNumeroTel("509 3700 0000")).toBe("+50937000000");
    expect(normaliserNumeroTel("(509) 3700-0000")).toBe("+50937000000");
  });

  it("numéro local haïtien à 8 chiffres (2/3/4) → +509…", () => {
    expect(normaliserNumeroTel("3712 3456")).toBe("+50937123456");
    expect(normaliserNumeroTel("2812-3456")).toBe("+50928123456");
    expect(normaliserNumeroTel("4212 3456")).toBe("+50942123456");
  });

  it("format ambigu → chiffres nus valides RFC 3966 (jamais de code pays inventé)", () => {
    expect(normaliserNumeroTel("06 10 20 30 40")).toBe("0610203040");
    expect(construireUriTel("06 10 20 30 40")).toBe("tel:0610203040");
  });

  it("rejette les entrées sans numéro exploitable", () => {
    expect(normaliserNumeroTel("")).toBeNull();
    expect(normaliserNumeroTel("   ")).toBeNull();
    expect(normaliserNumeroTel("abc")).toBeNull();
    expect(normaliserNumeroTel("123")).toBeNull(); // trop court pour être réel
    expect(construireUriTel("abc")).toBeNull();
  });

  it("neutralise un + mal placé au milieu du numéro", () => {
    expect(normaliserNumeroTel("509+3712")).toBe("5093712");
  });

  it("génère l'URI tel: finale transmise à l'OS (Phone Link)", () => {
    expect(construireUriTel("+509 3700-0000")).toBe("tel:+50937000000");
    expect(construireUriTel("3712 3456")).toBe("tel:+50937123456");
    expect(construireUriTel("0050937123456")).toBe("tel:+50937123456");
    expect(construireUriTel("509 3700 0000")).toBe("tel:+50937000000");
  });
});
