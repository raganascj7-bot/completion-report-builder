# Test cases for this build

How the team's QA workbook (*Completion Report Builder – Application Test
Cases*) maps to the rebuilt app, and what was already run automatically.

**Automated run: 74 of 74 checks passed** (list at the end), plus an
end-to-end rebuild of the TOLE August 2026 report through the real interface
(setup → client → new report → all nine sections → 31 image uploads →
14 pages, no JavaScript errors), plus browser runs of exact-copy templates,
email invitations and sharing (tables below).

> Run in a test environment on SQLite with the same SQL. Before handover,
> run the **Manual** items below on XAMPP/MySQL and on the live host.

## Sheet by sheet

| Sheet | What happens to it |
| --- | --- |
| **Sign Up (FR1)** | **Rewrite as "Invite team member (Admin)".** Public sign-up no longer exists (client chose admin-managed accounts). Team → *Add team member* sends an **email invitation**; the member opens the link and chooses a password (link works once, 48 hours). Without email settings the Admin copies the link. TC-REG-01 → 12 target this form; all pass. TC-REG-06 (email format) and TC-REG-07 (8+ character password) are real validation. TC-REG-13 Show/Hide is on the sign-in and invitation pages. |
| **Sign In and Session (FR2)** | **Keep.** Logout (TC-AUTH-09), new session id at sign-in (TC-AUTH-10) and lockout after 5 failures for 15 minutes (TC-AUTH-12) are now implemented. Add: first sign-in forces a password change; deactivated accounts cannot sign in. TC-AUTH-06 URL becomes `builder.php?uid=…`. TC-AUTH-11: an expired session while saving shows a message and keeps the changes in the browser. |
| **Report Editor and Checklist (FR3)** | **Update the expected results.** The nine sections are now: Cover · Project Completion Report · Content Calendar · Content for the Month · Content Posted · Creatives / Layouts · Content Shoot · Breakdown · Contact Us. Ticks: Cover = client name + prepared by; Summary = report date, company, project names, description, start, completion, preparer, approver; Content Posted = every platform page has a screenshot (no table); Creatives = every campaign has a title and a design or link; Breakdown default statuses are **IN PROGRESS** (not "Incomplete"). TC-EDT-12/13/14 unchanged. |
| **Live Preview and Zoom (FR4)** | **Update.** A blank report shows **10** pages (cover, summary, calendar, content, 3 posted pages, content shoot, breakdown, contact); the TOLE August report shows **14**. Default zoom 60%, range 30–120%, remembered per browser. **Retire TC-PRV-05** (analytics chips removed). |
| **Image Handling (FR5)** | **Update TC-IMG-05/12/13.** Images are shrunk to **2000 px** wide (was 1100), screenshots stay PNG when ≤ 1.5 MB, otherwise JPEG 90% on white (transparent PNGs never turn black). Each image is uploaded to the server, so the "browser storage full" case (TC-IMG-13) becomes "image over 10 MB is refused with a message". New: a `.php` file renamed to `.png` is refused. |
| **Post Analytics and CSV Import (FR6)** | **Retire the whole sheet.** The TOLE report shows platform screenshots, not a typed table, so the table, CSV import and statistics were removed. |
| **Report Lifecycle (FR7)** | **Update.** Saving is automatic (1.5 s after the last change) and the bar shows *Saving… / All changes saved*. New report = choose client + month. Duplicate = choose the new month; it keeps client text, approver, scope rows, page titles, contact and photos, and clears screenshots, shoots, notes and dates. One report per client per month. Delete is Admin only. TC-RPT-15 (two tabs) now shows a choice dialog instead of "last save wins". |
| **Agency Defaults (FR8)** | **Update.** Now **Agency settings** (Admin only), saved on the server: TC-DEF-04 holds across browsers and **TC-DEF-05's limitation is gone**. Includes default cover and office photos. |
| **Export to PDF and Word (FR9)** | **Remove the Word cases** (TC-EXP-03, Word half of 04 and 07). File name is now `Client - Completion Report - Month Year.pdf`. New: links in the PDF are clickable; empty sections trigger a warning before export; export works offline if the vendor files are present. |
| **Custom Templates (FR10)** | **Keep, with new expected results.** *Templates → Upload a template* (Admin, PDF ≤ 10 MB). **Exact copy** (default): every text, photo and shape stays in place; report values (month, dates, client, preparer, contact) fill in automatically; screenshots become monthly picture boxes; the copy is reviewed beside the original and saved as ready. **Learn the look only**: TOLE pages in the uploaded colours, fonts and headings. Both can be chosen per client and per report. TC-TPL-05 stays an upload-security test; TC-TPL-11 (no wildcard CORS) still holds. |
| **Security and Data Isolation** | **Update TC-SEC-01**: reports are shared across the agency on purpose; isolation now means *Editors cannot reach Admin pages or endpoints* (403). TC-SEC-04 becomes the version check (409) and "image ids from other reports are dropped". TC-SEC-06, 07, 09, 11, 12, 13 now pass (protected images, CSRF tokens, per-user browser storage, generic errors, no DB test page, one config with a dedicated DB user). |
| **Non-Functional Checks** | **Keep, update TC-NFR-04**: users are deactivated, never deleted, so their reports stay. Run NFR-01/02/06/07 manually. |
| **Planned Enhancements** | Client management (TC-ENH-15 → 20) and image storage as files (33 → 38) are **done**; ENH-21 changes because clients are shared. Report status is a simple Draft / Final (no Manager/Designer roles — the client chose Admin + Editor). Template application (01 → 07) is **done** through report designs (see FR10); server-side PDF (08 → 14) is not planned. |

