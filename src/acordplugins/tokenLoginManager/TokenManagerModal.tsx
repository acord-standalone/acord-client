/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { copyWithToast } from "@utils/discord";
import { Alerts, Forms, Modal, openModal, React, TextInput, useEffect, useState } from "@webpack/common";

import { type SavedToken, TokenStore } from "./store";
import { getCurrentToken, loginWithToken } from "./token";

function useTokens(): SavedToken[] {
    const [tokens, setTokens] = useState<SavedToken[]>(TokenStore.getAll());
    useEffect(() => TokenStore.subscribe(setTokens), []);
    return tokens;
}

function maskToken(token: string) {
    if (token.length <= 8) return "•".repeat(token.length);
    return `${token.slice(0, 4)}${"•".repeat(Math.min(token.length - 8, 24))}${token.slice(-4)}`;
}

function EyeIcon({ open }: { open: boolean; }) {
    return open
        ? (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
        )
        : (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        );
}

function TokenRow({ entry }: { entry: SavedToken; }) {
    const [revealed, setRevealed] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(entry.name);

    const commitName = () => {
        const next = nameDraft.trim();
        if (next && next !== entry.name) TokenStore.update(entry.id, { name: next });
        else setNameDraft(entry.name);
        setEditingName(false);
    };

    const confirmLogin = () => {
        Alerts.show({
            title: "Switch account?",
            body: `This will log you out and sign in as "${entry.name}". The app will reload.`,
            confirmText: "Log in",
            cancelText: "Cancel",
            onConfirm: () => loginWithToken(entry.token)
        });
    };

    const confirmDelete = () => {
        Alerts.show({
            title: "Delete token?",
            body: `Remove the saved token "${entry.name}"? This cannot be undone.`,
            confirmText: "Delete",
            cancelText: "Cancel",
            onConfirm: () => TokenStore.remove(entry.id)
        });
    };

    return (
        <div className="vc-tlm-row">
            <div className="vc-tlm-row-main">
                {editingName ? (
                    <TextInput
                        value={nameDraft}
                        onChange={setNameDraft}
                        onBlur={commitName}
                        onKeyDown={(e: React.KeyboardEvent) => {
                            if (e.key === "Enter") commitName();
                            if (e.key === "Escape") { setNameDraft(entry.name); setEditingName(false); }
                        }}
                        autoFocus
                        style={{ height: 28 }}
                    />
                ) : (
                    <div
                        className="vc-tlm-name"
                        title="Click to rename"
                        onClick={() => { setNameDraft(entry.name); setEditingName(true); }}
                    >
                        {entry.name}
                    </div>
                )}
                <div className="vc-tlm-token">{revealed ? entry.token : maskToken(entry.token)}</div>
            </div>
            <div className="vc-tlm-row-actions">
                <Button size="iconOnly" variant="secondary" onClick={() => setRevealed(v => !v)} aria-label="Toggle reveal">
                    <EyeIcon open={revealed} />
                </Button>
                <Button size="small" variant="secondary" onClick={() => copyWithToast(entry.token, "Token copied!")}>
                    Copy
                </Button>
                <Button size="small" variant="primary" onClick={confirmLogin}>
                    Log in
                </Button>
                <Button size="small" variant="dangerPrimary" onClick={confirmDelete}>
                    Delete
                </Button>
            </div>
        </div>
    );
}

function AddSection() {
    const [name, setName] = useState("");
    const [token, setToken] = useState("");

    const add = () => {
        if (!token.trim()) return;
        TokenStore.add(name, token);
        setName("");
        setToken("");
    };

    const saveCurrent = () => {
        const current = getCurrentToken();
        if (!current) {
            Alerts.show({ title: "No token found", body: "Could not read the current account's token." });
            return;
        }
        TokenStore.add(name || "Current account", current);
        setName("");
    };

    return (
        <div className="vc-tlm-add">
            <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>Add a token</Forms.FormTitle>
            <div className="vc-tlm-add-fields">
                <TextInput
                    value={name}
                    onChange={setName}
                    placeholder="Name (e.g. Main, Alt)"
                    style={{ flex: "0 0 180px" }}
                />
                <TextInput
                    type="password"
                    value={token}
                    onChange={setToken}
                    placeholder="Token"
                    style={{ flex: 1 }}
                />
                <Button variant="primary" onClick={add} disabled={!token.trim()}>Add</Button>
            </div>
            <Button variant="secondary" size="small" style={{ marginTop: 8 }} onClick={saveCurrent}>
                Save current account's token
            </Button>
        </div>
    );
}

function TokenManagerModalContent() {
    const tokens = useTokens();

    return (
        <div className="vc-tlm-container">
            <AddSection />
            <Divider style={{ margin: "16px 0" }} />
            <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>
                Saved tokens ({tokens.length})
            </Forms.FormTitle>
            {tokens.length === 0 ? (
                <div className="vc-tlm-empty">No tokens saved yet. Add one above.</div>
            ) : (
                <div className="vc-tlm-list">
                    {tokens.map(t => <TokenRow key={t.id} entry={t} />)}
                </div>
            )}
        </div>
    );
}

export function openTokenManagerModal() {
    openModal(props => (
        <Modal {...props} title="Token Login Manager" size="lg">
            <div style={{ padding: 16 }}>
                <TokenManagerModalContent />
            </div>
        </Modal>
    ));
}
