/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import { OAuth2AuthorizeModal, openModal, showToast, Toasts, UserStore, zustandCreate, zustandPersist } from "@webpack/common";

import { ACCESS_TOKEN_URL, AUTHORIZE_URL, CLIENT_ID, SCOPES } from "./constants";

const logger = new Logger("AcordOnlineServices");

interface AuthorizationState {
    token: string | null;
    tokens: Record<string, string>;
    init: () => void;
    authorize: () => Promise<void>;
    setToken: (token: string) => void;
    remove: (id: string) => void;
    isAuthorized: () => boolean;
}

const indexedDBStorage = {
    async getItem(name: string): Promise<string | null> {
        return DataStore.get(name).then(v => v ?? null);
    },
    async setItem(name: string, value: string): Promise<void> {
        await DataStore.set(name, value);
    },
    async removeItem(name: string): Promise<void> {
        await DataStore.del(name);
    },
};

type ZustandStore<T> = {
    (): T;
    <U>(selector: (state: T) => U): U;
    getState: () => T;
    subscribe: (listener: (state: T) => void) => () => void;
};

export const useAuthorizationStore = proxyLazy(() => zustandCreate(
    zustandPersist(
        (set: any, get: any) => ({
            token: null,
            tokens: {},
            init: () => { set({ token: get().tokens[UserStore.getCurrentUser().id] ?? null }); },
            setToken: (token: string) => set({ token, tokens: { ...get().tokens, [UserStore.getCurrentUser().id]: token } }),
            remove: (id: string) => {
                const { tokens } = get();
                const newTokens = { ...tokens };
                delete newTokens[id];
                set({ tokens: newTokens });
                accessTokenCache.delete(id);
                get().init();
            },
            async authorize() {
                return new Promise<void>((resolve, reject) => openModal(props =>
                    <OAuth2AuthorizeModal
                        {...props}
                        scopes={SCOPES}
                        responseType="code"
                        redirectUri={AUTHORIZE_URL}
                        permissions={0n}
                        clientId={CLIENT_ID}
                        cancelCompletesFlow={false}
                        callback={async (response: any) => {
                            try {
                                const url = new URL(response.location);
                                url.searchParams.append("client", "acord");

                                const req = await fetch(url);
                                if (!req.ok) throw new Error("Request not OK");

                                get().setToken((await req.text()).trim());
                                resolve();
                            } catch (e) {
                                if (e instanceof Error) {
                                    showToast(`Failed to authorize: ${e.message}`, Toasts.Type.FAILURE);
                                    logger.error("Failed to authorize", e);
                                    reject(e);
                                }
                            }
                        }}
                    />, {
                    onCloseCallback() {
                        reject(new Error("Authorization cancelled"));
                    },
                }));
            },
            isAuthorized: () => !!get().token,
        } as AuthorizationState),
        {
            name: "acord-online-services-auth",
            storage: indexedDBStorage,
            partialize: (state: AuthorizationState) => ({ tokens: state.tokens }),
            onRehydrateStorage: () => (state?: AuthorizationState) => state?.init(),
        }
    )
)) as unknown as ZustandStore<AuthorizationState>;

// Short-lived Discord access tokens, keyed by the current user id. Never persisted.
const accessTokenCache = new Map<string, { token: string; expiresAt: number; }>();

// Shared so concurrent token requests open the OAuth modal only once.
let pendingAuthorize: Promise<void> | null = null;

function ensureAuthorized(): Promise<void> {
    if (useAuthorizationStore.getState().token) return Promise.resolve();
    pendingAuthorize ??= useAuthorizationStore.getState().authorize().finally(() => { pendingAuthorize = null; });
    return pendingAuthorize;
}

/**
 * Returns a currently-valid Discord access token (identify + guilds.join).
 * Triggers the OAuth flow automatically if we are not authorized yet. The backend
 * tracks the refresh token internally; we just ask it for a fresh token and cache
 * it until shortly before it expires.
 */
export async function getAccessToken(): Promise<string> {
    await ensureAuthorized();

    const userId = UserStore.getCurrentUser().id;
    const sessionToken = useAuthorizationStore.getState().token;
    if (!sessionToken) throw new Error("Not authorized with Acord online services");

    const cached = accessTokenCache.get(userId);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

    const res = await fetch(ACCESS_TOKEN_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${sessionToken}` },
    });

    if (res.status === 401) {
        // Backend rejected our session; the stored refresh token is dead.
        useAuthorizationStore.getState().remove(userId);
        throw new Error("Acord online services session expired");
    }
    if (!res.ok) throw new Error(`Failed to fetch access token (${res.status})`);

    const { access_token, expires_in } = await res.json() as { access_token: string; expires_in: number; };
    accessTokenCache.set(userId, { token: access_token, expiresAt: Date.now() + expires_in * 1000 });
    return access_token;
}

export function isAuthorized(): boolean {
    return useAuthorizationStore.getState().isAuthorized();
}

export function authorize(): Promise<void> {
    return useAuthorizationStore.getState().authorize();
}

export function logout(): void {
    useAuthorizationStore.getState().remove(UserStore.getCurrentUser().id);
}