## Manual checks still needed

| Check | Why it wasn't automated here |
| --- | --- |
| Generate a real PDF and compare it page by page with TOLE (TC-EXP-01/02) | The test environment had no internet for the PDF libraries; the export code was tested with stand-in libraries (page count, A4 size, link positions, file name) |
| Click each Drive/Canva link inside the downloaded PDF | Needs a real PDF viewer |
| Whole flow on XAMPP with MySQL, then on the live host | Automated run used SQLite with the same queries |
| "Draft with AI" with a real key; then with a wrong key (friendly error) | Needs the client's OpenAI key |
| Upload one of Ms. Jeah's own Canva reports as an exact copy; compare the copy with the original page by page | Tested with the TOLE PDF (14 pages) and a 7-page sample in another design |
| Send a real invitation and a share notice from Gmail (app password) | Tested against a local mail server; Gmail itself needs the client's account |
| Chrome, Edge, Firefox, Safari; 1366×768 and 1920×1080 (TC-NFR-01/02) | Only Chrome was available |
| Keyboard-only use of sign-in and builder (TC-NFR-07) | Manual |

## Automated checks — exact-copy templates, invitations, sharing

| Test id | Check | Result |
| --- | --- | --- |
| TC-TPL-copy | TOLE PDF (14 pages, 9.8 MB) becomes an exact copy in about 5 s: 155 texts, 40 photos, 14 backgrounds, 11 links | Pass |
| TC-TPL-fidelity | Each copied page compared with the original page: same positions; differences only where Garet is replaced by Montserrat | Pass |
| TC-TPL-values | Found automatically: month (`CONTENT CALENDAR: {month}`), month + year, report/start/completion dates, client, preparer, approver, contact details | Pass |
| TC-TPL-roles | Screenshots become monthly picture boxes; logos stay fixed; cover and office photos are kept | Pass |
| TC-TPL-ai | With an OpenAI key: one strict-schema request; labels applied, a label that changes the PDF's words is rejected, no positions accepted | Pass (local stand-in server) |
| TC-TPL-files | PHP's 20-files-per-request limit respected (pictures sent in batches of 15) | Pass |
| TC-LAY-01 | New report from the exact copy: 14 pages, month changes to the report's month everywhere | Pass |
| TC-LAY-02 | Picture uploaded into a monthly box; edited text shows on the page; both saved | Pass |
| TC-LAY-03 | Duplicate page (15 pages), kept after reload | Pass |
| TC-LAY-04 | PDF export: one page per page, links kept, warning lists the empty picture boxes | Pass (stand-in PDF libraries) |
| TC-LAY-05 | Longer values (SEPTEMBER instead of AUGUST) never break inside a word | Pass |
| TC-INV-01 → 05 | Invitation: can't sign in before accepting; greeting by name; short and mismatched passwords refused; accepting signs in; link works once | Pass |
| TC-INV-mail | Invitation email delivered over SMTP with login, to the right address, with a working link | Pass (local mail server) |
| TC-SHR-01 | Admin shares a report with a note → email sent → Editor sees it under Shared with me, marked New | Pass |
| TC-SHR-02 | Shared template: the Editor can open and save it, but not delete it (403) | Pass |
| TC-SHR-03 | Opened items are no longer marked New | Pass |
| TC-OVF-01 | A very long word in "Prepared for" wraps inside its column (no overlap with "Prepared by") | Pass |

