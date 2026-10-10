# Sandeep Group Asset Tracker (GitHub + Vercel + Firebase)

1. Firebase console: create a project -> Firestore Database (create) and Authentication -> Email/Password (enable) -> add your admin user.
2. Project settings -> Your apps -> Web app -> copy the config into `fb.js`.
3. Firestore -> Rules: paste `firestore.rules` (put your admin email) and Publish. (Required again after this update: it adds the `assetLatest` rule.)
4. Upload this folder to a GitHub repo. In Vercel: Add New Project -> import the repo -> Deploy (no build settings needed).
5. Open your Vercel URL, log in, add assets, print labels from that URL (QR codes use the address you opened).
