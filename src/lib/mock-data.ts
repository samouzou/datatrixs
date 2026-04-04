import { HoldingCompany, Location, FinancialRecord } from './types';

export const mockHoldingCompany: HoldingCompany = {
  id: 'h-01',
  name: 'Datatrixs Holding Co.',
  industry: 'Automotive Retail',
};

export const mockLocations: Location[] = [
  {
    id: 'l-houston',
    holdingId: 'h-01',
    name: 'Houston West Tires',
    address: '123 Main St, Houston, TX',
    integrationStatus: 'connected',
    integrationType: 'QuickBooks',
    lastSync: '2025-12-31 05:30 PM',
  },
  {
    id: 'l-dallas',
    holdingId: 'h-01',
    name: 'Dallas Central Auto',
    address: '456 Commerce St, Dallas, TX',
    integrationStatus: 'connected',
    integrationType: 'Excel',
    lastSync: '2025-12-30 02:15 PM',
  },
  {
    id: 'l-austin',
    holdingId: 'h-01',
    name: 'Austin North Tires',
    address: '789 Burnet Rd, Austin, TX',
    integrationStatus: 'connected',
    integrationType: 'QuickBooks',
    lastSync: '2025-12-31 10:00 AM',
  },
  {
    id: 'l-sanantonio',
    holdingId: 'h-01',
    name: 'San Antonio Elite Wheels',
    address: '101 Alamo St, San Antonio, TX',
    integrationStatus: 'connected',
    integrationType: 'NetSuite',
    lastSync: '2025-12-28 11:00 AM',
  }
];

// Helper to generate a batch of records for a location/period
const generateQuarterlyData = (
  locId: string, 
  locName: string, 
  period: string, 
  baseRev: number, 
  profitMargin: number
): FinancialRecord[] => {
  const cogs = baseRev * 0.6;
  const opex = baseRev * 0.2;
  const netProfit = baseRev * profitMargin;
  const invValue = baseRev * 0.25;

  return [
    { locationId: locId, locationName: locName, period, metric: 'Revenue', value: Math.round(baseRev) },
    { locationId: locId, locationName: locName, period, metric: 'COGS', value: Math.round(cogs) },
    { locationId: locId, locationName: locName, period, metric: 'Operating Expenses', value: Math.round(opex) },
    { locationId: locId, locationName: locName, period, metric: 'Net Profit', value: Math.round(netProfit) },
    { locationId: locId, locationName: locName, period, metric: 'Inventory Value', value: Math.round(invValue) },
  ];
};

const allRecords: FinancialRecord[] = [];

// 2024 and 2025 Quarterly Data Generation
const locations = [
  { id: 'l-houston', name: 'Houston', startRev: 500000, growth: 1.05, margin: 0.18 },
  { id: 'l-dallas', name: 'Dallas', startRev: 420000, growth: 1.03, margin: 0.15 },
  { id: 'l-austin', name: 'Austin', startRev: 320000, growth: 1.10, margin: 0.12 },
  { id: 'l-sanantonio', name: 'San Antonio', startRev: 250000, growth: 1.15, margin: 0.10 },
];

['2024', '2025'].forEach(year => {
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach((q, qIdx) => {
    const period = `${q} ${year}`;
    locations.forEach(loc => {
      // Calculate revenue with compounding growth and some random noise
      const quartersPassed = (year === '2025' ? 4 : 0) + qIdx;
      const seasonalFactor = q === 'Q4' ? 1.2 : (q === 'Q1' ? 0.9 : 1.0);
      const currentRev = loc.startRev * Math.pow(loc.growth, quartersPassed) * seasonalFactor;
      const noise = 1 + (Math.random() * 0.04 - 0.02); // +/- 2% noise
      
      allRecords.push(...generateQuarterlyData(
        loc.id, 
        loc.name, 
        period, 
        currentRev * noise, 
        loc.margin + (quartersPassed * 0.005) // Slight margin improvement over time
      ));
    });
  });
});

// Add historical 2023 data for trend baseline
allRecords.push(
  ...generateQuarterlyData('l-houston', 'Houston', 'Q4 2023', 495000, 0.17),
  ...generateQuarterlyData('l-dallas', 'Dallas', 'Q4 2023', 410000, 0.14),
  ...generateQuarterlyData('l-austin', 'Austin', 'Q4 2023', 310000, 0.11),
);

export const mockFinancialRecords: FinancialRecord[] = allRecords;
