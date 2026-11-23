<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$user = require_login();
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$template = $id ? template_by_id($id) : null;
if (!$template) {
    abort_page(404, 'This design doesn’t exist or was deleted.');
}
if (($template['kind'] ?? 'theme') === 'layout') {
    redirect('template-layout.php?id=' . (int) $template['id']);
}
if (!can_edit_template($user, (int) $template['id'])) {
    abort_page(403, 'Only an Admin, or someone this template was shared with, can edit it.');
}
mark_share_seen('template', (int) $template['id'], $user['id']);

$palette = json_decode((string) @file_get_contents(template_dir((int) $template['id']) . '/palette.json'), true) ?: [];
$reports = array_map(
    static fn(array $row) => ['uid' => $row['report_uid'], 'label' => $row['client_name'] . ' · ' . MONTH_NAMES[(int) $row['month']] . ' ' . $row['year']],
    db_all('SELECT report_uid, client_name, month, year FROM reports ORDER BY updated_at DESC LIMIT 25')
);

$config = [
    'template' => template_payload($template, true),
    'palette' => $palette,
    'reports' => $reports,
    'aiEnabled' => ai_enabled(),
    'isNew' => isset($_GET['new']),
    'morePages' => ($_GET['pages'] ?? '') === 'more',
    'uploadNote' => clean_line($_GET['note'] ?? '', 300),
];

page_top('Design: ' . $template['name'], 'templates', 'design-page');
?>
<div class="builder-bar">
    <a class="btn btn-ghost btn-sm" href="<?= $user['role'] === 'admin' ? 'templates.php' : 'reports.php' ?>">← <?= $user['role'] === 'admin' ? 'Templates' : 'Reports' ?></a>
    <div class="builder-title">
        <label class="visually-hidden" for="designName">Design name</label>
        <input type="text" id="designName" class="title-input" maxlength="120" value="<?= e($template['name']) ?>">
        <span class="save-state" id="designState" aria-live="polite"><?= $template['status'] === 'ready' ? 'Ready — in use for reports' : 'Draft — not available to reports yet' ?></span>
    </div>
    <div class="builder-actions">
        <?php if (ai_enabled()): ?>
            <button type="button" class="btn btn-ghost" id="btnAnalyze">Analyse again with AI</button>
        <?php endif; ?>
        <button type="button" class="btn btn-secondary" id="btnSaveDraft">Save as draft</button>
        <button type="button" class="btn btn-primary" id="btnSaveReady">Save — ready to use</button>
    </div>
</div>

<div class="design-shell" id="main">
    <aside class="design-controls" id="designControls" aria-label="Design settings"></aside>

    <section class="design-column" aria-label="Your report in this design">
        <div class="previewpane-head">
            <label class="inline-select">Preview
                <select id="previewReport" aria-label="Report shown in the preview"></select>
            </label>
            <span class="muted small" id="previewCount"></span>
        </div>
        <div class="design-scroll" id="designPreview"></div>
    </section>

    <section class="design-column design-source" aria-label="Uploaded example">
        <div class="previewpane-head"><span>Uploaded example</span><span class="muted small"><?= e($template['source_name']) ?></span></div>
        <div class="design-scroll" id="designSource"></div>
    </section>
</div>

<script type="application/json" id="designConfig"><?= json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE) ?></script>
<?php
page_bottom(['js/pages/template-edit.js']);
