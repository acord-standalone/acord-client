/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Voice Indicators — single-file client SDK.
 *
 * Drop-in WebSocket client for the VI backend. Handles the binary (MessagePack)
 * protocol, the auth handshake, heartbeats, auto-reconnect with backoff +
 * jitter, automatic resubscription, request/response queries, and fatal-error
 * termination. Designed to be copied into a browser plugin; its only dependency
 * is `@msgpack/msgpack` and a global `WebSocket`.
 *
 * Usage:
 *   const vi = new VoiceIndicatorsClient({ url, getAccessToken: () => token });
 *   vi.on("voiceDelta", d => ...);
 *   vi.on("revalidate", ({ channelId }) => vi.report(currentStateFor(channelId)));
 *   vi.on("fatal", ({ code }) => reauth());
 *   await vi.connect();
 *   const sessions = await vi.queryUser(userId);
 */

import { decode as mpDecode, encode as mpEncode } from "@msgpack/msgpack";

// ── Protocol constants (mirror of src/protocol/opcodes.ts) ───────────────────
const Op = {
    IDENTIFY: 0, READY: 1, HEARTBEAT: 2, HEARTBEAT_ACK: 3,
    VOICE_REPORT: 4, META_UPSERT: 5, SUBSCRIBE: 6, UNSUBSCRIBE: 7,
    VOICE_DELTA: 8, REVALIDATE: 9, QUERY: 10, QUERY_RESULT: 11, ERROR: 12,
} as const;

const FATAL_CODES = new Set(["AUTH_INVALID", "GUILD_JOIN_FAILED"]);

// ── Public types ─────────────────────────────────────────────────────────────
export interface VoiceState {
    userId: string;
    channelId: string | null;
    sessionId: string | null;
    mute: boolean; deaf: boolean; stream: boolean;
    selfMute: boolean; selfDeaf: boolean; selfVideo: boolean;
    selfStream?: boolean; suppress: boolean;
    oldChannelId?: string; guildId?: string;
}

export interface MetaUpsert {
    guild?: { id: string; name: string; icon?: string; vanityCode?: string; };
    channel?: { id: string; guildId?: string; name?: string; userLimit?: number; type: number; };
    user?: { id: string; username: string; displayName?: string; avatar?: string; };
    nick?: { guildId: string; userId: string; nick: string; };
}

export interface SubscribePayload {
    guilds?: string[]; channels?: string[]; users?: string[];
}

export interface VoiceDelta {
    type: "join" | "leave" | "move" | "update";
    sessionId: string; userId: string;
    channelId: string | null; guildId?: string; fromChannelId?: string;
    state?: Record<string, unknown>;
}

export interface ViError { code: string; message: string; fatal: boolean; reqId?: number; }

export interface ClientOptions {
    url: string;
    getAccessToken: () => string | Promise<string>;
    autoReconnect?: boolean;
    /** Base reconnect backoff in ms (default 500). */
    reconnectBaseMs?: number;
    /** Max reconnect backoff in ms (default 15000). */
    reconnectMaxMs?: number;
}

type EventMap = {
    open: void;
    ready: { userId: string; heartbeatIntervalMs: number; };
    voiceDelta: VoiceDelta;
    revalidate: { channelId: string; guildId?: string; userId?: string; };
    error: ViError;
    fatal: ViError;
    close: { code: number; reason: string; };
};

type Handler<T> = (payload: T) => void;

export class VoiceIndicatorsClient {
    private ws: WebSocket | null = null;
    private readonly opts: Required<Omit<ClientOptions, "getAccessToken">> & Pick<ClientOptions, "getAccessToken">;

