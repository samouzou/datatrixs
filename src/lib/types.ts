
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

export type CompanyRole = 'admin' | 'member';

export type Company = {
  id: string;
  name: string;
  description?: string;
  members: Record<string, CompanyRole>; // Denormalized for rules: { [uid: string]: 'admin' | 'member' }
  customMetrics?: string[]; // Shared metrics across the holding
  createdAt: string;
  updatedAt: string;
};

export type CompanyInvitation = {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  role: CompanyRole;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
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
  companyMembers: Record<string, CompanyRole>; // Denormalized from Company for rules
  integrationStatus: 'connected' | 'pending' | 'disconnected';
  integrationType: 'QuickBooks' | 'Excel' | 'NetSuite' | 'Manual';
  lastSync?: string;
  lastRawData?: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedReport = {
  id: string;
  userId: string;
  title: string;
  type: 'Financial Report' | 'Data Export' | 'Analysis';
  summary: string;
  content: string; // Markdown or JSON representation
  companyMembers: Record<string, CompanyRole>; // For secure cross-team visibility
  metadata?: any;
  createdAt: string;
};

// Metric is now a flexible string to allow for custom business definitions
export type FinancialMetric = string;

export type FinancialRecord = {
  id: string;
  locationId: string;
  locationName: string;
  period: string; // Normalized e.g., "2024-Q1"
  metric: FinancialMetric;
  value: number;
  companyMembers: Record<string, CompanyRole>; // Denormalized for secure cross-collection visibility
  createdAt: string;
};
