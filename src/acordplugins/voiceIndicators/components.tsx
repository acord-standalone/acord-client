/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { findCssClassesLazy } from "@webpack";
import { GuildStore, React, Tooltip, useMemo } from "@webpack/common";

import { requestUserSessions, subscribeUser, unsubscribeUser, useVoiceStore } from "./client";
import { DeafIcon, MutedIcon, SpeakerIcon, StreamIcon, VideoIcon } from "./icons";
import { type HydratedSession, isInVoice } from "./types";
import { openVoiceInfoModal } from "./VoiceInfoModal";

const cl = classNameFactory("vc-vi-");

const ActionButtonClasses = findCssClassesLazy("actionButton", "highlight");

function useUserVoice(userId: string): HydratedSession | null {
    const sessions = useVoiceStore(s => s.sessions[userId]);

    React.useEffect(() => {
        subscribeUser(userId);
        requestUserSessions(userId);
        return () => unsubscribeUser(userId);
    }, [userId]);

    return useMemo(() => sessions?.find(isInVoice) ?? null, [sessions]);
}

function pickIcon(session: HydratedSession) {
    if (session.deaf || session.selfDeaf) return DeafIcon;
    if (session.mute || session.selfMute) return MutedIcon;
    if (session.stream || session.selfStream) return StreamIcon;
    if (session.selfVideo) return VideoIcon;
    return SpeakerIcon;
}

function resolveGuildName(session: HydratedSession): string | null {
    if (session.guild?.name) return session.guild.name;
    const guildId = session.guild?.id ?? session.channel?.guildId ?? session.guildId;
    return guildId ? GuildStore.getGuild(guildId)?.name ?? null : null;
}

function VoiceTooltip({ session }: { session: HydratedSession; }) {
    const name = session.nick?.nick ?? session.user?.displayName ?? session.user?.username ?? "Someone";
    const guildName = resolveGuildName(session);
    const channelName = session.channel?.name ?? "a voice channel";

    return (
        <div className={cl("tooltip-content")}>
            <BaseText size="sm" weight="bold">{name} is in voice</BaseText>
            <BaseText size="sm" color="text-muted">
                {guildName ? `${guildName} · ${channelName}` : channelName}
            </BaseText>
            <BaseText size="xs" color="text-muted">Click for details</BaseText>
        </div>
    );
}

export type VoiceIndicatorProps = {
    userId: string;
    isMessageIndicator?: boolean;
    isProfile?: boolean;
    isActionButton?: boolean;
    shouldHighlight?: boolean;
};

export const VoiceIndicator = ErrorBoundary.wrap(({ userId, isProfile, isActionButton, shouldHighlight }: VoiceIndicatorProps) => {
    const session = useUserVoice(userId);
    if (session == null) return null;

    const IconComponent = pickIcon(session);
    const serverEnforced = session.deaf || session.mute;

    return (
        <Tooltip
            text={<VoiceTooltip session={session} />}
            tooltipClassName={cl("tooltip-container")}
        >
            {props => (
                <IconComponent
                    {...props}
                    role="button"
                    onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openVoiceInfoModal(userId);
                    }}
                    className={classes(
                        cl("clickable"),
                        serverEnforced && cl("state-danger"),
                        isActionButton && ActionButtonClasses.actionButton,
                        isActionButton && shouldHighlight && ActionButtonClasses.highlight,
                        isProfile && cl("profile-speaker")
                    )}
                    size={isActionButton ? 20 : 16}
                />
            )}
        </Tooltip>
    );
}, { noop: true });
