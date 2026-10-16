# Sandeep Group Asset Tracker (GitHub + Vercel + Firebase)

1. Firebase console: create a project -> Firestore Database (create) and Authentication -> Email/Password (enable) -> add your admin user.
2. Project settings -> Your apps -> Web app -> copy the config into `fb.js`.
3. Firestore -> Rules: paste `firestore.rules` (put your admin email) and Publish. (Required again after this update: it adds the `assetLatest` rule.)
4. Upload this folder to a GitHub repo. In Vercel: Add New Project -> import the repo -> Deploy (no build settings needed).
5. Open your Vercel URL, log in, add assets, print labels from that URL (QR codes use the address you opened).

## Security (important)
Deploy order: 1) upload all files -> 2) log in once as admin (this copies the branch list and code counters into the database) -> 3) paste `firestore.rules` in Firebase -> Firestore -> Rules and Publish.

Firebase console settings to switch on:
1. Authentication -> Settings -> User actions: turn OFF "Enable create (sign-up)" (nobody can register new accounts).
2. Google Cloud Console -> APIs & Services -> Credentials -> your Browser API key -> Application restrictions: HTTP referrers = your Vercel site address.
3. Use strong, different passwords for the admin and the add-only user; change them if a person leaves.

Who can do what: Admin = everything. Add-only user = create NEW assets only (branch must be in the admin's list); sees only the assets added in the current login session; cannot edit, delete, export, back up or restore.

## Asset movement (user -> IT), repair approval and gate pass
1. User scans the asset QR -> "Send this asset to IT". Asset details are filled automatically; the user adds only: where it is sent, who carries it, and the issue. This creates a ticket (category "Asset Movement").
2. Admin -> Tickets -> "Repair Approval" (Repair Type, Party, Note ...). For an Offsite repair a Gate Pass number (GP/2026-27/0001) is created. No approval = no gate pass.
3. The user then sees "Print Gate Pass" on the same QR page. Admin can print it too ("Gate Pass" button).
4. Admin marks "Received at IT" (asset status -> Under Repair) and "Returned to user" (asset status -> In Use). The user sees each step.
After changing `firestore.rules`, publish it again in Firebase.

