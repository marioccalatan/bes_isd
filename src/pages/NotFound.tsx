import { useNavigate } from 'react-router-dom';
import { CompassIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <CompassIcon className="h-8 w-8" />
      </div>
      <h1 className="text-lg font-bold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-500">The page you're looking for doesn't exist or may have been moved.</p>
      <Button onClick={() => navigate('/home')}>Return to Enterprise Home</Button>
    </div>
  );
}
