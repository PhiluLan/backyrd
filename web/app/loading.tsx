export default function Loading() {
  return (
    <div className="b-container b-main">
      <div
        className="b-skeleton"
        style={{ height: "min(70vh,720px)", borderRadius: 30 }}
      />
    </div>
  );
}
