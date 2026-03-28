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
    lastSync: '2023-11-01 09:30 AM',
  },
  {
    id: 'l-dallas',
    holdingId: 'h-01',
    name: 'Dallas Central Auto',
    address: '456 Commerce St, Dallas, TX',
    integrationStatus: 'connected',
    integrationType: 'Excel',
    lastSync: '2023-10-28 02:15 PM',
  },
  {
    id: 'l-austin',
    holdingId: 'h-01',
    name: 'Austin North Tires',
    address: '789 Burnet Rd, Austin, TX',
    integrationStatus: 'pending',
    integrationType: 'QuickBooks',
    lastSync: 'N/A',
  },
  {
    id: 'l-sanantonio',
    holdingId: 'h-01',
    name: 'San Antonio Elite Wheels',
    address: '101 Alamo St, San Antonio, TX',
    integrationStatus: 'disconnected',
    integrationType: 'NetSuite',
    lastSync: '2023-09-15 11:00 AM',
  }
];

export const mockFinancialRecords: FinancialRecord[] = [
  // Houston
  { locationId: 'l-houston', locationName: 'Houston', period: 'Q3 2023', metric: 'Revenue', value: 450000 },
  { locationId: 'l-houston', locationName: 'Houston', period: 'Q3 2023', metric: 'Net Profit', value: 85000 },
  { locationId: 'l-houston', locationName: 'Houston', period: 'Q4 2023', metric: 'Revenue', value: 495000 },
  { locationId: 'l-houston', locationName: 'Houston', period: 'Q4 2023', metric: 'Net Profit', value: 92000 },
  // Dallas
  { locationId: 'l-dallas', locationName: 'Dallas', period: 'Q3 2023', metric: 'Revenue', value: 380000 },
  { locationId: 'l-dallas', locationName: 'Dallas', period: 'Q3 2023', metric: 'Net Profit', value: 62000 },
  { locationId: 'l-dallas', locationName: 'Dallas', period: 'Q4 2023', metric: 'Revenue', value: 410000 },
  { locationId: 'l-dallas', locationName: 'Dallas', period: 'Q4 2023', metric: 'Net Profit', value: 71000 },
  // Austin
  { locationId: 'l-austin', locationName: 'Austin', period: 'Q3 2023', metric: 'Revenue', value: 290000 },
  { locationId: 'l-austin', locationName: 'Austin', period: 'Q3 2023', metric: 'Net Profit', value: 45000 },
  { locationId: 'l-austin', locationName: 'Austin', period: 'Q4 2023', metric: 'Revenue', value: 310000 },
  { locationId: 'l-austin', locationName: 'Austin', period: 'Q4 2023', metric: 'Net Profit', value: 48000 },
];