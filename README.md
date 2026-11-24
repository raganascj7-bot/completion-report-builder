# Completion Report Builder

A web app for **JT Digital Marketing Services** that builds the monthly client
completion report (the 14-page TOLE layout) and exports it as a PDF.

- Admin-managed accounts (Admin and Editor roles, no public sign-up)
- Client presets: cover name, project names, description, approver, scope rows
- Nine guided sections with a live A4 preview that matches the TOLE design
- Screenshots by paste, drag-and-drop or file picker; stored on the server
- Autosave, plus a copy kept in the browser if the connection drops
- PDF export with clickable Google Drive / Canva links
- Templates: upload a finished report PDF and the app makes an **exact copy**
  (every text, photo and shape in its place); each month you only change the
  words and pictures. Or "learn the look only" to restyle the TOLE pages.
  TOLE stays the built-in default
- Team invitations by email (the new member chooses their own password)
- Sharing: hand a report or template to a team member, with a note and an email
- Optional AI (OpenAI): "Draft with AI" for the description, and checking
  what each part of an uploaded template is

Built with plain PHP 8, MySQL, HTML, CSS and JavaScript modules. No build step,
no Composer, no npm.

---

## 1. Folder structure

```
completion-report-builder/
├── public/                  ← the ONLY folder visitors can reach
│   ├── index.php            ← sends you to login or reports
│   ├── setup.php            ← one-time: creates the first Admin
│   ├── login.php  logout.php  account.php  invite.php (set password from an invitation)
│   ├── reports.php          ← all reports, filters, new / duplicate / delete
│   ├── builder.php          ← the three-pane report builder
│   ├── team.php  clients.php  settings.php      ← Admin only
│   ├── templates.php        ← template list and upload (Admin)
│   ├── template-layout.php  ← review an exact-copy template
│   ├── template-edit.php    ← review a look-only template
│   ├── api/                 ← JSON endpoints, one job each
│   └── assets/
│       ├── css/  base.css (tokens, fonts, controls)
│       │         app.css  (app screens only)
│       │         report.css (the A4 report pages only)
│       ├── js/lib/       dom.js, api.js (all fetch calls + CSRF), ui.js, share.js
│       ├── js/pages/     one small script per admin page
│       ├── js/builder/   main, store, editor, preview, export-pdf,
│       │                 layout-render (exact-copy pages), layout-editor (page editor), …
│       ├── js/templates/ read-layout (PDF → exact copy), layout-label, read-design (look only)
│       ├── fonts/        Montserrat + Inter (OFL licence files included)
│       ├── img/          favicon
│       └── vendor/       optional local copies of the PDF libraries
├── app/                     ← PHP the browser never loads directly
│   ├── bootstrap.php        ← every page and endpoint starts here
│   ├── config.php  db.php  auth.php  csrf.php  helpers.php
│   ├── reports.php  images.php  openai.php  templates.php
│   ├── layouts.php          ← exact-copy templates and their report pages
│   ├── shares.php  mailer.php   ← sharing; email over SMTP (no libraries)
│   └── views/  layout.php  error.php
├── storage/
│   ├── uploads/             ← report images (never public)
│   ├── templates/           ← uploaded templates (page pictures, layout.json)
│   └── logs/                ← error log, one file per month
├── database/schema.sql      ← fresh install
├── database/migrations/     ← upgrades for an existing database
├── docs/TEST-CASES.md       ← how this build maps to your test sheets
├── .env.example             ← copy to .env and fill in
├── .htaccess                ← only public/ is reachable if this folder is in the web root
└── .gitignore
```

`app/`, `storage/` and `database/` each contain an `.htaccess` with
`Require all denied`, as a second lock in case they ever end up inside the web
root.

---

## 2. Run it on your laptop (XAMPP)

