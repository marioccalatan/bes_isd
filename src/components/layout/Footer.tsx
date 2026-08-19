import { useUI } from '@/context/UIContext';

export function Footer() {
  const { setAboutOpen } = useUI();
  return (
    <footer className="mt-auto border-t border-slate-200 bg-surface px-4 py-3 text-center text-xs text-slate-400 no-print">
      <p>
        BES Enterprise System ·{' '}
        <button onClick={() => setAboutOpen(true)} className="font-medium text-brand-600 hover:underline">
          About BES
        </button>
      </p>
    </footer>
  );
}
