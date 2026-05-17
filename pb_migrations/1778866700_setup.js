migrate((app) => {
  // 1. Update users collection with needs_password_change field
  const usersCollection = app.findCollectionByNameOrId("users");
  const hasField = usersCollection.schema.fields().some(f => f.name === "needs_password_change");
  
  if (!hasField) {
    usersCollection.schema.addField(new SchemaField({
      name: "needs_password_change",
      type: "bool",
    }));
    app.save(usersCollection);
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
    app.save(notes);
  } catch (e) { /* ignore if exists */ }

  // 3. Create checklist_items collection
  try {
    const notes = app.findCollectionByNameOrId("notes");
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
    app.save(checklistItems);
  } catch (e) { /* ignore if exists */ }

  // 4. Create initial users (PWA Users)
  const emails = ["badesebastian@outlook.com", "claudiaborg@web.de"];
  emails.forEach(email => {
    try {
      let user;
      try {
        // Find existing record by email
        user = app.findFirstRecordByData("users", "email", email);
      } catch (e) {
        // Create new record if it doesn't exist
        user = new Record(usersCollection);
        user.set("email", email);
      }
      user.setPassword("ChangeMe123!");
      user.set("needs_password_change", true);
      app.save(user);
    } catch (e) { /* ignore or log */ }
  });

  // 5. Create or Update Superuser (PB v0.23+ API)
  try {
    const adminEmail = "admin@notiz.local";
    const adminPassword = "AdminPassword123!";
    
    let superuser;
    try {
      superuser = app.findSuperuserByEmail(adminEmail);
    } catch (e) {
      superuser = new Superuser();
      superuser.email = adminEmail;
    }
    
    superuser.setPassword(adminPassword);
    app.save(superuser);
  } catch (e) {
    // ignore
  }

}, (app) => {
  // rollback logic
})
