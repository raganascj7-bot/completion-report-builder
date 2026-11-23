<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

require_admin();
$designs = ready_templates();
$clients = db_all(
    'SELECT c.*, (SELECT COUNT(*) FROM reports r WHERE r.client_id = c.id) AS report_count
     FROM clients c ORDER BY c.is_active DESC, c.name'
);

page_top('Clients', 'clients');
?>
<main class="page" id="main">
    <div class="page-head">
        <div>
            <h1>Clients</h1>
            <p class="muted">Each client’s preset pre-fills new reports: cover name, project names, description and approver.
                To save a client’s own scope rows, open one of their reports, go to Breakdown and choose “Save as this client’s default rows”.</p>
        </div>
        <button type="button" class="btn btn-primary" data-client-new>+ Add client</button>
    </div>

    <?php if (!$clients): ?>
        <div class="empty-state"><p><strong>No clients yet.</strong></p><p class="muted">Add a client to start their first report.</p></div>
    <?php else: ?>
    <div class="table-wrap">
        <table class="data-table">
            <thead><tr><th>Client</th><th>Approver</th><th>Scope rows</th><th>Reports</th><th>Status</th><th class="actions-col"><span class="visually-hidden">Actions</span></th></tr></thead>
            <tbody>
            <?php foreach ($clients as $client): ?>
                <?php
                $preset = $client['breakdown_preset'] ? json_decode((string) $client['breakdown_preset'], true) : null;
                $payload = [
                    'id' => (int) $client['id'],
                    'name' => $client['name'],
                    'coverDisplay' => $client['cover_display'],
                    'approverName' => $client['approver_name'],
                    'approverPosition' => $client['approver_position'],
                    'approverDepartment' => $client['approver_department'],
                    'projectNames' => (string) $client['project_names'],
                    'projectDescription' => (string) $client['project_description'],
                    'hasPreset' => is_array($preset),
                    'templateId' => $client['template_id'] !== null ? (int) $client['template_id'] : null,
                ];
                ?>
                <tr class="<?= (int) $client['is_active'] === 1 ? '' : 'row-muted' ?>">
                    <td><strong><?= e($client['name']) ?></strong></td>
                    <td><?= e($client['approver_name'] ?: '—') ?><?php if ($client['approver_position']): ?><br><span class="muted small"><?= e($client['approver_position']) ?></span><?php endif; ?></td>
                    <td><?= is_array($preset) ? count($preset) . ' custom' : 'Standard 6' ?></td>
                    <td><a href="reports.php?client=<?= (int) $client['id'] ?>"><?= (int) $client['report_count'] ?></a></td>
                    <td><?= (int) $client['is_active'] === 1 ? '<span class="pill pill-final">Active</span>' : '<span class="pill pill-muted">Archived</span>' ?></td>
                    <td class="actions-col">
                        <button type="button" class="btn btn-ghost btn-sm" data-client-edit='<?= e(json_encode($payload)) ?>'>Edit</button>
                        <?php if ((int) $client['is_active'] === 1): ?>
                            <button type="button" class="btn btn-ghost btn-sm" data-client-action="archive" data-id="<?= (int) $client['id'] ?>" data-name="<?= e($client['name']) ?>">Archive</button>
                        <?php else: ?>
                            <button type="button" class="btn btn-ghost btn-sm" data-client-action="restore" data-id="<?= (int) $client['id'] ?>" data-name="<?= e($client['name']) ?>">Restore</button>
                        <?php endif; ?>
                        <?php if ((int) $client['report_count'] === 0): ?>
                            <button type="button" class="btn btn-danger-ghost btn-sm" data-client-action="delete" data-id="<?= (int) $client['id'] ?>" data-name="<?= e($client['name']) ?>">Delete</button>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</main>

<dialog class="modal modal-wide" id="clientModal" aria-labelledby="clientModalTitle">
    <form class="stack" id="clientForm" novalidate>
        <h2 id="clientModalTitle">Add client</h2>
        <input type="hidden" name="id">
        <div class="form-row">
            <label>Client name <span class="hint">shown in lists</span>
                <input type="text" name="name" maxlength="150" required placeholder="The Outlets at LIMA Estate">
            </label>
            <label>Name on the cover <span class="hint">press Enter for a second line</span>
                <textarea name="coverDisplay" rows="2" maxlength="200" placeholder="The Outlets&#10;@LIMA ESTATE"></textarea>
            </label>
        </div>
        <label>Project name(s) <span class="hint">one per line</span>
            <textarea name="projectNames" rows="2" maxlength="1000" placeholder="The Outlets at LIMA Estate Social Media Marketing Services"></textarea>
        </label>
        <label>Project description
            <textarea name="projectDescription" rows="3" maxlength="3000" placeholder="Monthly social media management and layouts for …"></textarea>
        </label>
        <fieldset class="fieldset">
            <legend>Approved by</legend>
            <div class="form-row three">
                <label>Name <input type="text" name="approverName" maxlength="150"></label>
                <label>Position <input type="text" name="approverPosition" maxlength="200"></label>
                <label>Department / unit <input type="text" name="approverDepartment" maxlength="200"></label>
            </div>
        </fieldset>
        <?php if ($designs): ?>
        <label>Report design for new reports
            <select name="templateId">
                <option value="">Agency default</option>
                <?php foreach ($designs as $design): ?>
                    <option value="<?= (int) $design['id'] ?>"><?= e($design['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <?php endif; ?>
        <label class="checkbox" data-reset-preset hidden><input type="checkbox" name="resetPreset" value="1"> Go back to the standard 6 scope rows</label>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Save client</button>
        </div>
    </form>
</dialog>
<?php
page_bottom(['js/pages/clients.js']);
