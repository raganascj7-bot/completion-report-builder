<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

require_admin();

$templates = db_all(
    'SELECT t.*, (SELECT COUNT(*) FROM reports r WHERE r.template_id = t.id) AS report_count,
            (SELECT COUNT(*) FROM clients c WHERE c.template_id = t.id) AS client_count
     FROM templates t ORDER BY t.status DESC, t.name'
);
$defaultId = default_template_id();
$builtInReports = (int) (db_one('SELECT COUNT(*) AS total FROM reports WHERE template_id IS NULL')['total'] ?? 0);

// Known names, so the upload can recognise report values (client, preparer, contact) in the PDF.
$settings = agency_settings();
$known = [
    'agency' => array_intersect_key($settings, array_flip(['contractor_name', 'contractor_address', 'prepared_by_name', 'prepared_by_company',
        'closing_note', 'viber_name', 'viber_number', 'email', 'website', 'location'])),
    'clients' => array_map(static fn(array $client) => [
        'name' => $client['name'], 'coverDisplay' => $client['cover_display'], 'projectNames' => $client['project_names'] ?? '',
        'projectDescription' => $client['project_description'] ?? '', 'approverName' => $client['approver_name'],
        'approverPosition' => $client['approver_position'], 'approverDepartment' => $client['approver_department'],
    ], db_all('SELECT * FROM clients')),
];

page_top('Templates', 'templates');
?>
<main class="page" id="main">
    <div class="page-head">
        <div>
            <h1>Report templates</h1>
            <p class="muted">Upload a finished completion report (PDF) and the app makes an <strong>exact copy</strong>: every text, photo and shape
                stays where it is, and each month you only change the words and pictures. Choose the template per client, or per report in the builder.</p>
        </div>
        <button type="button" class="btn btn-primary" data-open-modal="uploadModal">+ Upload a template</button>
    </div>

    <div class="template-grid">
        <article class="template-card">
            <div class="template-thumb"><img src="assets/img/tole-thumb.jpg" alt="JT Default cover" loading="lazy"></div>
            <div class="template-body">
                <h2>JT Default (TOLE)</h2>
                <p class="muted small">Built in · <?= e(count_label($builtInReports, 'report')) ?></p>
                <div class="template-tags">
                    <span class="pill pill-final">Ready</span>
                    <?php if ($defaultId === null): ?><span class="pill pill-brand">Default for new reports</span><?php endif; ?>
                </div>
                <div class="template-actions">
                    <?php if ($defaultId !== null): ?>
                        <button type="button" class="btn btn-ghost btn-sm" data-template-default="">Make default</button>
                    <?php endif; ?>
                </div>
            </div>
        </article>

        <?php foreach ($templates as $template): ?>
            <?php
            $id = (int) $template['id'];
            $hasPage = is_file(template_dir($id) . '/page-1.jpg');
            $isLayout = ($template['kind'] ?? 'theme') === 'layout';
            $editUrl = ($isLayout ? 'template-layout.php?id=' : 'template-edit.php?id=') . $id;
            ?>
            <article class="template-card">
                <a class="template-thumb" href="<?= e($editUrl) ?>">
                    <?php if ($hasPage): ?>
                        <img src="api/template-file.php?id=<?= $id ?>&amp;file=page-1" alt="<?= e($template['name']) ?> — first page of the uploaded example" loading="lazy">
                    <?php else: ?>
                        <span class="muted small">No preview</span>
                    <?php endif; ?>
                </a>
                <div class="template-body">
                    <h2><a href="<?= e($editUrl) ?>"><?= e($template['name']) ?></a></h2>
                    <p class="muted small">
                        <?= e(count_label((int) $template['report_count'], 'report')) ?> · <?= e(count_label((int) $template['client_count'], 'client')) ?>
                        · <?= $isLayout
                            ? ($template['analyzed_by'] === 'ai' ? 'copied from the PDF, checked by AI' : 'copied from the PDF')
                            : (['ai' => 'analysed by AI', 'pdf' => 'read from the PDF'][$template['analyzed_by']] ?? 'colours measured') ?>
                    </p>
                    <div class="template-tags">
                        <span class="pill pill-kind"><?= $isLayout ? 'Exact copy' : 'Look only' ?></span>
                        <?php if ($template['status'] === 'ready'): ?>
                            <span class="pill pill-final">Ready</span>
                        <?php else: ?>
                            <span class="pill pill-draft">Draft — review and save</span>
                        <?php endif; ?>
                        <?php if ($defaultId === $id): ?><span class="pill pill-brand">Default for new reports</span><?php endif; ?>
                    </div>
                    <div class="template-actions">
                        <a class="btn btn-secondary btn-sm" href="<?= e($editUrl) ?>"><?= $template['status'] === 'ready' ? 'Edit' : 'Review' ?></a>
                        <?php if ($template['status'] === 'ready' && $defaultId !== $id): ?>
                            <button type="button" class="btn btn-ghost btn-sm" data-template-default="<?= $id ?>">Make default</button>
                        <?php endif; ?>
                        <button type="button" class="btn btn-ghost btn-sm" data-share-type="template" data-share-id="<?= $id ?>" data-share-title="<?= e($template['name']) ?>">Share</button>
                        <button type="button" class="btn btn-danger-ghost btn-sm" data-template-delete="<?= $id ?>"
                                data-name="<?= e($template['name']) ?>" data-used="<?= (int) $template['report_count'] ?>">Delete</button>
                    </div>
                </div>
            </article>
        <?php endforeach; ?>
    </div>
</main>

<dialog class="modal modal-wide" id="uploadModal" aria-labelledby="uploadTitle">
    <form class="stack" id="uploadForm" novalidate>
        <h2 id="uploadTitle">Upload a template</h2>
        <fieldset class="choice-cards">
            <legend>What should the app do with it?</legend>
            <label class="choice-card">
                <input type="radio" name="mode" value="layout" checked>
                <span><strong>Exact copy</strong> <span class="pill pill-brand">Recommended</span>
                    <span class="muted small">Same pages, same positions. Each month you change the words and pictures. PDF only.</span></span>
            </label>
            <label class="choice-card">
                <input type="radio" name="mode" value="theme">
                <span><strong>Learn the look only</strong>
                    <span class="muted small">Keeps the nine TOLE pages and uses this report’s colours, fonts and headings. PDF or page pictures.</span></span>
            </label>
        </fieldset>
        <label>Template name
            <input type="text" name="name" maxlength="120" required placeholder="e.g. Harbor View monthly report">
        </label>
        <label>Finished report
            <input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple required>
            <span class="hint">PDF up to <?= config_int('UPLOAD_MAX_MB', 10) ?> MB<span data-mode-hint="theme" hidden>, or several page pictures in order</span>.
                <?= ai_enabled() ? 'The AI then checks what each part is; you review it before anyone can use it.' : 'You review it before anyone can use it (AI checking is off until an OpenAI key is added).' ?></span>
        </label>
        <div class="upload-progress" data-upload-progress hidden>
            <ol class="upload-steps">
                <li data-step="read">Reading pages</li>
                <li data-step="measure" data-mode-step="theme">Measuring colours</li>
                <li data-step="upload">Uploading</li>
                <?php if (ai_enabled()): ?><li data-step="analyze">AI is checking the template (up to a minute)</li><?php endif; ?>
            </ol>
        </div>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Upload</button>
        </div>
    </form>
</dialog>
<script type="application/json" id="templatesConfig"><?= json_encode(['known' => $known], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?></script>
<?php
page_bottom(['js/pages/templates.js']);