1. Copy the whole `completion-report-builder` folder into `C:\xampp\htdocs\`.
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Open <http://localhost/phpmyadmin> → **Databases** → create `jt_reports`
   with collation `utf8mb4_unicode_ci`.
4. Select `jt_reports` → **Import** → choose `database/schema.sql` → **Go**.
5. Copy `.env.example` to `.env` and set at least:

   ```
   APP_URL=http://localhost/completion-report-builder/public
   APP_DEBUG=true
   DB_NAME=jt_reports
   DB_USER=root
   DB_PASS=
   ```

6. Open <http://localhost/completion-report-builder/public/setup.php> and create
   the Admin account (Ms. Jeah). The setup page closes itself afterwards.
7. Sign in → **Clients** → add a client → **Reports** → **New report**.

PHP needs the `pdo_mysql`, `fileinfo`, `curl` (AI only) and `zip` (backup only)
extensions. XAMPP has them all; check that `extension=fileinfo`,
`extension=curl` and `extension=zip` are not commented out in `php.ini`.

---

## 3. Put it online (reports.jtdigitalmarketingservices.com)

Create the hosting account **in Ms. Jeah's name/email** so she owns it.

1. **Subdomain.** In the hosting panel add `reports.jtdigitalmarketingservices.com`.
   Wherever her domain's DNS is managed, add the record the host gives you
   (usually a CNAME or A record for `reports`).
2. **Upload the files.**
   - If the panel lets you choose the subdomain's *document root*, upload the
     whole project and point the document root at `public/`.
   - If it doesn't (common on free hosts), upload the **contents** of `public/`
     into the subdomain's web folder (e.g. `htdocs/`), and upload `app/`,
     `storage/`, `database/` and `.env` to the folder **one level above it**.
     The code finds them with `__DIR__ . '/../app/…'`, so this just works.
3. **Database.** Create a MySQL database and user in the panel, import
   `database/schema.sql` with its phpMyAdmin, and put the details in `.env`.
   Use the panel's database user, never `root`.
4. **`.env` for production:** `APP_URL=https://reports.jtdigitalmarketingservices.com`,
   `APP_DEBUG=false`, real `DB_*` values. Upload `.env` by hand; never commit it.
5. **HTTPS.** Turn on the free SSL certificate in the panel. `public/.htaccess`
   then forces every visit to HTTPS.
6. **PHP settings** (panel → PHP options, or `php.ini`):
   `upload_max_filesize = 10M`, `post_max_size = 12M`, `display_errors = Off`.
   (Template uploads send each page's pictures in batches of 15, so the
   default `max_file_uploads = 20` is fine.)
7. **Permissions.** `storage/uploads`, `storage/templates` and `storage/logs` must be writable by
   PHP (usually 755 is enough on shared hosting).
8. Open `/setup.php` once to create the Admin, then sign in and run one full
   report end to end.

**Whole project inside the web root?** On hosts where you can't point the
document root at `public/` (e.g. InfinityFree), you may have uploaded the
whole folder, so the site opens at `https://…/crb/public/`. That works: the
`.htaccess` in the project folder refuses everything outside `public/` (`.env`,
README, docs, database files, `.git`). **Check it once:** open
`https://…/crb/README.md` and `https://…/crb/.env` in a browser — both must say
*Forbidden* (403). If either shows text, the host ignored `.htaccess`: move
`app/`, `storage/`, `database/` and `.env` out of `htdocs` as in step 2, and
change your database password.

**Free-host check, before you build on it:** after step 4, sign in, add an
OpenAI key and press **Draft with AI** once. Some free hosts block certain
outside services. If that call fails while it works on XAMPP, the host is
blocking it, and that is the moment to move to a low-cost paid host (Ms. Jeah
accepted this upgrade path in her preferences form).

**Backups.** Free hosts promise none. Admin → **Agency settings** →
**Download backup** gives a `.zip` with the full database (`database.sql`) and
every image and report design. Do it monthly. To restore: import `schema.sql`
into an empty database, import `database.sql`, and copy `uploads/` and
`templates/` back into `storage/`.

---

## 4. PDF export

