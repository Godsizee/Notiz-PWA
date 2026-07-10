/// <reference path="../pb_data/types.d.ts" />

// Workspace-Modell: Lockert die ursprünglich owner-scoped Zugriffsregeln so,
// dass JEDER eingeloggte Nutzer alle Notizen & Checklist-Items sehen und
// bearbeiten kann. Damit sehen beide Nutzer dieselben Notiz-Datensätze
// (gleiche ID) -> gemeinsame Checklisten + Realtime-Presence funktionieren.
//
// Das Feld `owner` bleibt erhalten (es protokolliert weiterhin den Ersteller),
// die Sichtbarkeit hängt nur nicht mehr daran.
migrate((app) => {
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
}, (app) => {
  // Rollback: ursprüngliche owner-scoped Regeln wiederherstellen.
  const notes = app.findCollectionByNameOrId("notes");
  notes.listRule = "owner = @request.auth.id";
  notes.viewRule = "owner = @request.auth.id";
  notes.createRule = "@request.auth.id != ''";
  notes.updateRule = "owner = @request.auth.id";
  notes.deleteRule = "owner = @request.auth.id";
  app.save(notes);

  const items = app.findCollectionByNameOrId("checklist_items");
  items.listRule = "note.owner = @request.auth.id";
  items.viewRule = "note.owner = @request.auth.id";
  items.createRule = "note.owner = @request.auth.id";
  items.updateRule = "note.owner = @request.auth.id";
  items.deleteRule = "note.owner = @request.auth.id";
  app.save(items);
});
