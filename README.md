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


## Return to user + separate Return Gate Pass (IT only)
1. When the repair is finished: Admin -> Tickets -> **Return to user**. A form asks: **Returning to** (person), **Return location**, **Sent with** (who carries it) and remarks.
2. On confirm, a separate **Return Gate Pass** number `RGP/2026-27/0001` is created (own counter, not mixed with the outgoing `GP/...` numbers) and the asset status goes back to *In Use*.
3. The Return Gate Pass is shown **only in the admin panel** (button *Return Gate Pass* on the ticket). The user's QR page shows only the outgoing Gate Pass and a line "Asset returned to ... sent with ...".
4. All gate passes now open as a **digital pass on screen** (IT approval is stamped digitally with date/time); use *Print / Save as PDF* only if paper is needed. Ticket CSV export has the new return columns.
No change in `firestore.rules` is needed for this.

## Accounts, roles and passwords (v3)
**Only one admin:** `techpoint.chandu@gmail.com`. The old `it@assets.local` / `user@assets.local` accounts have no power any more (rules changed) - delete them in Firebase -> Authentication.

One-time setup:
1. Firebase -> Authentication -> Users -> **Add user**: e-mail `techpoint.chandu@gmail.com` + any temporary password. Then in the app click **Forgot password?** (login page) or **Reset password (e-mail)** to set your real password from the e-mail link.
2. Firebase -> Firestore -> Rules: paste the new `firestore.rules` and **Publish** (required).
3. For the Users tab: Firebase -> Project settings -> Service accounts -> **Generate new private key**. In Vercel -> Settings -> Environment Variables add `FIREBASE_SERVICE_ACCOUNT` = full content of the JSON file. Redeploy. Never put this file in GitHub.

Passwords:
* **Admin:** only by Firebase e-mail link (header button *Reset password (e-mail)* or *Forgot password?* on the login page).
* **Other users:** log in with the **username** (e.g. `ramesh.kumar`). They can change their own password (header -> Change password); the admin can set a new one any time in **Users -> Set password**.

## Users tab (admin)
Add a user with Full name + Username + Password (or *Generate password*). Role: **User - add assets only** (cannot edit, delete, export, see tickets). Admin can also Disable/Enable and Delete users. Username `Ramesh Kumar` becomes `ramesh.kumar` (login is not case sensitive).

## Digital
Dashboard (totals, assets by company/type, latest tickets), digital gate passes / return gate passes / handover forms that open on screen (Print / Save as PDF only if needed), installable as an app on phone (Add to Home screen).

## v4 - new features (admin unless written otherwise)
* **Audit log** (tab *Audit Log*): every asset add / edit (old -> new values) / delete / status change / assign / return / Excel upload is recorded with user and time. Nobody can edit or delete these lines (see rules).
* **Daily automatic backup** (tab *Users & Backup*): every night 2:00 AM (cron in `vercel.json`), last 30 kept, download Assets / Tickets / Audit log as JSON (Assets and Tickets files work with the Restore buttons). *Backup now* button for a manual backup.
* **Asset history** (button *History* on an asset): audit lines + tickets + movement + repair + return in one timeline.
* **Warranty alerts**: uses the existing *Warranty Till* (and Monitor warranty) date. Dashboard shows assets ending within 30 days or expired; the asset list shows a badge.
* **Asset assignment**: *Assign* / *Receive back* on an asset -> digital handover / return receipt (employee acceptance recorded on screen). Tab *Employees* lists every employee with their assets and a printable list.
* **Camera QR scan**: header button *Scan QR* (every logged-in user). Admin: opens the asset detail. Add-only user: opens the asset page.
* **Stock audit** (tab *Stock Audit*): choose branch, scan assets (camera or code + Enter), finish -> report of assets NOT found and extra assets; saved in history.
* **Photos on tickets**: the user can attach up to 3 photos (compressed in the browser) when raising a ticket; shown to IT and in the ticket status page.
* **Monthly report** (tab *Reports*): tickets, assets with problems, repairs, repair cost (final cost is asked when you *Return to user*; else the cost from Repair Approval), tickets by branch / issue type. Print / PDF and Excel.
* **Auto logout**: add-only users are logged out after 15 minutes without use (warning at 14 minutes).

### One-time setup for v4
1. **Publish the new `firestore.rules`** (audit log, stock audits, ticket photos).
2. Vercel -> Environment Variables: add `CRON_SECRET` = any long random text (Vercel sends it to the nightly backup). `FIREBASE_SERVICE_ACCOUNT` must already be set. Redeploy.
3. Camera scanning needs the site to be opened with https (Vercel is) and camera permission allowed. Chrome on Android scans QR + barcode directly; other browsers load a small QR library from cdnjs.

