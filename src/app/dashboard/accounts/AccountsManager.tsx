"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "../portal.module.css";

type InstagramAccount = {
  id: string;
  user_id: string;
  handle: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
};

export default function AccountsManager({ initialAccounts, initialError }: {
  initialAccounts: InstagramAccount[];
  initialError: string | null;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(
    initialError ? { kind: "error", text: `Instagram accounts are not ready yet: ${initialError}. Apply the SQL migration included with this update first.` } : null
  );

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/instagram-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, displayName: displayName.trim() || null }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setAccounts((previous) => [body.account as InstagramAccount, ...previous.filter((a) => a.id !== body.account.id)]);
      setHandle(""); setDisplayName("");
      setNotice({ kind: "success", text: `@${body.account.handle} is now available for clip submissions.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not add this account." });
    } finally { setBusy(false); }
  }

  async function deactivateAccount(account: InstagramAccount) {
    if (!window.confirm(`Remove @${account.handle} from new submissions? Existing clips will keep their account history.`)) return;
    setBusyId(account.id); setNotice(null);
    try {
      const response = await fetch(`/api/instagram-accounts/${account.id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setAccounts((previous) => previous.map((a) => a.id === account.id ? { ...a, is_active: false } : a));
      setNotice({ kind: "success", text: `@${account.handle} was removed from new submissions. Existing clip history is preserved.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not remove this account." });
    } finally { setBusyId(null); }
  }

  const activeAccounts = accounts.filter((account) => account.is_active);

  return <>
    {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : styles.noticeSuccess}`} role="status">{notice.text}</div>}
    <div className={styles.grid}>
      <section className={styles.panel}>
        <h2>Add an Instagram account</h2>
        <p>Add up to 10 accounts to organize your Reels. When submitting a clip, select which account published it.</p>
        <form className={styles.form} onSubmit={addAccount}>
          <label className={styles.label}>Instagram username or profile URL
            <input className={styles.input} required maxLength={200} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@yourcreatorname or instagram.com/yourcreatorname" autoComplete="off" />
          </label>
          <label className={styles.label}>Label (optional)
            <input className={styles.input} maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Main page, Gaming page" />
          </label>
          <button className={styles.primaryButton} type="submit" disabled={busy || Boolean(initialError)}>{busy ? "Adding account…" : "+ Add Instagram account"}</button>
        </form>
        <div className={styles.warning} style={{ marginTop: 18 }}>
          These handles are self-reported. Adding a username does not prove ownership or connect Instagram Insights. Official account verification and automatic metrics require a supported Meta/Instagram OAuth integration.
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Your accounts <span style={{ color: "#7fa9db", fontSize: 13, fontWeight: 600 }}>({activeAccounts.length}/10 active)</span></h2>
        <p>Account selection is saved with each new Reel you submit.</p>
        <div className={styles.accountList}>
          {accounts.length === 0 && <div className={styles.empty}>You haven't added an Instagram account yet.<br />Add one to submit a Reel.</div>}
          {accounts.map((account) => <div className={styles.accountCard} key={account.id}>
            <div className={styles.avatar}>@</div>
            <div className={styles.accountInfo}>
              <strong>@{account.handle}</strong>
              {account.display_name && <small>{account.display_name}</small>}
              <small><a href={`https://www.instagram.com/${account.handle}/`} target="_blank" rel="noreferrer" style={{ color: "#69aefa" }}>Open Instagram profile ↗</a></small>
              <span className={`${styles.status} ${account.is_active ? "" : styles.statusInactive}`}>{account.is_active ? "Active for submissions" : "Removed from new submissions"}</span>
            </div>
            {account.is_active && <button className={styles.dangerButton} type="button" disabled={busyId === account.id} onClick={() => void deactivateAccount(account)}>{busyId === account.id ? "Removing…" : "Remove"}</button>}
          </div>)}
        </div>
        <div className={styles.inlineLinks}>
          <Link className={styles.secondaryButton} href="/dashboard/submit">Submit a Reel →</Link>
          <Link className={styles.secondaryButton} href="/dashboard">Back to dashboard</Link>
        </div>
      </section>
    </div>
  </>;
}
