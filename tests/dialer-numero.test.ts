import { describe, it, expect } from "vitest";
import { normaliserNumeroTel, construireUriTel } from "@/lib/dialer/numero";

describe("Normalisation téléphone → URI tel: (E.164 générique, sans code pays inventé)", () => {
  it("conserve un numéro déjà en E.164 (aucune réécriture aveugle)", () => {
    expect(normaliserNumeroTel("+50937123456")).toBe("+50937123456");
    expect(normaliserNumeroTel("+33612345678")).toBe("+33612345678");
    expect(normaliserNumeroTel("+12025551234")).toBe("+12025551234");
  });

  it("nettoie espaces, tirets et parenthèses d'un numéro international saisi", () => {
    expect(normaliserNumeroTel("+509 3700-0000")).toBe("+50937000000");
    expect(normaliserNumeroTel("(+509) 3700 0000")).toBe("+50937000000");
    expect(normaliserNumeroTel("+1 (202) 555-1234")).toBe("+12025551234");
    // Sans + : on n'invente pas le code pays → chiffres nus
    expect(normaliserNumeroTel("(509) 3700-0000")).toBe("50937000000");
  });

  it("convertit le préfixe international 00 en +", () => {
    expect(normaliserNumeroTel("0050937123456")).toBe("+50937123456");
    expect(normaliserNumeroTel("0012025551234")).toBe("+12025551234");
  });

  it("numéro local sans code pays → chiffres nus (jamais de code pays inventé)", () => {
    // UNITED Research: on ne devine PLUS le code pays haïtien.
    // Les numéros locaux doivent être saisis avec leur préfixe international.
    expect(normaliserNumeroTel("3712 3456")).toBe("37123456");
    expect(normaliserNumeroTel("06 10 20 30 40")).toBe("0610203040");
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
    expect(construireUriTel("0050937123456")).toBe("tel:+50937123456");
    expect(construireUriTel("+1 202 555 1234")).toBe("tel:+12025551234");
    // Numéro local sans code pays → chiffres nus (RFC 3966 valide)
    expect(construireUriTel("3712 3456")).toBe("tel:37123456");
  });
});
