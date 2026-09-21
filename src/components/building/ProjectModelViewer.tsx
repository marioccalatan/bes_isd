import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fetchBfmProjectFileBlob, type BfmProjectResource } from '@/lib/api';
import { Button } from '@/components/ui/button';

function disposeModel(model: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
  }
}

export default function ProjectModelViewer({ resource, token }: { resource: BfmProjectResource; token: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<(() => void) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const abort = new AbortController();
    setLoading(true); setError('');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('3D rendering is unavailable in this browser. You can still download the GLB file.'); setLoading(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.setAttribute('aria-label', `3D model: ${resource.name}`);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e2e8f0');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(4, 6, 5); scene.add(light);
    const fill = new THREE.DirectionalLight(0xffffff, 2);
    fill.position.set(-4, 2, -3); scene.add(fill);
    let model: THREE.Object3D | undefined;
    let radius = 1;
    const fit = () => {
      const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
      const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
      const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.15;
      camera.near = radius / 1000; camera.far = Math.max(distance * 20, radius * 100);
      camera.position.copy(new THREE.Vector3(1, 0.65, 1).normalize().multiplyScalar(distance));
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0); controls.minDistance = radius * 0.05; controls.maxDistance = distance * 10;
      controls.update();
    };
    resetRef.current = fit;
    const resize = () => {
      const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const manager = new THREE.LoadingManager();
    // Project uploads are standalone GLBs; embedded textures remain supported.
    manager.setURLModifier((url) => {
      if (/^(blob:|data:)/i.test(url)) return url;
      throw new Error('This model references external files. Export a self-contained GLB with embedded textures.');
    });
    const loader = new GLTFLoader(manager);
    void (async () => {
      try {
        const blob = await fetchBfmProjectFileBlob(token, resource, abort.signal);
        const data = await blob.arrayBuffer();
        if (abort.signal.aborted) return;
        const gltf = await loader.parseAsync(data, '');
        if (abort.signal.aborted) { disposeModel(gltf.scene); return; }
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) throw new Error('This GLB contains no visible geometry.');
        const center = box.getCenter(new THREE.Vector3());
        radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.0001);
        if (!Number.isFinite(radius)) throw new Error('This GLB has invalid model dimensions.');
        model.position.sub(center); scene.add(model); fit(); setLoading(false);
      } catch (reason) {
        if (!abort.signal.aborted) {
          setError(reason instanceof Error ? `Unable to display this GLB. ${reason.message}` : 'Unable to display this GLB. The file may be damaged or use unsupported compression.');
          setLoading(false);
        }
      }
    })();
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    return () => {
      abort.abort(); resetRef.current = null; observer.disconnect(); controls.dispose();
      renderer.setAnimationLoop(null); if (model) disposeModel(model);
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [resource, token]);

  return <div className="flex h-full min-h-0 w-full flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Drag to rotate · Scroll to zoom · Right-drag to pan</p><Button variant="outline" disabled={loading || Boolean(error)} onClick={() => resetRef.current?.()}>Reset view</Button></div>
    <div className="relative min-h-[240px] flex-1 overflow-hidden rounded-lg border border-slate-200">
      <div ref={hostRef} className="absolute inset-0" />
      {loading && <div role="status" className="absolute inset-0 grid place-items-center bg-surface/80 text-sm">Loading 3D model…</div>}
      {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-surface p-8 text-center text-sm text-red-600">{error}</div>}
    </div>
  </div>;
}
