import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Folder, File as FileIcon, FolderPlus, Upload, Pencil, Trash2, HardDrive } from 'lucide-react';
import { PageHeader, type Crumb } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input, Label, FieldHint } from '@/components/ui/input';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatBytes, formatDateTime } from '@/lib/utils';
import type { StorageItem } from '@/lib/types';

export default function Storage() {
  const { folderId } = useParams();
  const currentFolderId = folderId ?? null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    storageItems, createFolder, uploadFile, renameStorageItem, deleteStorageItem,
    storageUsedBytes, storageQuotaBytes,
  } = useData();

  const ownerId = CURRENT_EMPLOYEE.id;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<StorageItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StorageItem | null>(null);

  const myItems = useMemo(() => storageItems.filter((i) => i.ownerId === ownerId), [storageItems, ownerId]);
  const currentFolder = currentFolderId ? myItems.find((i) => i.id === currentFolderId && i.type === 'folder') : null;

  const trail = useMemo(() => {
    const list: StorageItem[] = [];
    let cur = currentFolderId ? myItems.find((i) => i.id === currentFolderId) : undefined;
    while (cur) {
      list.unshift(cur);
      cur = cur.parentId ? myItems.find((i) => i.id === cur!.parentId) : undefined;
    }
    return list;
  }, [myItems, currentFolderId]);

  const children = useMemo(() => {
    const list = myItems.filter((i) => i.parentId === currentFolderId);
    const filtered = search.trim() ? list.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase())) : list;
    return [...filtered].sort((a, b) => (a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name)));
  }, [myItems, currentFolderId, search]);

  const childCount = (folder: StorageItem) => myItems.filter((i) => i.parentId === folder.id).length;

  const usedBytes = storageUsedBytes(ownerId);
  const quotaBytes = storageQuotaBytes(ownerId);
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const nearLimit = pct >= 90;

  if (folderId && !currentFolder) return <Navigate to="/storage" replace />;

  const crumbs: Crumb[] = [
    { label: 'My Storage', to: trail.length ? '/storage' : undefined },
    ...trail.map((f, i) => ({ label: f.name, to: i < trail.length - 1 ? `/storage/${f.id}` : undefined })),
  ];

  function submitNewFolder() {
    const name = folderName.trim();
    if (!name) return;
    createFolder(name, currentFolderId, ownerId);
    toast({ kind: 'success', title: 'Folder created', description: name });
    setFolderName('');
    setNewFolderOpen(false);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const result = uploadFile(f.name, f.size, currentFolderId, ownerId, f.type || undefined);
    if (result.ok) {
      toast({ kind: 'success', title: 'File uploaded', description: `${f.name} (${formatBytes(f.size)})` });
    } else {
      toast({ kind: 'error', title: 'Upload failed', description: result.error });
    }
  }

  function submitRename() {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) return;
    renameStorageItem(renameTarget.id, name);
    toast({ kind: 'success', title: `${renameTarget.type === 'folder' ? 'Folder' : 'File'} renamed` });
    setRenameTarget(null);
  }

  const columns: Column<StorageItem>[] = [
    {
      key: 'name', header: 'Name', sortable: true,
      render: (i) => (
        <span className="flex items-center gap-2 font-medium text-slate-800">
          {i.type === 'folder' ? <Folder className="h-4 w-4 shrink-0 text-brand-500" /> : <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />}
          {i.name}
        </span>
      ),
    },
    { key: 'type', header: 'Type', render: (i) => (i.type === 'folder' ? `Folder · ${childCount(i)} item${childCount(i) === 1 ? '' : 's'}` : `${i.name.includes('.') ? i.name.split('.').pop()!.toUpperCase() : 'FILE'} file`) },
    { key: 'sizeBytes', header: 'Size', sortable: true, render: (i) => (i.type === 'folder' ? '—' : formatBytes(i.sizeBytes)) },
    { key: 'modifiedAt', header: 'Modified', sortable: true, render: (i) => formatDateTime(i.modifiedAt), hideOnCard: true },
    {
      key: 'actions', header: '', className: 'text-right',
      render: (i) => (
        <span className="flex items-center justify-end gap-1">
          <Button
            variant="ghost" size="sm"
            onClick={(e) => { e.stopPropagation(); setRenameTarget(i); setRenameValue(i.name); }}
            aria-label={`Rename ${i.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(i); }}
            aria-label={`Delete ${i.name}`}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="My Storage"
        description="Personal files and folders. Only you can see what's here."
        crumbs={crumbs}
        actions={
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} aria-hidden="true" tabIndex={-1} />
            <Button variant="outline" onClick={() => setNewFolderOpen(true)}><FolderPlus className="h-4 w-4" /> New Folder</Button>
            <Button onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> Upload File</Button>
          </>
        }
      />

      <Card className="mb-5">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <HardDrive className="h-4 w-4 text-slate-400" /> Storage Used
            </span>
            <span className={`text-sm font-medium ${nearLimit ? 'text-red-600' : 'text-slate-600'}`}>
              {formatBytes(usedBytes)} of {formatBytes(quotaBytes)} used ({pct}%)
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full transition-all ${nearLimit ? 'bg-red-500' : 'bg-brand-600'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {nearLimit && <p className="mt-1.5 text-xs text-red-600">You're close to your storage limit. Delete unused files or ask an administrator to increase your quota.</p>}
        </CardContent>
      </Card>

      <Toolbar search={search} onSearchChange={setSearch} placeholder="Search files and folders…" />
      <DataTable
        columns={columns}
        rows={children}
        getRowId={(i) => i.id}
        cardTitle={(i) => i.name}
        onRowClick={(i) => (i.type === 'folder' ? navigate(`/storage/${i.id}`) : toast({ kind: 'info', title: 'Simulated file', description: 'No file content is stored in this prototype — only its name and size are recorded.' }))}
        emptyTitle="This folder is empty"
        emptyDescription="Create a folder or upload a file to get started."
      />

      <Dialog
        open={newFolderOpen}
        onClose={() => { setNewFolderOpen(false); setFolderName(''); }}
        title="New Folder"
        size="sm"
        footer={<Button onClick={submitNewFolder}>Create Folder</Button>}
      >
        <Label htmlFor="new-folder-name">Folder name</Label>
        <Input id="new-folder-name" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Scanned Documents" autoFocus onKeyDown={(e) => e.key === 'Enter' && submitNewFolder()} />
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title={`Rename ${renameTarget?.type === 'folder' ? 'Folder' : 'File'}`}
        size="sm"
        footer={<Button onClick={submitRename}>Save</Button>}
      >
        <Label htmlFor="rename-value">Name</Label>
        <Input id="rename-value" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && submitRename()} />
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteStorageItem(deleteTarget.id);
          toast({ kind: 'success', title: `${deleteTarget.type === 'folder' ? 'Folder' : 'File'} deleted` });
          setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.type === 'folder' ? 'Folder' : 'File'}`}
        description={deleteTarget?.type === 'folder' ? `This will permanently delete "${deleteTarget?.name}" and everything inside it.` : `This will permanently delete "${deleteTarget?.name}".`}
        confirmLabel="Delete"
        destructive
      />

      <FieldHint>Simulated uploads — file content is not stored in this prototype; only the file name and reported size are recorded.</FieldHint>
    </div>
  );
}
