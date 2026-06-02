/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { copyToClipboard } from "@utils/clipboard";
import { classNameFactory } from "@utils/css";
import { openInviteModal, openUserProfile } from "@utils/discord";
import { useFixedTimer } from "@utils/react";
import { formatDurationMs } from "@utils/text";
import { Avatar, ChannelRouter, ContextMenuApi, GuildStore, IconUtils, InviteActions, Menu, Modal, openModal, React, ScrollerThin, showToast, Toasts, Tooltip, useEffect, useMemo, UserStore, useState } from "@webpack/common";

import { queryChannelMembers, queryUserSessions, subscribeChannel } from "./client";
import { DeafIcon, GoToIcon, JoinIcon, LogIcon, MutedIcon, SpeakerIcon, VideoIcon } from "./icons";
import { openLogsModal } from "./LogsModal";
import { type ChannelQueryResult, type HydratedSession, isInVoice, type SessionGuild } from "./types";

const cl = classNameFactory("vc-vi-");

function memberName(m: HydratedSession): string {
    return m.nick?.nick ?? m.user?.displayName ?? m.user?.username ?? m.userId;
}

function avatarUrl(userId: string): string {
    const user = UserStore.getUser(userId);
    return user ? IconUtils.getUserAvatarURL(user, false, 80) : IconUtils.getDefaultAvatarURL(userId);
}

function guildAcronym(name?: string): string {
    return (name ?? "?").replace(/'s /g, " ").replace(/\w+/g, w => w[0]).replace(/\s/g, "");
}

/** Fall back to the local guild record when the backend didn't hydrate it. */
function resolveGuild(data: ChannelQueryResult | null, session: HydratedSession): SessionGuild | null {
    if (data?.guild) return data.guild;
    if (session.guild) return session.guild;

    const guildId = data?.channel?.guildId ?? session.channel?.guildId ?? session.guildId;
    if (!guildId) return null;

    const g = GuildStore.getGuild(guildId);
    return g ? { id: g.id, name: g.name, icon: g.icon ?? undefined, vanityCode: g.vanityURLCode ?? undefined } : null;
}

/** Navigate to the voice channel, joining the server first if we are not a member. */
async function goToChannel(guild: SessionGuild | null, channelId: string, onClose: () => void) {
    if (guild && GuildStore.getGuild(guild.id) == null) {
        if (!guild.vanityCode) {
            showToast("This server has no public invite to join.", Toasts.Type.FAILURE);
            return;
        }
        try {
            await InviteActions.acceptInvite({ inviteKey: guild.vanityCode, context: { location: "Voice Indicators" } });
        } catch {
            // Fall back to the invite modal so the user can join manually.
            openInviteModal(guild.vanityCode).catch(() => { });
            return;
        }
    }
    onClose();
    ChannelRouter.transitionToChannel(channelId);
}

function LiveDuration({ durationMs }: { durationMs?: number; }) {
    const initialTime = useMemo(() => Date.now() - (durationMs ?? 0), [durationMs]);
    const elapsed = useFixedTimer({ initialTime });
    if (durationMs == null) return null;
    return <BaseText size="xs" color="text-muted" className={cl("member-duration")}>{formatDurationMs(elapsed)}</BaseText>;
}

function StateIcons({ session }: { session: HydratedSession; }) {
    const streaming = session.stream || session.selfStream;
    const deafened = session.deaf || session.selfDeaf;
    const muted = session.mute || session.selfMute;

    return (
        <div className={cl("member-state")}>
            {streaming ? <span className={cl("live-badge")}>LIVE</span> : null}
            {session.selfVideo ? <VideoIcon size={14} /> : null}
            {deafened
                ? <DeafIcon size={14} className={session.deaf ? cl("state-danger") : undefined} />
                : muted
                    ? <MutedIcon size={14} className={session.mute ? cl("state-danger") : undefined} />
                    : null}
        </div>
    );
}

function MemberRow({ member, onClose }: { member: HydratedSession; onClose: () => void; }) {
    return (
        <div
            className={cl("member")}
            role="button"
            onClick={() => { onClose(); openUserProfile(member.userId); }}
            onContextMenu={e => ContextMenuApi.openContextMenu(e, () => (
                <Menu.Menu navId="vc-vi-member" onClose={ContextMenuApi.closeContextMenu}>
                    <Menu.MenuItem
                        id="vc-vi-open-profile"
                        label="Open Profile"
                        action={() => { onClose(); openUserProfile(member.userId); }}
                    />
                    <Menu.MenuItem
                        id="vc-vi-copy-id"
                        label="Copy User ID"
                        action={() => { copyToClipboard(member.userId); showToast("Copied user id.", Toasts.Type.SUCCESS); }}
                    />
                </Menu.Menu>
            ))}
        >
            <Avatar src={avatarUrl(member.userId)} size="SIZE_32" />
            <BaseText size="sm" weight="medium" className={cl("member-name")}>{memberName(member)}</BaseText>
            <LiveDuration durationMs={member.durationMs} />
            <StateIcons session={member} />
        </div>
    );
}

function GuildCard({ guild, onClose }: { guild: SessionGuild; onClose: () => void; }) {
    const iconUrl = guild.icon ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 48 }) : null;

    return (
        <div className={cl("guild-card")}>
            {iconUrl
                ? <img className={cl("guild-icon")} src={iconUrl} alt="" width={36} height={36} />
                : <div className={cl("guild-icon", "guild-acronym")}>{guildAcronym(guild.name)}</div>}
            <BaseText size="md" weight="semibold" className={cl("guild-name")}>{guild.name ?? "Unknown server"}</BaseText>
            {guild.vanityCode
                ? (
                    <Tooltip text={`Join discord.gg/${guild.vanityCode}`}>
                        {props => (
                            <Button
                                {...props}
                                size="iconOnly"
                                variant="secondary"
                                aria-label="Join server"
                                onClick={() => {
                                    onClose();
                                    openInviteModal(guild.vanityCode!).catch(() => showToast("That invite is no longer valid.", Toasts.Type.FAILURE));
                                }}
                            >
                                <JoinIcon size={18} />
                            </Button>
                        )}
                    </Tooltip>
                )
                : null}
        </div>
    );
}

