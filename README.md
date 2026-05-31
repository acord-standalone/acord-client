# [<img src="./browser/icon.png" width="40" align="left" alt="Acord">](https://github.com/acord-standalone/acord-client) Acord

[![Tests](https://github.com/acord-standalone/acord-client/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/acord-standalone/acord-client/actions/workflows/build.yml)

Acord is a fork of [Equicord](https://github.com/Equicord/Equicord), which itself is a fork of [Vencord](https://github.com/Vendicated/Vencord).

## Installing Acord Devbuild

### Dependencies

[Git](https://git-scm.com/download) and [Node.JS LTS](https://nodejs.dev/en/) are required.

Install `pnpm`:

> :exclamation: This next command may need to be run as admin/root depending on your system, and you may need to close and reopen your terminal for pnpm to be in your PATH.

```shell
npm i -g pnpm
```

> :exclamation: **IMPORTANT** Make sure you aren't using an admin/root terminal from here onwards. It **will** mess up your Discord/Acord instance and you **will** most likely have to reinstall.

Clone Acord:

```shell
git clone https://github.com/acord-standalone/acord-client
cd acord-client
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build Acord:

```shell
pnpm build
```

Inject Acord into your desktop client:

```shell
pnpm inject
```

Build Acord for web:

```shell
pnpm buildWeb
```

After building Acord's web extension, locate the appropriate ZIP file in the `dist` directory and follow your browser's guide for installing custom extensions, if supported.

Note: Firefox extension zip requires Firefox for developers

## Credits

Thank you to [Equicord](https://github.com/Equicord/Equicord) for the base this project is built upon, and [Vendicated](https://github.com/Vendicated) for creating [Vencord](https://github.com/Vendicated/Vencord).

## Disclaimer

Discord is trademark of Discord Inc., and solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.

<details>
<summary>Using Acord violates Discord's terms of service</summary>

Client modifications are against Discord's Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods! So you should generally be fine if you don't use plugins that implement abusive behaviour. But no worries, all inbuilt plugins are safe to use!

Regardless, if your account is essential to you and getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to Acord), just to be safe.

Additionally, make sure not to post screenshots with Acord in a server where you might get banned for it.

</details>