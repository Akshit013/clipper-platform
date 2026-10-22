import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "../clipping-tools.module.css";

export const dynamic = "force-dynamic";

const samples = [
  { file: "sample-clip-01.mp4", title: "Sample clip 1", duration: "16 seconds" },
  { file: "sample-clip-02.mp4", title: "Sample clip 2", duration: "16 seconds" },
  { file: "sample-clip-03.mp4", title: "Sample clip 3", duration: "20 seconds" },
  { file: "sample-clip-04.mp4", title: "Sample clip 4", duration: "22 seconds" },
  { file: "sample-clip-05.mp4", title: "Sample clip 5", duration: "11 seconds" },
];

export default async function SampleClipsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Creator resources</p>
        <h1 className={styles.title}>Sample clips</h1>
        <p className={styles.description}>Preview the supplied footage, download the source clip, and use it to practise your edits. Submit your finished Reel through the normal Submit Reel page.</p>
      </section>
      <p className={styles.note}>Use these clips only according to your team's campaign rules and any applicable creator/content permissions. These are source clips, not approved finished submissions.</p>
      <div className={styles.grid}>
        {samples.map((sample, index) => {
          const src = `/sample-clips/${sample.file}`;
          return (
            <article className={styles.card} key={sample.file}>
              <video className={styles.video} src={src} controls playsInline preload="metadata" aria-label={sample.title} />
              <h2 className={styles.cardTitle}>{sample.title}</h2>
              <p className={styles.muted}>{sample.duration} · Vertical video · Optimized MP4</p>
              <div className={styles.actions}>
                <a className={styles.primary} href={src} download={sample.file}>Download sample</a>
                <a className={styles.secondary} href={src} target="_blank" rel="noopener noreferrer">Open video</a>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
