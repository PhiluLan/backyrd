import { EngineeringPanel } from "@/components/founder/EngineeringPanel";

export default function FounderEngineeringPage() {
  return (
    <div className="fcc-page">
      <header className="fcc-pageHeader">
        <div><span className="fcc-wordmark">BACKYRD · FOUNDER</span><h1>Engineering</h1><p>Live main, merges, pull requests, CI and mergeability. A merged PR is engineering evidence—not launch verification.</p></div>
        <div className="fcc-refreshNote"><span /> Refreshes every 45 seconds</div>
      </header>
      <EngineeringPanel />
      <section className="fcc-note">
        <strong>Engineering → Launch rule</strong>
        <p>Merged work can move a gate to <b>VERIFY</b>. Only acceptance evidence and an explicit verification decision can move it to <b>VERIFIED</b>.</p>
      </section>
    </div>
  );
}
