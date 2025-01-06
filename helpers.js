import db, { getDb } from './db.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import crypto from 'crypto';

export async function getFiles(dir) {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = join(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return files.flat();
}

export function normalizePath(path) {
    return path.split('\\').join('/');
}
export function hashFilePath(filePath) {
    return crypto.createHash('sha256').update(filePath).digest('hex');
}
export function captureFileData(file) {
    let paylaod = {};

    const normalizedPath = normalizePath(file);
    const fileName = normalizedPath.split('/').pop();
    const directory = normalizedPath.split('/').slice(0, -1).join('/');

    paylaod.id = hashFilePath(directory + '/' + fileName);
    paylaod.fullname = fileName;
    paylaod.directory = directory;
    paylaod.hash = crypto.createHash('sha256').update(file).digest('hex');

    console.log(paylaod);
    db.addFile(paylaod);
}


