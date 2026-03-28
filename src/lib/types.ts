export type HoldingCompany = {
  id: string;
  name: string;
  industry: string;
};

export type Location = {
  id: string;
  holdingId: string;
  name: string;
  address: string;
  integrationStatus: 'connected' | 'pending' | 'disconnected';
  integrationType: 'QuickBooks' | 'Excel' | 'NetSuite' | 'Manual';
  lastSync: string;
};

export type FinancialMetric = 'Revenue' | 'Net Profit' | 'COGS' | 'Operating Expenses' | 'Inventory Value';

export type FinancialRecord = {
  locationId: string;
  locationName: string;
  period: string; // e.g., "Q1 2023", "Oct 2023"
  metric: FinancialMetric;
  value: number;
};

export type DashboardKPI = {
  label: string;
  value: string | number;
  change: number; // percentage change
  trend: 'up' | 'down' | 'neutral';
};