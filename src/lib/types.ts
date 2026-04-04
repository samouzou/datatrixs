export type UserRole = 'Admin' | 'Analyst' | 'LocationManager';

export type UserProfile = {
  id: string;
  externalAuthIdentifier: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type Company = {
  id: string;
  name: string;
  description?: string;
  members: Record<string, boolean>; // Denormalized for rules: { [uid: string]: true }
  createdAt: string;
  updatedAt: string;
};

export type Location = {
  id: string;
  companyId: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
  companyMembers: Record<string, boolean>; // Denormalized from Company for rules
  integrationStatus: 'connected' | 'pending' | 'disconnected';
  integrationType: 'QuickBooks' | 'Excel' | 'NetSuite' | 'Manual';
  lastSync?: string;
  createdAt: string;
  updatedAt: string;
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
