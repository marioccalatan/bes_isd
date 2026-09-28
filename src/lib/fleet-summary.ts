import type { FleetVehicleRecord } from './api';

export const fleetLabel = (value: string | null | undefined) => {
  const text = value?.trim();
  return !text || text === '-' || text === '—' ? 'Unassigned' : text;
};

export function fleetCost(value: FleetVehicleRecord['acquiredCost']): number | null {
  if (value == null || String(value).trim() === '') return null;
  const amount = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function acquisitionYear(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1900 ? 'Unknown' : String(date.getUTCFullYear());
}

export function plateEnding(value: string | null): string {
  return value?.match(/\d(?=\D*$)/)?.[0] ?? 'Unknown';
}

export type FleetGroup = { label: string; count: number; cost: number; costCount: number };
export function groupFleet(rows: FleetVehicleRecord[], key: (row: FleetVehicleRecord) => string): FleetGroup[] {
  const groups = new Map<string, FleetGroup>();
  for (const row of rows) {
    const label = key(row);
    const group = groups.get(label) ?? { label, count: 0, cost: 0, costCount: 0 };
    const cost = fleetCost(row.acquiredCost);
    group.count++;
    if (cost !== null) { group.cost += cost; group.costCount++; }
    groups.set(label, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarizeFleet(rows: FleetVehicleRecord[]) {
  const costs = rows.map((row) => fleetCost(row.acquiredCost)).filter((cost): cost is number => cost !== null);
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  const endings = groupFleet(rows, (row) => plateEnding(row.plateNo));
  return {
    total: rows.length, totalCost, knownCosts: costs.length,
    averageCost: costs.length ? totalCost / costs.length : null,
    unknownDates: rows.filter((row) => acquisitionYear(row.acquiredDate) === 'Unknown').length,
    unknownPlates: endings.find((group) => group.label === 'Unknown')?.count ?? 0,
    departments: groupFleet(rows, (row) => fleetLabel(row.department)),
    types: groupFleet(rows, (row) => fleetLabel(row.vehicleType)),
    brands: groupFleet(rows, (row) => `${fleetLabel(row.brand)} / ${fleetLabel(row.description)}`),
    fuels: groupFleet(rows, (row) => fleetLabel(row.fuelType)),
    acquisitions: groupFleet(rows, (row) => acquisitionYear(row.acquiredDate)).sort((a, b) => a.label === 'Unknown' ? 1 : b.label === 'Unknown' ? -1 : b.label.localeCompare(a.label)),
    endings: [...Array.from({ length: 10 }, (_, digit) => endings.find((group) => group.label === String(digit)) ?? { label: String(digit), count: 0, cost: 0, costCount: 0 }), ...endings.filter((group) => group.label === 'Unknown')],
    costBands: groupFleet(rows, (row) => {
      const cost = fleetCost(row.acquiredCost);
      return cost === null ? 'Unknown' : cost === 0 ? 'Zero recorded cost' : cost < 500_000 ? 'Below ₱500,000' : cost < 1_000_000 ? '₱500,000–999,999.99' : cost < 2_000_000 ? '₱1,000,000–1,999,999.99' : '₱2,000,000 and above';
    }),
  };
}
