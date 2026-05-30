/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Channel, Role } from "@vencord/discord-types";
import { ChannelStore, Checkbox, GuildChannelStore, GuildMemberStore, GuildRoleStore, Modal, openModal, React, RestAPI, SearchableSelect, TextInput, UserStore, useState, VoiceStateStore } from "@webpack/common";

const ACTION_OPTIONS = [
    { label: "Mute", value: "mute" },
    { label: "Unmute", value: "unmute" },
    { label: "Deafen", value: "deafen" },
    { label: "Undeafen", value: "undeafen" },
    { label: "Mute & Deafen", value: "mute_deafen" },
];

const FILTER_OPTIONS = [
    { label: "All users", value: "all" },
    { label: "Users with role(s)", value: "has_role" },
    { label: "Users without role(s)", value: "no_role" },
];

function buildBody(action: string): Record<string, unknown> {
    switch (action) {
        case "mute": return { mute: true };
        case "unmute": return { mute: false };
        case "deafen": return { deaf: true };
        case "undeafen": return { deaf: false };
        case "mute_deafen": return { mute: true, deaf: true };
        default: return {};
    }
}

const labelStyle: React.CSSProperties = { fontWeight: 600, marginBottom: "8px", color: "var(--header-secondary)" };
const sectionStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };

function AdvancedMuteModal({ channel, onClose, transitionState }: { channel: Channel; onClose(): void; transitionState: number; }) {
    const [action, setAction] = useState("mute");
    const [filterMode, setFilterMode] = useState("all");
    const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
    const [useRandom, setUseRandom] = useState(false);
    const [randomCount, setRandomCount] = useState("5");

    const rolesMap = (GuildRoleStore.getRolesSnapshot(channel.guild_id) ?? {}) as Record<string, Role>;
    const roleOptions = Object.values(rolesMap)
        .filter(r => r.id !== channel.guild_id)
        .sort((a, b) => (b as any).position - (a as any).position)
        .map(r => ({ label: r.name, value: r.id }));

    const voiceStates = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id));
    const myId = UserStore.getCurrentUser().id;

    const getTargets = () => {
        let targets = voiceStates.filter(s => s.userId !== myId);

        if (filterMode !== "all" && selectedRoles.length > 0) {
            targets = targets.filter(s => {
                const member = GuildMemberStore.getMember(channel.guild_id, s.userId);
                const memberRoles = member?.roles ?? [];
                const hasAny = selectedRoles.some(r => memberRoles.includes(r));
                return filterMode === "has_role" ? hasAny : !hasAny;
            });
        }

        if (useRandom) {
            const n = Math.max(1, parseInt(randomCount) || 1);
            if (n < targets.length) {
                targets = [...targets].sort(() => Math.random() - 0.5).slice(0, n);
            }
        }

        return targets;
    };

    const apply = async () => {
        onClose();
        const body = buildBody(action);
        for (const s of getTargets()) {
            await RestAPI.patch({ url: `/guilds/${channel.guild_id}/members/${s.userId}`, body });
        }
    };

    const count = getTargets().length;

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="md"
            title="Advanced Voice Actions"
            actions={[
                { text: "Cancel", variant: "secondary", onClick: onClose },
                { text: `Apply to ${count} user${count !== 1 ? "s" : ""}`, variant: "primary", onClick: apply, disabled: count === 0 },
            ]}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "4px 0 8px" }}>
                <div style={sectionStyle}>
                    <div style={labelStyle}>Action</div>
                    <SearchableSelect
                        options={ACTION_OPTIONS}
                        value={action}
                        onChange={setAction}
                        placeholder="Select action"
                    />
                </div>

                <div style={sectionStyle}>
                    <div style={labelStyle}>Target filter</div>
                    <SearchableSelect
                        options={FILTER_OPTIONS}
                        value={filterMode}
                        onChange={setFilterMode}
                        placeholder="Select filter"
                    />
                </div>

                {filterMode !== "all" && (
                    <div style={sectionStyle}>
                        <div style={labelStyle}>Roles</div>
                        <SearchableSelect
                            options={roleOptions}
                            value={selectedRoles}
                            onChange={setSelectedRoles}
                            placeholder="Select roles..."
                            multi
                        />
                    </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Checkbox
                        value={useRandom}
                        onChange={(_e, v) => setUseRandom(v)}
                    >
                        Limit to random
                    </Checkbox>
                    {useRandom && (
                        <>
                            <TextInput
                                value={randomCount}
                                onChange={setRandomCount}
                                placeholder="N"
                                style={{ width: "72px" }}
                            />
                            <span style={{ color: "var(--text-muted)" }}>users</span>
                        </>
                    )}
                </div>
            </div>
        </Modal>
    );
}

export function openAdvancedModal(channel: Channel) {
    openModal(props => <AdvancedMuteModal channel={channel} {...props} />);
}

function DistributeModal({ channel, onClose, transitionState }: { channel: Channel; onClose(): void; transitionState: number; }) {
    const guildChannels: { VOCAL: { channel: Channel; }[]; } = GuildChannelStore.getChannels(channel.guild_id);
    const allVoice = guildChannels.VOCAL?.map(({ channel: c }) => c).filter(c => c.id !== channel.id) ?? [];

    const categoryIds = [...new Set(allVoice.map(c => c.parent_id).filter(Boolean))];
    const categoryOptions = [
        { label: "All voice channels", value: "__all__" },
        ...categoryIds.map(id => ({
            label: ChannelStore.getChannel(id)?.name ?? "Unknown Category",
            value: id,
        })),
    ];

    const [categoryId, setCategoryId] = useState("__all__");
    const targetChannels = categoryId === "__all__" ? allVoice : allVoice.filter(c => c.parent_id === categoryId);

    const voiceStates = Object.values(VoiceStateStore.getVoiceStatesForChannel(channel.id));

    const distribute = async () => {
        onClose();
        if (targetChannels.length === 0 || voiceStates.length === 0) return;
        const shuffled = [...voiceStates].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length; i++) {
            const dest = targetChannels[i % targetChannels.length];
            await RestAPI.patch({
                url: `/guilds/${channel.guild_id}/members/${shuffled[i].userId}`,
                body: { channel_id: dest.id },
            });
        }
    };

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title="Random Channel Distribution"
            subtitle={`${voiceStates.length} user${voiceStates.length !== 1 ? "s" : ""} → ${targetChannels.length} channel${targetChannels.length !== 1 ? "s" : ""}`}
            actions={[
                { text: "Cancel", variant: "secondary", onClick: onClose },
                { text: "Distribute", variant: "primary", onClick: distribute, disabled: targetChannels.length === 0 },
            ]}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "4px 0 8px" }}>
                <div style={sectionStyle}>
                    <div style={labelStyle}>Category</div>
                    <SearchableSelect
                        options={categoryOptions}
                        value={categoryId}
                        onChange={setCategoryId}
                        placeholder="Select category"
                    />
                </div>

                <div style={sectionStyle}>
                    <div style={labelStyle}>Target channels ({targetChannels.length})</div>
                    <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                        {targetChannels.length === 0
                            ? <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>No channels in this category.</span>
                            : targetChannels.map(c => (
                                <span key={c.id} style={{ fontSize: "14px", color: "var(--text-normal)" }}>🔊 {c.name}</span>
                            ))
                        }
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export function openDistributeModal(channel: Channel) {
    openModal(props => <DistributeModal channel={channel} {...props} />);
}
