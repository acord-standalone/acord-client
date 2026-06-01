/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useRouteContext } from "@acordplugins/_shared/useRouteContext";
import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot, React, useEffect, useState } from "@webpack/common";

import { OVERLAY_ROOT_ID } from "./anchor";
import { EditModeStore } from "./editMode";
import { OverlayItem } from "./OverlayItem";
import { matchScope } from "./routing";
import { OverlayStore } from "./store";
import type { Overlay } from "./types";

function useOverlays(): Overlay[] {
    const [list, setList] = useState<Overlay[]>(() => OverlayStore.getAll());
    useEffect(() => OverlayStore.subscribe(setList), []);
    return list;
}

function useEditMode(): boolean {
    const [on, setOn] = useState(() => EditModeStore.get());
    useEffect(() => EditModeStore.subscribe(setOn), []);
    return on;
}

function InnerLayer() {
    const ctx = useRouteContext();
    const list = useOverlays();
    const editMode = useEditMode();

    const visible = list.filter(o => o.enabled && matchScope(o.scope, ctx));
    console.log("[FunOverlays] render", { total: list.length, visible: visible.length, ctx, editMode });

    return (
        <>
            {visible.map(o => (
                <OverlayItem key={o.id} overlay={o} editMode={editMode} />
            ))}
        </>
    );
}

export function mountOverlayLayer() {
    if (document.getElementById(OVERLAY_ROOT_ID)) return;
    const host = document.createElement("div");
    host.id = OVERLAY_ROOT_ID;
    document.body.appendChild(host);
    try {
        const root = createRoot(host);
        root.render(
            <ErrorBoundary>
                <InnerLayer />
            </ErrorBoundary>
        );
        (host as any).__vcRoot = root;
        console.log("[FunOverlays] mounted layer, overlays:", OverlayStore.getAll().length);
    } catch (e) {
        console.error("[FunOverlays] failed to mount", e);
    }
}

export function unmountOverlayLayer() {
    const host = document.getElementById(OVERLAY_ROOT_ID);
    if (!host) return;
    const r = (host as any).__vcRoot;
    try { r?.unmount?.(); } catch { /* ignore */ }
    host.remove();
}
