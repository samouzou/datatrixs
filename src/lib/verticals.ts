import { BusinessVertical } from '@/lib/types';

export type VerticalConfig = {
  id: BusinessVertical;
  label: string;
  description: string;
  /** Singular label for a single managed unit (e.g. "Location", "Client") */
  unitLabel: string;
  /** Plural label for managed units */
  unitsLabel: string;
  /** Label for the 4th KPI card (the one that varies most by vertical) */
  kpi4Label: string;
  /** The financial metric key used for the 4th KPI */
  kpi4Metric: string;
  /** Injected into AI analyst prompts for context grounding */
  aiContext: string;
};

export const VERTICALS: Record<BusinessVertical, VerticalConfig> = {
  retail: {
    id: 'retail',
    label: 'Retail',
    description: 'Physical stores, restaurants, or franchise units',
    unitLabel: 'Location',
    unitsLabel: 'Locations',
    kpi4Label: 'Inventory Turn',
    kpi4Metric: 'inventory value',
    aiContext: 'a portfolio of retail locations managed by a private equity holding firm',
  },
  hardware: {
    id: 'hardware',
    label: 'Hardware',
    description: 'Physical product manufacturing, distribution, or OEM',
    unitLabel: 'Product Line',
    unitsLabel: 'Product Lines',
    kpi4Label: 'Gross Margin %',
    kpi4Metric: 'gross margin',
    aiContext: 'a hardware product and distribution business with multiple product lines',
  },
  saas: {
    id: 'saas',
    label: 'SaaS',
    description: 'Software products with recurring subscription revenue',
    unitLabel: 'Client',
    unitsLabel: 'Clients',
    kpi4Label: 'Churn Rate',
    kpi4Metric: 'churn rate',
    aiContext: 'a SaaS business with recurring subscription revenue and multiple client accounts',
  },
  services: {
    id: 'services',
    label: 'Services',
    description: 'Consulting, agencies, or professional services firms',
    unitLabel: 'Engagement',
    unitsLabel: 'Engagements',
    kpi4Label: 'Utilization Rate',
    kpi4Metric: 'utilization rate',
    aiContext: 'a professional services business with client engagements and project-based revenue',
  },
  biotech: {
    id: 'biotech',
    label: 'Biotech',
    description: 'Life sciences, drug development, or medical devices',
    unitLabel: 'Program',
    unitsLabel: 'Programs',
    kpi4Label: 'R&D Burn Rate',
    kpi4Metric: 'r&d burn',
    aiContext: 'a biotech or life sciences company with research programs and product pipelines',
  },
  other: {
    id: 'other',
    label: 'Other',
    description: 'Business models not listed above',
    unitLabel: 'Unit',
    unitsLabel: 'Units',
    kpi4Label: 'Operating Margin',
    kpi4Metric: 'operating margin',
    aiContext: 'a diversified business portfolio',
  },
};

export const DEFAULT_VERTICAL: BusinessVertical = 'retail';

export function getVerticalConfig(vertical?: string | null): VerticalConfig {
  if (!vertical) return VERTICALS[DEFAULT_VERTICAL];
  return VERTICALS[vertical as BusinessVertical] ?? VERTICALS[DEFAULT_VERTICAL];
}
