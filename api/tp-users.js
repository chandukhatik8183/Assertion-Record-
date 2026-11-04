// Vercel serverless function - TRANSPORT (Courier ERP) USER MANAGEMENT.
// Transport accounts are separate from Asset Tracker accounts: e-mail = username@transport.local, claims { tp: true, tprole }.
// Allowed callers: the owner (admin e-mail) or a Transport Super Admin. Needs FIREBASE_SERVICE_ACCOUNT (same as users.js).
const admin = require("firebase-admin");

const ADMIN_EMAIL = "techpoint.chandu@gmail.com";
const DOMAIN = "@transport.local";
const ROLES = ["super_admin", "company_admin", "driver", "branch_employee"];

const slug = s => String(s || "").trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
const toEmail = u => slug(u) + DOMAIN;

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set in Vercel (see README).");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const bad = (res, m) => res.status(400).json({ error: m });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    init();
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return res.status(401).json({ error: "Please login again." });
    const dec = await admin.auth().verifyIdToken(m[1], true);
    const owner = (dec.email || "").toLowerCase() === ADMIN_EMAIL;
    const tpSuper = dec.tp === true && dec.tprole === "super_admin" && (dec.email || "").endsWith(DOMAIN);
    if (!owner && !tpSuper) return res.status(403).json({ error: "Only the owner or a Transport Super Admin can manage Transport users." });

    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const A = admin.auth();
    const username = slug(b.username);
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, "Employee ID (login username) must be 3-30 letters/numbers (a-z, 0-9, . _ -).");

    if (b.action === "create") {
      const pw = String(b.password || "");
      if (pw.length < 8 || pw.length > 128) return bad(res, "Password must be 8 to 128 characters.");
      const role = ROLES.includes(b.role) ? b.role : "branch_employee";
      const u = await A.createUser({ email: toEmail(username), password: pw, displayName: String(b.name || "").slice(0, 80) || undefined });
      await A.setCustomUserClaims(u.uid, { tp: true, tprole: role });
      return res.json({ ok: true, username });
    }

    const u = await A.getUserByEmail(toEmail(username));   // only @transport.local accounts can be touched
    if (b.action === "setPassword") {
      const pw = String(b.password || "");
      if (pw.length < 8 || pw.length > 128) return bad(res, "Password must be 8 to 128 characters.");
      await A.updateUser(u.uid, { password: pw });
      await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    if (b.action === "setRole") {
      if (!ROLES.includes(b.role)) return bad(res, "Unknown role.");
      await A.setCustomUserClaims(u.uid, { tp: true, tprole: b.role });
      await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    if (b.action === "setDisabled") {
      await A.updateUser(u.uid, { disabled: !!b.disabled });
      if (b.disabled) await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    return bad(res, "Unknown action.");
  } catch (e) {
    console.error(e);
    const c = e.code || "";
    const msg = /FIREBASE_SERVICE_ACCOUNT/.test(e.message) ? e.message
      : c === "auth/email-already-exists" ? "This Employee ID already has a login."
      : c === "auth/user-not-found" ? "No login exists for this Employee ID."
      : c === "auth/id-token-expired" || c === "auth/id-token-revoked" ? "Please login again."
      : "Server error. Check the Vercel function log.";
    return res.status(500).json({ error: msg });
  }
};
