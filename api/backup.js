// Daily automatic backup (Vercel Cron) + manual "Backup now" / list / download for the admin.
// Backups are stored (gzip, in parts) inside Firestore collection "backups" - the browser can never read it directly.
// Needs env: FIREBASE_SERVICE_ACCOUNT and CRON_SECRET (any long random text; Vercel sends it with the cron call).
const admin = require("firebase-admin");
const zlib = require("zlib");

const ADMIN_EMAIL = "techpoint.chandu@gmail.com";
const KEEP_DAYS = 30, PART = 900000;

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set in Vercel (see README).");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}
const istDate = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function runBackup(by) {
  const db = admin.firestore();
  const all = async (n, idKey) => (await db.collection(n).get()).docs.map(d => ({ ...d.data(), [idKey]: d.id }));
  const data = { at: Date.now(), assets: await all("assets", "code"), tickets: await all("tickets", "id"),
    audit: await all("audit", "id"), stockaudits: await all("stockaudits", "id"),
    config: await all("config", "id"), counters: await all("counters", "id") };
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString("base64");
  const date = istDate(), ref = db.collection("backups").doc(date);
  await db.recursiveDelete(ref.collection("parts"));
  const parts = Math.ceil(b64.length / PART);
  for (let i = 0; i < parts; i++) await ref.collection("parts").doc(String(i).padStart(3, "0")).set({ i, d: b64.slice(i * PART, (i + 1) * PART) });
  await ref.set({ date, at: data.at, by: by || "auto", parts, bytes: b64.length,
    assets: data.assets.length, tickets: data.tickets.length, audit: data.audit.length });
  // keep only the newest KEEP_DAYS backups
  const old = (await db.collection("backups").orderBy("at", "desc").get()).docs.slice(KEEP_DAYS);
  for (const d of old) await db.recursiveDelete(d.ref);
  return { date, assets: data.assets.length, tickets: data.tickets.length };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    init();
    // ---- Vercel Cron (GET) ----
    if (req.method === "GET") {
      const sec = process.env.CRON_SECRET;
      if (!sec) return res.status(500).json({ error: "CRON_SECRET is not set in Vercel." });
      if (req.headers.authorization !== "Bearer " + sec) return res.status(401).json({ error: "Unauthorized" });
      return res.json({ ok: true, ...(await runBackup("auto")) });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST only" });

    // ---- Admin (POST) ----
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
    if (!m) return res.status(401).json({ error: "Please login again." });
    const dec = await admin.auth().verifyIdToken(m[1], true);
    if ((dec.email || "").toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: "Only admin can do this." });
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const db = admin.firestore();

    if (b.action === "list") {
      const s = await db.collection("backups").orderBy("at", "desc").limit(60).get();
      return res.json({ backups: s.docs.map(d => d.data()) });
    }
    if (b.action === "run") return res.json({ ok: true, ...(await runBackup(dec.email)) });
    if (b.action === "get") {
      const date = String(b.date || ""), what = String(b.what || "assets");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["assets", "tickets", "audit", "stockaudits"].includes(what)) return res.status(400).json({ error: "Bad request." });
      const parts = await db.collection("backups").doc(date).collection("parts").orderBy("i").get();
      if (parts.empty) return res.status(404).json({ error: "Backup not found." });
      const data = JSON.parse(zlib.gunzipSync(Buffer.from(parts.docs.map(d => d.data().d).join(""), "base64")).toString());
      return res.json({ list: data[what] || [] });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: /FIREBASE_SERVICE_ACCOUNT|CRON_SECRET/.test(e.message) ? e.message : "Backup error: " + (e.message || "failed") });
  }
};
