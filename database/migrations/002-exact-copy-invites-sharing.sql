-- Adds exact-copy templates, email invitations and sharing to a database
-- created before this update. Run it ONCE: phpMyAdmin → select the
-- database → Import. (Run 001-templates.sql first if you never did.)
-- A fresh install doesn't need this: schema.sql already includes it.

-- "theme" = learns the look (colours, fonts, headings) and keeps the TOLE pages;
-- "layout" = an exact copy of the uploaded PDF, element by element.
ALTER TABLE templates
    ADD COLUMN kind ENUM('theme', 'layout') NOT NULL DEFAULT 'theme' AFTER status;

-- Invitations: a one-time link (stored only as a hash) to set a password.
ALTER TABLE users
    ADD COLUMN invite_token_hash CHAR(64) NULL AFTER locked_until,
    ADD COLUMN invite_expires_at DATETIME NULL AFTER invite_token_hash,
    ADD COLUMN invited_at DATETIME NULL AFTER invite_expires_at;

-- Reports and templates handed to a team member.
CREATE TABLE IF NOT EXISTS shares (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    item_type   ENUM('report', 'template') NOT NULL,
    item_id     INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    shared_by   INT UNSIGNED NOT NULL,
    note        VARCHAR(500) NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL,
    seen_at     DATETIME NULL,
    UNIQUE KEY uq_share (item_type, item_id, user_id),
    KEY idx_share_user (user_id, created_at),
    CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_shares_by FOREIGN KEY (shared_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
