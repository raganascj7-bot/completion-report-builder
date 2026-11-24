<?php

declare(strict_types=1);

/*
 * Sends email (invitations, share notices) over SMTP — e.g. a Gmail account
 * with an "app password" — with no extra libraries. Settings in .env:
 *
 *   MAIL_DRIVER=smtp            smtp | log (write emails to storage/logs/mail/ instead of sending) | off
 *   MAIL_HOST=smtp.gmail.com
 *   MAIL_PORT=587               587 with tls, 465 with ssl
 *   MAIL_ENCRYPTION=tls         tls (STARTTLS) | ssl | none
 *   MAIL_USERNAME=you@gmail.com
 *   MAIL_PASSWORD=app password (16 letters, no spaces needed)
 *   MAIL_FROM=you@gmail.com     Gmail only allows its own address here
 *   MAIL_FROM_NAME="JT Digital Marketing Services"
 *
 * Every sender returns true/false and never stops the page: when email
 * fails, the screen shows the link so the Admin can send it another way.
 */

function mail_driver(): string
{
    $driver = strtolower((string) config('MAIL_DRIVER', ''));
    if ($driver === '') {
        $driver = trim((string) config('MAIL_HOST', '')) !== '' ? 'smtp' : 'off';
    }
    return in_array($driver, ['smtp', 'log', 'off'], true) ? $driver : 'off';
}

/** Why the last email failed (for the Admin's "Send a test email" button). */
function mail_last_error(?string $set = null): string
{
    static $error = '';
    if ($set !== null) {
        $error = $set;
    }
    return $error;
}

function mail_enabled(): bool
{
    return mail_driver() !== 'off';
}

/** Absolute link into the app, e.g. app_link('invite.php?token=…'). */
function app_link(string $path): string
{
    $base = rtrim((string) config('APP_URL', ''), '/');
    if ($base === '') {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $dir = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        $dir = preg_replace('#/api$#', '', $dir) ?? $dir;
        $base = ($https ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir;
    }
    return $base . '/' . ltrim($path, '/');
}

/** One header value: no line breaks (blocks header injection), non-ASCII encoded. */
function mail_header_text(string $text): string
{
    $text = trim(str_replace(["\r", "\n"], ' ', $text));
    return preg_match('/[^\x20-\x7E]/', $text) ? '=?UTF-8?B?' . base64_encode($text) . '?=' : $text;
}

/** Simple branded HTML around a message, with one button. */
function mail_html(string $heading, string $bodyHtml, string $buttonText, string $buttonUrl): string
{
    $button = $buttonUrl !== ''
        ? '<p style="margin:28px 0"><a href="' . e($buttonUrl) . '" style="background:#3500ff;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">' . e($buttonText) . '</a></p>'
          . '<p style="color:#6b7080;font-size:12px">If the button doesn’t work, copy this link into your browser:<br><span style="word-break:break-all">' . e($buttonUrl) . '</span></p>'
        : '';
    return '<!DOCTYPE html><html><body style="margin:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif;color:#11111a">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">'
        . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">'
        . '<tr><td style="background:#3500ff;color:#ffffff;padding:18px 28px;font-weight:700;font-size:16px">' . e(config('APP_NAME', 'Completion Report Builder')) . '</td></tr>'
        . '<tr><td style="padding:28px;font-size:15px;line-height:1.55"><h1 style="font-size:20px;margin:0 0 14px">' . e($heading) . '</h1>'
        . $bodyHtml . $button . '</td></tr></table></td></tr></table></body></html>';
}

/**
 * Sends one email. Returns true when it was handed to the mail server
 * (or written to the log with MAIL_DRIVER=log). Failures are logged.
 */
function send_mail(string $toEmail, string $toName, string $subject, string $text, string $html): bool
{
    $driver = mail_driver();
    mail_last_error('');
    if ($driver === 'off') {
        mail_last_error('Email is off: MAIL_HOST is empty in .env.');
        return false;
    }
    if (!valid_email($toEmail)) {
        mail_last_error('The address to send to is not valid.');
        return false;
    }
    $from = (string) config('MAIL_FROM', config('MAIL_USERNAME', ''));
    $fromName = (string) config('MAIL_FROM_NAME', config('APP_NAME', 'Completion Report Builder'));
    if ($driver === 'smtp' && !valid_email($from)) {
        mail_last_error('MAIL_FROM in .env is not a valid email address.');
        log_error('Email not sent: MAIL_FROM is not a valid address.');
        return false;
    }

    $boundary = 'b' . random_token(12);
    $domain = substr(strrchr($from ?: 'app@localhost', '@') ?: '@localhost', 1);
    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . mail_header_text($fromName) . ' <' . ($from ?: 'app@localhost') . '>',
        'To: ' . mail_header_text($toName) . ' <' . $toEmail . '>',
        'Subject: ' . mail_header_text($subject),
        'Message-ID: <' . random_token(16) . '@' . $domain . '>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];
    $body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text))
        . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html))
        . "--{$boundary}--\r\n";
    $message = implode("\r\n", $headers) . "\r\n\r\n" . $body;

    if ($driver === 'log') {
        $dir = STORAGE_PATH . '/logs/mail';
        ensure_dir($dir);
        file_put_contents($dir . '/' . date('Ymd-His') . '-' . random_token(3) . '.eml', $message);
        return true;
    }

    try {
        smtp_send($from, $toEmail, $message);
        return true;
    } catch (Throwable $error) {
        mail_last_error($error->getMessage());
        log_error('Email not sent: ' . $error->getMessage(), ['to' => $toEmail]);
        return false;
    }
}

