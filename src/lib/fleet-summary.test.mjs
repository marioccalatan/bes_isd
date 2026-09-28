import assert from 'node:assert/strict';
import test from 'node:test';
import { acquisitionYear, fleetCost, plateEnding, summarizeFleet } from './fleet-summary.ts';

test('cost metrics distinguish missing values from zero and parse Oracle text amounts', () => {
  for (const value of [null, '', ' ', '-', 'invalid', -1, Infinity]) assert.equal(fleetCost(value), null);
  assert.equal(fleetCost('1,200,000.50'), 1200000.5);
  assert.equal(fleetCost(0), 0);
  const metrics = summarizeFleet([{ acquiredCost: '1,200,000.50' }, { acquiredCost: 0 }, { acquiredCost: null }]);
  assert.equal(metrics.totalCost, 1200000.5);
  assert.equal(metrics.knownCosts, 2);
  assert.equal(metrics.averageCost, 600000.25);
});

test('renewal planning counts the last numeric digit even with trailing letters', () => {
  assert.equal(plateEnding('108YHS'), '8');
  assert.equal(plateEnding('ABC-1230'), '0');
  assert.equal(plateEnding(' 133YDK '), '3');
  assert.equal(plateEnding('ABC'), 'Unknown');
  assert.equal(plateEnding(null), 'Unknown');
});

test('all breakdowns reconcile, with missing categories and dates included', () => {
  const metrics = summarizeFleet([
    { department: ' ISD ', vehicleType: 'Service Vehicle', brand: 'SUZUKI', description: 'JIMNY', fuelType: 'GAS', acquiredDate: '2020-06-10T00:00:00.000Z', acquiredCost: 500000, plateNo: '108YHS' },
    { department: 'ISD', vehicleType: 'Service Vehicle', brand: 'SUZUKI', description: 'JIMNY', fuelType: 'GAS', acquiredDate: '2023-01-01', acquiredCost: 2000000, plateNo: 'ABC100' },
    { department: '-', vehicleType: null, brand: null, description: null, fuelType: '', acquiredDate: 'invalid', acquiredCost: null, plateNo: null },
  ]);
  for (const key of ['departments', 'types', 'brands', 'fuels', 'acquisitions', 'endings', 'costBands']) {
    assert.equal(metrics[key].reduce((sum, group) => sum + group.count, 0), 3, key);
    assert.equal(metrics[key].reduce((sum, group) => sum + group.cost, 0), 2500000, key);
  }
  assert.equal(metrics.departments[0].label, 'ISD');
  assert.equal(metrics.departments[0].count, 2);
  assert.equal(metrics.brands[0].label, 'SUZUKI / JIMNY');
  assert.deepEqual(metrics.acquisitions.map((group) => group.label), ['2023', '2020', 'Unknown']);
  assert.equal(metrics.unknownPlates, 1);
  assert.equal(metrics.unknownDates, 1);
  assert.equal(metrics.endings.length, 11);
  assert.equal(acquisitionYear(null), 'Unknown');
});

test('empty fleet has safe metrics and all ten plate digit buckets', () => {
  const metrics = summarizeFleet([]);
  assert.equal(metrics.total, 0);
  assert.equal(metrics.totalCost, 0);
  assert.equal(metrics.averageCost, null);
  assert.equal(metrics.endings.length, 10);
  assert.ok(metrics.endings.every((group) => group.count === 0));
});
