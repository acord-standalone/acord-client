/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { AcordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { User, VoiceState } from "@vencord/discord-types";
import { ChannelStore, Checkbox, GuildStore, Menu, Modal, openModal, React, SearchableSelect, showToast, Toasts, useEffect, UserStore, useState } from "@webpack/common";

type NotifType = "1" | "2" | "3";
type LogType = "status" | "platform" | "activity" | "stream" | "listen" | "voice" | "text";
interface TypeSetting { enabled: boolean; notification: NotifType; }
type UserSettings = Partial<Record<LogType, TypeSetting>>;
interface LogEntry { action: LogType; content: string; at: number; color: number; }

const LOG_TYPES: LogType[] = ["status", "platform", "activity", "stream", "listen", "voice", "text"];
const TYPE_LABELS: Record<LogType, string> = {
    status: "Status", platform: "Platform", activity: "Activities",
    stream: "Streaming", listen: "Listening", voice: "Voice Channel", text: "Text Messages",
};
const NOTIF_OPTIONS = [
    { label: "In-app toast", value: "1" },
    { label: "Desktop notification", value: "2" },
    { label: "Log only", value: "3" },
];
const DEFAULT_TS: TypeSetting = { enabled: false, notification: "1" };
const SETTINGS_KEY = "FriendNotifications_settings";
const logKey = (id: string) => `FriendNotifications_logs_${id}`;

let settingsCache: Record<string, UserSettings> = {};
let statusCache: Record<string, string | undefined> = {};
let platformCache: Record<string, string | undefined> = {};
let activityCache: Record<string, Record<string, [number, string, string]> | undefined> = {};

function ts(userId: string, type: LogType): TypeSetting {
    return settingsCache[userId]?.[type] ?? DEFAULT_TS;
}

async function saveSettings(userId: string, settings: UserSettings): Promise<void> {
    const all = await DataStore.get<Record<string, UserSettings>>(SETTINGS_KEY) ?? {};
    all[userId] = settings;
    await DataStore.set(SETTINGS_KEY, all);
    settingsCache[userId] = settings;
}

async function appendLog(userId: string, action: LogType, content: string, color: number): Promise<void> {
    let logs = await DataStore.get<LogEntry[]>(logKey(userId)) ?? [];
    logs.push({ action, content, at: Date.now(), color });
    if (logs.length > 100) logs = logs.slice(-100);
    await DataStore.set(logKey(userId), logs);
}

function notify(userId: string, action: LogType, content: string): void {
    const type = ts(userId, action).notification;
    if (type === "1") {
        showToast(content, Toasts.Type.MESSAGE);
    } else if (type === "2") {
        const user = UserStore.getUser(userId);
        new Notification("Friend Notifications", {
            body: content,
            icon: user?.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png?size=128` : undefined,
        });
    }
}

function uname(userId: string): string {
    const u = UserStore.getUser(userId);
    return u?.globalName ?? u?.username ?? userId;
}

const STATUS_LABELS: Record<string, string> = {
    online: "Online", idle: "Idle", dnd: "Do Not Disturb", offline: "Offline", invisible: "Invisible",
};
const ACTIVITY_VERBS: Partial<Record<number, [string, string]>> = {
    0: ["started playing", "stopped playing"],
    1: ["started streaming", "stopped streaming"],
    2: ["started listening to", "stopped listening to"],
    3: ["started watching", "stopped watching"],
    4: ["set status to", "removed custom status"],
    5: ["started competing in", "stopped competing in"],
};

function activityLogType(type: number): LogType {
    return type === 1 ? "stream" : type === 2 ? "listen" : "activity";
}

// === Config Modal ===

function ConfigModal({ userId, onClose, transitionState }: { userId: string; onClose(): void; transitionState: number; }) {
    const user = UserStore.getUser(userId);
    const [settings, setSettings] = useState<UserSettings>(settingsCache[userId] ?? {});

    function update<K extends keyof TypeSetting>(type: LogType, field: K, value: TypeSetting[K]) {
        setSettings(prev => {
            const next: UserSettings = { ...prev, [type]: { ...(prev[type] ?? DEFAULT_TS), [field]: value } };
            void saveSettings(userId, next);
            return next;
        });
    }

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title={`Notifications — ${user?.globalName ?? user?.username ?? userId}`}
            actions={[{ text: "Close", variant: "secondary", onClick: onClose }]}
        >
            <div style={{ padding: "4px 0 12px" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "32px 1fr 170px",
                    gap: "8px",
                    padding: "0 4px 8px 4px",
                    borderBottom: "1px solid var(--background-modifier-accent)",
                    marginBottom: "6px",
                }}>
                    <div />
                    <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Event</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Notify via</span>
                </div>
                {LOG_TYPES.map(type => {
                    const s = settings[type] ?? DEFAULT_TS;
                    return (
                        <div key={type} style={{
                            display: "grid",
                            gridTemplateColumns: "32px 1fr 170px",
                            alignItems: "center",
                            gap: "8px",
                            padding: "5px 4px",
                            borderRadius: "4px",
                            background: s.enabled ? "var(--background-modifier-hover)" : "transparent",
                            transition: "background 0.15s",
                        }}>
                            <Checkbox value={s.enabled} onChange={(_e, v) => update(type, "enabled", v)} />
                            <span style={{
                                color: s.enabled ? "var(--text-normal)" : "var(--text-muted)",
                                fontSize: "14px",
                                transition: "color 0.15s",
                                userSelect: "none",
                            }}>
                                {TYPE_LABELS[type]}
                            </span>
                            <SearchableSelect
                                options={NOTIF_OPTIONS}
                                value={s.notification}
                                onChange={(v: string) => update(type, "notification", v as NotifType)}
                                isDisabled={!s.enabled}
                            />
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

// === Log Modal ===

function LogModal({ userId, onClose, transitionState }: { userId: string; onClose(): void; transitionState: number; }) {
    const user = UserStore.getUser(userId);
    const [logs, setLogs] = useState<LogEntry[] | null>(null);

    useEffect(() => {
        DataStore.get<LogEntry[]>(logKey(userId)).then(l => setLogs(l ? [...l].reverse() : []));
    }, [userId]);

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title={`Logs — ${user?.globalName ?? user?.username ?? userId}`}
            actions={[{ text: "Close", variant: "secondary", onClick: onClose }]}
        >
            <div style={{ maxHeight: "420px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", padding: "4px 0 8px" }}>
                {logs === null && <span style={{ color: "var(--text-muted)", textAlign: "center" }}>Loading...</span>}
                {logs?.length === 0 && <span style={{ color: "var(--text-muted)", textAlign: "center" }}>No logs yet.</span>}
                {logs?.map((log, i) => (
                    <div key={i} style={{ borderLeft: `3px solid #${log.color.toString(16).padStart(6, "0")}`, paddingLeft: "8px" }}>
                        <div style={{ color: "var(--text-normal)", fontSize: "13px" }}>{log.content}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>{new Date(log.at).toLocaleString()}</div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

// === Context Menu ===

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user: User; }) => {
    if (!user || user.id === UserStore.getCurrentUser()?.id) return;
    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="fn-settings"
            label="Friend Notifications"
            action={() => openModal(p => <ConfigModal userId={user.id} {...p} />)}
        />,
        <Menu.MenuItem
            id="fn-logs"
            label="View Notification Logs"
            action={() => openModal(p => <LogModal userId={user.id} {...p} />)}
        />
    );
};

// === Plugin ===

type PresenceUpdate = {
    user: { id: string; };
    activities: Array<{ id?: string; name: string; type: number; details?: string; state?: string; }>;
    clientStatus: Record<string, unknown>;
    status: string;
};

export default definePlugin({
    name: "FriendNotifications",
    description: "Get notified when friends change their status, activity, voice channel, or send messages. Configure per user via right-click.",
    authors: [AcordDevs.TheArmagan],
    async start() {
        settingsCache = await DataStore.get<Record<string, UserSettings>>(SETTINGS_KEY) ?? {};
    },
    stop() {
        settingsCache = {};
        statusCache = {};
        platformCache = {};
        activityCache = {};
    },
    flux: {
        PRESENCE_UPDATES({ updates }: { updates: PresenceUpdate[]; }) {
            for (const { user: { id: userId }, activities, clientStatus, status } of updates) {
                if (!settingsCache[userId]) continue;
                const name = uname(userId);

                // Activities
                const newMap: Record<string, [number, string, string]> = {};
                for (const a of activities ?? []) {
                    const key = a.id ?? a.name;
                    const stateText = `${a.name} ${a.details ?? a.state ?? ""}`.trim();
                    newMap[key] = [a.type, stateText, a.name];
                }

                const prevMap = activityCache[userId];
                activityCache[userId] = newMap;

                if (prevMap !== undefined) {
                    for (const [key, [aType, stateText, aName]] of Object.entries(newMap)) {
                        const logType = activityLogType(aType);
                        if (!ts(userId, logType).enabled) continue;
                        const [startMsg] = ACTIVITY_VERBS[aType] ?? ["started", "stopped"];
                        if (!prevMap[key]) {
                            const content = `${name} ${startMsg} ${stateText}`;
                            void appendLog(userId, logType, content, 0x43f581);
                            notify(userId, logType, content);
                        } else if (prevMap[key][2] !== aName) {
                            const content = `${name} ${startMsg} ${stateText}`;
                            void appendLog(userId, logType, content, 0x53c591);
                            notify(userId, logType, content);
                        }
                    }
                    for (const [key, [oldType, oldState]] of Object.entries(prevMap)) {
                        if (newMap[key]) continue;
                        const logType = activityLogType(oldType);
                        if (!ts(userId, logType).enabled) continue;
                        const [, stopMsg] = ACTIVITY_VERBS[oldType] ?? ["started", "stopped"];
                        const content = `${name} ${stopMsg} ${oldState}`;
                        void appendLog(userId, logType, content, 0xf55151);
                        notify(userId, logType, content);
                    }
                }

                // Platform
                const newPlatform = Object.keys(clientStatus ?? {}).sort().join(", ");
                const prevPlatform = platformCache[userId];
                platformCache[userId] = newPlatform;
                if (prevPlatform !== undefined && prevPlatform !== newPlatform && newPlatform && ts(userId, "platform").enabled) {
                    const content = `${name} is on ${newPlatform}`;
                    void appendLog(userId, "platform", content, 0x5865f2);
                    notify(userId, "platform", content);
                }

                // Status
                const prevStatus = statusCache[userId];
                statusCache[userId] = status;
                if (prevStatus !== undefined && prevStatus !== status && ts(userId, "status").enabled) {
                    const content = `${name} is now ${STATUS_LABELS[status] ?? status}`;
                    void appendLog(userId, "status", content, 0x9b51f5);
                    notify(userId, "status", content);
                }
            }
        },

        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: Array<VoiceState & { oldChannelId?: string; guildId?: string; }>; }) {
            for (const state of voiceStates) {
                if (!state.guildId || state.oldChannelId === state.channelId) continue;
                if (!settingsCache[state.userId] || !ts(state.userId, "voice").enabled) continue;

                const name = uname(state.userId);
                const gn = GuildStore.getGuild(state.guildId)?.name ?? state.guildId;
                const newCh = state.channelId ? `${gn} > ${ChannelStore.getChannel(state.channelId)?.name ?? state.channelId}` : null;
                const oldCh = state.oldChannelId ? `${gn} > ${ChannelStore.getChannel(state.oldChannelId)?.name ?? state.oldChannelId}` : null;

                let content: string;
                let color: number;
                if (state.channelId && !state.oldChannelId) { content = `${name} joined ${newCh}`; color = 0x33ff31; }
                else if (!state.channelId) { content = `${name} left ${oldCh}`; color = 0xff3333; }
                else { content = `${name} moved from ${oldCh} to ${newCh}`; color = 0x33ffc1; }

                void appendLog(state.userId, "voice", content, color);
                notify(state.userId, "voice", content);
            }
        },

        MESSAGE_CREATE({ message }: { message: { author: { id: string; }; channel_id: string; guild_id?: string; }; }) {
            const { id: userId } = message.author;
            if (!message.guild_id || !settingsCache[userId] || !ts(userId, "text").enabled) return;
            const user = UserStore.getUser(userId);
            const channel = ChannelStore.getChannel(message.channel_id);
            if (!user || !channel) return;
            const chName = `${GuildStore.getGuild(message.guild_id)?.name ?? "Unknown"} > ${channel.name}`;
            const content = `${uname(userId)} sent a message in ${chName}`;
            void appendLog(userId, "text", content, 0x6aff99);
            notify(userId, "text", content);
        },
    },
    contextMenus: {
        "user-context": UserContextMenuPatch,
    }
});
