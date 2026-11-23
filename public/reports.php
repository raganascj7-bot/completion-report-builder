<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

$user = require_login();

$clientFilter = filter_var($_GET['client'] ?? null, FILTER_VALIDATE_INT) ?: null;
$yearFilter = filter_var($_GET['year'] ?? null, FILTER_VALIDATE_INT) ?: null;
$statusFilter = in_array($_GET['status'] ?? '', ['draft', 'final'], true) ? $_GET['status'] : null;

$where = [];
$params = [];
if ($clientFilter) {
    $where[] = 'r.client_id = ?';
    $params[] = $clientFilter;
}
if ($yearFilter) {
    $where[] = 'r.year = ?';
    $params[] = $yearFilter;
}
if ($statusFilter) {
    $where[] = 'r.status = ?';
    $params[] = $statusFilter;
}

$reports = db_all(
    'SELECT r.report_uid, r.client_name, r.month, r.year, r.status, r.updated_at, u.name AS updated_by_name
     FROM reports r JOIN users u ON u.id = r.updated_by'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
    . ' ORDER BY r.updated_at DESC LIMIT 300',
    $params
);

$clients = db_all('SELECT id, name, is_active FROM clients ORDER BY name');
$activeClients = array_values(array_filter($clients, static fn($c) => (int) $c['is_active'] === 1));
$years = array_map('intval', array_column(db_all('SELECT DISTINCT year FROM reports ORDER BY year DESC'), 'year'));
$sharedWithMe = shared_with_me($user['id']);
$thisMonth = (int) date('n');
$thisYear = (int) date('Y');