## Fixes after QA (Nov 24)

| Bug (from the QA screenshots) | Cause | Fix | Check |
| --- | --- | --- | --- |
| Agency settings / client form: card titles sat on the card's border line | Browser default for `<legend>` | Titles are drawn inside the card with a divider | Every card title is inside its card (settings and client form) — Pass |
| Cover of an exact-copy report: "NOVEMBER 2026" ran over the white arc | Free space was checked against texts and photos only, not shapes in the background picture | The background is measured beside every text; a text that is too wide shrinks to fit (down to 60%). Choosing "month and year" for a two-line text keeps two lines | SEPTEMBER 2026 stops before the arc, on one line and on two lines — Pass |
| Team: invitation said email is not set up | No MAIL_ settings on the host | Agency settings → Email shows the sender and has **Send a test email**, which explains failures | Test email delivered; a wrong app password is explained without showing it — Pass |
| Whole project in the web root (`/crb/public/`) | Files outside `public/` could be opened if the host allows it | `.htaccess` in the project folder refuses everything outside `public/` | Open `/crb/README.md` and `/crb/.env` on the live site: both must be 403 |

## Automated checks — report designs

| Test id | Check | Result |
| --- | --- | --- |
| TC-TPL-read | (Look only) 7-page PDF in another design is read in about 1 s: 21 headings/labels copied exactly, fonts (Lora titles), left titles, line header, striped tables, page-number footer, brand colours | Pass |
| TC-TPL-logo | Logo cut from an uploaded page with transparent background; shown in the preview | Pass |
| TC-TPL-ai | With an OpenAI key: one strict-schema request with the page pictures; text read from the PDF is kept over the AI's guesses | Pass (local stand-in server) |
| TC-TPL-ai-fail | AI unavailable → design still opens with the PDF reading and a clear note | Pass |
| TC-TPL-ready | *Save — ready to use* makes it selectable for clients | Pass |
| TC-TPL-client | Client default design is used by that client's new reports | Pass |
| TC-TPL-switch | Builder *Design* menu switches to TOLE and back; choice is saved with the report | Pass |
| TC-TPL-export | PDF export with the new design: one A4 page per preview page | Pass (stand-in PDF libraries) |
| TC-TPL-TOLE | The default TOLE design is still pixel-identical to the reference (14 of 14 pages) | Pass |

## Automated checks

