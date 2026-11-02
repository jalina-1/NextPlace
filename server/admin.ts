import { init, query } from "./db.ts";
await init();
const email = process.argv[2];
if (!email) throw Error("Usage: npm run admin -- registered-email");
const rows = await query(
  "UPDATE users SET role='admin' WHERE email=$1 RETURNING id",
  [email.toLowerCase()],
);
if (!rows.length) throw Error("Register the account first.");
console.log("Admin role granted.");
process.exit(0);
