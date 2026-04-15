
export type UserRole = 'Admin' | 'Analyst' | 'LocationManager';

export type BusinessVertical = 'retail' | 'hardware' | 'saas' | 'services' | 'biotech' | 'other';

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

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export type CompanySubscription = {
  plan: 'pro' | 'enterprise';
  interval: 'monthly' | 'annual';
  status: SubscriptionStatus;
  locationLimit: number; // Added to enforce ceiling
  currentPeriodEnd: string;
  updatedAt: string;
};

export type Company = {
  id: string;
  name: string;
  description?: string;
  ein?: string;
  sector?: string;
  reportingCurrency?: string;
  members: Record<string, CompanyRole>; 
  customMetrics?: string[]; 
  vertical?: BusinessVertical;
  stripeCustomerId?: string; // Persistent link to Stripe billing
  subscription?: CompanySubscription;
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
  companyMembers: Record<string, CompanyRole>; 
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
  type: 'Financial Report' | 'Data Export';
  summary: string;
  content: string; 
  companyMembers: Record<string, CompanyRole>; 
  metadata?: any;
  createdAt: string;
};

export type SavedAnalysis = {
  id: string;
  userId: string;
  title: string;
  summary: string;
  content: string;
  results?: any[];
  suggestedChart?: {
    type: 'bar' | 'line' | 'pie' | 'table';
    title: string;
    xAxisLabel?: string;
    yAxisLabel?: string;
  };
  companyMembers: Record<string, CompanyRole>;
  createdAt: string;
};

export type FinancialMetric = string;

export type FinancialRecord = {
  id: string;
  locationId: string;
  locationName: string;
  period: string; 
  metric: FinancialMetric;
  value: number;
  companyMembers: Record<string, CompanyRole>; 
  createdAt: string;
};
