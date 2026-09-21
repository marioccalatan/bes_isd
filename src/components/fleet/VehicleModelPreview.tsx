import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchFleetVehicleModel } from '@/lib/api';
import { VehicleModelViewer } from './VehicleModelViewer';

export function VehicleModelPreview({ token, modelId, name, file, onClose }: {
  token: string; modelId: string; name: string; file?: File; onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setUrl('');
    setError('');
    async function load() {
      try {
        if (file && !file.name.toLowerCase().endsWith('.glb')) throw new Error('Please choose a GLB (.glb) file to preview.');
        const blob = file ?? await fetchFleetVehicleModel(token, modelId);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load the 3D model.');
      }
    }
    void load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [token, modelId, file, attempt]);

  return <Dialog open onClose={onClose} title={`3D Preview — ${name}`} description={file ? `Previewing ${file.name} · Unsaved replacement` : 'Preview of the saved GLB model.'} size="xl" footer={<Button variant="outline" onClick={onClose}>Close Preview</Button>}>
    {error ? <div role="alert" className="p-8 text-center"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div>
      : url ? <VehicleModelViewer dataUrl={url} name={name} annotations={[]} onAnnotationsChange={() => {}} readOnly />
        : <p role="status" className="py-20 text-center text-sm text-slate-500">Loading GLB preview…</p>}
  </Dialog>;
}
