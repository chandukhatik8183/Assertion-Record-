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

const crypto = require("crypto");
const pad = n => String(n).padStart(3, "0");
const COLS = [["assets", "code"], ["tickets", "id"], ["audit", "id"], ["stockaudits", "id"], ["config", "id"], ["counters", "id"], ["serials", "id"], ["assetLatest", "code"]];

// A backup is written in a NEW set of parts (named <run>_000, <run>_001 ...) and only when ALL parts are saved the
// manifest document of the day is switched to the new run. So a failed / timed-out backup can never damage the
// backup that was already there. Parts of older runs are deleted afterwards.
async function runBackup(by) {
  const db = admin.firestore();
  const got = await Promise.all(COLS.map(async ([n, idKey]) => [n, (await db.collection(n).get()).docs.map(d => ({ ...d.data(), [idKey]: d.id }))]));
  const data = { at: Date.now() };
  got.forEach(([n, l]) => { data[n] = l; });
  const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(data))).toString("base64");
  const sha = crypto.createHash("sha256").update(b64).digest("hex");
  const date = istDate(), ref = db.collection("backups").doc(date), run = "r" + data.at;
  const parts = Math.ceil(b64.length / PART);
  for (let i = 0; i < parts; i += 5) {                       // 5 parts (about 4.5 MB) per commit
    const w = db.batch();
    for (let k = i; k < Math.min(parts, i + 5); k++) w.set(ref.collection("parts").doc(run + "_" + pad(k)), { i: k, run, d: b64.slice(k * PART, (k + 1) * PART) });
    await w.commit();
  }
  await ref.set({ date, at: data.at, by: by || "auto", run, parts, bytes: b64.length, sha,
    assets: data.assets.length, tickets: data.tickets.length, audit: data.audit.length,
    serials: data.serials.length });
  // new backup is complete -> remove the parts of older runs of this day (and leftovers of failed runs)
  const olds = (await ref.collection("parts").listDocuments()).filter(d => !d.id.startsWith(run + "_"));
  for (let i = 0; i < olds.length; i += 400) { const w = db.batch(); olds.slice(i, i + 400).forEach(d => w.delete(d)); await w.commit(); }
  // keep only the newest KEEP_DAYS backups
  const old = (await db.collection("backups").orderBy("at", "desc").get()).docs.slice(KEEP_DAYS);
  for (const d of old) await db.recursiveDelete(d.ref);
  return { date, assets: data.assets.length, tickets: data.tickets.length, serials: data.serials.length };
}

// returns the whole backup of one day as base64(gzip); checks that no part is missing and the checksum matches
async function readB64(db, date) {
  const ref = db.collection("backups").doc(date), man = await ref.get();
  if (!man.exists) return null;
  const m = man.data();
  let b64;
  if (m.run) {                                               // new format: parts named <run>_000 ...
    const refs = []; for (let i = 0; i < m.parts; i++) refs.push(ref.collection("parts").doc(m.run + "_" + pad(i)));
    const docs = await db.getAll(...refs);
    if (docs.some(d => !d.exists)) throw new Error("This backup is incomplete (a part is missing). Use an older backup.");
    b64 = docs.map(d => d.data().d).join("");
  } else {                                                   // old format (before this fix)
    const ps = await ref.collection("parts").orderBy("i").get();
    if (ps.empty) return null;
    b64 = ps.docs.map(d => d.data().d).join("");
  }
  if (m.sha && crypto.createHash("sha256").update(b64).digest("hex") !== m.sha) throw new Error("This backup is damaged (checksum does not match). Use an older backup.");
  return b64;
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
    if (b.action === "getAll") {   // whole backup as ONE gzip(base64) - the browser unpacks it into a single .json file
      const date = String(b.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Bad request." });
      const b64 = await readB64(db, date);
      if (!b64) return res.status(404).json({ error: "Backup not found." });
      return res.json({ b64 });
    }
    if (b.action === "get") {
      const date = String(b.date || ""), what = String(b.what || "assets");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["assets", "tickets", "audit", "stockaudits"].includes(what)) return res.status(400).json({ error: "Bad request." });
      const b64 = await readB64(db, date);
      if (!b64) return res.status(404).json({ error: "Backup not found." });
      const data = JSON.parse(zlib.gunzipSync(Buffer.from(b64, "base64")).toString());
      return res.json({ list: data[what] || [] });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: /FIREBASE_SERVICE_ACCOUNT|CRON_SECRET/.test(e.message) ? e.message : "Backup error: " + (e.message || "failed") });
  }
};
