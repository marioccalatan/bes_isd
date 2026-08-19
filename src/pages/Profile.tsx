import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Award, Building2, CalendarDays, Camera, Edit3, Mail, MapPin, Phone, Save, Upload, UserRound, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import type { ProfileDetailsInput } from '@/lib/api';
import { initials, formatDate } from '@/lib/utils';

const POSITION_OPTIONS = ['Manager', 'Officer', 'Rank and File'];

export default function Profile() {
  const { user, saveProfilePhoto, saveProfileDetails } = useAuth();
  const { departments } = useData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileDetailsInput>(() => emptyProfileForm());

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      username: user.username ?? '',
      email: user.email ?? '',
      firstName: user.firstName ?? '',
      middleName: user.middleName ?? '',
      lastName: user.lastName ?? '',
      suffix: user.suffix ?? '',
      position: user.position ?? '',
      designation: user.designation ?? '',
      departmentCode: user.departmentCode ?? '',
      unitName: user.unitName ?? '',
      mobileNo: user.mobileNo ?? '',
      dateHired: toDateInputValue(user.dateHired),
      workLocation: user.workLocation ?? '',
    });
  }, [user]);

  const dept = departments.find((d) => d.id === user?.departmentCode);
  const departmentText = dept
    ? `${dept.name}${user?.unitName ? ` (${user.unitName})` : ''}`
    : user?.departmentCode ?? '—';
  const roleBadges = user?.roles?.length ? user.roles : [user?.role ?? 'Employee'];

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your profile photo.');
      return;
    }
    if (file.size > 1_000_000) {
      setError('Use an image under 1 MB.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Unable to read this image.'));
      reader.readAsDataURL(file);
    });
    await savePhoto(dataUrl);
    event.target.value = '';
  }

  async function savePhoto(profilePhoto: string) {
    setSavingPhoto(true);
    setError('');
    setNotice('');
    const result = await saveProfilePhoto(profilePhoto);
    setSavingPhoto(false);
    if (result.ok) setNotice(profilePhoto ? 'Profile photo updated.' : 'Profile photo removed.');
    else setError(result.error ?? 'Unable to update profile photo.');
  }

  function updateField<K extends keyof ProfileDetailsInput>(field: K, value: ProfileDetailsInput[K]) {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function cancelEdit() {
    if (user) {
      setProfileForm({
        username: user.username ?? '',
        email: user.email ?? '',
        firstName: user.firstName ?? '',
        middleName: user.middleName ?? '',
        lastName: user.lastName ?? '',
        suffix: user.suffix ?? '',
        position: user.position ?? '',
        designation: user.designation ?? '',
        departmentCode: user.departmentCode ?? '',
        unitName: user.unitName ?? '',
        mobileNo: user.mobileNo ?? '',
        dateHired: toDateInputValue(user.dateHired),
        workLocation: user.workLocation ?? '',
      });
    }
    setEditing(false);
    setError('');
    setNotice('');
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDetails(true);
    setError('');
    setNotice('');
    const result = await saveProfileDetails(profileForm);
    setSavingDetails(false);
    if (result.ok) {
      setEditing(false);
      setNotice('Profile details updated.');
    } else {
      setError(result.error ?? 'Unable to update your profile.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Profile" crumbs={[{ label: 'My Profile' }]} />
      <Card>
        <CardContent className="pt-5">
          <div className="border-b border-slate-100 pb-5">
            <div className="grid gap-5 sm:grid-cols-[128px_1fr]">
              <div className="flex flex-col items-center gap-3">
                <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-2xl font-bold text-brand-700 ring-4 ring-brand-50">
                {user?.profilePhoto ? <img src={user.profilePhoto} alt="" className="h-full w-full object-cover" /> : initials(user?.name ?? 'User')}
                </span>
                <div className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={savingPhoto} className="w-full">
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                  {user?.profilePhoto && (
                    <Button type="button" variant="outline" size="sm" onClick={() => savePhoto('')} disabled={savingPhoto} className="w-full">
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
              <div className="min-w-0 self-center pb-2 text-center sm:text-left">
                <p className="text-xl font-bold text-slate-900">{user?.name ?? '—'}</p>
                <p className="mt-1 text-sm text-slate-500">{user?.designation || user?.position || '—'}</p>
                {user?.designation && user?.position && <p className="mt-0.5 text-xs text-slate-400">{user.position}</p>}
                <p className="mt-1 text-xs text-slate-400">{user?.employeeNo ?? '—'}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  {roleBadges.map((role) => <Badge key={role} className="border-gold-200 bg-gold-50 text-gold-800">{role}</Badge>)}
                  <Badge className="border-green-200 bg-green-50 text-green-700">{user?.accountStatus ?? 'ACTIVE'}</Badge>
                </div>
              </div>
            </div>
          </div>

          {notice && <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
          {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <form onSubmit={handleDetailsSubmit} className="py-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Personal and employee details</h2>
                <p className="text-xs text-slate-500">You can maintain your own profile details here. Roles and access remain controlled by Administration.</p>
              </div>
              {editing ? (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={savingDetails}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={savingDetails}>
                    <Save className="h-3.5 w-3.5" /> {savingDetails ? 'Saving…' : 'Save Details'}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(true); setError(''); setNotice(''); }}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit Details
                </Button>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Username" required value={profileForm.username ?? ''} onChange={(value) => updateField('username', value)} />
                <Field label="Email" type="email" required value={profileForm.email ?? ''} onChange={(value) => updateField('email', value)} />
                <Field label="First Name" required value={profileForm.firstName ?? ''} onChange={(value) => updateField('firstName', value)} />
                <Field label="Middle Name" value={profileForm.middleName ?? ''} onChange={(value) => updateField('middleName', value)} />
                <Field label="Last Name" required value={profileForm.lastName ?? ''} onChange={(value) => updateField('lastName', value)} />
                <Field label="Suffix" value={profileForm.suffix ?? ''} onChange={(value) => updateField('suffix', value)} />
                <label className="block">
                  <span className="text-xs font-medium text-[#cbd5e1]">Position</span>
                  <select
                    value={profileForm.position ?? ''}
                    onChange={(event) => updateField('position', event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#1d5b48] bg-[#061811] px-3 text-sm font-medium text-[#f8fafc] outline-none transition [color-scheme:dark] focus:border-[#34d399] focus:ring-2 focus:ring-[#22c55e]/25"
                  >
                    <option value="" className="bg-slate-950 text-slate-50">—</option>
                    {POSITION_OPTIONS.map((position) => (
                      <option key={position} value={position} className="bg-slate-950 text-slate-50">{position}</option>
                    ))}
                  </select>
                </label>
                <Field label="Designation" value={profileForm.designation ?? ''} onChange={(value) => updateField('designation', value)} />
                <label className="block">
                  <span className="text-xs font-medium text-[#cbd5e1]">Department</span>
                  <select
                    value={profileForm.departmentCode ?? ''}
                    onChange={(event) => updateField('departmentCode', event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-[#1d5b48] bg-[#061811] px-3 text-sm text-[#f8fafc] outline-none transition [color-scheme:dark] focus:border-[#34d399] focus:ring-2 focus:ring-[#22c55e]/25"
                  >
                    <option value="" className="bg-slate-950 text-slate-50">—</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id} className="bg-slate-950 text-slate-50">{department.name}</option>
                    ))}
                  </select>
                </label>
                <Field label="Unit" value={profileForm.unitName ?? ''} onChange={(value) => updateField('unitName', value)} />
                <Field label="Mobile / Contact" value={profileForm.mobileNo ?? ''} onChange={(value) => updateField('mobileNo', value)} />
                <Field label="Work Location" value={profileForm.workLocation ?? ''} onChange={(value) => updateField('workLocation', value)} />
                <Field label="Date Hired" type="date" value={profileForm.dateHired ?? ''} onChange={(value) => updateField('dateHired', value)} />
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Detail icon={UserRound} label="Username" value={user?.username ?? '—'} />
                <Detail icon={Mail} label="Email" value={user?.email ?? '—'} />
                <Detail icon={Building2} label="Position" value={user?.position ?? '—'} />
                <Detail icon={Award} label="Designation" value={user?.designation ?? '—'} />
                <Detail icon={Building2} label="Department" value={departmentText} />
                <Detail icon={MapPin} label="Work Location" value={user?.workLocation ?? '—'} />
                <Detail icon={Phone} label="Contact" value={user?.mobileNo ?? '—'} />
                <Detail icon={CalendarDays} label="Date Hired" value={formatDate(user?.dateHired ?? undefined)} />
              </dl>
            )}
          </form>

          <div className="rounded-lg border border-gold-200 bg-gold-50 p-3">
            <div className="flex items-start gap-2">
              <Award className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Roles and access</p>
                <p className="mt-1 text-sm font-medium text-gold-900">{roleBadges.join(', ')}</p>
                <p className="mt-1 text-xs text-gold-700">Only an Administrator can edit BES roles, access, account status, and permissions from the Administration page.</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Profile information is loaded from Oracle BES_USERS. BES roles and access are loaded from BES_USER_ROLES.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Mail | typeof Camera; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[#cbd5e1]">{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-[#1d5b48] bg-[#061811] px-3 text-sm font-medium text-[#f8fafc] caret-[#86efac] outline-none transition placeholder:text-[#94a3b8] [color-scheme:dark] focus:border-[#34d399] focus:ring-2 focus:ring-[#22c55e]/25"
      />
    </label>
  );
}

function emptyProfileForm(): ProfileDetailsInput {
  return {
    username: '',
    email: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    position: '',
    designation: '',
    departmentCode: '',
    unitName: '',
    mobileNo: '',
    dateHired: '',
    workLocation: '',
  };
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}
