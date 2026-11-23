<?php

declare(strict_types=1);

/* Review screen of an exact-copy template: check what each text and photo is, name the pages, save. */

require __DIR__ . '/../app/bootstrap.php';

$user = require_login();
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$template = $id ? template_by_id($id) : null;
if (!$template || ($template['kind'] ?? 'theme') !== 'layout') {
    abort_page(404, 'This template doesn’t exist or was deleted.');
}
if (!can_edit_template($user, (int) $template['id'])) {
    abort_page(403, 'Only an Admin, or someone this template was shared with, can edit it.');
}
mark_share_seen('template', (int) $template['id'], $user['id']);

$reports = array_map(
    static fn(array $row) => ['uid' => $row['report_uid'], 'label' => $row['client_name'] . ' · ' . MONTH_NAMES[(int) $row['month']] . ' ' . $row['year']],
    db_all('SELECT report_uid, client_name, month, year FROM reports ORDER BY updated_at DESC LIMIT 25')
);
$config = [
    'template' => template_payload($template, true),
    'fields' => LAYOUT_FIELDS,
    'reports' => $reports,
    'aiEnabled' => ai_enabled(),
    'isNew' => isset($_GET['new']),
    'uploadNote' => clean_line($_GET['note'] ?? '', 300),
    'canDelete' => $user['role'] === 'admin',
];

page_top('Template: ' . $template['name'], 'templates', 'design-page');
?>
<div class="builder-bar">
    <a class="btn btn-ghost btn-sm" href="<?= $user['role'] === 'admin' ? 'templates.php' : 'reports.php' ?>">← <?= $user['role'] === 'admin' ? 'Templates' : 'Reports' ?></a>
    <div class="builder-title">
        <label class="visually-hidden" for="designName">Template name</label>
        <input type="text" id="designName" class="title-input" maxlength="120" value="<?= e($template['name']) ?>">
        <span class="save-state" id="designState" aria-live="polite"><?= $template['status'] === 'ready' ? 'Ready — in use for reports' : 'Draft — not available to reports yet' ?></span>
    </div>
    <div class="builder-actions">
        <?php if (ai_enabled()): ?>
            <button type="button" class="btn btn-ghost" id="btnLabel">Check again with AI</button>
        <?php endif; ?>
        <button type="button" class="btn btn-secondary" id="btnSaveDraft">Save as draft</button>
        <button type="button" class="btn btn-primary" id="btnSaveReady">Save — ready to use</button>
    </div>
</div>

<div class="design-shell layout-review" id="main">
    <aside class="design-controls" id="layoutControls" aria-label="Template settings"></aside>

    <section class="design-column" aria-label="The copy">
        <div class="previewpane-head">
            <label class="inline-select">Show
                <select id="previewReport" aria-label="Text shown on the copy"></select>
            </label>
            <span class="muted small" id="pageLabel"></span>
        </div>
        <div class="design-scroll" id="layoutPreview"></div>
    </section>

    <section class="design-column design-source" aria-label="Uploaded original">
        <div class="previewpane-head"><span>Original</span><span class="muted small"><?= e($template['source_name']) ?></span></div>
        <div class="design-scroll" id="layoutSource"></div>
    </section>
</div>

<script type="application/json" id="layoutConfig"><?= json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
<?php
page_bottom(['js/pages/template-layout.js']);
