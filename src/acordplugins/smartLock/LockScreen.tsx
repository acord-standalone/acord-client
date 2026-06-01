/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { useRouteContext } from "@acordplugins/_shared/useRouteContext";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { createRoot, IconUtils, NavigationRouter, React, ReactDOM, TextInput, useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";
import type { Root } from "react-dom/client";

import { settings } from "./settings";
import { isLocked, isRemembered, markUnlocked, verifyPassword } from "./store";

const cl = classNameFactory("vc-smartlock-");
const ROOT_ID = "vc-smartlock-root";
const BLUR_KEYS: ["blurAmount"] = ["blurAmount"];

function Overlay({ targetId, kind, onUnlock }: { targetId: string; kind: "server" | "channel"; onUnlock(): void; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    const { blurAmount } = settings.use(BLUR_KEYS);
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [checking, setChecking] = useState(false);

    const tryUnlock = async () => {
        if (!password || checking) return;
        setChecking(true);
        if (await verifyPassword(targetId, password)) {
            markUnlocked(targetId);
            onUnlock();
            return;
        }
        setError(true);
        setPassword("");
        setChecking(false);
    };

    const goBack = () => NavigationRouter.back();

    return (
        <div
            className={cl("root")}
            style={{ backdropFilter: `blur(${blurAmount}px) brightness(0.4) saturate(0.4)` }}
            onKeyDown={e => { if (e.key === "Enter") tryUnlock(); }}
        >
            {user && (
                <img className={cl("avatar")} src={IconUtils.getUserAvatarURL(user, false, 128)} alt="" />
            )}
            <div className={cl("name")}>{user?.globalName ?? user?.username ?? "Locked"}</div>
            <div className={cl("sub")}>This {kind} is locked. Enter the password to view it.</div>

            <div className={cl("form")}>
                <TextInput type="password" value={password} onChange={v => { setPassword(v); setError(false); }} placeholder="Password" autoFocus />
                {error && <div className={cl("error")}>Wrong password.</div>}
                <div className={cl("actions")}>
                    <Button variant="primary" disabled={!password || checking} onClick={tryUnlock}>Unlock</Button>
                    <Button variant="link" onClick={goBack}>Go back</Button>
                </div>
            </div>
        </div>
    );
}

function LockScreen() {
    const { guildId, channelId } = useRouteContext();
    const [lockedGuild, setLockedGuild] = useState<string | null>(null);
    const [lockedChannel, setLockedChannel] = useState<string | null>(null);

    // Each is re-evaluated only when its own id changes, so unlocking doesn't
    // immediately re-lock when "remember" is off, and browsing channels inside
    // an unlocked server doesn't re-prompt for the server password.
    useEffect(() => {
        const remember = settings.store.rememberMinutes;
        setLockedGuild(guildId && isLocked(guildId) && !isRemembered(guildId, remember) ? guildId : null);
    }, [guildId]);

    useEffect(() => {
        const remember = settings.store.rememberMinutes;
        setLockedChannel(channelId && isLocked(channelId) && !isRemembered(channelId, remember) ? channelId : null);
    }, [channelId]);

    // A locked server gates its whole content, so it takes priority.
    const target = lockedGuild
        ? { id: lockedGuild, kind: "server" as const, clear: () => setLockedGuild(null) }
        : lockedChannel
            ? { id: lockedChannel, kind: "channel" as const, clear: () => setLockedChannel(null) }
            : null;

    if (!target) return null;

    return ReactDOM.createPortal(
        <ErrorBoundary noop>
            <Overlay key={target.id} targetId={target.id} kind={target.kind} onUnlock={target.clear} />
        </ErrorBoundary>,
        document.body
    );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

export function mountLockScreen() {
    if (container) return;
    container = document.createElement("div");
    container.id = ROOT_ID;
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(<LockScreen />);
}

export function unmountLockScreen() {
    root?.unmount();
    root = null;
    container?.remove();
    container = null;
}
