import PocketBase from 'pocketbase';

const pbUrl = process.env.POCKETBASE_URL || 'https://pbnote.dasdann.jetzt';
const pb = new PocketBase(pbUrl);

const ADMIN_EMAIL = process.env.PB_SUPERUSER_EMAIL || 'badesebastian@outlook.com';
const ADMIN_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || 'Arschmusik11';

async function run() {
  try {
    console.log(`Verbindung zu: ${pbUrl}`);
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log("✅ Als Admin angemeldet.");

    const usersCollection = await pb.collections.getOne('users');
    const notesCollection = await pb.collections.getOne('notes');

    console.log("Erstelle 'presence' Tabelle...");
    await pb.collections.create({
      name: 'presence',
      type: 'base',
      schema: [
        { 
          name: 'note', 
          type: 'relation', 
          required: true, 
          options: { collectionId: notesCollection.id, cascadeDelete: true, maxSelect: 1 } 
        },
        { 
          name: 'user', 
          type: 'relation', 
          required: true, 
          options: { collectionId: usersCollection.id, cascadeDelete: true, maxSelect: 1 } 
        },
        { 
          name: 'last_seen', 
          type: 'number', 
          required: false 
        },
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    console.log("✅ 'presence' Tabelle erfolgreich erstellt.");
  } catch (err) {
    if (err.data && err.data.data && err.data.data.name && err.data.data.name.code === 'validation_not_unique') {
      console.log("ℹ️ 'presence' Tabelle existiert wahrscheinlich schon.");
    } else {
      console.error("❌ Fehler:", err.message, err.data);
    }
  }
}

run();