page_top('Reports', 'reports');
?>
<main class="page" id="main">
    <div class="page-head">
        <div>
            <h1>Reports</h1>
            <p class="muted">Every completion report in the agency, newest first.</p>
        </div>
        <button type="button" class="btn btn-primary" data-open-modal="newReportModal"<?= $activeClients ? '' : ' disabled title="Add a client first"' ?>>+ New report</button>
    </div>

    <?php if ($sharedWithMe): ?>
        <section class="shared-box" aria-labelledby="sharedTitle">
            <h2 id="sharedTitle">Shared with me</h2>
            <ul class="shared-list">
                <?php foreach (array_slice($sharedWithMe, 0, 8) as $item): ?>
                    <li class="<?= $item['seen'] ? '' : 'is-new' ?>">
                        <a href="<?= e($item['url']) ?>"><strong><?= e($item['title']) ?></strong></a>
                        <span class="pill pill-kind"><?= $item['type'] === 'template' ? 'Template' : 'Report' ?></span>
                        <?php if (!$item['seen']): ?><span class="pill pill-brand">New</span><?php endif; ?>
                        <span class="muted small">from <?= e($item['sharedBy']) ?> · <?= e(date('M j, g:i A', strtotime((string) $item['createdAt']))) ?></span>
                        <?php if ($item['note'] !== ''): ?><span class="share-note"><?= e($item['note']) ?></span><?php endif; ?>
                    </li>
                <?php endforeach; ?>
            </ul>
        </section>
    <?php endif; ?>

    <?php if (!$activeClients): ?>
        <div class="alert alert-info">
            No clients yet. <?= is_admin() ? '<a href="clients.php">Add your first client</a> to start a report.' : 'Ask the Admin to add a client so you can start a report.' ?>
        </div>
    <?php endif; ?>

    <form class="filters" method="get">
        <label>Client
            <select name="client">
                <option value="">All clients</option>
                <?php foreach ($clients as $client): ?>
                    <option value="<?= (int) $client['id'] ?>"<?= $clientFilter === (int) $client['id'] ? ' selected' : '' ?>><?= e($client['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label>Year
            <select name="year">
                <option value="">All years</option>
                <?php foreach ($years as $year): ?>
                    <option value="<?= $year ?>"<?= $yearFilter === $year ? ' selected' : '' ?>><?= $year ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <label>Status
            <select name="status">
                <option value="">Any status</option>
                <option value="draft"<?= $statusFilter === 'draft' ? ' selected' : '' ?>>Draft</option>
                <option value="final"<?= $statusFilter === 'final' ? ' selected' : '' ?>>Final</option>
            </select>
        </label>
        <button type="submit" class="btn btn-secondary">Filter</button>
        <?php if ($clientFilter || $yearFilter || $statusFilter): ?>
            <a class="btn btn-ghost" href="reports.php">Clear</a>
        <?php endif; ?>
    </form>

    <?php if (!$reports): ?>
        <div class="empty-state">
            <p><strong>No reports<?= ($clientFilter || $yearFilter || $statusFilter) ? ' match these filters' : ' yet' ?>.</strong></p>
            <p class="muted">Use “New report” to start one for a client and month.</p>
        </div>
    <?php else: ?>
    <div class="table-wrap">
        <table class="data-table">
            <thead>
                <tr><th>Client</th><th>Month</th><th>Status</th><th>Last edited</th><th class="actions-col"><span class="visually-hidden">Actions</span></th></tr>
            </thead>
            <tbody>
            <?php foreach ($reports as $report): ?>
                <tr>
                    <td><a class="row-link" href="builder.php?uid=<?= e($report['report_uid']) ?>"><?= e($report['client_name']) ?></a></td>
                    <td><?= e(MONTH_NAMES[(int) $report['month']] . ' ' . $report['year']) ?></td>
                    <td><span class="pill pill-<?= e($report['status']) ?>"><?= $report['status'] === 'final' ? 'Final' : 'Draft' ?></span></td>
                    <td><?= e(date('M j, Y g:i A', strtotime((string) $report['updated_at']))) ?> <span class="muted">· <?= e($report['updated_by_name']) ?></span></td>
                    <td class="actions-col">
                        <a class="btn btn-ghost btn-sm" href="builder.php?uid=<?= e($report['report_uid']) ?>">Open</a>
                        <button type="button" class="btn btn-ghost btn-sm" data-share-type="report" data-share-id="<?= e($report['report_uid']) ?>"
                                data-share-title="<?= e($report['client_name'] . ' · ' . MONTH_NAMES[(int) $report['month']] . ' ' . $report['year']) ?>">Share</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-duplicate="<?= e($report['report_uid']) ?>"
                                data-label="<?= e($report['client_name'] . ' · ' . MONTH_NAMES[(int) $report['month']] . ' ' . $report['year']) ?>"
                                data-month="<?= (int) $report['month'] ?>" data-year="<?= (int) $report['year'] ?>">Duplicate</button>
                        <?php if (is_admin()): ?>
                            <button type="button" class="btn btn-danger-ghost btn-sm" data-delete="<?= e($report['report_uid']) ?>"
                                    data-label="<?= e($report['client_name'] . ' · ' . MONTH_NAMES[(int) $report['month']] . ' ' . $report['year']) ?>">Delete</button>
                        <?php endif; ?>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</main>

<dialog class="modal" id="newReportModal" aria-labelledby="newReportTitle">
    <form class="stack" id="newReportForm">
        <h2 id="newReportTitle">New report</h2>
        <p class="muted small">Client details, approver and scope rows are filled in from the client’s preset.</p>
        <label>Client
            <select name="clientId" required>
                <?php foreach ($activeClients as $client): ?>
                    <option value="<?= (int) $client['id'] ?>"><?= e($client['name']) ?></option>
                <?php endforeach; ?>
            </select>
        </label>
        <div class="form-row">
            <label>Month
                <select name="month" required>
                    <?php foreach (MONTH_NAMES as $number => $name): ?>
                        <option value="<?= $number ?>"<?= $number === $thisMonth ? ' selected' : '' ?>><?= e($name) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>Year
                <input type="number" name="year" min="2020" max="2100" value="<?= $thisYear ?>" required>
            </label>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Create report</button>
        </div>
    </form>
</dialog>

<dialog class="modal" id="duplicateModal" aria-labelledby="duplicateTitle">
    <form class="stack" id="duplicateForm">
        <h2 id="duplicateTitle">Duplicate report</h2>
        <p class="muted small">Copies <strong data-duplicate-label></strong>: client text, approver, scope rows, posted-page titles, contact details, cover and office photos. Screenshots, shoots, notes and dates start empty.</p>
        <input type="hidden" name="uid">
        <div class="form-row">
            <label>New month
                <select name="month" required>
                    <?php foreach (MONTH_NAMES as $number => $name): ?>
                        <option value="<?= $number ?>"><?= e($name) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>Year
                <input type="number" name="year" min="2020" max="2100" required>
            </label>
        </div>
        <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-close-modal>Cancel</button>
            <button type="submit" class="btn btn-primary">Duplicate</button>
        </div>
    </form>
</dialog>
<?php
page_bottom(['js/pages/reports.js']);
