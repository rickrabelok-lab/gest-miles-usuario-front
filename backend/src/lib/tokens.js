import crypto from "crypto";

export function generateUrlToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}
