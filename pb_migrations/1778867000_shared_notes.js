/// <reference path="../pb_data/types.d.ts" />

// Geteilte Notizen (Scope v1.2, Stufe 1): ersetzt das offene Workspace-Modell
// (jeder eingeloggte Nutzer sieht alles) durch owner-basierte Sichtbarkeit mit
// explizitem `is_shared`-Flag pro Notiz. Checklist-Items folgen der Notiz.
//
// Bestehende Notizen werden als geteilt markiert, damit nach dem Update keine
// Notiz aus der Ansicht eines der beiden Nutzer verschwindet (bisher sahen
// beide alles).
migrate((app) => {
  const notes = app.findCollectionByNameOrId("notes");

  let hasField = false;
  notes.fields.forEach((field) => {
    if (field.name === "is_shared") hasField = true;
  });
  if (!hasField) {
    notes.fields.add(new BoolField({ name: "is_shared" }));
  }

  const ownerOrShared = "owner = @request.auth.id || is_shared = true";
  notes.listRule = ownerOrShared;
  notes.viewRule = ownerOrShared;
  notes.createRule = "@request.auth.id != '' && owner = @request.auth.id";
  notes.updateRule = ownerOrShared;
  notes.deleteRule = ownerOrShared;
  app.save(notes);

  const items = app.findCollectionByNameOrId("checklist_items");
  const itemRule = "note.owner = @request.auth.id || note.is_shared = true";
  items.listRule = itemRule;
  items.viewRule = itemRule;
  items.createRule = itemRule;
  items.updateRule = itemRule;
  items.deleteRule = itemRule;
  app.save(items);

  app.findRecordsByFilter("notes", "id != ''", "", 0).forEach((record) => {
    record.set("is_shared", true);
    app.save(record);
  });
}, (app) => {
  // Rollback: Workspace-Regeln wiederherstellen (das Feld bleibt, ist aber
  // ohne die Regeln wirkungslos).
  const authRule = "@request.auth.id != ''";
  ["notes", "checklist_items"].forEach((name) => {
    const col = app.findCollectionByNameOrId(name);
    col.listRule = authRule;
    col.viewRule = authRule;
    col.createRule = authRule;
    col.updateRule = authRule;
    col.deleteRule = authRule;
    app.save(col);
  });
});
