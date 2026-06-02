/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import type { ComponentPropsWithoutRef, PropsWithChildren } from "react";

const cl = classNameFactory("vc-vi-");

type IconProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & { size?: number; };

function Icon({ size = 16, className, children, ...rest }: PropsWithChildren<IconProps>) {
    return (
        <div {...rest} className={classes(cl("speaker"), className)}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
                {children}
            </svg>
        </div>
    );
}

export function SpeakerIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3ZM15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z" />
            <path d="M15.16 16.51c-.57.28-1.16-.2-1.16-.83v-.14c0-.43.28-.8.63-1.02a3 3 0 0 0 0-5.04c-.35-.23-.63-.6-.63-1.02v-.14c0-.63.59-1.1 1.16-.83a5 5 0 0 1 0 9.02Z" />
        </Icon>
    );
}

export function MutedIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="m2.7 22.7 20-20a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4ZM10.8 17.32c-.21.21-.1.58.2.62V20H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.06A8 8 0 0 0 20 10a1 1 0 0 0-2 0c0 1.45-.52 2.79-1.38 3.83l-.02.02A5.99 5.99 0 0 1 12.32 16a.52.52 0 0 0-.34.15l-1.18 1.18ZM15.36 4.52c.15-.15.19-.38.08-.56A4 4 0 0 0 8 6v4c0 .3.03.58.1.86.07.34.49.43.74.18l6.52-6.52ZM5.06 13.98c.16.28.53.31.75.09l.75-.75c.16-.16.19-.4.08-.61A5.97 5.97 0 0 1 6 10a1 1 0 0 0-2 0c0 1.45.39 2.81 1.06 3.98Z" />
        </Icon>
    );
}

export function DeafIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M22.7 2.7a1 1 0 0 0-1.4-1.4l-20 20a1 1 0 1 0 1.4 1.4l20-20ZM17.06 2.94a.48.48 0 0 0-.11-.77A11 11 0 0 0 2.18 16.94c.14.3.53.35.76.12l3.2-3.2c.25-.25.15-.68-.2-.76a5 5 0 0 0-1.02-.1H3.05a9 9 0 0 1 12.66-9.2c.2.09.44.05.59-.1l.76-.76ZM20.2 8.28a.52.52 0 0 1 .1-.58l.76-.76a.48.48 0 0 1 .77.11 11 11 0 0 1-4.5 14.57c-1.27.71-2.73.23-3.55-.74a3.1 3.1 0 0 1-.17-3.78l1.38-1.97a5 5 0 0 1 4.1-2.13h1.86a9.1 9.1 0 0 0-.75-4.72ZM10.1 17.9c.25-.25.65-.18.74.14a3.1 3.1 0 0 1-.62 2.84 2.85 2.85 0 0 1-3.55.74.16.16 0 0 1-.04-.25l3.48-3.48Z" />
        </Icon>
    );
}

export function VideoIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M4 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H4ZM22.79 6.16c-.27-.13-.59-.1-.83.07L18 9v6l3.96 2.77c.24.17.56.2.83.07.27-.14.21-.4.21-.7V6.86c0-.3.06-.56-.21-.7Z" />
        </Icon>
    );
}

export function StreamIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M2 4.5C2 3.4 2.9 2.5 4 2.5h16c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2h-5l.4 2H17a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h1.6l.4-2H4c-1.1 0-2-.9-2-2v-11Zm8.4 3.3c-.3-.2-.7 0-.7.4v4.6c0 .4.4.6.7.4l3.5-2.3c.3-.2.3-.6 0-.8l-3.5-2.3Z" />
        </Icon>
    );
}

export function LogIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5c0 .27.1.52.3.7l3 3a1 1 0 0 0 1.4-1.4L13 11.6V7Z" />
        </Icon>
    );
}

export function GoToIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M13 4a1 1 0 1 0 0 2h4.59l-8.3 8.29a1 1 0 0 0 1.42 1.42L19 7.4V12a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1h-7Z" />
            <path d="M5 7a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5a1 1 0 1 0-2 0v4H6V9h4a1 1 0 1 0 0-2H5Z" />
        </Icon>
    );
}

export function JoinIcon(props: IconProps) {
    return (
        <Icon {...props}>
            <path d="M10 4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4a1 1 0 1 0 0-2H5V5h4a1 1 0 0 0 1-1Z" />
            <path d="M14.3 7.3a1 1 0 0 0 0 1.4L16.58 11H10a1 1 0 1 0 0 2h6.59l-2.3 2.3a1 1 0 0 0 1.42 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.42 0Z" />
        </Icon>
    );
}