The PDF is made in the browser with **html2canvas 1.4.1** and **jsPDF 2.5.1**.
They load from `public/assets/vendor/` if the files are there, otherwise from
the cdnjs CDN. To work without the CDN, download these two files into
`public/assets/vendor/`:

- <https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js>
- <https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js>

Each page is captured at scale 2 (about 190 dpi) and placed on an A4 page.
Every link on the page (Drive and Canva links, shoot links) is added back as a
clickable area. Page text is part of the page image, so it can't be selected
in the PDF; this is a deliberate trade-off for matching the TOLE design
exactly.

---

## 5. AI drafting (optional)

Set `OPENAI_API_KEY` in `.env` to show **Draft with AI** under Project
description. It sends only the report's text (never report images) and the
user always reviews the draft before it is used. The same key lets the app
check an uploaded report design (section 6); only that design's page
pictures are sent.

- `OPENAI_MODEL=gpt-4o` is the client's choice. **OpenAI shuts gpt-4o down in
  the API on 14 January 2027** and names `gpt-6-luna` as its replacement.
  Changing that one line switches models.
- `AI_DAILY_LIMIT_PER_USER` caps drafts per person per day (default 20).
- Usage per month is shown in Agency settings. Also set a monthly budget limit
  in the OpenAI dashboard.

---

## 6. Templates, email and sharing

**Updating a database you already imported?** In phpMyAdmin select
`jt_reports` → **Import**, once each, in order:
`database/migrations/001-templates.sql` (skip if you already did it), then
`database/migrations/002-exact-copy-invites-sharing.sql`.
New installs don't need these; `schema.sql` already has everything.

### Exact-copy templates (Admin)

1. **Templates → Upload a template** → keep **Exact copy** → choose the PDF
   (max 10 MB) → **Upload**. About 5 seconds for the 14-page TOLE.
2. The browser reads the PDF with pdf.js (`assets/vendor/pdfjs/`). Each page
   is drawn three times — whole, without text, without text and photos — so
   the app gets the exact background, the exact visible part of every photo
   (rounded corners included) and the exact colour of every text. Positions,
   sizes and fonts come straight from the PDF. **Nothing is moved or guessed.**
3. Report values are found automatically: the month (`CONTENT CALENDAR: AUGUST`
   becomes `CONTENT CALENDAR: {month:upper}`), dates, the client, the preparer,
   the approver and the contact details (matched against Clients and Agency
   settings). Screenshots become "new picture each month" boxes.
4. With an OpenAI key, the page pictures and the list of texts are sent once
   to the AI, which **only labels** them (which texts are report values, what
   each photo is, page names). It cannot move anything, and a label that
   doesn't match the PDF's own words is rejected.
5. The review screen shows the copy beside the original. Click any text or
   photo to change what it is. **Save — ready to use**, then choose it per
   client (**Clients → Edit**) or in the builder's **Design** menu.

In a report that uses it, the builder becomes a **page editor**: click a text
to change it (report values like the client name change everywhere), click a
picture box (or drop / paste a screenshot on it) to replace it, duplicate a
page when there are more screenshots, remove or reorder pages, and add pages
from the template. Duplicating a report for the next month keeps the pages and
texts and empties the monthly picture boxes.

Limits: the fonts are matched to the ones the app has (Garet uses Montserrat
unless Garet is installed); text that a PDF draws as shapes ("Type 3" fonts —
rare in Canva PDFs) stays part of the page picture and can't be edited.

**Learn the look only** (the other upload choice) keeps the nine TOLE pages
and takes the uploaded report's colours, fonts, headings and logo.

Files live in `storage/templates/<id>/` (`layout.json`, page pictures,
`source.pdf`; look-only templates also `palette.json`, `read.json`, `logo.png`).

### Email: invitations and share notices

Without email settings everything still works: **Team → Add team member**
shows an invitation link to copy and send. To send emails from a Gmail account:

1. In that Google account turn on **2-Step Verification**.
2. Google Account → **Security** → **App passwords** → create one (16 letters).
3. In `.env`:
   ```
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_ENCRYPTION=tls
   MAIL_USERNAME=yourname@gmail.com
   MAIL_PASSWORD=the 16-letter app password
   MAIL_FROM=yourname@gmail.com
   ```
