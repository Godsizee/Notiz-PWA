import { describe, expect, it } from "vitest";
import { planScanSlices } from "./images";

const whole = (width: number, height: number) => [{ sx: 0, sy: 0, sw: width, sh: height }];

describe("planScanSlices", () => {
  it("laesst normale Fotos und Handy-Screenshots ganz", () => {
    expect(planScanSlices(4000, 3000, 3)).toEqual(whole(4000, 3000)); // 12-MP-Foto
    expect(planScanSlices(3000, 4000, 3)).toEqual(whole(3000, 4000));
    expect(planScanSlices(1080, 2400, 3)).toEqual(whole(1080, 2400)); // 20:9-Screenshot
    expect(planScanSlices(1440, 3120, 3)).toEqual(whole(1440, 3120));
    expect(planScanSlices(900, 1800, 3)).toEqual(whole(900, 1800));
  });

  it("zerlegt einen langen Scroll-Screenshot in ueberlappende Abschnitte ohne Luecke", () => {
    const slices = planScanSlices(1080, 7000, 3);
    expect(slices).toHaveLength(3);
    expect(slices[0].sy).toBe(0);
    const last = slices[slices.length - 1];
    expect(last.sy + last.sh).toBe(7000);
    for (let i = 1; i < slices.length; i++) {
      const prevEnd = slices[i - 1].sy + slices[i - 1].sh;
      expect(slices[i].sy).toBeLessThan(prevEnd); // Ueberlappung
      expect(slices[i].sy).toBeGreaterThan(slices[i - 1].sy);
    }
    for (const s of slices) {
      expect(s).toMatchObject({ sx: 0, sw: 1080 });
      expect(s.sh).toBeLessThanOrEqual(2800); // bleibt nahe an 2048 px, kaum verkleinert
    }
  });

  it("nimmt bei maessig langem Screenshot nur so viele Abschnitte wie noetig", () => {
    const slices = planScanSlices(1080, 3000, 3);
    expect(slices).toHaveLength(2);
    expect(slices.every((s) => s.sh <= 2048)).toBe(true); // ohne Verkleinerung
  });

  it("schneidet liegende Bilder entlang der Breite", () => {
    const slices = planScanSlices(7000, 1080, 3);
    expect(slices).toHaveLength(3);
    expect(slices.every((s) => s.sy === 0 && s.sh === 1080)).toBe(true);
    expect(slices[2].sx + slices[2].sw).toBe(7000);
  });

  it("zerlegt nicht, wenn kein Platz fuer mehrere Bilder bleibt", () => {
    expect(planScanSlices(1080, 7000, 1)).toEqual(whole(1080, 7000));
  });

  it("verweigert einen Screenshot, der selbst in Abschnitten unlesbar wuerde", () => {
    expect(() => planScanSlices(1080, 20000, 3)).toThrow(/zu lang/);
  });
});
