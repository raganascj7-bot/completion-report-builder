/**
 * Prepares an image in the browser before upload:
 * - rejects anything that is not an image
 * - shrinks it to at most 2000 px wide (never enlarges)
 * - keeps PNG for screenshots (sharp text) unless the file would be big,
 *   otherwise JPEG at 90% quality on a white background
 */

const MAX_WIDTH = 2000;
const KEEP_AS_IS_BYTES = 1.5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`“${file.name}” could not be read as an image.`)); };
        image.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name, extension) {
    const base = (name || 'image').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').slice(0, 60) || 'image';
    return `${base}.${extension}`;
}

export async function prepareImage(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        throw new Error(`“${file?.name ?? 'This file'}” is not an image. Use JPG, PNG or WebP.`);
    }
    if (!ACCEPTED.includes(file.type)) {
        throw new Error(`“${file.name}” is a ${file.type.replace('image/', '').toUpperCase()} file. Use JPG, PNG or WebP.`);
    }

    const image = await loadImage(file);
    const scale = Math.min(1, MAX_WIDTH / image.naturalWidth);
    const keepOriginal = scale === 1 && file.size <= KEEP_AS_IS_BYTES && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (keepOriginal) return file;

    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';

    if (file.type === 'image/png') {
        context.drawImage(image, 0, 0, width, height);
        const png = await canvasToBlob(canvas, 'image/png');
        if (png && png.size <= KEEP_AS_IS_BYTES) return new File([png], renamed(file.name, 'png'), { type: 'image/png' });
    }

    // JPEG has no transparency: paint white first so transparent areas don't turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    if (!jpeg) throw new Error(`“${file.name}” could not be processed.`);
    return new File([jpeg], renamed(file.name, 'jpg'), { type: 'image/jpeg' });
}
