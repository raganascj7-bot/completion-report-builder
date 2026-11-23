/**
 * Holds the open report and keeps it safe:
 * - autosaves to the server 1.5 s after the last change
 * - keeps an unsaved copy in this browser (per user + report) until the
 *   server confirms, so a crash, refresh or lost connection loses nothing
 * - detects when someone else saved first (HTTP 409) instead of
 *   silently overwriting their work
 */
import { apiGet, apiPost } from '../lib/api.js';
import { debounce } from '../lib/dom.js';

const AUTOSAVE_MS = 1500;

export const store = {
    config: null,
    uid: '',
    version: 0,
    status: 'draft',
    data: null,
    images: {},
    meta: {},
    changeSeq: 0,
    savedSeq: 0,
    saving: false,
    offline: false,
    conflict: null,
    error: null,
    lastSavedAt: null,
    templateId: null,
    theme: null,
    logoUrl: '',
    designs: [],
    design: null,      // { kind: 'theme' | 'layout', layout?, assetBase? }
};

const listeners = new Set();

/** kind: 'data' (text changed) | 'structure' (rows/images added) | 'save' | 'conflict' */
export function subscribe(listener) {
    listeners.add(listener);
}

function emit(kind) {
    listeners.forEach((listener) => listener(kind));
}

export function getPath(object, path) {
    return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), object);
}

export function setPath(object, path, value) {
    const keys = path.split('.');
    let target = object;
    for (let i = 0; i < keys.length - 1; i += 1) {
        if (target[keys[i]] == null) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
        target = target[keys[i]];
    }
    target[keys.at(-1)] = value;
}

export const isDirty = () => store.changeSeq !== store.savedSeq;

/* ---------- Local backup (this browser only) ---------- */

const backupKey = () => `crb:${store.config.userId}:${store.uid}`;

function writeBackup() {
    if (!isDirty()) return;
    try {
        localStorage.setItem(backupKey(), JSON.stringify({
            data: store.data, status: store.status, version: store.version, savedAt: Date.now(),
        }));
    } catch {
        // Storage full or blocked: the server copy is still the main safety net.
    }
}
const writeBackupSoon = debounce(writeBackup, 300);

export function readBackup() {
    try {
        const raw = localStorage.getItem(backupKey());
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearBackup() {
    try { localStorage.removeItem(backupKey()); } catch { /* ignore */ }
}

/* ---------- Loading and changing ---------- */

export async function loadReport(config) {
    store.config = config;
    store.uid = config.uid;
    const result = await apiGet(`api/report-get.php?uid=${encodeURIComponent(config.uid)}`);
    store.data = result.data;
    store.images = result.images ?? {};
    store.version = result.report.version;
    store.status = result.report.status;
    store.meta = result.report;
    store.changeSeq = 0;
    store.savedSeq = 0;
    store.lastSavedAt = result.report.updatedAt;
    store.templateId = result.design.templateId;
    store.theme = result.design.theme;
    store.logoUrl = result.design.logoUrl;
    store.design = result.design;
    store.designs = result.designs ?? [];
}

/** Switches the report's design; the report content is untouched. */
export function setDesign(design) {
    store.templateId = design.id ?? null;
    store.theme = design.theme;
    store.logoUrl = design.logoUrl ?? '';
    store.design = { kind: design.kind ?? 'theme', layout: design.layout ?? null, assetBase: design.assetBase ?? '' };
    change({ structural: true });
}

const saveSoon = debounce(() => save(), AUTOSAVE_MS);

/** Call after every edit. structural = rows/images added, removed or moved. */
export function change({ structural = false } = {}) {
    store.changeSeq += 1;
    writeBackupSoon();
    saveSoon();
    emit(structural ? 'structure' : 'data');
}

export function setStatus(status) {
    store.status = status;
    change();
}

/* ---------- Saving ---------- */

let inFlight = null;
let saveAgain = false;

/** Resolves true when the server has everything; false otherwise. */
export function save({ force = false } = {}) {
    saveSoon.cancel();
    if (store.conflict && !force) return Promise.resolve(false);
    if (inFlight) {
        saveAgain = true;
        return inFlight;
    }
    if (!isDirty() && !force) return Promise.resolve(true);

    const seq = store.changeSeq;
    store.saving = true;
    store.error = null;
    emit('save');

    inFlight = apiPost('api/report-save.php', {
        uid: store.uid, version: store.version, data: store.data, status: store.status, templateId: store.templateId, force,
    })
        .then((result) => {
            store.version = result.version;
            store.savedSeq = seq;
            store.lastSavedAt = result.updatedAt;
            store.offline = false;
            store.conflict = null;
            if (!isDirty()) clearBackup();
            return true;
        })
        .catch((error) => {
            writeBackup();
            if (error.status === 409) {
                store.conflict = error.body ?? {};
                emit('conflict');
            } else if (error.status === 0) {
                store.offline = true;
            } else if (error.status === 401) {
                store.error = 'Your session ended. Your changes are kept in this browser — sign in again (new tab), then press Save.';
            } else {
                store.error = error.message;
            }
            return false;
        })
        .finally(() => {
            store.saving = false;
            inFlight = null;
            emit('save');
            if (saveAgain) {
                saveAgain = false;
                if (isDirty()) save();
            }
        });
    return inFlight;
}

// Retry automatically when the connection comes back.
window.addEventListener('online', () => { if (isDirty()) save(); });