    private listeners: { [K in keyof EventMap]?: Set<Handler<any>> } = {};

    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private attempts = 0;
    private terminated = false;
    private reqSeq = 0;
    private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; }>();

    /** Tracked subscriptions, replayed on every (re)connect. */
    private subs = { guilds: new Set<string>(), channels: new Set<string>(), users: new Set<string>() };

    userId: string | null = null;

    constructor(options: ClientOptions) {
        this.opts = {
            autoReconnect: true,
            reconnectBaseMs: 500,
            reconnectMaxMs: 15_000,
            ...options,
        };
    }

    // ── Event emitter ───────────────────────────────────────────────────────────
    on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): this {
        (this.listeners[event] ??= new Set()).add(handler);
        return this;
    }
    off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): this {
        this.listeners[event]?.delete(handler);
        return this;
    }
    private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
        this.listeners[event]?.forEach(h => {
            try { h(payload); } catch (e) { console.error("[vi] listener error", e); }
        });
    }

    // ── Connection lifecycle ─────────────────────────────────────────────────────
    connect(): Promise<void> {
        this.terminated = false;
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.opts.url);
            ws.binaryType = "arraybuffer";
            this.ws = ws;
            let settled = false;

            ws.onopen = async () => {
                this.emit("open", undefined);
                try {
                    const accessToken = await this.opts.getAccessToken();
                    this.sendFrame(Op.IDENTIFY, { accessToken });
                } catch (e) {
                    reject(e as Error);
                }
            };

            ws.onmessage = ev => {
                const settledReady = this.handleMessage(ev.data as ArrayBuffer);
                if (settledReady && !settled) { settled = true; resolve(); }
            };

            ws.onerror = () => {
                if (!settled) { settled = true; reject(new Error("websocket error")); }
            };

            ws.onclose = ev => {
                this.cleanupSocket();
                this.emit("close", { code: ev.code, reason: ev.reason });
                this.rejectAllPending(new Error("connection closed"));
                if (!this.terminated && this.opts.autoReconnect) this.scheduleReconnect();
            };
        });
    }

    /** Permanently close; cancels reconnection. */
    close(): void {
        this.terminated = true;
        this.cancelReconnect();
        this.ws?.close();
        this.cleanupSocket();
    }

    private cleanupSocket(): void {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    private scheduleReconnect(): void {
        this.cancelReconnect();
        const base = Math.min(this.opts.reconnectMaxMs, this.opts.reconnectBaseMs * 2 ** this.attempts);
        const delay = base / 2 + Math.random() * (base / 2); // full-ish jitter
        this.attempts++;
        this.reconnectTimer = setTimeout(() => { void this.connect().catch(() => { }); }, delay);
    }
    private cancelReconnect(): void {
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    }

    // ── Message handling ─────────────────────────────────────────────────────────
    /** Returns true once READY is received (used to resolve connect()). */
    private handleMessage(data: ArrayBuffer): boolean {
        let frame: [number, unknown];
        try {
            const decoded = mpDecode(new Uint8Array(data)) as [number, unknown];
            frame = decoded;
        } catch { return false; }
        const [op, payload] = frame;

        switch (op) {
            case Op.READY: {
                const p = payload as { userId: string; heartbeatIntervalMs: number; };
                this.userId = p.userId;
                this.attempts = 0;
                this.startHeartbeat(p.heartbeatIntervalMs);
                this.replaySubscriptions();
                this.emit("ready", p);
                return true;
            }
            case Op.HEARTBEAT_ACK:
                return false;
            case Op.VOICE_DELTA:
                this.emit("voiceDelta", payload as VoiceDelta);
                return false;
            case Op.REVALIDATE:
                this.emit("revalidate", payload as { channelId: string; guildId?: string; userId?: string; });
                return false;
            case Op.QUERY_RESULT: {
                const { reqId, data: result } = payload as { reqId: number; data: unknown; };
                this.pending.get(reqId)?.resolve(result);
                this.pending.delete(reqId);
                return false;
            }
            case Op.ERROR: {
                const err = payload as ViError;
                err.fatal = err.fatal ?? FATAL_CODES.has(err.code);
                if (err.reqId !== undefined) {
                    this.pending.get(err.reqId)?.reject(new Error(`${err.code}: ${err.message}`));
                    this.pending.delete(err.reqId);
                }
                this.emit("error", err);
                if (err.fatal) {
                    // Terminal: do not reconnect — the same token would fail identically.
                    this.terminated = true;
                    this.cancelReconnect();
                    this.rejectAllPending(new Error(`fatal: ${err.code}`));
                    this.emit("fatal", err);
                    this.ws?.close();
                }
                return false;
            }
            default:
                return false;
        }
    }

    private startHeartbeat(intervalMs: number): void {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendFrame(Op.HEARTBEAT, {}), intervalMs);
    }

    // ── Outbound API ─────────────────────────────────────────────────────────────
    report(state: VoiceState, meta?: MetaUpsert): void {
        this.sendFrame(Op.VOICE_REPORT, meta ? { ...state, meta } : state);
    }

    upsertMeta(meta: MetaUpsert): void {
        this.sendFrame(Op.META_UPSERT, meta);
    }

    subscribe(payload: SubscribePayload): void {
        payload.guilds?.forEach(g => this.subs.guilds.add(g));
        payload.channels?.forEach(c => this.subs.channels.add(c));
        payload.users?.forEach(u => this.subs.users.add(u));
        this.sendFrame(Op.SUBSCRIBE, payload);
    }

    unsubscribe(payload: SubscribePayload): void {
        payload.guilds?.forEach(g => this.subs.guilds.delete(g));
        payload.channels?.forEach(c => this.subs.channels.delete(c));
        payload.users?.forEach(u => this.subs.users.delete(u));
        this.sendFrame(Op.UNSUBSCRIBE, payload);
    }

    private replaySubscriptions(): void {
        const payload: SubscribePayload = {
            guilds: [...this.subs.guilds],
            channels: [...this.subs.channels],
            users: [...this.subs.users],
        };
        if (payload.guilds!.length || payload.channels!.length || payload.users!.length) {
            this.sendFrame(Op.SUBSCRIBE, payload);
        }
    }

    // ── Queries (request/response) ───────────────────────────────────────────────
    private query<T>(kind: string, args: Record<string, unknown>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error("not connected"));
            }
            const reqId = ++this.reqSeq;
            this.pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject });
            this.sendFrame(Op.QUERY, { reqId, kind, args });
        });
    }

    queryUser(userId: string) { return this.query("user", { userId }); }
    queryUsers(userIds: string[]) { return this.query("usersBulk", { userIds }); }
    queryChannel(channelId: string) { return this.query("channel", { channelId }); }
    queryGuild(guildId: string) { return this.query("guild", { guildId }); }
    queryUserLog(userId: string) { return this.query("userLog", { userId }); }
    queryChannelLog(channelId: string) { return this.query("channelLog", { channelId }); }

    // ── Internals ────────────────────────────────────────────────────────────────
    private sendFrame(op: number, payload: unknown): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(mpEncode([op, payload]));
        }
    }

    private rejectAllPending(err: Error): void {
        for (const { reject } of this.pending.values()) reject(err);
        this.pending.clear();
    }
}

export default VoiceIndicatorsClient;
