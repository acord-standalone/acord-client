/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore, SelectedGuildStore, useEffect, useState, useStateFromStores } from "@webpack/common";

export interface RouteContext {
    guildId: string | null;
    channelId: string | null;
    pathname: string;
}

/**
 * Tracks the currently viewed location: selected guild, selected channel and the
 * raw pathname. Re-renders on guild/channel switches and on history navigation.
 */
export function useRouteContext(): RouteContext {
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
