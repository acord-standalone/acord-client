/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Constants, RestAPI } from "@webpack/common";

import { Asset, extractAssets } from "./filters";
import { logger } from "./store";

export interface ScanProgress {
    messagesScanned: number;
    assetsFound: number;
    oldestTimestamp: number | null;
    done: boolean;
}

export interface ScanHandle {
    abort(): void;
}

const PAGE_LIMIT = 100;

function snowflakeToTime(id: string): number {
    try {
        return Number((BigInt(id) >> 22n) + 1420070400000n);
    } catch {
        return 0;
    }
}

// Continuously walks a channel's history toward the past, one 100-message page at
// a time, emitting every attachment it sees. Returns a handle so the UI can stop.
export function scanChannel(
    channelId: string,
    onAssets: (assets: Asset[]) => void,
    onProgress: (progress: ScanProgress) => void
): ScanHandle {
    let aborted = false;
    let before: string | undefined;
    let messagesScanned = 0;
    let assetsFound = 0;
    let oldestTimestamp: number | null = null;

    const handle: ScanHandle = { abort() { aborted = true; } };

    (async () => {
        while (!aborted) {
            let body: any[];
            try {
                const res = await RestAPI.get({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    query: { limit: PAGE_LIMIT, ...(before ? { before } : {}) },
                    retries: 2
                });
                body = Array.isArray(res?.body) ? res.body : [];
            } catch (e) {
                logger.error("history fetch failed", e);
                onProgress({ messagesScanned, assetsFound, oldestTimestamp, done: true });
                return;
            }

            if (!body.length) break;

            const pageAssets: Asset[] = [];
            for (const msg of body) {
                messagesScanned++;
                const assets = extractAssets(msg);
                if (assets.length) pageAssets.push(...assets);
            }

            if (pageAssets.length) {
                assetsFound += pageAssets.length;
                onAssets(pageAssets);
            }

            // Messages come back newest-first; the last one is the oldest in the page.
            const last = body[body.length - 1];
            before = String(last.id);
            oldestTimestamp = snowflakeToTime(before);

            onProgress({ messagesScanned, assetsFound, oldestTimestamp, done: false });

            if (body.length < PAGE_LIMIT) break;

            // Stay friendly to the rate limiter.
            await new Promise(r => setTimeout(r, 350));
        }

        onProgress({ messagesScanned, assetsFound, oldestTimestamp, done: true });
    })();

    return handle;
}
