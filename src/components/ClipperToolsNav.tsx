"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./ClipperToolsNav.module.css";

export default function ClipperToolsNav() {
  const pathname = usePathname() || "/";
  if (pathname === "/login" || pathname === "/signup" || pathname.startsWith("/auth/")) return null;
  const links = [
    { href: "/dashboard/streamers", label: "Approved streamers" },
    { href: "/dashboard/samples", label: "Sample clips" },
    { href: "/dashboard/how-to-edit", label: "How to edit clips" },
    { href: "/dashboard/bonuses", label: "Bonuses" },
  ];
  return (
    <nav className={styles.nav} aria-label="Clipper resources">
      <span className={styles.brand}>Clipper tools</span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? styles.active : styles.link}>
          {link.label}
        </Link>
      ))}
      {pathname.startsWith("/admin") && (
        <>
          <Link href="/admin/manage" className={pathname.startsWith("/admin/manage") ? styles.active : styles.link}>
            Admin operations
          </Link>
          <Link href="/admin/financials" className={pathname.startsWith("/admin/financials") ? styles.active : styles.link}>Financial ledger</Link>
        <Link href="/admin/bonuses" className={pathname.startsWith("/admin/bonuses") ? styles.active : styles.link}>
            Review bonus claims
          </Link>
        </>
      )}
    </nav>
  );
}
