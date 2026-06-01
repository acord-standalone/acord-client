/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Flex } from "@components/Flex";
import { HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Modal, openModal, React, showToast, TextInput, Toasts, useState } from "@webpack/common";

import { removeLock, setLock, verifyPassword } from "./store";

const labelStyle: React.CSSProperties = { color: "var(--header-secondary)", marginBottom: 4 };

function SetPasswordModal({ id, name, onClose, transitionState }: { id: string; name: string; onClose(): void; transitionState: number; }) {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);

    const mismatch = confirm.length > 0 && password !== confirm;
    const canSave = password.length > 0 && password === confirm && !saving;

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        await setLock(id, password);
        showToast(`Locked ${name}.`, Toasts.Type.SUCCESS);
        onClose();
    };

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title="Lock"
            subtitle={`Set a password to view ${name}.`}
            actions={[
                { text: "Cancel", variant: "secondary", onClick: onClose },
                { text: "Lock", variant: "primary", onClick: save, disabled: !canSave },
            ]}
        >
            <Flex flexDirection="column" gap={12} style={{ padding: "4px 0 8px" }}>
                <section>
                    <HeadingSecondary style={labelStyle}>Password</HeadingSecondary>
                    <TextInput type="password" value={password} onChange={setPassword} placeholder="Password" autoFocus />
                </section>
                <section>
                    <HeadingSecondary style={labelStyle}>Confirm password</HeadingSecondary>
                    <TextInput type="password" value={confirm} onChange={setConfirm} placeholder="Repeat password" />
                    {mismatch && <Paragraph color="text-danger" style={{ marginTop: 4 }}>Passwords do not match.</Paragraph>}
                </section>
            </Flex>
        </Modal>
    );
}

function RemovePasswordModal({ id, name, onClose, transitionState }: { id: string; name: string; onClose(): void; transitionState: number; }) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [checking, setChecking] = useState(false);

    const remove = async () => {
        if (!password || checking) return;
        setChecking(true);
        if (await verifyPassword(id, password)) {
            removeLock(id);
            showToast(`Unlocked ${name}.`, Toasts.Type.SUCCESS);
            onClose();
            return;
        }
        setError(true);
        setPassword("");
        setChecking(false);
    };

    return (
        <Modal
            onClose={onClose}
            transitionState={transitionState}
            size="sm"
            title="Remove lock"
            subtitle={`Enter the password to unlock ${name}.`}
            actions={[
                { text: "Cancel", variant: "secondary", onClick: onClose },
                { text: "Remove lock", variant: "critical-primary", onClick: remove, disabled: !password || checking },
            ]}
        >
            <Flex flexDirection="column" gap={4} style={{ padding: "4px 0 8px" }}>
                <TextInput
                    type="password"
                    value={password}
                    onChange={v => { setPassword(v); setError(false); }}
                    placeholder="Password"
                    autoFocus
                />
                {error && <Paragraph color="text-danger" style={{ marginTop: 4 }}>Wrong password.</Paragraph>}
            </Flex>
        </Modal>
    );
}

export function openSetLockModal(id: string, name: string) {
    openModal(props => <SetPasswordModal id={id} name={name} {...props} />);
}

export function openRemoveLockModal(id: string, name: string) {
    openModal(props => <RemovePasswordModal id={id} name={name} {...props} />);
}
