// Vercel serverless function - USER MANAGEMENT (admin only).
// Needs env variable FIREBASE_SERVICE_ACCOUNT (full JSON of a Firebase service-account key).
const admin = require("firebase-admin");

const ADMIN_EMAIL = "techpoint.chandu@gmail.com";
const DOMAIN = "@assets.local";
const ROLES = ["user", "editor", "full"];   // user = add only, editor = edit only, full = everything except users & backup

const slug = s => String(s || "").trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
const toEmail = u => slug(u) + DOMAIN;

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set in Vercel (see README, 'User management').");
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
    if ((dec.email || "").toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: "Only admin can manage users." });

    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const A = admin.auth();

    if (b.action === "list") {
      const out = [];
      let r = await A.listUsers(1000);
      r.users.forEach(u => {
        if (!(u.email || "").endsWith(DOMAIN)) return;
        out.push({ username: u.email.slice(0, -DOMAIN.length), name: u.displayName || "", disabled: !!u.disabled,
          role: (u.customClaims || {}).role || "user", created: u.metadata.creationTime, last: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : 0 });
      });
      out.sort((x, y) => x.username < y.username ? -1 : 1);
      return res.json({ users: out });
    }

    const username = slug(b.username);
    if (b.action === "create") {
      const pw = String(b.password || "");
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, "Username: 3-30 letters/numbers (a-z, 0-9, . _ -).");
      if (pw.length < 8 || pw.length > 128) return bad(res, "Password must be 8 to 128 characters.");
      const u = await A.createUser({ email: toEmail(username), password: pw, displayName: String(b.name || "").slice(0, 80) || undefined });
      await A.setCustomUserClaims(u.uid, { role: ROLES.includes(b.role) ? b.role : "user" });
      return res.json({ ok: true, username });
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return bad(res, "Invalid username.");
    const u = await A.getUserByEmail(toEmail(username));   // only @assets.local accounts can be touched
    if (b.action === "setPassword") {
      const pw = String(b.password || "");
      if (pw.length < 8 || pw.length > 128) return bad(res, "Password must be 8 to 128 characters.");
      await A.updateUser(u.uid, { password: pw });
      await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    if (b.action === "setRole") {
      if (!ROLES.includes(b.role)) return bad(res, "Unknown role.");
      await A.setCustomUserClaims(u.uid, { role: b.role });
      await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    if (b.action === "setDisabled") {
      await A.updateUser(u.uid, { disabled: !!b.disabled });
      if (b.disabled) await A.revokeRefreshTokens(u.uid);
      return res.json({ ok: true });
    }
    if (b.action === "delete") { await A.deleteUser(u.uid); return res.json({ ok: true }); }
    return bad(res, "Unknown action.");
  } catch (e) {
    console.error(e);
    const c = e.code || "";
    const msg = /FIREBASE_SERVICE_ACCOUNT/.test(e.message) ? e.message
      : c === "auth/email-already-exists" ? "This username already exists."
      : c === "auth/user-not-found" ? "That user does not exist."
      : /id-token/.test(c) ? "Session expired - please login again."
      : "Server error: " + (e.message || "failed");
    return res.status(500).json({ error: msg });
  }
};
