/// <reference path="../pb_data/types.d.ts" />

// Bilder in Notizen: eine eigene Collection statt eines Multi-File-Felds auf
// `notes`. Gründe:
//   - useRealtimeNotes() holt per getFullList() *alle* Notizen; Bildmetadaten
//     würden diese Antwort unnötig aufblähen.
//   - Reihenfolge und Einzel-Löschung brauchen eigene Records. Die +/- -Suffix-
//     Semantik von PocketBase-Multi-File-Feldern verträgt sich schlecht mit dem
//     Last-Write-Wins-Sync zwischen zwei Geräten.
// Aufbau und Regeln spiegeln daher bewusst `checklist_items`.
//
// Feld-Optionen sind hier *flach* notiert (PB v0.23+). Die älteren Migrationen
// in diesem Verzeichnis nutzen noch `options: { ... }`; das wird von der
// aktuellen API ignoriert und darf nicht als Vorlage dienen.
migrate((app) => {
  const notes = app.findCollectionByNameOrId("notes");

  try {
    app.findCollectionByNameOrId("note_images");
    return; // existiert bereits
  } catch (e) {
    // noch nicht vorhanden — unten anlegen
  }

  // Sichtbarkeit folgt der Notiz (eigene Notiz oder explizit geteilt),
  // identisch zu checklist_items in 1778867000_shared_notes.js.
  const rule = "note.owner = @request.auth.id || note.is_shared = true";

  const images = new Collection({
    name: "note_images",
    type: "base",
    fields: [
      {
        type: "relation",
        name: "note",
        required: true,
        collectionId: notes.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        type: "file",
        name: "file",
        maxSelect: 1,
        // Der Client skaliert vorher auf ~2048px/WebP herunter (src/lib/images.ts),
        // liegt also weit darunter. Das Limit fängt nur Ausreißer ab.
        maxSize: 5242880,
        mimeTypes: ["image/webp", "image/jpeg", "image/png", "image/gif"],
        // 400x400 = quadratische Galerie-Kachel, 1200x0 = Vollbild-Ansicht.
        thumbs: ["400x400", "1200x0"],
      },
      { type: "number", name: "order" },
      // Originalmaße: die Galerie reserviert damit per aspect-ratio den Platz,
      // bevor das Bild geladen ist — sonst springen die Masonry-Spalten.
      { type: "number", name: "width" },
      { type: "number", name: "height" },
      // Winziger Blur-DataURL (~16px breit, <1KB) für den Sofort-Render.
      { type: "text", name: "placeholder" },
    ],
    listRule: rule,
    viewRule: rule,
    createRule: rule,
    updateRule: rule,
    deleteRule: rule,
  });

  app.save(images);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("note_images"));
  } catch (e) {
    // bereits entfernt
  }
});
