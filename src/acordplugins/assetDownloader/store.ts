/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

import { emptyFilter, FilterConfig } from "./filters";

export type FollowAction = "download" | "upload" | "forward";

// A channel the user asked us to keep watching. As new matching attachments
// arrive via MESSAGE_CREATE we either save them to `dir`, re-upload them to
// `targetId`, or forward the source message to `targetId`.
export interface FollowConfig {
    channelId: string;
    channelName: string;
    action: FollowAction;
    // Used by the "download" action.
    dir?: string;
    // Used by the "upload" / "forward" actions.
    targetId?: string;
    filter: FilterConfig;
}

const KEY = "AssetDownloader_follows_v1";
export const logger = new Logger("AssetDownloader");

type Listener = (follows: Record<string, FollowConfig>) => void;

let follows: Record<string, FollowConfig> = {};
let loaded = false;
const listeners = new Set<Listener>();

async function load() {
    try {
        const stored = await DataStore.get<Record<string, FollowConfig>>(KEY);
        follows = stored && typeof stored === "object" ? stored : {};
    } catch (e) {
        logger.error("failed to load follows", e);
        follows = {};
    }
    loaded = true;
    emit();
}

function emit() {
    for (const l of listeners) {
        try { l(follows); } catch (e) { logger.error("listener threw", e); }
    }
}

async function persist() {
    try {
        await DataStore.set(KEY, follows);
    } catch (e) {
        logger.error("failed to save follows", e);
    }
}

export const FollowStore = {
    init: load,
    isLoaded: () => loaded,
    getAll(): Record<string, FollowConfig> {
        return follows;
    },
    get(channelId: string): FollowConfig | undefined {
        return follows[channelId];
    },
    isFollowing(channelId: string): boolean {
        return !!follows[channelId];
    },
    subscribe(l: Listener): () => void {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },
    set(config: FollowConfig) {
        follows = { ...follows, [config.channelId]: { ...config, filter: config.filter ?? emptyFilter() } };
        emit();
        void persist();
    },
    updateFilter(channelId: string, filter: FilterConfig) {
        const existing = follows[channelId];
        if (!existing) return;
        follows = { ...follows, [channelId]: { ...existing, filter } };
        emit();
        void persist();
    },
    remove(channelId: string) {
        if (!follows[channelId]) return;
        const next = { ...follows };
        delete next[channelId];
        follows = next;
        emit();
        void persist();
    }
};