function ChannelView({ session, onClose }: { session: HydratedSession; onClose: () => void; }) {
    const channelId = session.channelId!;
    const [data, setData] = useState<ChannelQueryResult | null>(null);

    useEffect(() => {
        let alive = true;
        const load = () => queryChannelMembers(channelId).then(res => { if (alive) setData(res); }, () => { });
        load();
        const unsubscribe = subscribeChannel(channelId, load);
        return () => { alive = false; unsubscribe(); };
    }, [channelId]);

    const guild = resolveGuild(data, session);
    const channelName = data?.channel?.name ?? session.channel?.name ?? "Voice channel";
    const members = data?.members ?? [];

    return (
        <div className={cl("channel-view")}>
            {guild ? <GuildCard guild={guild} onClose={onClose} /> : null}

            <div className={cl("channel-card")}>
                <div className={cl("channel-row")}>
                    <SpeakerIcon size={18} />
                    <BaseText size="sm" weight="semibold" className={cl("channel-name")}>{channelName}</BaseText>
                    {data ? <span className={cl("count-pill")}>{data.count}</span> : null}
                    <div className={cl("channel-actions")}>
                        <Tooltip text="View logs">
                            {props => (
                                <Button {...props} size="iconOnly" variant="secondary" aria-label="View logs" onClick={() => openLogsModal(session.userId, channelId, "channel")}>
                                    <LogIcon size={18} />
                                </Button>
                            )}
                        </Tooltip>
                        <Tooltip text="Go to channel">
                            {props => (
                                <Button {...props} size="iconOnly" variant="secondary" aria-label="Go to channel" onClick={() => goToChannel(guild, channelId, onClose)}>
                                    <GoToIcon size={18} />
                                </Button>
                            )}
                        </Tooltip>
                    </div>
                </div>

                <ScrollerThin className={cl("members")}>
                    {data == null
                        ? <BaseText size="sm" color="text-muted" className={cl("placeholder")}>Loading…</BaseText>
                        : members.length === 0
                            ? <BaseText size="sm" color="text-muted" className={cl("placeholder")}>No one else here.</BaseText>
                            : members.map(m => <MemberRow key={m.sessionId ?? m.userId} member={m} onClose={onClose} />)}
                </ScrollerThin>
            </div>
        </div>
    );
}

function VoiceInfoModal({ userId, onClose, transitionState }: { userId: string; onClose: () => void; transitionState: number; }) {
    const [sessions, setSessions] = useState<HydratedSession[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        queryUserSessions(userId).then(
            res => { if (alive) setSessions(res); },
            () => { if (alive) setFailed(true); }
        );
        return () => { alive = false; };
    }, [userId]);

    const active = sessions?.filter(isInVoice) ?? [];
    const user = UserStore.getUser(userId);
    const headerName = user?.globalName ?? user?.username ?? sessions?.[0]?.user?.displayName ?? "User";

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title={`${headerName}'s voice activity`}
            actions={[{ text: "Close", variant: "secondary", onClick: onClose }]}
        >
            <Flex flexDirection="column" gap={12} style={{ padding: "4px 0 8px" }}>
                {failed
                    ? <BaseText size="sm" color="text-muted">Could not load voice activity. Make sure you are connected to Acord online services.</BaseText>
                    : sessions == null
                        ? <BaseText size="sm" color="text-muted">Loading…</BaseText>
                        : active.length === 0
                            ? <BaseText size="sm" color="text-muted">This user is not in a voice channel right now.</BaseText>
                            : active.map(session => <ChannelView key={session.sessionId ?? session.channelId} session={session} onClose={onClose} />)}
            </Flex>
        </Modal>
    );
}

export function openVoiceInfoModal(userId: string) {
    openModal(props => <VoiceInfoModal userId={userId} {...props} />);
}
