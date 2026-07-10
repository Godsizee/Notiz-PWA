/// <reference path="../pb_data/types.d.ts" />

// Adds a lightweight `presence` collection used by usePresence.ts to show
// "X bearbeitet gerade" indicators on shared checklists.
//
// Access rules intentionally allow any authenticated user to list/create
// presence records (so collaborators can see each other), while a user may
// only update/delete their own presence record.
migrate((app) => {
  try {
    const users = app.findCollectionByNameOrId("users");
    const notes = app.findCollectionByNameOrId("notes");

    const presence = new Collection({
      name: "presence",
      type: "base",
      fields: [
        new RelationField({
          name: "note",
          required: true,
          options: { collectionId: notes.id, cascadeDelete: true, maxSelect: 1 },
        }),
        new RelationField({
          name: "user",
          required: true,
          options: { collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
        }),
        // Epoch milliseconds of the last heartbeat.
        new NumberField({ name: "last_seen" }),
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });

    app.save(presence);
  } catch (e) {
    // ignore if it already exists
  }
}, (app) => {
  // rollback
  try {
    const presence = app.findCollectionByNameOrId("presence");
    app.delete(presence);
  } catch (e) {
    // ignore
  }
});
