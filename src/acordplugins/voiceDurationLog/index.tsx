/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { DataStore } from "@api/index";
import { Button } from "@components/Button";
import { AcordDevs } from "@utils/constants";
import { useFixedTimer } from "@utils/react";
import { formatDurationMs } from "@utils/text";
import definePlugin from "@utils/types";
import type { Guild, VoiceState } from "@vencord/discord-types";
import { ChannelActions, ChannelStore, GuildChannelStore, Menu, Modal, openModal, React, Tooltip, useEffect, UserStore, useState, VoiceStateStore } from "@webpack/common";

type ChannelStats = { totalMs: number; lastJoined: number; };
type GuildData = Record<string, ChannelStats>;
type Session = { guildId: string; channelId: string; joinedAt: number; };

const dsKey = (guildId: string) => `VoiceDurationLog_${guildId}`;

let currentSession: Session | null = null;

async function flush(guildId: string, channelId: string, joinedAt: number) {
    const elapsed = Date.now() - joinedAt;
    if (elapsed < 500) return;
    const data: GuildData = (await DataStore.get<GuildData>(dsKey(guildId))) ?? {};
    const prev = data[channelId] ?? { totalMs: 0, lastJoined: joinedAt };
    data[channelId] = { totalMs: prev.totalMs + elapsed, lastJoined: joinedAt };
    await DataStore.set(dsKey(guildId), data);
}

function LiveDelta({ joinedAt }: { joinedAt: number; }) {
    const ms = useFixedTimer({ initialTime: joinedAt });
    return <span style={{ color: "var(--status-positive)" }}> +{formatDurationMs(ms, true, true)}</span>;
}

function ChannelRow({ channel, stats, session }: { channel: any; stats: ChannelStats | undefined; session: Session | null; }) {
    const isActive = session?.channelId === channel.id;
    if (!stats && !isActive) return null;

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 4px", gap: "8px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--header-primary)" }}>
                    🔊 {channel.name}
                </span>
                {stats && (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Last joined: {new Date(stats.lastJoined).toLocaleString()}
                    </span>
                )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <span style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--header-secondary)" }}>
                    {formatDurationMs((stats?.totalMs ?? 0), true, true)}
                    {isActive && <LiveDelta joinedAt={session!.joinedAt} />}
                </span>
                <Tooltip text="Join channel">
                    {({ onMouseEnter, onMouseLeave }) => (
                        <Button variant="link" size="min" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onClick={() => ChannelActions.selectVoiceChannel(channel.id)}>▶</Button>
                    )}
                </Tooltip>
            </div>
        </div>
    );
}

