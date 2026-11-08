import { CloudOff } from 'lucide-react';
import { useOnline } from '@/state/online';
import { useNav } from '@/state/nav';

/** A small reminder at the top of every page but Home (which has its own offline screen). */
export function OfflinePill() {
  const online = useOnline((s) => s.online);
  const onHome = useNav((s) => s.stack[s.index]!.route.name === 'home');
  if (online || onHome) return null;
  return (
    <div className="glass pointer-events-none fixed top-[52px] left-1/2 z-40 flex -translate-x-1/2 animate-rise items-center gap-2 rounded-pill px-4 py-1.5 type-callout-emphasized text-secondary" role="status">
      <CloudOff size={14} /> Offline: your downloaded songs still play
    </div>
  );
}
