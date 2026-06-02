/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Discord OAuth2 application id for Acord's online services.
export const CLIENT_ID = "845650370063368233";

// Scopes the backend needs: identify resolves the user, guilds.join lets the
// backend auto-join you into its guild on connect (mandatory gate for the VI socket).
export const SCOPES = ["identify", "guilds.join"];

export let BASE_URL = "https://acord-api.armagan.rest";
export let AUTH_BASE = BASE_URL + "/auth";
export let AUTHORIZE_URL = AUTH_BASE + "/authorize";
export let ACCESS_TOKEN_URL = AUTH_BASE + "/access-token";

export function setBaseUrl(baseUrl: string) {
    BASE_URL = baseUrl.replace(/\/+$/, "");
    AUTH_BASE = BASE_URL + "/auth";
    AUTHORIZE_URL = AUTH_BASE + "/authorize";
    ACCESS_TOKEN_URL = AUTH_BASE + "/access-token";
}
