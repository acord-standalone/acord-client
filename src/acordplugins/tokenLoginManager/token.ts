/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { findByPropsLazy } from "@webpack";

const logger = new Logger("TokenLoginManager");

const TokenModule = findByPropsLazy("getToken", "setToken") as {
    getToken(): string | undefined;
    setToken?(token: string, ...rest: any[]): void;
};

/** Returns the token of the currently logged-in account, or undefined. */
export function getCurrentToken(): string | undefined {
    try {
        return TokenModule.getToken?.();
    } catch (e) {
        logger.error("failed to read current token", e);
        return undefined;
    }
}

/**
 * Logs into Discord with the given token by writing it into localStorage and
 * reloading. Discord deletes `localStorage.token` from the main window, so we
 * write it through a throwaway iframe whose localStorage shares the same origin.
 */
export function loginWithToken(token: string) {
    const trimmed = token.trim().replace(/^"|"$/g, "");
    if (!trimmed) return;

    try {
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        const win = iframe.contentWindow as Window & typeof globalThis;
        win.localStorage.setItem("token", `"${trimmed}"`);
        document.body.removeChild(iframe);
    } catch (e) {
        logger.error("failed to write token to localStorage", e);
        return;
    }

    window.location.reload();
}
