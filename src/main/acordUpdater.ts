/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Acord host auto-updater.
 *
 * On every launch this checks GitHub for a newer build (i.e. the build hash
 * changed), and if so downloads the Acord client installer and re-installs the
 * current Discord branch via `AcordClientInstaller.exe --install <platform>`.
 *
 * The installer rarely changes, so it is cached on disk and only re-downloaded
 * when its ETag changes.
 *
 * In dev mode the patched asar lives outside a real Discord install, so there
 * is no `build_info.json` next to us — that (and the IS_DEV flag) makes us skip.
 */

import { fetchJson } from "@main/utils/http";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { execFile } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";

import gitRemote from "~git-remote";

import { DATA_DIR } from "./utils/constants";

const log = (...args: unknown[]) => console.log("[Acord:Updater]", ...args);
const error = (...args: unknown[]) => console.error("[Acord:Updater]", ...args);

const ACORD_REPO = gitRemote || "acord-standalone/acord-client";
const INSTALLER_EXE_URL =
    "https://github.com/acord-standalone/acord-client-installer/releases/download/latest/AcordClientInstaller.exe";

const INSTALLER_DIR = join(DATA_DIR, "installer");
const INSTALLER_PATH = join(INSTALLER_DIR, "AcordClientInstaller.exe");
const ETAG_PATH = join(INSTALLER_DIR, "etag.txt");
// Tracks the build we last installed, so we don't re-install an unchanged one.
const BUILD_MARKER_PATH = join(INSTALLER_DIR, "last-build.txt");

type ReleaseChannel = "stable" | "ptb" | "canary";
const VALID_CHANNELS: ReleaseChannel[] = ["stable", "ptb", "canary"];

/**
 * Read the Discord branch we're injected into from the host's build_info.json.
 *
 * `process.resourcesPath` points at the running Discord version's `resources/`
 * dir, where Discord drops `build_info.json`. If it's missing or the channel is
 * unknown we're not inside a real Discord install (i.e. dev mode), so bail.
 */
function getReleaseChannel(): ReleaseChannel | null {
    try {
        const infoPath = join(process.resourcesPath, "build_info.json");
        if (!existsSync(infoPath)) return null;

        const { releaseChannel } = JSON.parse(readFileSync(infoPath, "utf-8"));
        return VALID_CHANNELS.includes(releaseChannel) ? releaseChannel : null;
    } catch (err) {
        error("Failed to read build_info.json", err);
        return null;
    }
}

interface GithubRelease {
    assets: { name: string; updated_at: string; }[];
}

/**
 * Identify the currently released build by the `updated_at` timestamp of the
 * `desktop.asar` release asset. CI re-uploads it on every push, so a changed
 * timestamp means a changed build — that's our "build hash".
 */
async function getLatestBuildId(): Promise<string | null> {
    const data = await fetchJson<GithubRelease>(
        `https://api.github.com/repos/${ACORD_REPO}/releases/latest`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": VENCORD_USER_AGENT
            }
        }
    );

    return data?.assets?.find(a => a.name === "desktop.asar")?.updated_at ?? null;
}

/** The build id we last installed, or null if we've never installed one. */
function getInstalledBuildId(): string | null {
    return existsSync(BUILD_MARKER_PATH) ? readFileSync(BUILD_MARKER_PATH, "utf-8").trim() : null;
}

function setInstalledBuildId(id: string) {
    writeFileSync(BUILD_MARKER_PATH, id);
}

/**
 * Make sure the installer exe is on disk, re-downloading only when GitHub
 * reports a new ETag. Returns the path to the cached exe.
 */
async function ensureInstaller(): Promise<string> {
    mkdirSync(INSTALLER_DIR, { recursive: true });

    const cachedEtag = existsSync(INSTALLER_PATH) && existsSync(ETAG_PATH)
        ? readFileSync(ETAG_PATH, "utf-8")
        : null;

    const res = await fetch(INSTALLER_EXE_URL, {
        headers: {
            "User-Agent": VENCORD_USER_AGENT,
            ...(cachedEtag ? { "If-None-Match": cachedEtag } : {})
        }
    });

    if (res.status === 304 && existsSync(INSTALLER_PATH)) {
        log("Installer is up to date, using cached copy");
        return INSTALLER_PATH;
    }
    if (!res.ok || !res.body)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    // Download to a temp file first so an interrupted download can't leave a
    // corrupt exe in place of a working one.
    const tmpPath = INSTALLER_PATH + ".tmp";
    // @ts-expect-error web stream -> node stream
    await finished(Readable.fromWeb(res.body).pipe(createWriteStream(tmpPath)));
    renameSync(tmpPath, INSTALLER_PATH);

    const etag = res.headers.get("etag");
    if (etag) writeFileSync(ETAG_PATH, etag);

    log("Downloaded installer");
    return INSTALLER_PATH;
}

/** Run `AcordClientInstaller.exe --install <platform>`, detached, fire-and-forget. */
function runInstaller(exePath: string, channel: ReleaseChannel) {
    log(`Running installer: --install ${channel}`);

    const child = execFile(exePath, ["--install", channel], { windowsHide: true }, err => {
        if (err) error("Installer failed", err);
        else log("Installer finished");
    });
    child.unref();
}

let started = false;

export async function checkForAcordUpdate() {
    // Installer is Windows-only; nothing to do elsewhere.
    if (process.platform !== "win32") return;
    if (IS_DEV) return;
    if (started) return;
    started = true;

    try {
        const channel = getReleaseChannel();
        if (!channel) {
            log("Not running inside a Discord install (dev mode?), skipping update check");
            return;
        }

        const latestBuild = await getLatestBuildId();
        if (!latestBuild) {
            log("Could not determine latest build, skipping");
            return;
        }
        if (latestBuild === getInstalledBuildId()) {
            log("Already up to date");
            return;
        }

        log("Update available, fetching installer");
        const exePath = await ensureInstaller();
        runInstaller(exePath, channel);

        // Remember what we just installed so we don't reinstall it next launch.
        setInstalledBuildId(latestBuild);
    } catch (err) {
        error("Auto-update check failed", err);
    }
}
