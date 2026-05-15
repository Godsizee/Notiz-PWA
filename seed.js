import PocketBase from 'pocketbase';

const pb = new PocketBase('http://127.0.0.0:8090'); // Adjust if not running locally

const ADMIN_EMAIL = 'admin@notiz.local';
const ADMIN_PASSWORD = 'AdminPassword123!';

// Run this using: node seed.js <user1_email> <user2_email>
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Please provide two email addresses: node seed.js <user1_email> <user2_email>");
  process.exit(1);
}

const USER1_EMAIL = args[0];
const USER2_EMAIL = args[1];
const INITIAL_USER_PASSWORD = 'ChangeMe123!';

async function seed() {
  try {
    console.log("Authenticating as admin...");
    try {
      await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log("Logged in as existing admin.");
    } catch (e) {
      console.log("Admin not found, attempting to create...");
      await pb.admins.create({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        passwordConfirm: ADMIN_PASSWORD,
      });
      await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
      console.log("Admin created and logged in.");
    }

    console.log("Updating Users collection schema...");
    const usersCollection = await pb.collections.getOne('users');
    
    // Add needs_password_change field if it doesn't exist
    if (!usersCollection.schema.find(f => f.name === 'needs_password_change')) {
      usersCollection.schema.push({
        system: false,
        id: "needs_password_change_id",
        name: "needs_password_change",
        type: "bool",
        required: false,
        presentable: false,
        unique: false,
        options: {}
      });
      await pb.collections.update('users', usersCollection);
      console.log("Users schema updated.");
    }

    console.log("Creating Notes collection...");
    try {
      await pb.collections.create({
        name: 'notes',
        type: 'base',
        system: false,
        schema: [
          { name: 'title', type: 'text', required: false },
          { name: 'content', type: 'text', required: false },
          { name: 'type', type: 'select', required: true, options: { maxSelect: 1, values: ['text', 'checklist'] } },
          { name: 'color', type: 'text', required: false },
          { name: 'is_pinned', type: 'bool', required: false },
          { name: 'is_archived', type: 'bool', required: false },
          { name: 'owner', type: 'relation', required: true, options: { collectionId: usersCollection.id, cascadeDelete: false, maxSelect: 1 } },
        ],
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
      });
      console.log("Notes collection created.");
    } catch (e) {
      console.log("Notes collection might already exist.");
    }

    console.log("Creating Checklist Items collection...");
    try {
      const notesCollection = await pb.collections.getOne('notes');
      await pb.collections.create({
        name: 'checklist_items',
        type: 'base',
        system: false,
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
      console.log("Checklist Items collection created.");
    } catch (e) {
      console.log("Checklist Items collection might already exist.");
    }

    console.log("Creating Users...");
    for (const email of [USER1_EMAIL, USER2_EMAIL]) {
      try {
        await pb.collection('users').create({
          email: email,
          password: INITIAL_USER_PASSWORD,
          passwordConfirm: INITIAL_USER_PASSWORD,
          needs_password_change: true,
          emailVisibility: true,
        });
        console.log(`User ${email} created with password: ${INITIAL_USER_PASSWORD}`);
      } catch (e) {
        console.log(`User ${email} already exists or error:`, e.data || e.message);
      }
    }

    console.log("Seeding complete.");

  } catch (err) {
    console.error("Seeding error:", err.data || err.message);
  }
}

seed();
