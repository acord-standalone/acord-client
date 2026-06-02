/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { formatDurationMs } from "@utils/text";
import { Avatar, ChannelStore, GuildStore, IconUtils, Modal, moment, openModal, React, ScrollerThin, useEffect, UserStore, useState } from "@webpack/common";

import { queryChannelLog, queryUserLog, reportGuildMeta } from "./client";
import { SpeakerIcon } from "./icons";
import type { ChannelLogEntry, UserChannelLogEntry } from "./types";

const cl = classNameFactory("vc-vi-");

type Tab = "channel" | "user";

function avatarUrl(userId: string): string {
    const user = UserStore.getUser(userId);
    return user ? IconUtils.getUserAvatarURL(user, false, 80) : IconUtils.getDefaultAvatarURL(userId);
}

/** The guild id for a log entry, resolved from the entry or the local channel record. */
function logGuildId(e: UserChannelLogEntry): string | undefined {
    return e.guildId ?? e.channel?.guildId ?? ChannelStore.getChannel(e.channelId)?.guild_id ?? undefined;
}

/** Resolve a guild label, falling back to local stores so guild channels aren't mislabeled as DMs. */
function logGuildName(e: UserChannelLogEntry): string {
    if (e.guild?.name) return e.guild.name;

    const guildId = logGuildId(e);
    if (guildId) return GuildStore.getGuild(guildId)?.name ?? "Server";

    return "Direct Message";
}

function UserLogList({ entries }: { entries: UserChannelLogEntry[]; }) {
    if (entries.length === 0) return <BaseText size="sm" color="text-muted" className={cl("placeholder")}>No recent channels.</BaseText>;

    return (
        <>
            {entries.map(e => {
                const current = e.leftAt === undefined;
                const durationMs = (e.leftAt ?? Date.now()) - e.joinedAt;
                const channelName = e.channel?.name ?? "Unknown channel";
                const guildName = logGuildName(e);

                return (
                    <div key={e.channelId + e.joinedAt} className={cl("log-row")}>
                        <SpeakerIcon size={16} />
                        <div className={cl("log-main")}>
                            <BaseText size="sm" weight="medium" className={cl("log-title")}>{channelName}</BaseText>
                            <BaseText size="xs" color="text-muted">{guildName} · {moment(e.joinedAt).fromNow()}</BaseText>
                        </div>
                        {current
                            ? <span className={cl("live-badge")}>NOW</span>
                            : <BaseText size="xs" color="text-muted" className={cl("member-duration")}>{formatDurationMs(durationMs)}</BaseText>}
                    </div>
                );
            })}
        </>
    );
}

function channelActionText(e: ChannelLogEntry): string {
    switch (e.type) {
        case "join": return "joined";
        case "leave": return "left";
        case "move": return `moved from ${e.fromChannel?.name ?? "another channel"}`;
    }
}

function ChannelLogList({ entries }: { entries: ChannelLogEntry[]; }) {
    if (entries.length === 0) return <BaseText size="sm" color="text-muted" className={cl("placeholder")}>No recent activity.</BaseText>;

    return (
        <>
            {entries.map(e => {
                const name = e.nick ?? e.user?.displayName ?? e.user?.username ?? e.userId;

                return (
                    <div key={e.sessionId + e.ts} className={cl("log-row")}>
                        <Avatar src={avatarUrl(e.userId)} size="SIZE_24" />
                        <div className={cl("log-main")}>
                            <BaseText size="sm" weight="medium" className={cl("log-title")}>{name}</BaseText>
                            <BaseText size="xs" color="text-muted">{channelActionText(e)} · {moment(e.ts).fromNow()}</BaseText>
                        </div>
                    </div>
                );
            })}
        </>
    );
}

function LogsModal({ userId, channelId, initialTab, onClose, transitionState }: { userId: string; channelId: string; initialTab: Tab; onClose: () => void; transitionState: number; }) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [userLog, setUserLog] = useState<UserChannelLogEntry[] | null>(null);
    const [channelLog, setChannelLog] = useState<ChannelLogEntry[] | null>(null);

    useEffect(() => {
        let alive = true;
        if (tab === "user" && userLog == null) queryUserLog(userId).then(r => { if (alive) setUserLog(r); }, () => { if (alive) setUserLog([]); });
        if (tab === "channel" && channelLog == null) queryChannelLog(channelId).then(r => { if (alive) setChannelLog(r); }, () => { if (alive) setChannelLog([]); });
        return () => { alive = false; };
    }, [tab]);

    // Backfill guild metadata we know locally but the backend was missing, so others get it too.
    useEffect(() => {
        for (const e of userLog ?? []) {
            if (e.guild) continue;
            const guildId = logGuildId(e);
            if (guildId) reportGuildMeta(guildId);
        }
    }, [userLog]);

    const loading = <BaseText size="sm" color="text-muted" className={cl("placeholder")}>Loading…</BaseText>;

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title="Voice log"
            actions={[{ text: "Close", variant: "secondary", onClick: onClose }]}
        >
            <div className={cl("log-tabs")}>
                <Button size="small" variant={tab === "channel" ? "primary" : "secondary"} onClick={() => setTab("channel")}>This channel</Button>
                <Button size="small" variant={tab === "user" ? "primary" : "secondary"} onClick={() => setTab("user")}>This user</Button>
            </div>

            <ScrollerThin className={cl("log-list")}>
                {tab === "user"
                    ? (userLog == null ? loading : <UserLogList entries={userLog} />)
                    : (channelLog == null ? loading : <ChannelLogList entries={channelLog} />)}
            </ScrollerThin>
        </Modal>
    );
}

export function openLogsModal(userId: string, channelId: string, initialTab: Tab = "channel") {
    openModal(props => <LogsModal userId={userId} channelId={channelId} initialTab={initialTab} {...props} />);
}
