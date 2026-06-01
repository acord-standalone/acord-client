/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { HeadingSecondary } from "@components/Heading";
import type { Channel, User } from "@vencord/discord-types";
import { Checkbox, GuildMemberStore, IconUtils, Modal, openModal, React, SearchableSelect, showToast, TextArea, Toasts, useMemo, useRef, UserStore, useState } from "@webpack/common";

import { buildAttachments, FakeFile, sendFakeMessage } from "./utils";

const labelStyle: React.CSSProperties = { color: "var(--header-secondary)" };

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function userLabel(guildId: string | undefined, id: string) {
    const user = UserStore.getUser(id);
    const base = user?.globalName ?? user?.username ?? id;
    const nick = guildId ? GuildMemberStore.getNick(guildId, id) : null;
    const tag = user && user.discriminator && user.discriminator !== "0" ? `#${user.discriminator}` : "";
    return nick && nick !== base ? `${nick} (${base}${tag})` : `${base}${tag}`;
}

function AuthorPreview({ user }: { user: User | undefined; }) {
    if (!user) return null;
    return (
        <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
            <img
                src={IconUtils.getUserAvatarURL(user)}
                alt=""
                width={24}
                height={24}
                style={{ borderRadius: "50%" }}
            />
            <span style={{ color: "var(--text-normal)", fontWeight: 600 }}>
                {user.globalName ?? user.username}
            </span>
        </Flex>
    );
}

function FakeMessageModal({ channel, onClose, transitionState }: { channel: Channel; onClose(): void; transitionState: number; }) {
    const guildId = channel.guild_id || undefined;

    // Candidate authors: every cached guild member for server channels, or the
    // DM recipient(s) plus yourself for direct/group messages.
    const candidateIds = useMemo(() => {
        if (guildId) return GuildMemberStore.getMemberIds(guildId);
        const selfId = UserStore.getCurrentUser()?.id;
        const ids = [...(channel.recipients ?? [])];
        if (selfId && !ids.includes(selfId)) ids.push(selfId);
        return ids;
    }, [guildId, channel.id]);

    const options = useMemo(
        () => candidateIds
            .map(id => ({ label: userLabel(guildId, id), value: id }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        [candidateIds, guildId]
    );

    const [authorId, setAuthorId] = useState<string>(() => channel.getRecipientId?.() ?? candidateIds[0] ?? "");
    const [content, setContent] = useState("");
    const [files, setFiles] = useState<FakeFile[]>([]);
    const [sending, setSending] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const author = authorId ? UserStore.getUser(authorId) : undefined;

    const addFiles = (list: FileList | null) => {
        if (!list?.length) return;
        const added = Array.from(list).map(file => ({
            key: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
            file,
            spoiler: false,
        }));
        setFiles(prev => [...prev, ...added]);
    };

    const removeFile = (key: string) => setFiles(prev => prev.filter(f => f.key !== key));
    const toggleSpoiler = (key: string) =>
        setFiles(prev => prev.map(f => f.key === key ? { ...f, spoiler: !f.spoiler } : f));

    const canSend = !!author && (content.trim().length > 0 || files.length > 0) && !sending;

    const send = async () => {
        if (!author) return;
        setSending(true);
        try {
            const attachments = await buildAttachments(files);
            sendFakeMessage(channel.id, author, content, attachments);
            onClose();
        } catch (e) {
            console.error("[FakeMessages] failed to send fake message", e);
            showToast("Failed to create fake message.", Toasts.Type.FAILURE);
            setSending(false);
        }
    };

    const targetName = guildId
        ? `#${channel.name}`
        : channel.isGroupDM()
            ? (channel.name || "Group DM")
            : "this DM";

    const selectIsMulti = options.length > 1 || guildId;

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="md"
            title="Fake Message"
            subtitle={`Locally inject a message into ${targetName}. Nothing is actually sent.`}
            actions={[
                { text: "Cancel", variant: "secondary", onClick: onClose },
                { text: sending ? "Sending..." : "Send", variant: "primary", onClick: send, disabled: !canSend },
            ]}
        >
            <Flex flexDirection="column" gap={16} style={{ padding: "4px 0 8px" }}>
                <section>
                    <HeadingSecondary style={labelStyle}>Send as</HeadingSecondary>
                    <AuthorPreview user={author} />
                    {selectIsMulti
                        ? (
                            <SearchableSelect
                                options={options}
                                value={authorId}
                                onChange={(v: string) => setAuthorId(v)}
                                placeholder="Select a user..."
                                maxVisibleItems={6}
                                closeOnSelect
                                renderOptionPrefix={(opt: { value: string; }) => {
                                    const u = UserStore.getUser(opt.value);
                                    return u
                                        ? <img src={IconUtils.getUserAvatarURL(u)} alt="" width={20} height={20} style={{ borderRadius: "50%" }} />
                                        : null;
                                }}
                            />
                        )
                        : (
                            <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
                                {options.length ? options[0].label : "No user found in this channel."}
                            </span>
                        )
                    }
                </section>

                <section>
                    <HeadingSecondary style={labelStyle}>Message content</HeadingSecondary>
                    <TextArea
                        value={content}
                        onChange={setContent}
                        placeholder="What should they have said?"
                        autosize
                    />
                </section>

                <section>
                    <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: 8 }}>
                        <HeadingSecondary style={{ ...labelStyle, margin: 0 }}>Fake attachments</HeadingSecondary>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                background: "var(--button-secondary-background)",
                                color: "var(--text-normal)",
                                border: "none",
                                borderRadius: 4,
                                padding: "4px 12px",
                                cursor: "pointer",
                                fontSize: 13,
                            }}
                        >
                            Add files
                        </button>
                    </Flex>

                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        style={{ display: "none" }}
                        onChange={e => {
                            addFiles(e.currentTarget.files);
                            e.currentTarget.value = "";
                        }}
                    />

                    {files.length === 0
                        ? <span style={{ color: "var(--text-muted)", fontSize: 14 }}>No attachments. Picked files render locally only.</span>
                        : (
                            <Flex flexDirection="column" gap={6}>
                                {files.map(f => (
                                    <Flex
                                        key={f.key}
                                        alignItems="center"
                                        gap={8}
                                        style={{
                                            background: "var(--background-secondary)",
                                            borderRadius: 4,
                                            padding: "6px 10px",
                                        }}
                                    >
                                        <span style={{ flex: 1, color: "var(--text-normal)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {f.file.name}
                                        </span>
                                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{formatSize(f.file.size)}</span>
                                        <Checkbox value={f.spoiler} onChange={() => toggleSpoiler(f.key)} size={18}>
                                            <span style={{ fontSize: 13 }}>Spoiler</span>
                                        </Checkbox>
                                        <button
                                            onClick={() => removeFile(f.key)}
                                            style={{ background: "none", border: "none", color: "var(--text-danger)", cursor: "pointer", fontSize: 16 }}
                                            aria-label="Remove"
                                        >
                                            ×
                                        </button>
                                    </Flex>
                                ))}
                            </Flex>
                        )
                    }
                </section>
            </Flex>
        </Modal>
    );
}

export function openFakeMessageModal(channel: Channel) {
    openModal(props => <FakeMessageModal channel={channel} {...props} />);
}