4. XAMPP: `extension=openssl` must be on in `php.ini` (it is by default).
5. Agency settings → **Email** → **Send a test email to me**. If it fails, the
   message says why (for example a wrong app password). On InfinityFree, PHP's
   own `mail()` is blocked but Gmail SMTP is allowed; if port 587 times out,
   try `MAIL_PORT=465` with `MAIL_ENCRYPTION=ssl`.

Invitation links work once, for 48 hours; **Resend invitation** makes a new
one. For a domain address later (e.g. `reports@jtdigitalmarketingservices.com`)
use an email service's SMTP settings instead — no code changes. For testing,
`MAIL_DRIVER=log` saves emails in `storage/logs/mail/` instead of sending.

### Sharing

**Share** on a report (Reports list or builder) or a template (Templates, Admin
only) → choose people → optional note. They get an email and see it under
**Shared with me** at the top of Reports, marked **New** until opened.
Editors already see every report, so sharing a report is a hand-over with a
note; sharing a template also lets that Editor edit it (normally Admin only).

---

## 7. How the pieces fit

| Concern | Where |
| --- | --- |
| Every request starts | `app/bootstrap.php` (config, session, errors, headers) |
| Who may see a page | `require_login()` / `require_admin()` in `app/auth.php` |
| Forged requests | `verify_csrf()`; JS sends the token in `X-CSRF-Token` (`assets/js/lib/api.js`) |
| What a report may contain | `normalize_report_data()` in `app/reports.php` rebuilds every save from scratch |
| Exact-copy templates | `assets/js/templates/read-layout.js` reads the PDF; `app/layouts.php` checks and stores it; `builder/layout-render.js` draws the pages; `builder/layout-editor.js` edits them |
| Email and sharing | `app/mailer.php` (SMTP), `app/shares.php`, `api/shares.php`, `assets/js/lib/share.js` |
| How a report looks | A design ("theme"): `app/templates.php` checks and stores it; `assets/js/builder/theme.js` turns it into CSS variables and layout classes for `preview.js`; `assets/js/templates/read-design.js` reads an uploaded PDF |
| Two people editing one report | `version` column; a stale save gets HTTP 409 and a choice dialog |
| Images | validated by real content (`finfo`), random names, `storage/uploads/<report id>/`, served by `api/image.php` after a login check |
| Report layout | `assets/js/builder/preview.js` (HTML) + `assets/css/report.css` (styles), shared by preview and PDF |

---

## 8. Team code rules

- **PHP:** start with `bootstrap.php`; prepared statements only; escape every
  echo with `e()`; endpoints answer `{ ok, data }` or `{ ok: false, error }`
  with the right status code; never echo exception text.
- **JS:** ES modules; all requests through `lib/api.js`; everything placed in
  `innerHTML` goes through `esc()`; links through `safeUrl()`.
- **CSS:** colours and fonts only as variables from `base.css`; report rules
  only in `report.css` under `.report-page`; app rules only in `app.css`; no
  `!important`. Inline `style=""` is used only for pixel sizes that JavaScript
  calculates (image sizes in the report).
- **Git:** `main` always runs; one branch per feature; a teammate reviews each
  pull request; `.env` and `storage/` are never committed.

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Blank page or "Something went wrong" | Set `APP_DEBUG=true` locally, or read `storage/logs/app-YYYY-MM.log` |
| "Cannot connect to the database" on setup | Check `DB_*` in `.env`; import `schema.sql` |
| Uploads fail for big images | Raise `upload_max_filesize` / `post_max_size` (section 3.6) |
| "The PDF tools could not load" | No internet for the CDN: add the two vendor files (section 4) |
| "Too many failed attempts" | Wait 15 minutes, or the Admin resets the password on the Team page |
| Someone forgot their password | Admin → Team → Reset password, and give them the temporary password |
