/*
 * Acord, a fork of Equicord/Vencord
 * Build notification script — posts a Discord embed on successful release builds.
 *
 * Required environment variables:
 *   WEBHOOK_URL        — Discord webhook URL (stored as a GitHub secret)
 *   GITHUB_SHA         — Full commit SHA (set by GitHub Actions)
 *   GITHUB_REPOSITORY  — "owner/repo" (set by GitHub Actions)
 *   GITHUB_REF_NAME    — Branch / tag name (set by GitHub Actions)
 *   GITHUB_ACTOR       — Username who triggered the run (set by GitHub Actions)
 *   GITHUB_SERVER_URL  — e.g. https://github.com (set by GitHub Actions)
 *   CHANGED_FILES      — Number of files changed in this commit (passed by workflow step)
 *   COMMIT_MESSAGE     — First line of the commit message (passed by workflow step)
 *   COMMIT_AUTHOR      — Commit author name (passed by workflow step)
 */

// @ts-check

const {
    WEBHOOK_URL,
    GITHUB_SHA,
    GITHUB_REPOSITORY,
    GITHUB_REF_NAME,
    GITHUB_ACTOR,
    GITHUB_SERVER_URL = "https://github.com",
    CHANGED_FILES = "?",
    COMMIT_MESSAGE = "No message",
    COMMIT_AUTHOR = GITHUB_ACTOR ?? "Unknown",
} = process.env;

if (!WEBHOOK_URL) {
    console.error("[notifyBuild] WEBHOOK_URL is not set, skipping notification.");
    process.exit(0);
}

const shortSha = (GITHUB_SHA ?? "").slice(0, 7);
const repoUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}`;
const commitUrl = `${repoUrl}/commit/${GITHUB_SHA}`;
const releaseUrl = `${repoUrl}/releases/tag/latest`;

const embed = {
    title: "New Acord Build Released",
    url: releaseUrl,
    color: 0x5865f2,
    fields: [
        {
            name: "Commit",
            value: `[\`${shortSha}\`](${commitUrl}) — ${COMMIT_MESSAGE}`,
            inline: false,
        },
        {
            name: "Author",
            value: COMMIT_AUTHOR,
            inline: true,
        },
        {
            name: "Branch",
            value: GITHUB_REF_NAME ?? "unknown",
            inline: true,
        },
        {
            name: "Changed Files",
            value: String(CHANGED_FILES),
            inline: true,
        },
        {
            name: "Links",
            value: `[Release](${releaseUrl}) · [Repository](${repoUrl})`,
            inline: false,
        },
    ],
    timestamp: new Date().toISOString(),
    footer: {
        text: "Acord CI",
    },
};

const body = JSON.stringify({
    username: "Acord Builds",
    avatar_url: "https://raw.githubusercontent.com/acord-standalone/acord-client/main/browser/icon.png",
    embeds: [embed],
});

try {
    const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`[notifyBuild] Webhook returned ${res.status}: ${text}`);
        process.exit(1);
    }

    console.log("[notifyBuild] Notification sent successfully.");
} catch (err) {
    console.error("[notifyBuild] Failed to send notification:", err);
    process.exit(1);
}
