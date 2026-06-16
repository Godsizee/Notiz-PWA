migrate((app) => {
  // 1. Update users collection with needs_password_change field
  const usersCollection = app.findCollectionByNameOrId("users");
  let hasField = false;
  
  // Sicheres Durchsuchen der typisierten Felder in v0.23+
  usersCollection.fields.forEach((field) => {
    if (field.name === "needs_password_change") {
      hasField = true;
    }
  });
  
  if (!hasField) {
    usersCollection.fields.add(new BoolField({
      name: "needs_password_change",
    }));
    app.save(usersCollection);
  }

  // 2. Create notes collection (v0.23+ Syntax)
  try {
    const notes = new Collection({
      name: "notes",
      type: "base",
      fields: [
        new TextField({ name: "title" }),
        new TextField({ name: "content" }),
        new SelectField({ name: "type", required: true, options: { values: ["text", "checklist"], maxSelect: 1 } }),
        new TextField({ name: "color" }),
        new BoolField({ name: "is_pinned" }),
        new BoolField({ name: "is_archived" }),
        new RelationField({ name: "owner", required: true, options: { collectionId: usersCollection.id, maxSelect: 1 } }),
      ],
      listRule: "owner = @request.auth.id",
      viewRule: "owner = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "owner = @request.auth.id",
      deleteRule: "owner = @request.auth.id",
    });
    app.save(notes);
  } catch (e) { /* ignore if exists */ }

  // 3. Create checklist_items collection (v0.23+ Syntax)
  try {
    const notes = app.findCollectionByNameOrId("notes");
    const checklistItems = new Collection({
      name: "checklist_items",
      type: "base",
      fields: [
        new RelationField({ name: "note", required: true, options: { collectionId: notes.id, cascadeDelete: true, maxSelect: 1 } }),
        new TextField({ name: "text" }),
        new BoolField({ name: "is_completed" }),
        new NumberField({ name: "order" }),
      ],
      listRule: "note.owner = @request.auth.id",
      viewRule: "note.owner = @request.auth.id",
      createRule: "note.owner = @request.auth.id",
      updateRule: "note.owner = @request.auth.id",
      deleteRule: "note.owner = @request.auth.id",
    });
    app.save(checklistItems);
  } catch (e) { /* ignore if exists */ }

  // 4. Create initial users (PWA Users)
  const emails = ["badesebastian@outlook.com", "claudiaborg@web.de"];
  emails.forEach(email => {
    try {
      let user;
      try {
        user = app.findFirstRecordByData("users", "email", email);
      } catch (e) {
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
