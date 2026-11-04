// Vercel serverless function - PUBLIC QR PAGE data.
// The browser can no longer read an asset directly without login (firestore.rules), so the public QR page
// asks this function, which returns ONLY safe fields (no user name, phone, e-mail, router password, SIM / account numbers ...).
const admin = require("firebase-admin");

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not set in Vercel (see README).");
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// fields the public page may show (serial number is NOT shown for ISP / SIM: it is an account / SIM number there)
const SAFE = ["company", "type", "model", "loc", "aloc", "st"];
const NO_SN = ["ISP", "SIM"];

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const code = String((req.query && req.query.code) || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(code)) return res.status(400).json({ error: "Invalid asset code." });
    init();
    const db = admin.firestore();
    let s = await db.collection("assets").doc(code).get();
    if (!s.exists) {   // asset code was changed by the admin: the old printed QR still opens the asset
      const q = await db.collection("assets").where("oldCodes", "array-contains", code).limit(1).get();
      if (!q.empty) s = q.docs[0];
    }
    if (!s.exists) return res.status(404).json({ error: "Asset not found." });
    const d = s.data() || {}, out = { code: s.id };
    SAFE.forEach(k => { if (d[k] != null && d[k] !== "") out[k] = String(d[k]).slice(0, 200); });
    if (!NO_SN.includes(d.type) && d.sn) out.sn = String(d.sn).slice(0, 100);
    return res.json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: /FIREBASE_SERVICE_ACCOUNT/.test(e.message) ? e.message : "Server error. Try again." });
  }
};
