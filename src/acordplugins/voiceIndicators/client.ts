/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getAccessToken, isAuthorized } from "@acordplugins/_api/acordOnlineServices";
import { proxyLazy } from "@utils/lazy";
import { Logger } from "@utils/Logger";
import type { VoiceState as DiscordVoiceState } from "@vencord/discord-types";
import { ChannelStore, GuildMemberStore, GuildStore, showToast, Toasts, UserStore, VoiceStateStore, zustandCreate } from "@webpack/common";
import { debounce } from "lodash";

import { BATCH_INTERVAL_MS, WS_URL } from "./constants";
import { type MetaUpsert, VoiceIndicatorsClient, type VoiceState as ReportVoiceState } from "./sdk/VoiceIndicatorsClient";
import type { ChannelLogEntry, ChannelQueryResult, HydratedSession, UserChannelLogEntry } from "./types";

const logger = new Logger("VoiceIndicators");

const vi = new VoiceIndicatorsClient({ url: WS_URL, getAccessToken });

// ── Reactive session store ───────────────────────────────────────────────────
interface VoiceStoreState {
    sessions: Record<string, HydratedSession[]>;
    setMany: (map: Record<string, HydratedSession[]>) => void;
    clear: () => void;
}

export const useVoiceStore = proxyLazy(() => zustandCreate((set: any, get: any) => ({
    sessions: {},
    setMany: (map: Record<string, HydratedSession[]>) => set({ sessions: { ...get().sessions, ...map } }),
    clear: () => set({ sessions: {} }),
} as VoiceStoreState))) as unknown as {
    <U>(selector: (state: VoiceStoreState) => U): U;
    getState: () => VoiceStoreState;
};

// ── Connection lifecycle ─────────────────────────────────────────────────────
let started = false;
let connecting: Promise<void> | null = null;

async function ensureConnected(): Promise<void> {
    if (started) return;
    if (connecting) return connecting;

    connecting = vi.connect().then(
        () => { started = true; },
        e => { connecting = null; throw e; }
    ).finally(() => { connecting = null; });
    return connecting;
}

// ── Subscriptions (ref-counted) ──────────────────────────────────────────────
const userRefCounts = new Map<string, number>();
const channelListeners = new Map<string, Set<() => void>>();

export function subscribeUser(userId: string): void {
    const next = (userRefCounts.get(userId) ?? 0) + 1;
    userRefCounts.set(userId, next);
    if (next === 1) vi.subscribe({ users: [userId] });
    void ensureConnected().catch(() => { });
}

export function unsubscribeUser(userId: string): void {
    const next = (userRefCounts.get(userId) ?? 0) - 1;
    if (next <= 0) {
        userRefCounts.delete(userId);
        vi.unsubscribe({ users: [userId] });
    } else {
        userRefCounts.set(userId, next);
    }
}

export function subscribeChannel(channelId: string, onChange: () => void): () => void {
    let set = channelListeners.get(channelId);
    if (!set) {
        set = new Set();
        channelListeners.set(channelId, set);
        vi.subscribe({ channels: [channelId] });
    }
    set.add(onChange);
    void ensureConnected().catch(() => { });

    return () => {
        const current = channelListeners.get(channelId);
        if (!current) return;
        current.delete(onChange);
        if (current.size === 0) {
            channelListeners.delete(channelId);
            vi.unsubscribe({ channels: [channelId] });
        }
    };
}

// ── Batched bulk user queries ────────────────────────────────────────────────
const pendingUsers = new Set<string>();

const flushUsers = debounce(() => {
    const ids = [...pendingUsers];
    pendingUsers.clear();
    if (ids.length === 0) return;

    ensureConnected()
        .then(async () => {
            const result = await vi.queryUsers(ids) as Record<string, HydratedSession[]>;
            const map: Record<string, HydratedSession[]> = {};
            const missingChannels = new Set<string>();
            for (const id of ids) {
                map[id] = result[id] ?? [];
                // Backend knows nothing about them but we might: contribute their whole channel.
                if (map[id].length === 0) {
                    const cid = VoiceStateStore.getVoiceStateForUser(id)?.channelId;
                    if (cid) missingChannels.add(cid);
                }
            }
            useVoiceStore.getState().setMany(map);
            missingChannels.forEach(reportChannel);
        })
        .catch(e => { if (isAuthorized()) logger.error("Bulk user query failed", e); });
}, BATCH_INTERVAL_MS);

export function requestUserSessions(userId: string): void {
    pendingUsers.add(userId);
    flushUsers();
}

// ── Direct queries (for the modal) ───────────────────────────────────────────
export async function queryUserSessions(userId: string): Promise<HydratedSession[]> {
    await ensureConnected();
    return await vi.queryUser(userId) as HydratedSession[];
}

export async function queryChannelMembers(channelId: string): Promise<ChannelQueryResult> {
    await ensureConnected();
    const result = await vi.queryChannel(channelId) as ChannelQueryResult;
    // Backend has no members but we might know them locally: contribute it.
    if (!result.members?.length) reportChannel(channelId);
    return result;
}

