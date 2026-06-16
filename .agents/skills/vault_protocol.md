# Skill: Obsidian Vault Protocol — Notiz PWA

## Vault-Pfad

```
C:\Users\bades\OneDrive\Desktop\Ideen\Projekte\
```

Projektordner: `Notiz PWA\`

---

## Session-Start: Recent.md lesen

**Immer als erste Aktion.**

```
C:\Users\bades\OneDrive\Desktop\Ideen\Projekte\Notiz PWA\Recent.md
```

Ableiten:
- Was wurde zuletzt geändert?
- Welche `- [ ]` Checkboxen sind offen?
- Laufende Pläne oder Architekturentscheidungen?

---

## Session-Ende: Recent.md schreiben

**Immer als letzte Aktion.** Neuer Block ganz oben.

```markdown
## YYYY-MM-DD (Kurztitel)

### Kontext
Ein Satz zum Ausgangspunkt.

### Neue Dateien
- `pfad/datei.ext` — Warum?

### Geänderte Dateien
- `pfad/datei.ext` — Was und warum?

### Ausgeführte Aktionen
- `<befehl>`: ✅/❌ Ergebnis

### Offene Punkte / Nächste Aufgaben
- [ ] ...
```

**Regeln:**
- Datum immer absolut
- Pfade relativ zum Code-Root
- Nur echte Kommando-Ergebnisse eintragen
- Offene `- [ ]` bleiben, erledigte → `- [x]`

---

## Tasks anlegen

```
C:\Users\bades\OneDrive\Desktop\Ideen\Projekte\Notiz PWA\tasks\NPWA-XXX_Kurztitel.md
```

```markdown
---
tags: [Notiz_PWA, task]
status: open
created: YYYY-MM-DD
---

# NPWA-XXX — Aufgabentitel

## Kontext
Warum ist diese Aufgabe nötig?

## Akzeptanzkriterien
- [ ] Kriterium 1

## Notizen
```

---

## Vault-Konventionen Kurzreferenz

| Regel | ✅ | ❌ |
|---|---|---|
| Dateinamen | `PascalCase.md` / `Mit_Unterstrich.md` | `mit leerzeichen.md` |
| Links | `[[DateiName]]` | `[[C:\...\Datei.md]]` |
| Frontmatter | `tags`, `aliases`, `created` | fehlendes Frontmatter |
| Nach neuer Notiz | Index/Dashboard updaten | Orphaned Note stehen lassen |
