/** Small DOM helpers shared by every page. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape any value before it goes into innerHTML. */
export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Returns a safe http(s) link or '' (blocks javascript: and data: links).
 * Mirrors clean_url() in app/helpers.php.
 */
export function safeUrl(value) {
    let url = String(value ?? '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url)) url = `https://${url}`;
        else return '';
    }
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch {
        return '';
    }
}

export function debounce(fn, ms) {
    let timer;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

export function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
}
