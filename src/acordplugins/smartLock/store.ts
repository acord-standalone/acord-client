/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";

const LOCKS_KEY = "SmartLock_locks";
const logger = new Logger("SmartLock");

// channelId -> sha-256 hex of the password
let locks: Record<string, string> = {};

// channelId -> timestamp (ms) of the last successful unlock this session
const unlocked = new Map<string, number>();

const lockListeners = new Set<() => void>();

async function hashPassword(password: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function initLocks() {
    try {
        locks = (await DataStore.get<Record<string, string>>(LOCKS_KEY)) ?? {};
    } catch (e) {
        logger.error("Failed to load locks", e);
        locks = {};
    }
}

function persist() {
    DataStore.set(LOCKS_KEY, locks).catch(e => logger.error("Failed to save locks", e));
}

export function isLocked(channelId: string) {
    return channelId in locks;
}

export function lockedCount() {
    return Object.keys(locks).length;
}

// Whether the channel counts as unlocked right now, given how long passwords
// should be remembered. 0 minutes means never remember (ask every selection).
export function isRemembered(channelId: string, rememberMinutes: number) {
    if (rememberMinutes <= 0) return false;
    const at = unlocked.get(channelId);
    return at !== undefined && Date.now() - at < rememberMinutes * 60_000;
}

export function markUnlocked(channelId: string) {
    unlocked.set(channelId, Date.now());
}

export async function setLock(channelId: string, password: string) {
    locks = { ...locks, [channelId]: await hashPassword(password) };
    unlocked.set(channelId, Date.now());
    persist();
    lockListeners.forEach(l => l());
}

export function removeLock(channelId: string) {
    const { [channelId]: _, ...rest } = locks;
    locks = rest;
    unlocked.delete(channelId);
    persist();
    lockListeners.forEach(l => l());
}

export async function verifyPassword(channelId: string, password: string) {
    const hash = locks[channelId];
    if (!hash) return true;
    return (await hashPassword(password)) === hash;
}

export function clearAllLocks() {
    locks = {};
    unlocked.clear();
    persist();
    lockListeners.forEach(l => l());
}

export function subscribeLocks(listener: () => void) {
    lockListeners.add(listener);
    return () => { lockListeners.delete(listener); };
}