## Backup: one file + where it is stored
* Every night at 2:00 AM (India time) and on **Backup now**, the whole data (assets, tickets, audit log, stock audits, settings) is saved inside **your Firebase database**: Firebase console -> Firestore Database -> collection **backups** (one document per date, last 30 kept). It is not stored on your PC.
* Users & Backup tab -> **Download full backup** gives ONE file `sandeep-FULL-backup-DATE.json`. Keep a copy on your PC / Google Drive now and then (a backup inside the same Firebase project cannot help if the project itself is deleted).
* **Restore full backup (file)** puts assets and tickets back from that one file (nothing is deleted, same codes are overwritten).


## v5 - changes
**Stock Audit**
* Every audit is saved automatically (collection `stockaudits`, `done:false` while running). *Stock Audit* tab -> "Saved audits" -> **Resume** continues exactly where you stopped (found assets stay ticked). **Delete** removes a saved audit.
* **Add missed asset**: type / scan any code in "Add missed asset" (or press *Add to this audit* on an extra asset). Not-found assets can still be ticked later.
* A finished audit can be reopened with **Continue / add missed** in the history list; the report is updated.
* **Start NEW audit** starts a fresh one any time.

**QR page (user)** - only the request form ("Report an issue with this asset"). It has a tick **"This asset has to be sent out (to IT / outside)"**. Only when it is ticked the user writes *where* and *sent with (person)*; the ticket is then marked as a movement. The user sees no gate pass option until IT creates one; then **View / Print Gate Pass** appears on the same QR page (only for tickets where he ticked "send out").
**IT** - on every ticket: *Repair Approval* and status updates (shown live to the user). The **Gate Pass** option (inside Repair Approval), *Received at IT* and *Return to user* appear **only for tickets where the user ticked "send out"**. Return to user asks only *who carries it* (company courier - no AWB / tracking fields). The asset stays **Under Repair** until the user taps **I have received the asset** on the QR page -> then it becomes **In Use**.

**Asset add / edit** - *Serial No.* can be typed, or press **Scan label**: the camera opens, reads the barcode / QR on the serial label and fills the field automatically (also for Monitor Serial No.). Chrome on Android reads QR and common barcodes (Code128, Code39, EAN ...). Other browsers read QR only - type the serial there.
**QR label** prints the user's name and the serial number.

**Required:** publish the new `firestore.rules` (new: user can confirm receipt, asset back to In Use).

**Asset List** - new **Branch Location** filter next to Company (shows only that company's branches with asset counts; Print Labels / Export use the filtered list).

**Dashboard** - *Latest tickets & movements* now shows: **where the asset is now** (with user / on the way to IT with whom / at IT office / sent back by IT / back in use), **repair mode** (Onsite / Offsite / vendor / **Remote Support**) and **work status** (ticket status, engineer, latest IT note).
**Smart insights** (new card) - automatic warnings: asset with 3+ problems in 90 days (replace?), asset at IT for more than 7 days, user request without IT action for 2 days, ticket not picked for 3 days, user has not confirmed receipt for 3 days, open ticket on an asset that is still under warranty.

**Tickets tab (new layout)** - one clean row per ticket: S.N, Branch, Ticket No., Asset Code, Problem, Raised By, Date, Status (coloured), where the asset is now + repair mode, and buttons **View / Repair Approval / Gate Pass / Close**. *View* opens the full ticket window (details, status, engineer, IT note, movement, Received at IT / Return to user, history, delete). *Gate Pass* shows only for tickets where the user ticked "send out" and IT issued a pass. *Close* closes the ticket in one click. A count strip on top shows Open / In progress / At IT / Waiting for approval / Resolved.
**Design** - new look: soft cards with shadow, pill-shaped tabs, sticky table headings, row hover, striped ticket table, focus rings, smoother buttons (light and dark mode).

**User roles (Users tab -> Add User -> Role)**
* **Add only** - can add new assets only (as before).
* **Edit only** - sees the asset list and can edit existing assets; cannot add, delete, export, see tickets. Only the Assets tab is shown.
* **Full access** - everything the admin has (assets, tickets, gate passes, stock audit, reports, audit log, export) **except** the Users & Backup tab and e-mail password reset.
* **Change role** button on every user row (user is logged out and gets the new role at next login). Admin (`techpoint.chandu@gmail.com`) is always the only one who manages users.
**Required after this update:** publish the new `firestore.rules` AND redeploy on Vercel (api/users.js changed).

**Auto logout** - every user (including admin and full access) is logged out after **3 minutes** without any movement; a warning shows after 2 minutes. A running stock audit is saved automatically before logout (log in and press Resume). Camera scans count as activity.

**IT engineer auto-select** - on a ticket the engineer is pre-selected from the login: `techpoint.chandu@gmail.com` -> Chandraprakash Khatik, `bhanwar.vaishnav` -> Bhanwar Vaishnav (still changeable).
**Add-only users now have Stock Audit** - they choose company + branch and can mark an asset **only by scanning its QR with the camera**. No manual tick, no typed code, no "add missed". Only their own audits are visible to them. When the admin / full-access user opens ("Continue") that audit, the assets that were NOT scanned show as missing. **Publish the new `firestore.rules`.**
