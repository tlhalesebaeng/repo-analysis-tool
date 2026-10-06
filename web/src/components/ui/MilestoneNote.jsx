/** Callout describing what lands in a future milestone. */
export default function MilestoneNote({ note }) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {note}
    </p>
  );
}
