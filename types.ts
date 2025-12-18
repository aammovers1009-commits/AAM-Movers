
export type TabType = 'dashboard' | 'leads' | 'builder' | 'jobs' | 'dispatch' | 'crew' | 'seo' | 'settings';
export type UserRole = 'owner' | 'ops-manager' | 'crew-lead' | 'mover';
export type JobStatus = 'new' | 'contacted' | 'quoted' | 'deposit-paid' | 'booked' | 'in-progress' | 'completed' | 'lost';
export type ServiceType = 'Local' | 'Long Distance' | 'Labor Only' | 'Packing' | 'Junk';

export interface DesignStyle {
  id: string;
  name: string;
  prompt: string;
  description: string;
  previewImage: string;
}

export interface CompanySettings {
  name: string;
  phone: string;
  serviceArea: string[];
  baseHourlyRate: number;
  minChargeHours: number;
  depositAmount: number;
  crewSizes: number[];
  processingFeeRate: number;
}

export interface PayrollRecord {
  id: string;
  date: string;
  amount: number;
  type: 'salary' | 'bonus' | 'reimbursement';
  note: string;
}

export interface PayrollInfo {
  routingNumber: string;
  accountNumber: string;
  bankName: string;
  taxId: string;
  w9Status: 'pending' | 'verified';
  paymentHistory: PayrollRecord[];
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  role: UserRole;
  payroll: PayrollInfo;
  status: 'active' | 'inactive';
  hireDate: string;
}

export interface Receipt {
  id: string;
  title: string;
  amount: number;
  category: 'Fuel' | 'Equipment' | 'Maintenance' | 'Office' | 'Travel' | 'Other';
  date: string;
  imageUrl: string;
  uploadedBy: string;
}

export interface TimeEntry {
  id: string;
  employeeId: string;
  clockIn: string;
  clockOut?: string;
  jobId?: string;
  mileage?: number;
}

export interface MoveLogistics {
  pickupAddress: string;
  dropoffAddress: string;
  date: string;
  timeWindow: string;
  stairsPickup: number;
  stairsDropoff: number;
  elevator: boolean;
  walkDistance: 'Short' | 'Medium' | 'Long';
  crewSize: 2 | 3 | 4;
  truckSize: string;
  packingType: 'None' | 'Partial' | 'Full';
  heavyItemsCount: number;
  mileage: number;
  isSameDay: boolean;
  isWeekend: boolean;
  isMonthEnd: boolean;
  useCreditCard: boolean;
  estimatedHours: number;
  timelineView: 'Day' | 'Week' | 'Month';
  durationDays: number;
  timelineNotes: string;
}

export interface PricingTier {
  label: string;
  price: number;
  margin: number;
  description: string;
  depositDue: number;
  processingFee: number;
  totalWithFees: number;
}

export interface SmartPricing {
  tiers: {
    minimal: PricingTier;
    recommended: PricingTier;
    winTheJob: PricingTier;
  };
  breakdown: {
    laborRevenue: number;
    truckFee: number;
    mileageCharge: number;
    fuelFee: number;
    complexityMultiplier: number;
    estimatedHours: number;
    baseSubtotal: number;
  };
  surchargeReasons: string[];
  tip?: number;
}

export interface ReadinessChecklist {
  deposit: boolean;
  address: boolean;
  inventory: boolean;
  elevator: boolean;
  confirmation: boolean;
  agreementSigned: boolean;
}

export interface Job {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: JobStatus;
  serviceType: ServiceType;
  logistics: MoveLogistics;
  pricing: SmartPricing;
  selectedTier?: 'minimal' | 'recommended' | 'winTheJob';
  readinessScore: number;
  checklist: ReadinessChecklist;
  crewId?: string;
  startTime?: string;
  riskFlags: string[];
  leadSource: 'GBP' | 'Ads' | 'Referral' | 'Web';
  notes: string;
  photos: { url: string; type: 'before' | 'after' | 'damage'; timestamp: string }[];
  agreementUrl?: string;
}

export interface DailyBriefing {
  summary: string;
  alerts: string[];
  seoTask: string;
}

export interface Crew {
  id: string;
  name: string;
  employeeIds: string[];
  status: 'available' | 'on-job' | 'off';
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  sender?: string;
  timestamp: string;
  links?: { uri: string; title: string }[];
}
