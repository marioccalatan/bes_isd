import { ResponsiveContainer } from 'recharts';
import { useTheme } from '@/context/ThemeContext';

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-surface p-3.5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export function ChartBlock({ title, height = 220, children }: { title: string; height?: number; children: React.ReactElement }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
    </div>
  );
}

export function useKpiChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#2e3b33' : '#e2e8f0';
  const tickFill = isDark ? '#8a9c90' : '#64748b';
  return {
    isDark,
    barColor: isDark ? '#34d399' : '#16a34a',
    barColorAlt: isDark ? '#f0c766' : '#cf8f1c',
    barColorMuted: isDark ? '#1c5536' : '#bbf7d0',
    gridStroke,
    tickStyle: { fontSize: 11, fill: tickFill },
    tooltipContentStyle: { backgroundColor: isDark ? '#131f1a' : '#ffffff', border: `1px solid ${gridStroke}`, borderRadius: 8, fontSize: 12, color: isDark ? '#e4ebe6' : '#1c2333' },
    tooltipLabelStyle: { color: isDark ? '#e4ebe6' : '#1c2333', fontWeight: 600 },
  };
}
