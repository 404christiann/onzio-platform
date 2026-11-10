"use client";

import { Menu } from "@base-ui/react/menu";
import { useEffect, useState } from "react";
import { useAdminTheme } from "@/components/admin/AdminThemeProvider";
import {
  IconDarkTheme,
  IconExternalLink,
  IconLightTheme,
  IconSignOut,
} from "@/components/admin/icons";
import styles from "./frame.module.css";

// ADMIN-RE-24: the account menu on the avatar (Base UI Menu). On a laptop it
// sits at the foot of the sidebar with the email and role beside the avatar;
// on a phone it is the avatar in the top bar. The popup grows from its
// trigger (var(--transform-origin)), 150ms in and 100ms out.

export function AccountMenu({
  email,
  role,
  onSignOut,
  placement,
}: {
  email: string | null;
  role: "owner" | "admin" | null;
  onSignOut: () => Promise<void>;
  placement: "side" | "top";
}) {
  const { theme, toggleTheme } = useAdminTheme();
  // Popups render inside the admin wrapper so the admin's theme colors apply.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".admin-portal"));
  }, []);

  const roleLabel = role === "owner" ? "Owner" : role === "admin" ? "Helper" : "Member";
  const who = email ?? "Your account";
  const initial = (email?.trim()[0] ?? "A").toUpperCase();

  return (
    <Menu.Root>
      <Menu.Trigger
        className={`${styles.press} ${placement === "side" ? styles.me : styles.avatarButton}`}
        aria-label={`Your account, ${who}, ${roleLabel}`}
        data-testid={placement === "side" ? "admin-account-side" : "admin-account-top"}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        {placement === "side" ? (
          <span className={styles.clubText}>
            <b className={styles.ellipsis}>{who}</b>
            <small>{roleLabel}</small>
          </span>
        ) : null}
      </Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Positioner
          side={placement === "side" ? "top" : "bottom"}
          align={placement === "side" ? "start" : "end"}
          sideOffset={8}
          className={styles.menuPositioner}
        >
          <Menu.Popup className={styles.menu}>
            <div className={styles.menuHead}>
              <span className={styles.ellipsis}>{who}</span>
              <small>{roleLabel}</small>
            </div>
            <Menu.LinkItem
              className={styles.menuItem}
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              closeOnClick
            >
              <IconExternalLink aria-hidden="true" />
              View website
            </Menu.LinkItem>
            <Menu.Item className={styles.menuItem} onClick={toggleTheme} closeOnClick={false}>
              {theme === "dark" ? <IconLightTheme aria-hidden="true" /> : <IconDarkTheme aria-hidden="true" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </Menu.Item>
            <div className={styles.menuRule} role="separator" />
            <Menu.Item className={styles.menuItem} onClick={() => void onSignOut()}>
              <IconSignOut aria-hidden="true" />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
