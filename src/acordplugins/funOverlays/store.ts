/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

import type { Overlay } from "./types";

const KEY = "FunOverlays_overlays_v1";
const logger = new Logger("FunOverlays");

type Listener = (overlays: Overlay[]) => void;

let overlays: Overlay[] = [];
let loaded = false;
const listeners = new Set<Listener>();

async function load() {
    try {
        const stored = await DataStore.get<Overlay[]>(KEY);
        overlays = Array.isArray(stored) ? stored : [];
    } catch (e) {
        logger.error("failed to load overlays", e);
        overlays = [];
    }
    loaded = true;
    emit();
}

function emit() {
    const snapshot = overlays;
    for (const l of listeners) {
        try { l(snapshot); } catch (e) { logger.error("listener threw", e); }
    }
}

async function persist() {
    try {
        await DataStore.set(KEY, overlays);
    } catch (e) {
        logger.error("failed to save overlays", e);
    }
}

export const OverlayStore = {
    init: load,
    isLoaded: () => loaded,
    getAll(): Overlay[] {
        return overlays;
    },
    get(id: string): Overlay | undefined {
        return overlays.find(o => o.id === id);
    },
    subscribe(l: Listener): () => void {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },
    add(o: Overlay) {
        overlays = [...overlays, o];
        emit();
        void persist();
    },
    update(id: string, patch: Partial<Overlay>) {
        let changed = false;
        overlays = overlays.map(o => {
            if (o.id !== id) return o;
            changed = true;
            return { ...o, ...patch };
        });
        if (changed) {
            emit();
            void persist();
        }
    },
    remove(id: string) {
        const next = overlays.filter(o => o.id !== id);
        if (next.length === overlays.length) return;
        overlays = next;
        emit();
        void persist();
    },
    replaceAll(next: Overlay[]) {
        overlays = next;
        emit();
        void persist();
    }
};

export function newId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultOverlay(url = ""): Overlay {
    return {
        id: newId(),
        name: "New overlay",
        url,
        enabled: true,
        locked: false,
        scope: { kind: "everywhere" },
        placement: { kind: "free", x: 200, y: 200 },
        width: 160,
        height: 160,
        opacity: 1,
        rotation: 0,
        keepAspect: true,
        clickThrough: true,
        zIndex: 1
    };
}
