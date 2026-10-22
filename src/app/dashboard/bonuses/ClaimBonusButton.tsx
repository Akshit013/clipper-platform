"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../clipping-tools.module.css";

export default function ClaimBonusButton({ milestone, amount }: { milestone: number; amount: number }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const router = useRouter();
  async function claim() {
    setBusy(true); setMessage(""); setIsError(false);
    try {
      const response = await fetch("/api/bonuses/claim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ milestone }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setIsError(true); setMessage(body.error || "Could not submit the bonus claim."); }
      else { setMessage("Bonus claim submitted! It is now awaiting admin review."); router.refresh(); }
    } catch { setIsError(true); setMessage("Network error. Please try again."); }
    finally { setBusy(false); }
  }
  return <div>
    <button type="button" className={styles.primary} disabled={busy} onClick={claim}>
      {busy ? "Submitting…" : `Claim ₹${amount}`}
    </button>
    {message && <p role="status" className={isError ? styles.error : styles.success}>{message}</p>}
  </div>;
}
