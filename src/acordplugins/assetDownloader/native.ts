/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { dialog, IpcMainInvokeEvent, shell } from "electron";

export interface DownloadRequest {
    dir: string;
    url: string;
    filename: string;
}

export interface DownloadResult {
    ok: boolean;
    path?: string;
    error?: string;
    skipped?: boolean;
}

// Strip any path components a Discord filename might smuggle in, so we can only
// ever write inside the directory the user picked.
function sanitizeFilename(filename: string): string {
    const base = basename(filename).replace(/[\\/:*?"<>|]/g, "_").trim();
    return base || "file";
}

// Avoid clobbering existing files by appending " (1)", " (2)", ... before the ext.
function uniquePath(dir: string, filename: string): string {
    const ext = extname(filename);
    const stem = filename.slice(0, filename.length - ext.length);
    let candidate = join(dir, filename);
    let i = 1;
    while (existsSync(candidate)) {
        candidate = join(dir, `${stem} (${i})${ext}`);
        i++;
    }
    return candidate;
}

export async function pickDirectory(_: IpcMainInvokeEvent, defaultPath?: string): Promise<string | null> {
    const res = await dialog.showOpenDialog({
        title: "Choose a folder to save attachments",
        properties: ["openDirectory", "createDirectory"],
        defaultPath: defaultPath || undefined
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
}

// Fetch happens in the main process to dodge the CORS restrictions the renderer
// hits on non-image Discord CDN files.
export async function downloadAsset(_: IpcMainInvokeEvent, req: DownloadRequest): Promise<DownloadResult> {
    try {
        if (!req?.dir || !req?.url || !req?.filename)
            return { ok: false, error: "Invalid download request" };

        await mkdir(req.dir, { recursive: true });

        const res = await fetch(req.url);
        if (!res.ok)
            return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };

        const buffer = Buffer.from(await res.arrayBuffer());
        const target = uniquePath(req.dir, sanitizeFilename(req.filename));
        await writeFile(target, buffer);

        return { ok: true, path: target };
    } catch (error: any) {
        return { ok: false, error: error?.message ?? "Unknown error" };
    }
}

// Used by the always-follow flow: keeps a per-channel subfolder tidy and skips
// files that were already saved (matched by the attachment id prefix).
export async function downloadAssetUnique(
    _: IpcMainInvokeEvent,
    req: DownloadRequest & { dedupeKey: string; }
): Promise<DownloadResult> {
    try {
        if (!req?.dir || !req?.url || !req?.filename)
            return { ok: false, error: "Invalid download request" };

        await mkdir(req.dir, { recursive: true });

        const clean = sanitizeFilename(req.filename);
        const prefix = `${req.dedupeKey}-`;
        const target = join(req.dir, `${prefix}${clean}`);
        if (existsSync(target)) return { ok: true, path: target, skipped: true };

        const res = await fetch(req.url);
        if (!res.ok)
            return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };

        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(target, buffer);

        return { ok: true, path: target };
    } catch (error: any) {
        return { ok: false, error: error?.message ?? "Unknown error" };
    }
}

// Re-uploading needs the raw bytes in the renderer, but the renderer can't fetch
// most Discord CDN files because of CORS. Pull them down here instead.
export async function fetchAssetBytes(
    _: IpcMainInvokeEvent,
    url: string
): Promise<{ ok: boolean; data?: Uint8Array; error?: string; }> {
    try {
        if (!url) return { ok: false, error: "Missing url" };
        const res = await fetch(url);
        if (!res.ok) return { ok: false, error: `HTTP ${res.status} ${res.statusText}` };
        return { ok: true, data: new Uint8Array(await res.arrayBuffer()) };
    } catch (error: any) {
        return { ok: false, error: error?.message ?? "Unknown error" };
    }
}

export async function revealPath(_: IpcMainInvokeEvent, filePath: string) {
    if (filePath) shell.showItemInFolder(filePath);
}

export async function openFolder(_: IpcMainInvokeEvent, dir: string) {
    if (dir) shell.openPath(dir);
}
