migrate((db) => {
  const dao = new Dao(db);

  // 1. Update users collection with needs_password_change field
  const usersCollection = dao.findCollectionByNameOrId("users");
  const hasField = usersCollection.schema.fields().some(f => f.name === "needs_password_change");
  
  if (!hasField) {
    usersCollection.schema.addField(new SchemaField({
      name: "needs_password_change",
      type: "bool",
    }));
    dao.saveCollection(usersCollection);
  }

  // 2. Create notes collection
  try {
    const notes = new Collection({
      name: "notes",
      type: "base",
      schema: [
        { name: "title", type: "text" },
        { name: "content", type: "text" },
        { name: "type", type: "select", required: true, options: { values: ["text", "checklist"], maxSelect: 1 } },
        { name: "color", type: "text" },
        { name: "is_pinned", type: "bool" },
        { name: "is_archived", type: "bool" },
        { name: "owner", type: "relation", required: true, options: { collectionId: usersCollection.id, maxSelect: 1 } },
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
    });
    dao.saveCollection(notes);
  } catch (e) { /* ignore if exists */ }

  // 3. Create checklist_items collection
  try {
    const notes = dao.findCollectionByNameOrId("notes");
    const checklistItems = new Collection({
      name: "checklist_items",
      type: "base",
      schema: [
        { name: "note", type: "relation", required: true, options: { collectionId: notes.id, cascadeDelete: true, maxSelect: 1 } },
        { name: "text", type: "text" },
        { name: "is_completed", type: "bool" },
        { name: "order", type: "number" },
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
    });
    dao.saveCollection(checklistItems);
  } catch (e) { /* ignore if exists */ }

  // 4. Create initial users
  const emails = ["badesebastian@outlook.com", "claudiaborg@web.de"];
  emails.forEach(email => {
    try {
      const user = new Record(usersCollection);
      user.setEmail(email);
      user.setPassword("ChangeMe123!");
      user.set("needs_password_change", true);
      dao.saveRecord(user);
    } catch (e) { /* ignore if exists */ }
  });

  // 5. Bulletproof Superuser Upsert (PB v0.22+)
  try {
    const adminEmail = "admin@notiz.local";
    const adminPassword = "AdminPassword123!";
    
    const superusers = dao.findCollectionByNameOrId("_superusers");
    
    let record;
    try {
        // Try to find existing by email
        record = dao.findFirstRecordByData("_superusers", "email", adminEmail);
    } catch (e) {
        // Create new if not found
        record = new Record(superusers);
        record.setEmail(adminEmail);
        // Set a stable username for the admin
        record.set("username", "admin_notiz");
    }
    
    // Always update these fields (Upsert)
    record.setPassword(adminPassword);
    record.set("verified", true);
    
    dao.saveRecord(record);
    
  } catch (e) {
    // Serious error logging if possible, otherwise fail silently
  }

}, (db) => {
  // rollback logic
})
