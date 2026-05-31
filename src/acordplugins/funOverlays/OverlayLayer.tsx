/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot, React, SelectedChannelStore, SelectedGuildStore, useEffect, useState, useStateFromStores } from "@webpack/common";

import { OVERLAY_ROOT_ID } from "./anchor";
import { EditModeStore } from "./editMode";
import { OverlayItem } from "./OverlayItem";
import { matchScope } from "./routing";
import { OverlayStore } from "./store";
import type { Overlay, RouteContext } from "./types";

function useRouteContext(): RouteContext {
    const guildId = useStateFromStores([SelectedGuildStore], () => SelectedGuildStore.getGuildId() || null);
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId() || null);
    const [pathname, setPathname] = useState(() => location.pathname);

    useEffect(() => {
        const update = () => setPathname(location.pathname);
        window.addEventListener("popstate", update);
        const origPush = history.pushState;
        const origReplace = history.replaceState;
        history.pushState = function (this: History, ...args: any[]) {
            const r = origPush.apply(this, args as any);
            update();
            return r;
        } as any;
        history.replaceState = function (this: History, ...args: any[]) {
            const r = origReplace.apply(this, args as any);
            update();
            return r;
        } as any;
        return () => {
            window.removeEventListener("popstate", update);
            history.pushState = origPush;
            history.replaceState = origReplace;
        };
    }, []);

    return { guildId, channelId, pathname };
}

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
