/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

export interface SavedToken {
    id: string;
    name: string;
    token: string;
}

const KEY = "TokenLoginManager_tokens_v1";
const logger = new Logger("TokenLoginManager");

type Listener = (tokens: SavedToken[]) => void;

let tokens: SavedToken[] = [];
let loaded = false;
const listeners = new Set<Listener>();

async function load() {
    try {
        const stored = await DataStore.get<SavedToken[]>(KEY);
        tokens = Array.isArray(stored) ? stored : [];
    } catch (e) {
        logger.error("failed to load tokens", e);
        tokens = [];
    }
    loaded = true;
    emit();
}

function emit() {
    const snapshot = tokens;
    for (const l of listeners) {
        try { l(snapshot); } catch (e) { logger.error("listener threw", e); }
    }
}

async function persist() {
    try {
        await DataStore.set(KEY, tokens);
    } catch (e) {
        logger.error("failed to save tokens", e);
    }
}

export const TokenStore = {
    init: load,
    isLoaded: () => loaded,
    getAll(): SavedToken[] {
        return tokens;
    },
    subscribe(l: Listener): () => void {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },
    add(name: string, token: string) {
        tokens = [...tokens, { id: newId(), name: name.trim() || "Unnamed", token: token.trim() }];
        emit();
        void persist();
    },
    update(id: string, patch: Partial<Omit<SavedToken, "id">>) {
        let changed = false;
        tokens = tokens.map(t => {
            if (t.id !== id) return t;
            changed = true;
            return { ...t, ...patch };
        });
        if (changed) {
            emit();
            void persist();
        }
    },
    remove(id: string) {
        const next = tokens.filter(t => t.id !== id);
        if (next.length === tokens.length) return;
        tokens = next;
        emit();
        void persist();
    }
};

export function newId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
