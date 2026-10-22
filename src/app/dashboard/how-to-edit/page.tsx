import Link from "next/link";
import styles from "./how-to-edit.module.css";

export const metadata = {
  title: "How to Edit Clips | ClipperPlatform",
  description: "Watch the editing walkthrough and learn how to make a vertical streamer clip.",
};

const steps = [
  {
    number: "01",
    title: "Start with your source footage",
    body: "Import the streamer's footage and the gameplay or reaction footage into your editor. Keep the original files unchanged so you can return to them if needed.",
  },
  {
    number: "02",
    title: "Set a vertical 9:16 canvas",
    body: "The recording shows a vertical project preview. Set the canvas to 9:16 so the finished clip is suited to Reels, Shorts, and TikTok. Check the preview edges before arranging the clips.",
  },
  {
    number: "03",
    title: "Put the facecam above the gameplay",
    body: "You arranged the streamer's facecam in the upper part of the frame and the mobile game footage in the lower part. Resize and crop each layer so both are clearly visible without covering important gameplay or the streamer's face.",
  },
  {
    number: "04",
    title: "Arrange and trim the timeline",
    body: "You worked with the clips and layered tracks on the timeline. Trim dead air, line up the footage, and make sure the facecam and gameplay stay in sync. Scrub through the whole clip to catch gaps, frozen frames, or sudden jumps.",
  },
  {
    number: "05",
    title: "Add an opening hook",
    body: "You opened the Text panel and added a text layer over the video. The preview shows placeholder wording (“Write random hook here”). Replace that placeholder with a short, real hook that matches the moment; never export the placeholder text by accident.",
  },
  {
    number: "06",
    title: "Preview, then export",
    body: "Watch the edit from beginning to end. Check that the hook is readable on a phone, the gameplay remains legible, and the audio is clear. Export in vertical 9:16 format, preferably 1080 × 1920 if your editor supports it and the source footage can support that resolution.",
  },
];

export default function HowToEditPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>CLIPPER ACADEMY</p>
        <h1>How to edit clips</h1>
        <p className={styles.intro}>
          Watch the walkthrough you shared, then follow the steps below to build a clean vertical clip with the streamer at the top and gameplay underneath.
        </p>
        <div className={styles.pills}>
          <span>Vertical 9:16</span><span>Facecam + gameplay</span><span>Text hook</span>
        </div>
      </header>

      <section className={styles.videoCard} aria-labelledby="walkthrough-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>YOUR WALKTHROUGH</p>
            <h2 id="walkthrough-title">Watch the editing video</h2>
          </div>
          <span className={styles.duration}>~3 min 15 sec</span>
        </div>
        <video className={styles.video} controls playsInline preload="metadata">
          <source src="/tutorials/clipping-editing-walkthrough.mp4" type="video/mp4" />
          Your browser does not support embedded videos. Please use a current version of Chrome, Safari, or Firefox.
        </video>
        <p className={styles.videoNote}>Tip: open the video full-screen if the editor controls are too small to read.</p>
      </section>

      <section className={styles.explainer} aria-labelledby="what-you-did-title">
        <p className={styles.eyebrow}>VIDEO BREAKDOWN</p>
        <h2 id="what-you-did-title">What you did in this recording</h2>
        <p>
          You used a desktop video editor to make a vertical gaming clip. You arranged a streamer facecam at the top and a mobile game recording below it, worked with the layered timeline, and added a text overlay for an opening hook. The video is a screen recording of the editing process, not the final exported Reel.
        </p>
      </section>

      <section className={styles.steps} aria-labelledby="steps-title">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>FOLLOW ALONG</p>
            <h2 id="steps-title">Step-by-step editing guide</h2>
          </div>
        </div>
        <div className={styles.stepGrid}>
          {steps.map((step) => (
            <article className={styles.step} key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.checklist} aria-labelledby="checklist-title">
        <p className={styles.eyebrow}>BEFORE YOU EXPORT</p>
        <h2 id="checklist-title">Final quality check</h2>
        <ul>
          <li>The final project is vertical 9:16 and fills the canvas.</li>
          <li>The facecam and gameplay are both visible and not accidentally cropped.</li>
          <li>The text hook is real, readable, and does not say “Write random hook here.”</li>
          <li>The footage is synced, with no blank frames or unnecessary dead air.</li>
          <li>You have permission to use the footage and follow the campaign's rules.</li>
          <li>You watched the exported file once before submitting it.</li>
        </ul>
      </section>

      <footer className={styles.footerActions}>
        <Link className={styles.primaryButton} href="/dashboard/submit">Submit a clip</Link>
        <Link className={styles.secondaryButton} href="/dashboard/samples">Browse sample clips</Link>
      </footer>
    </main>
  );
}
