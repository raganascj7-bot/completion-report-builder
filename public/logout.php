<?php

declare(strict_types=1);

require __DIR__ . '/../app/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    redirect('reports.php');
}

verify_csrf();
logout_user();
redirect('login.php?bye=1');
