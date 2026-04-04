import { HoldingCompany, Location, FinancialRecord } from './types';

export const mockHoldingCompany: HoldingCompany = {
  id: 'h-01',
  name: 'Datatrixs Holding Co.',
  industry: 'Automotive Retail',
};

export const mockLocations: Location[] = [
  {
    id: 'l-houston',
    companyId: 'h-01',
    name: 'Houston West Tires',
    addressLine1: '123 Main St, Houston, TX',
    city: 'Houston',
    state: 'TX',
    zipCode: '77001',
    phoneNumber: '555-0101',
    companyMembers: {},
    integrationStatus: 'connected',
    integrationType: 'QuickBooks',
    lastSync: '2025-12-31 05:30 PM',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2025-12-31T17:30:00Z'
  },
  {
    id: 'l-dallas',
    companyId: 'h-01',
    name: 'Dallas Central Auto',
    addressLine1: '456 Commerce St, Dallas, TX',
    city: 'Dallas',
    state: 'TX',
    zipCode: '75201',
    phoneNumber: '555-0102',
    companyMembers: {},
    integrationStatus: 'connected',
    integrationType: 'Excel',
    lastSync: '2025-12-30 02:15 PM',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2025-12-30T14:15:00Z'
  }
];

// Normalized Period Helper for Mock Data
// Use YYYY-QN for quarters or YYYY-MM for months
const generateQuarterlyData = (
  locId: string, 
  locName: string, 
  normalizedPeriod: string, 
  baseRev: number, 
  profitMargin: number
): FinancialRecord[] => {
  const cogs = baseRev * 0.6;
  const opex = baseRev * 0.2;
  const netProfit = baseRev * profitMargin;
  const invValue = baseRev * 0.25;

  return [
    { id: `${locId}-${normalizedPeriod}-rev`, locationId: locId, locationName: locName, period: normalizedPeriod, metric: 'Revenue', value: Math.round(baseRev), companyMembers: {}, createdAt: new Date().toISOString() },
    { id: `${locId}-${normalizedPeriod}-profit`, locationId: locId, locationName: locName, period: normalizedPeriod, metric: 'Net Profit', value: Math.round(netProfit), companyMembers: {}, createdAt: new Date().toISOString() },
    { id: `${locId}-${normalizedPeriod}-inv`, locationId: locId, locationName: locName, period: normalizedPeriod, metric: 'Inventory Value', value: Math.round(invValue), companyMembers: {}, createdAt: new Date().toISOString() },
  ];
};

const allRecords: FinancialRecord[] = [];

// Seed data using Normalized Formats (YYYY-QN)
const locations = [
  { id: 'l-houston', name: 'Houston', startRev: 500000, growth: 1.05, margin: 0.18 },
  { id: 'l-dallas', name: 'Dallas', startRev: 420000, growth: 1.03, margin: 0.15 },
];

['2024', '2025'].forEach(year => {
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, qIdx) => {
    const period = `${year}-${q}`; // Normalized format
    locations.forEach(loc => {
      const quartersPassed = (year === '2025' ? 4 : 0) + qIdx;
      const seasonalFactor = q === 'Q4' ? 1.2 : (q === 'Q1' ? 0.9 : 1.0);
      const currentRev = loc.startRev * Math.pow(loc.growth, quartersPassed) * seasonalFactor;
      const noise = 1 + (Math.random() * 0.04 - 0.02);
      
      allRecords.push(...generateQuarterlyData(
        loc.id, 
        loc.name, 
        period, 
        currentRev * noise, 
        loc.margin + (quartersPassed * 0.005)
      ));
    });
  });
});

export const mockFinancialRecords: FinancialRecord[] = allRecords;