export async function queryUserLog(userId: string): Promise<UserChannelLogEntry[]> {
    await ensureConnected();
    return await vi.queryUserLog(userId) as UserChannelLogEntry[];
}

export async function queryChannelLog(channelId: string): Promise<ChannelLogEntry[]> {
    await ensureConnected();
    return await vi.queryChannelLog(channelId) as ChannelLogEntry[];
}

// ── Crowd-sourced reporting ──────────────────────────────────────────────────
function toReport(vs: DiscordVoiceState): ReportVoiceState {
    return {
        userId: vs.userId,
        channelId: vs.channelId ?? null,
        sessionId: vs.sessionId ?? null,
        mute: vs.mute,
        deaf: vs.deaf,
        stream: vs.stream,
        selfMute: vs.selfMute,
        selfDeaf: vs.selfDeaf,
        selfVideo: vs.selfVideo,
        selfStream: vs.selfStream,
        suppress: vs.suppress,
        guildId: vs.guildId,
    };
}

function buildMeta(vs: DiscordVoiceState): MetaUpsert {
    const meta: MetaUpsert = {};

    const user = UserStore.getUser(vs.userId);
    if (user) meta.user = { id: user.id, username: user.username, displayName: user.globalName ?? undefined, avatar: user.avatar ?? undefined };

    if (vs.channelId) {
        const channel = ChannelStore.getChannel(vs.channelId);
        if (channel) meta.channel = { id: channel.id, guildId: channel.guild_id ?? undefined, name: channel.name, userLimit: channel.userLimit, type: channel.type };
    }

    if (vs.guildId) {
        const guild = GuildStore.getGuild(vs.guildId);
        if (guild) meta.guild = { id: guild.id, name: guild.name, icon: guild.icon ?? undefined, vanityCode: guild.vanityURLCode ?? undefined };

        const nick = GuildMemberStore.getNick(vs.guildId, vs.userId);
        if (nick) meta.nick = { guildId: vs.guildId, userId: vs.userId, nick };
    }

    return meta;
}

/** Push every voice state this client currently knows about to the backend. */
function reportAllVoiceStates(): void {
    for (const byUser of Object.values(VoiceStateStore.getAllVoiceStates())) {
        for (const vs of Object.values(byUser)) {
            if (!vs.channelId) continue;
            vi.report(toReport(vs), buildMeta(vs));
        }
    }
}

function reportChannel(channelId: string): void {
    for (const vs of Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId))) {
        vi.report(toReport(vs), buildMeta(vs));
    }
}

/** Backfill guild metadata from our local store when the backend hasn't got it yet. */
export function reportGuildMeta(guildId: string): void {
    const guild = GuildStore.getGuild(guildId);
    if (guild) vi.upsertMeta({ guild: { id: guild.id, name: guild.name, icon: guild.icon ?? undefined, vanityCode: guild.vanityURLCode ?? undefined } });
}

/** Forward live VOICE_STATE_UPDATES to the backend (joins, leaves, moves, mutes). */
export function reportVoiceStates(voiceStates: DiscordVoiceState[]): void {
    if (!started) return;
    for (const vs of voiceStates) vi.report(toReport(vs), buildMeta(vs));
}

let reportTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Report all known voice states shortly after Discord finishes loading them.
 * Called on READY_SUPPLEMENTAL, with a small delay so the stores settle first.
 */
export function reportKnownVoiceStatesSoon(): void {
    if (reportTimer) clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
        reportTimer = null;
        ensureConnected().then(reportAllVoiceStates, () => { });
    }, 100);
}

// ── Event wiring ─────────────────────────────────────────────────────────────
vi.on("voiceDelta", d => {
    if (userRefCounts.has(d.userId)) requestUserSessions(d.userId);

    for (const cid of [d.channelId, d.fromChannelId]) {
        if (cid == null) continue;
        channelListeners.get(cid)?.forEach(cb => cb());
    }
});

vi.on("ready", () => {
    // Crowd-source: push every voice state we currently know about.
    reportAllVoiceStates();
    // Refresh everything we're tracking after a (re)connect.
    for (const id of userRefCounts.keys()) requestUserSessions(id);
});

vi.on("revalidate", ({ channelId }) => reportChannel(channelId));

vi.on("fatal", ({ code, message }) => {
    started = false;
    logger.error(`Connection terminated: ${code} ${message}`);
    if (code === "AUTH_INVALID" || code === "GUILD_JOIN_FAILED") {
        showToast("Voice Indicators session expired. Re-authorize from the plugin settings.", Toasts.Type.FAILURE);
    }
});

export function stopClient(): void {
    started = false;
    connecting = null;
    if (reportTimer) { clearTimeout(reportTimer); reportTimer = null; }
    pendingUsers.clear();
    userRefCounts.clear();
    channelListeners.clear();
    vi.close();
    useVoiceStore.getState().clear();
}
