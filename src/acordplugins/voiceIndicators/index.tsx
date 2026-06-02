/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import { AcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import { reportKnownVoiceStatesSoon, reportVoiceStates, stopClient } from "./client";
import { VoiceIndicator } from "./components";

const settings = definePluginSettings({
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Show the voice indicator in the member and DMs list.",
        default: true,
        restartNeeded: true,
    },
    showInMessages: {
        type: OptionType.BOOLEAN,
        description: "Show the voice indicator next to messages.",
        default: true,
        restartNeeded: true,
    },
    showInProfile: {
        type: OptionType.BOOLEAN,
        description: "Show the voice indicator in user profiles.",
        default: true,
        restartNeeded: true,
    },
});

export default definePlugin({
    name: "VoiceIndicators",
    description: "Shows a crowd-sourced indicator when a user is in a voice channel, pulled from Acord's online services instead of your local client. Click it to see who they are with.",
    authors: [AcordDevs.TheArmagan],
    dependencies: ["AcordOnlineServicesAPI", "MemberListDecoratorsAPI", "MessageDecorationsAPI", "NicknameIconsAPI"],
    settings,

    flux: {
        // Discord delivers the initial voice states here; report them once the stores settle.
        READY_SUPPLEMENTAL() {
            reportKnownVoiceStatesSoon();
        },
        // Forward every live voice change so the crowd-sourced data stays current.
        VOICE_STATE_UPDATES({ voiceStates }) {
            reportVoiceStates(voiceStates);
        },
    },

    renderNicknameIcon({ userId }) {
        if (!settings.store.showInProfile) return null;
        return <VoiceIndicator userId={userId} isProfile />;
    },
    renderMemberListDecorator({ user }) {
        if (!settings.store.showInMemberList || user == null) return null;
        return <VoiceIndicator userId={user.id} />;
    },
    renderMessageDecoration({ message }) {
        if (!settings.store.showInMessages || message?.author == null) return null;
        return <VoiceIndicator userId={message.author.id} isMessageIndicator />;
    },

    patches: [
        // Friends list rows
        {
            find: "null!=this.peopleListItemRef.current",
            replacement: {
                match: /\.isProvisional.{0,50}?className:\i\.\i,children:\[(?<=isFocused:(\i).+?)/,
                replace: "$&$self.VoiceIndicator({userId:this?.props?.user?.id,isActionButton:true,shouldHighlight:$1}),"
            },
            predicate: () => settings.store.showInMemberList
        }
    ],

    stop() {
        stopClient();
    },

    VoiceIndicator,
});
