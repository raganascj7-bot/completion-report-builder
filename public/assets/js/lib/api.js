/**
 * The only place the app calls fetch(). Every request carries the CSRF
 * token, and every answer is unwrapped from { ok, data | error }.
 */

const csrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content ?? '';

export class ApiError extends Error {
    constructor(message, status, body = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.body = body;
    }
}

const FALLBACK_MESSAGES = {
    401: 'Your session has ended. Please sign in again.',
    403: 'You don’t have permission to do that.',
    404: 'Not found.',
    413: 'That file is too large.',
    419: 'Your session expired. Refresh the page and try again.',
    429: 'Too many requests. Please wait a moment.',
    500: 'Something went wrong on the server. Please try again.',
};

async function send(url, options) {
    let response;
    try {
        response = await fetch(url, {
            credentials: 'same-origin',
            ...options,
            headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json', ...(options.headers ?? {}) },
        });
    } catch {
        throw new ApiError('Can’t reach the server. Check your internet connection.', 0);
    }

    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (!response.ok || !body || body.ok !== true) {
        const message = body?.error || FALLBACK_MESSAGES[response.status] || `Request failed (${response.status}).`;
        throw new ApiError(message, response.status, body);
    }
    return body.data;
}

export const apiGet = (url) => send(url, { method: 'GET' });

export const apiPost = (url, payload) =>
    send(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export const apiUpload = (url, form) => send(url, { method: 'POST', body: form });
