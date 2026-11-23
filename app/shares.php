<?php

declare(strict_types=1);

/*
 * Sharing: handing a report or a template to a team member.
 * Editors already see every report, so sharing a report puts it in their
 * "Shared with me" list with a note and an email. Sharing a template also
 * lets that Editor edit it (normally Admin only).
 */

const SHARE_TYPES = ['report', 'template'];

function can_edit_template(array $user, int $templateId): bool
{
    if ($user['role'] === 'admin') {
        return true;
    }
    return (bool) db_one(
        "SELECT id FROM shares WHERE item_type = 'template' AND item_id = ? AND user_id = ?",
        [$templateId, $user['id']]
    );
}

function mark_share_seen(string $type, int $itemId, int $userId): void
{
    db_run('UPDATE shares SET seen_at = ? WHERE item_type = ? AND item_id = ? AND user_id = ? AND seen_at IS NULL', [now(), $type, $itemId, $userId]);
}

/** People an item is shared with, for the share window. */
function shares_for(string $type, int $itemId): array
{
    return array_map(static fn(array $row) => [
        'userId' => (int) $row['user_id'], 'name' => $row['name'], 'email' => $row['email'],
        'note' => $row['note'], 'sharedBy' => $row['shared_by_name'], 'createdAt' => $row['created_at'], 'seen' => $row['seen_at'] !== null,
    ], db_all(
        'SELECT s.*, u.name, u.email, b.name AS shared_by_name FROM shares s
         JOIN users u ON u.id = s.user_id JOIN users b ON b.id = s.shared_by
         WHERE s.item_type = ? AND s.item_id = ? ORDER BY s.created_at',
        [$type, $itemId]
    ));
}

/** Everything shared with one person, newest first, with a link to open it. */
function shared_with_me(int $userId): array
{
    $items = [];
    foreach (db_all(
        "SELECT s.*, b.name AS shared_by_name, r.report_uid, r.client_name, r.month, r.year
         FROM shares s JOIN users b ON b.id = s.shared_by JOIN reports r ON r.id = s.item_id
         WHERE s.item_type = 'report' AND s.user_id = ?",
        [$userId]
    ) as $row) {
        $items[] = ['type' => 'report', 'title' => $row['client_name'] . ' · ' . MONTH_NAMES[(int) $row['month']] . ' ' . $row['year'],
            'url' => 'builder.php?uid=' . $row['report_uid'], 'note' => $row['note'], 'sharedBy' => $row['shared_by_name'],
            'createdAt' => $row['created_at'], 'seen' => $row['seen_at'] !== null];
    }
    foreach (db_all(
        "SELECT s.*, b.name AS shared_by_name, t.name AS template_name, t.kind
         FROM shares s JOIN users b ON b.id = s.shared_by JOIN templates t ON t.id = s.item_id
         WHERE s.item_type = 'template' AND s.user_id = ?",
        [$userId]
    ) as $row) {
        $items[] = ['type' => 'template', 'title' => $row['template_name'],
            'url' => ($row['kind'] === 'layout' ? 'template-layout.php?id=' : 'template-edit.php?id=') . (int) $row['item_id'],
            'note' => $row['note'], 'sharedBy' => $row['shared_by_name'], 'createdAt' => $row['created_at'], 'seen' => $row['seen_at'] !== null];
    }
    usort($items, static fn(array $a, array $b) => strcmp($b['createdAt'], $a['createdAt']));
    return $items;
}

/** Removes shares of something that was deleted. */
function delete_shares(string $type, int $itemId): void
{
    db_run('DELETE FROM shares WHERE item_type = ? AND item_id = ?', [$type, $itemId]);
}
