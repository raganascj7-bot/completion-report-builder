<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$user = require_login();
$report = report_by_uid((string) ($_GET['uid'] ?? ''));
if (!$report) {
    abort_page(404, 'This report doesn’t exist or was deleted.');
}

mark_share_seen('report', (int) $report['id'], $user['id']);

$config = [
    'uid' => $report['report_uid'],
    'userId' => $user['id'],
    'isAdmin' => $user['role'] === 'admin',
    'aiEnabled' => ai_enabled(),
    'uploadMaxMb' => config_int('UPLOAD_MAX_MB', 10),
];
$label = $report['client_name'] . ' · ' . MONTH_NAMES[(int) $report['month']] . ' ' . $report['year'];

page_top($label, 'reports', 'builder-page');
?>
<div class="builder-bar">
    <a class="btn btn-ghost btn-sm" href="reports.php">← Reports</a>
    <div class="builder-title">
        <strong id="reportLabel"><?= e($label) ?></strong>
        <span class="save-state" id="saveState" aria-live="polite">Loading…</span>
    </div>
    <div class="builder-actions">
        <label class="inline-select">Design
            <select id="reportDesign" aria-label="Report design"></select>
        </label>
        <label class="inline-select">Status
            <select id="reportStatus" aria-label="Report status">
                <option value="draft">Draft</option>
                <option value="final">Final</option>
            </select>
        </label>
        <button type="button" class="btn btn-ghost" id="btnShare" data-share-type="report" data-share-id="<?= e($report['report_uid']) ?>" data-share-title="<?= e($label) ?>">Share</button>
        <button type="button" class="btn btn-secondary" id="btnSave">Save</button>
        <button type="button" class="btn btn-primary" id="btnExport">Generate PDF</button>
    </div>
</div>

<div class="app-shell" id="main">
    <nav class="sidenav" aria-label="Report sections">
        <p class="sidenav-hint">Sections</p>
        <ol class="section-list" id="sectionList"></ol>
        <p class="sidenav-progress" id="sectionProgress"></p>
    </nav>

    <section class="editor" id="editor" aria-label="Section editor">
        <p class="muted">Loading report…</p>
    </section>

    <aside class="previewpane" aria-label="Live preview">
        <div class="previewpane-head">
            <span>Live preview <span class="muted" id="pageCount"></span></span>
            <div class="preview-zoom">
                <button type="button" class="btn btn-ghost btn-xs" id="zoomOut" aria-label="Zoom out">−</button>
                <span id="zoomLevel">70%</span>
                <button type="button" class="btn btn-ghost btn-xs" id="zoomIn" aria-label="Zoom in">+</button>
            </div>
        </div>
        <div class="previewpane-scroll" id="previewScroll">
            <div class="preview-pages" id="previewPages"></div>
        </div>
    </aside>
</div>

<dialog class="modal" id="conflictModal" aria-labelledby="conflictTitle">
    <div class="stack">
        <h2 id="conflictTitle">Someone else saved this report</h2>
        <p data-conflict-text>Another person saved a newer version while you were editing.</p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-conflict="reload">Load their version</button>
            <button type="button" class="btn btn-primary" data-conflict="overwrite">Keep mine and overwrite</button>
        </div>
    </div>
</dialog>

<dialog class="modal" id="restoreModal" aria-labelledby="restoreTitle">
    <div class="stack">
        <h2 id="restoreTitle">Unsaved changes found</h2>
        <p>This browser kept changes to this report that never reached the server (saved <span data-restore-time></span>).</p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-restore="discard">Discard them</button>
            <button type="button" class="btn btn-primary" data-restore="restore">Restore my changes</button>
        </div>
    </div>
</dialog>

<script type="application/json" id="builderConfig"><?= json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
<?php
page_bottom(['js/builder/main.js']);
