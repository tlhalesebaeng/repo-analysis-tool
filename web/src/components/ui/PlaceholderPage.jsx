import PageHeader from './PageHeader.jsx';
import MilestoneNote from './MilestoneNote.jsx';

/** Standard scaffold for pages whose real content lands in a later milestone. */
export default function PlaceholderPage({ title, note, children }) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <MilestoneNote note={note} />
      {children}
    </div>
  );
}
