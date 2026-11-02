/** Prints database + private storage connectivity (same check as Admin → Overview). No secrets are printed. */
import { healthCheck } from "../src/server/services/admin";
import { closeDb } from "../src/server/db";
healthCheck()
  .then((h) => {
    console.log(JSON.stringify({ database: h.database, storage: h.storage }, null, 2));
    return closeDb();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await closeDb();
    process.exit(1);
  });
