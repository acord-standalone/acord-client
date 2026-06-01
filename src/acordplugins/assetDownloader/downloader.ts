/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

import { Asset } from "./filters";
import { logger } from "./store";

const Native = VencordNative.pluginHelpers.AssetDownloader as PluginNative<typeof import("./native")>;

export interface DownloadOutcome {
    completed: number;
    failed: number;
    lastPath: string | null;
}

export function pickDirectory(defaultPath?: string): Promise<string | null> {
    return Native.pickDirectory(defaultPath);
}

export function revealPath(path: string) {
    void Native.revealPath(path);
}

export function openFolder(dir: string) {
    void Native.openFolder(dir);
}

// Bulk download for the modal: keeps a few requests in flight at once and reports
// progress after each file finishes. Returns when everything has been attempted.
export async function downloadAssets(
    dir: string,
    assets: Asset[],
    onProgress: (done: number, total: number) => void,
    shouldAbort: () => boolean = () => false,
    concurrency = 4
): Promise<DownloadOutcome> {
    const outcome: DownloadOutcome = { completed: 0, failed: 0, lastPath: null };
    let index = 0;
    let finished = 0;

    async function worker() {
        while (!shouldAbort()) {
            const current = index++;
            if (current >= assets.length) return;
            const asset = assets[current];
            try {
                const res = await Native.downloadAsset({ dir, url: asset.url, filename: asset.filename });
                if (res.ok) {
                    outcome.completed++;
                    if (res.path) outcome.lastPath = res.path;
                } else {
                    outcome.failed++;
                    logger.warn(`failed to download ${asset.filename}: ${res.error}`);
                }
            } catch (e) {
                outcome.failed++;
                logger.error("download threw", e);
            }
            finished++;
            onProgress(finished, assets.length);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, assets.length) }, worker);
    await Promise.all(workers);
    return outcome;
}

// Single-file download used by the always-follow handler. De-dupes by attachment
// id so re-delivered MESSAGE_CREATE events don't write the same file twice.
export async function downloadFollowAsset(dir: string, asset: Asset): Promise<boolean> {
    try {
        const res = await Native.downloadAssetUnique({
            dir,
            url: asset.url,
            filename: asset.filename,
            dedupeKey: asset.id
        });
        if (!res.ok) logger.warn(`follow download failed for ${asset.filename}: ${res.error}`);
        return res.ok;
    } catch (e) {
        logger.error("follow download threw", e);
        return false;
    }
}