| Test id | Check | Result |
| --- | --- | --- |
| TC-SEC-12 | setup.php is closed once an Admin exists | Pass |
| TC-AUTH-01 | Valid sign-in redirects to reports | Pass |
| TC-REG-01 | Admin adds a member; an invitation link is made (no password shown) | Pass |
| TC-INV-01 | An invited member cannot sign in before accepting | Pass |
| TC-INV-02 | Invitation page greets the member by name | Pass |
| TC-INV-03 | Passwords that don’t match are rejected | Pass |
| TC-INV-04 | Accepting sets the password and signs the member in | Pass |
| TC-INV-05 | The invitation link works only once | Pass |
| TC-REG-02/08 | Duplicate email (any letter case) rejected | Pass |
| TC-REG-03 | Empty fields rejected | Pass |
| TC-REG-05 | Whitespace-only treated as empty | Pass |
| TC-REG-06 | Malformed email "abc" rejected | Pass |
| TC-REG-06 | Malformed email "abc@" rejected | Pass |
| TC-REG-06 | Malformed email "@x.com" rejected | Pass |
| TC-REG-09 | SQL injection text stored literally, no SQL error | Pass |
| TC-REG-10 | Script text in name is escaped on the Team page | Pass |
| TC-REG-11 | 101-character name rejected with a message | Pass |
| TC-REG-12 | Unicode names stored and shown | Pass |
| TC-AUTH-new | After a password reset the member is sent to change the temporary password | Pass |
| TC-AUTH-new | Other pages blocked until password changed | Pass |
| TC-REG-07 | Password shorter than 8 characters rejected | Pass |
| TC-AUTH-new | Password change accepted | Pass |
| TC-AUTH-02/03 | Wrong password and unknown email give the same generic message | Pass |
| TC-AUTH-08 | Passwords are case-sensitive | Pass |
| TC-AUTH-05 | SQL injection at sign-in fails safely | Pass |
| TC-AUTH-12 | Account locks for 15 minutes after 5 failed attempts | Pass |
| TC-AUTH-06 | Builder redirects to sign-in when signed out | Pass |
| TC-SEC-02 | api/report-get.php returns 401 without a session | Pass |
| TC-SEC-02 | api/image.php returns 401 without a session | Pass |
| TC-SEC-03 | Write API returns 401 without a session | Pass |
| TC-AUTH-10 | A new session id is issued at sign-in | Pass |
| TC-AUTH-09 | Log out ends the session | Pass |
| TC-SEC-access | Editor gets 403 on team.php | Pass |
| TC-SEC-access | Editor gets 403 on clients.php | Pass |
| TC-SEC-access | Editor gets 403 on settings.php | Pass |
| TC-SEC-access | Editor gets 403 on api/users.php | Pass |
| TC-SEC-access | Editor gets 403 on api/clients.php | Pass |
| TC-SEC-access | Editor gets 403 on api/report-delete.php | Pass |
| TC-SEC-07 | POST without CSRF token is blocked (419) | Pass |
| TC-SEC-01 (changed) | Editors see the agency’s shared reports | Pass |
| TC-RPT-02 | Save updates the same report (version +1) | Pass |
| TC-SEC-08 | javascript: link is removed on save | Pass |
| TC-SEC-links | Bare domain link gets https:// | Pass |
| TC-SEC-04 | Image ids from other reports are dropped | Pass |
| TC-RPT-15 | Stale save is refused with 409 and who saved | Pass |
| TC-SEC-05 | Malformed JSON returns a JSON error | Pass |
| TC-RPT-08 | Duplicate keeps client text, clears month content | Pass |
| TC-RPT-dup | Second report for the same client+month is refused (409) | Pass |
| TC-RPT-14 | Admin deletes a report and it stays deleted | Pass |
| TC-TPL-05 / IMG | PHP code disguised as .png is rejected | Pass |
| TC-IMG-07 | Text file is rejected | Pass |
| TC-IMG-size | File over 10 MB is rejected | Pass |
| TC-IMG-01 | A real PNG uploads and gets a protected URL | Pass |
| TC-ENH-33 | Stored with a random name outside the public folder | Pass |
| TC-DEF | Agency settings reject an invalid email | Pass |
| TC-backup | Admin backup downloads a zip with the database and images | Pass |
| TC-backup | Editor cannot download the backup | Pass |
| TC-AI | AI endpoint answers 503 with a clear message when no key is set | Pass |
| TC-AUTH-deact | Deactivated member is signed out and cannot sign in | Pass |
| TC-AUTH-deact | Admin cannot deactivate their own account | Pass |
| TC-REG-13 | Show/Hide toggles the password field | Pass |
| TC-RPT-15 (UI) | Conflict dialog appears instead of overwriting | Pass |
| TC-RPT-15 (UI) | “Keep mine” saves successfully | Pass |
| TC-RPT-10 | Offline save keeps changes in the browser and says so | Pass |
| TC-RPT-11 | After reload, unsaved changes are offered back | Pass |
| TC-RPT-11 | Restored changes reach the server | Pass |
| TC-IMG-14 | Paste without choosing an image box does nothing | Pass |
| TC-EXP-04 | Export warns about empty parts first | Pass |
| TC-EXP-01 | One A4 PDF page per preview page | Pass |
| TC-EXP-10 | File name = Client - Completion Report - Month Year | Pass |
| TC-EXP-links | Drive/Canva links become clickable PDF areas (7: one javascript: link was removed earlier) | Pass |
| TC-EXP-quality | Pages rendered at scale 2 | Pass |
| TC-EXP-05 | Clear message when the PDF tools cannot load | Pass |
| JS | No JavaScript errors during the run | Pass |
