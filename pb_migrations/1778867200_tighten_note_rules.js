/// <reference path="../pb_data/types.d.ts" />

// Haerten der Regeln aus 1778867000_shared_notes.js.
//
// Dort galt fuer Notizen `owner = @request.auth.id || is_shared = true` bei
// update UND delete. Praktisch hiess das: jeder angemeldete Account durfte
// jede geteilte Notiz
//   - loeschen,
//   - `owner` auf sich selbst umschreiben (= uebernehmen),
//   - `is_shared` auf false setzen, womit die Notiz aus der Liste des
//     eigentlichen Besitzers verschwindet.
//
// Fuer zwei sich vertrauende Personen war das folgenlos. Als oeffentliches
// Projekt — und mit einer Registrierung, deren Allowlist im Repo stand — ist es
// eine Uebernahmemoeglichkeit.
//
// Was hier NICHT eingeschraenkt wird: das gemeinsame Bearbeiten. Titel, Inhalt,
// Farbe, Pin und Archiv bleiben fuer beide Seiten schreibbar, ebenso
// checklist_items und note_images (die haben eigene Regeln und bleiben, wie sie
// sind). Genau das ist ja der Zweck der geteilten Einkaufsliste.
migrate((app) => {
  const notes = app.findCollectionByNameOrId("notes");

  // Schreiben darf: der Besitzer uneingeschraenkt — oder jeder mit Zugriff auf
  // eine geteilte Notiz, solange er weder `owner` noch `is_shared` anfasst.
  //
  // `:isset` prueft, ob das Feld ueberhaupt im Request-Body steht. Das passt zum
  // Client: applyChange() in src/lib/sync.ts schickt bei update immer nur das
  // geaenderte Feld als Patch, `owner` ausschliesslich beim create. Der
  // Teilen-Schalter (page.tsx) sendet `is_shared` — und ist in ContextMenu.tsx
  // bereits per isOwnedByMe() auf den Besitzer beschraenkt. Diese Regel ist die
  // serverseitige Haelfte davon.
  notes.updateRule =
    "owner = @request.auth.id || " +
    "(is_shared = true && @request.body.owner:isset = false && @request.body.is_shared:isset = false)";

  // Loeschen darf nur der Besitzer. Wer eine geteilte Notiz loswerden will, die
  // ihm nicht gehoert, bittet den Besitzer — oder dieser beendet das Teilen.
  notes.deleteRule = "owner = @request.auth.id";

  app.save(notes);

  // Presence: `createRule` war "@request.auth.id != ''", man konnte also einen
  // Presence-Eintrag im Namen eines anderen Nutzers anlegen und so eine fremde
  // Person als "bearbeitet gerade" ausgeben. Das Feld muss auf einen selbst
  // zeigen — deckungsgleich mit der bereits vorhandenen updateRule.
  const presence = app.findCollectionByNameOrId("presence");
  presence.createRule = "user = @request.auth.id";
  app.save(presence);
}, (app) => {
  // Rollback: exakt die Regeln aus 1778867000_shared_notes.js.
  const notes = app.findCollectionByNameOrId("notes");
  const ownerOrShared = "owner = @request.auth.id || is_shared = true";
  notes.updateRule = ownerOrShared;
  notes.deleteRule = ownerOrShared;
  app.save(notes);

  const presence = app.findCollectionByNameOrId("presence");
  presence.createRule = "@request.auth.id != ''";
  app.save(presence);
});
