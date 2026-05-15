import PocketBase from 'pocketbase';

const pbUrl = process.env.POCKETBASE_URL || 'https://pb.dasdann.jetzt';
const pb = new PocketBase(pbUrl);

const ADMIN_EMAIL = 'admin@notiz.local';
const ADMIN_PASSWORD = 'AdminPassword123!';

// Ausführung: node seed.js <email1> <email2>
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Bitte zwei E-Mail-Adressen angeben: node seed.js <email1> <email2>");
  process.exit(1);
}

const USER1_EMAIL = args[0];
const USER2_EMAIL = args[1];
const INITIAL_USER_PASSWORD = 'ChangeMe123!';

async function seed() {
  try {
    console.log("--- Notiz PWA Seeding gestartet ---");
    console.log(`Verbindung zu: ${pbUrl}`);

    // 1. Admin Authentifizierung
    try {
      await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log("✅ Als Admin angemeldet.");
    } catch (e) {
      console.log("ℹ️ Admin nicht gefunden oder Login fehlgeschlagen. Versuche Admin zu erstellen...");
      try {
        await pb.admins.create({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          passwordConfirm: ADMIN_PASSWORD,
        });
        await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
        console.log("✅ Admin-Konto wurde neu erstellt.");
      } catch (adminErr) {
        console.error("❌ Admin konnte nicht erstellt werden (ggf. schon vorhanden aber anderes PW):", adminErr.message);
      }
    }

    // 2. Users Collection aktualisieren (needs_password_change Feld)
    console.log("Stelle 'users' Tabelle sicher...");
    try {
      const usersCollection = await pb.collections.getOne('users');
      const schema = usersCollection.schema || [];
      
      const fieldExists = schema.some(f => f.name === 'needs_password_change');
      if (!fieldExists) {
        schema.push({
          name: "needs_password_change",
          type: "bool",
          required: false,
          options: {}
        });
        await pb.collections.update('users', { schema });
        console.log("✅ Feld 'needs_password_change' wurde zur Users-Tabelle hinzugefügt.");
      } else {
        console.log("ℹ️ Feld 'needs_password_change' existiert bereits.");
      }
    } catch (e) {
      console.error("❌ Fehler beim Aktualisieren der Users-Tabelle:", e.message);
    }

    // 3. Notes Collection
    console.log("Erstelle 'notes' Tabelle...");
    try {
      const usersCollection = await pb.collections.getOne('users');
      await pb.collections.create({
        name: 'notes',
        type: 'base',
        schema: [
          { name: 'title', type: 'text', required: false },
          { name: 'content', type: 'text', required: false },
          { name: 'type', type: 'select', required: true, options: { maxSelect: 1, values: ['text', 'checklist'] } },
          { name: 'color', type: 'text', required: false },
          { name: 'is_pinned', type: 'bool', required: false },
          { name: 'is_archived', type: 'bool', required: false },
          { name: 'owner', type: 'relation', required: true, options: { collectionId: usersCollection.id, cascadeDelete: false, maxSelect: 1 } },
        ],
        listRule: "@request.auth.id != '' && owner = @request.auth.id",
        viewRule: "@request.auth.id != '' && owner = @request.auth.id",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && owner = @request.auth.id",
        deleteRule: "@request.auth.id != '' && owner = @request.auth.id",
      });
      console.log("✅ 'notes' Tabelle erstellt.");
    } catch (e) {
      console.log("ℹ️ 'notes' Tabelle existiert wahrscheinlich schon.");
    }

    // 4. Checklist Items Collection
    console.log("Erstelle 'checklist_items' Tabelle...");
    try {
      const notesCollection = await pb.collections.getOne('notes');
      await pb.collections.create({
        name: 'checklist_items',
        type: 'base',
        schema: [
          { name: 'note', type: 'relation', required: true, options: { collectionId: notesCollection.id, cascadeDelete: true, maxSelect: 1 } },
          { name: 'text', type: 'text', required: false },
          { name: 'is_completed', type: 'bool', required: false },
          { name: 'order', type: 'number', required: false },
        ],
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
      });
      console.log("✅ 'checklist_items' Tabelle erstellt.");
    } catch (e) {
      console.log("ℹ️ 'checklist_items' Tabelle existiert wahrscheinlich schon.");
    }

    // 5. User-Accounts anlegen
    console.log("Lege User-Accounts an...");
    for (const email of [USER1_EMAIL, USER2_EMAIL]) {
      try {
        await pb.collection('users').create({
          email: email,
          password: INITIAL_USER_PASSWORD,
          passwordConfirm: INITIAL_USER_PASSWORD,
          needs_password_change: true,
          emailVisibility: true,
        });
        console.log(`✅ User ${email} erstellt (PW: ${INITIAL_USER_PASSWORD})`);
      } catch (e) {
        console.log(`ℹ️ User ${email} existiert bereits oder Fehler:`, e.message);
      }
    }

    console.log("--- Seeding erfolgreich abgeschlossen! ---");

  } catch (err) {
    console.error("❌ Schwerwiegender Fehler beim Seeding:", err.message);
  }
}

seed();