/** A minimal SMTP client: EHLO, STARTTLS/SSL, AUTH LOGIN, one message. */
function smtp_send(string $from, string $to, string $message): void
{
    $host = trim((string) config('MAIL_HOST', ''));
    $port = config_int('MAIL_PORT', 587);
    $encryption = strtolower((string) config('MAIL_ENCRYPTION', $port === 465 ? 'ssl' : 'tls'));
    $user = (string) config('MAIL_USERNAME', '');
    $password = str_replace(' ', '', (string) config('MAIL_PASSWORD', ''));   // Gmail shows app passwords in groups of 4

    $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host]]);
    $socket = @stream_socket_client(($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        throw new RuntimeException("Could not connect to {$host}:{$port} ({$errstr}).");
    }
    stream_set_timeout($socket, 20);

    $read = static function () use ($socket): array {
        $lines = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $lines .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return [(int) substr($lines, 0, 3), trim($lines)];
    };
    // $secret: the line carries the username or password — never repeat it in an error.
    $command = static function (string $line, array $expect, bool $secret = false) use ($socket, $read): string {
        fwrite($socket, $line . "\r\n");
        [$code, $reply] = $read();
        if (!in_array($code, $expect, true)) {
            $shown = $secret ? 'the login (check MAIL_USERNAME and the app password)' : $line;
            throw new RuntimeException("Mail server refused {$shown}: {$reply}");
        }
        return $reply;
    };

    try {
        [$code, $greeting] = $read();
        if ($code !== 220) {
            throw new RuntimeException("Unexpected greeting: {$greeting}");
        }
        $hostname = preg_replace('/[^a-z0-9.-]/i', '', (string) ($_SERVER['SERVER_NAME'] ?? 'localhost')) ?: 'localhost';
        $command("EHLO {$hostname}", [250]);
        if ($encryption === 'tls') {
            $command('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('Could not start an encrypted connection (check that PHP’s openssl extension is on).');
            }
            $command("EHLO {$hostname}", [250]);
        }
        if ($user !== '') {
            $command('AUTH LOGIN', [334]);
            $command(base64_encode($user), [334], true);
            $command(base64_encode($password), [235], true);
        }
        $command("MAIL FROM:<{$from}>", [250]);
        $command("RCPT TO:<{$to}>", [250, 251]);
        $command('DATA', [354]);
        // Lines starting with a dot are doubled (SMTP "dot stuffing").
        $data = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $message)) ?? $message;
        fwrite($socket, str_replace("\n", "\r\n", $data) . "\r\n.\r\n");
        [$code, $reply] = $read();
        if ($code !== 250) {
            throw new RuntimeException("Message refused: {$reply}");
        }
        fwrite($socket, "QUIT\r\n");
    } finally {
        fclose($socket);
    }
}

/* ---------- The app's emails ---------- */

function send_invitation_mail(array $member, string $link, string $invitedBy): bool
{
    $company = (string) (agency_settings()['contractor_name'] ?: 'JT Digital Marketing Services');
    $role = $member['role'] === 'admin' ? 'an Admin' : 'an Editor';
    $text = "Hi {$member['name']},\n\n{$invitedBy} added you to {$company}'s Completion Report Builder as {$role}.\n\n"
        . "Set your password here (the link works for 48 hours):\n{$link}\n\nIf you weren't expecting this, you can ignore this email.";
    $html = mail_html(
        'You’ve been added to the team',
        '<p>Hi ' . e($member['name']) . ',</p><p><strong>' . e($invitedBy) . '</strong> added you to ' . e($company)
            . '’s Completion Report Builder as ' . e($role) . '.</p><p>Click the button to choose your password. The link works for 48 hours.</p>',
        'Set my password',
        $link
    );
    return send_mail((string) $member['email'], (string) $member['name'], 'You’re invited to the Completion Report Builder', $text, $html);
}

function send_share_mail(array $to, string $sharedBy, string $what, string $title, string $note, string $link): bool
{
    $text = "Hi {$to['name']},\n\n{$sharedBy} shared the {$what} \"{$title}\" with you."
        . ($note !== '' ? "\n\nNote: {$note}" : '') . "\n\nOpen it here:\n{$link}";
    $html = mail_html(
        $sharedBy . ' shared a ' . $what . ' with you',
        '<p>Hi ' . e($to['name']) . ',</p><p><strong>' . e($sharedBy) . '</strong> shared the ' . e($what) . ' <strong>“' . e($title) . '”</strong> with you.</p>'
            . ($note !== '' ? '<p style="background:#f3f4f8;border-radius:8px;padding:12px 14px;margin:16px 0">' . nl2br(e($note)) . '</p>' : ''),
        'Open the ' . $what,
        $link
    );
    return send_mail((string) $to['email'], (string) $to['name'], "{$sharedBy} shared “{$title}” with you", $text, $html);
}
