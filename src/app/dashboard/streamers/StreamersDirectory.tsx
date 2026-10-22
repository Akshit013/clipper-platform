"use client";

import { useMemo, useState } from "react";
import { APPROVED_STREAMERS } from "@/lib/approved-streamers";
import styles from "../clipping-tools.module.css";

export default function StreamersDirectory() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return APPROVED_STREAMERS;
    return APPROVED_STREAMERS.filter((streamer) => streamer.username.toLowerCase().includes(q));
  }, [query]);
  return (
    <>
      <input aria-label="Search streamers" className={styles.search} placeholder="Search streamer username…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <p className={styles.count}>Showing {filtered.length} of {APPROVED_STREAMERS.length} approved streamer names</p>
      <div className={styles.grid}>
        {filtered.map((streamer) => (
          <article className={styles.card} key={streamer.username}>
            <h2 className={styles.cardTitle}>{streamer.username}</h2>
            <p className={styles.muted}>Approved streamer · Kick link needs verification</p>
            <div className={styles.actions}>
              <a className={styles.kickLink} href={streamer.kickUrl} target="_blank" rel="noopener noreferrer">Open Kick channel ↗</a>
              <button className={styles.secondary} type="button" onClick={() => navigator.clipboard.writeText(streamer.kickUrl)}>Copy link</button>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <p className={styles.note}>No streamers match that search.</p>}
    </>
  );
}