function VoiceDurationModal({ guild, ...modalProps }: { guild: Guild; transitionState: number; onClose(): void; }) {
    const [data, setData] = useState<GuildData>({});
    const session = currentSession?.guildId === guild.id ? currentSession : null;
    const tick = useFixedTimer({ initialTime: session?.joinedAt ?? Date.now() });

    useEffect(() => {
        DataStore.get<GuildData>(dsKey(guild.id)).then(d => setData(d ?? {}));
        const id = setInterval(() => {
            DataStore.get<GuildData>(dsKey(guild.id)).then(d => setData(d ?? {}));
        }, 5000);
        return () => clearInterval(id);
    }, [guild.id]);

    const guildChannels = GuildChannelStore.getChannels(guild.id);
    const vocalChannels: any[] = guildChannels.VOCAL?.map(({ channel }: any) => channel) ?? [];
    const categories: any[] = (guildChannels as any)[4]?.map(({ channel }: any) => channel) ?? [];

    const sortChannels = (chs: any[]) =>
        [...chs].sort((a, b) => {
            const aMs = (data[a.id]?.totalMs ?? 0) + (session?.channelId === a.id ? sessionMs : 0);
            const bMs = (data[b.id]?.totalMs ?? 0) + (session?.channelId === b.id ? sessionMs : 0);
            if (aMs !== bMs) return bMs - aMs;
            return (a.position_ ?? 0) - (b.position_ ?? 0);
        });

    const grouped = new Map<string | null, any[]>();
    for (const ch of vocalChannels) {
        const key = ch.parent_id || null;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(ch);
    }

    const sortedCats = [...categories].sort((a, b) => (a.position_ ?? 0) - (b.position_ ?? 0));
    const uncategorized = grouped.get(null) ?? [];
    const hasAny = Object.keys(data).length > 0 || session;

    const sessionMs = session ? tick : 0;
    const totalMs = Object.values(data).reduce((s, v) => s + v.totalMs, 0) + sessionMs;

    const catTotalMs = (chs: any[]) =>
        chs.reduce((s, ch) => {
            const base = data[ch.id]?.totalMs ?? 0;
            const live = session?.channelId === ch.id ? sessionMs : 0;
            return s + base + live;
        }, 0);

    return (
        <Modal {...modalProps} title={`Voice Duration — ${guild.name}`} size="md">
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "4px 0 8px" }}>
                {hasAny && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "var(--background-secondary)", borderRadius: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--header-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</span>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--header-primary)" }}>{formatDurationMs(totalMs, true, true)}</span>
                    </div>
                )}
                {uncategorized.length > 0 && sortChannels(uncategorized).map(ch => (
                    <ChannelRow key={ch.id} channel={ch} stats={data[ch.id]} session={session} />
                ))}
                {sortedCats.map(cat => {
                    const chs = sortChannels(grouped.get(cat.id) ?? []);
                    const visible = chs.filter(ch => data[ch.id] || session?.channelId === ch.id);
                    if (visible.length === 0) return null;
                    const catMs = catTotalMs(chs);
                    return (
                        <div key={cat.id}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", padding: "0 4px" }}>
                                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--channels-default)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    {cat.name}
                                </span>
                                <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-muted)" }}>
                                    {formatDurationMs(catMs, true, true)}
                                </span>
                            </div>
                            {visible.map(ch => (
                                <ChannelRow key={ch.id} channel={ch} stats={data[ch.id]} session={session} />
                            ))}
                        </div>
                    );
                })}
                {!hasAny && (
                    <span style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                        No voice activity recorded yet.
                    </span>
                )}
            </div>
        </Modal>
    );
}

const GuildContextPatch: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    children.push(
        <Menu.MenuSeparator />,
        <Menu.MenuItem
            id="vdl-open"
            label="Voice Duration Log"
            action={() => openModal(props => <VoiceDurationModal guild={guild} {...props} />)}
        />
    );
};

export default definePlugin({
    name: "VoiceDurationLog",
    description: "Tracks time spent in each voice channel per server. Right-click a server to view the log.",
    authors: [AcordDevs.TheArmagan],
    start() {
        const myId = UserStore.getCurrentUser()?.id;
        if (!myId) return;
        const state = VoiceStateStore.getVoiceStateForUser(myId);
        if (state?.channelId && state.guildId) {
            currentSession = { guildId: state.guildId, channelId: state.channelId, joinedAt: Date.now() };
        }
    },
    stop() {
        if (currentSession) {
            void flush(currentSession.guildId, currentSession.channelId, currentSession.joinedAt);
            currentSession = null;
        }
    },
    flux: {
        async VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const myId = UserStore.getCurrentUser()?.id;
            if (!myId) return;
            const myState = voiceStates.find(v => v.userId === myId);
            if (!myState) return;

            const newChannelId = myState.channelId ?? null;

            if (!newChannelId) {
                if (currentSession) {
                    await flush(currentSession.guildId, currentSession.channelId, currentSession.joinedAt);
                    currentSession = null;
                }
                return;
            }

            if (currentSession?.channelId === newChannelId) return;

            const newGuildId = myState.guildId ?? ChannelStore.getChannel(newChannelId)?.guild_id ?? null;
            if (!newGuildId) return;

            if (currentSession) {
                await flush(currentSession.guildId, currentSession.channelId, currentSession.joinedAt);
            }

            currentSession = { guildId: newGuildId, channelId: newChannelId, joinedAt: Date.now() };
        }
    },
    contextMenus: {
        "guild-context": GuildContextPatch
    }
});
