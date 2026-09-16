import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];

if (!password) {
  console.log("Usage: node scripts/hash-password.mjs \"your-password\"");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, salt, 64).toString("hex");

console.log("\nADMIN_PASSWORD_HASH=");
console.log(`scrypt:${salt}:${derived}`);
console.log("\nSESSION_SECRET=");
console.log(randomBytes(32).toString("hex"));
console.log("\nPaste both into Vercel: Settings, Environment Variables. Never commit them.\n");
