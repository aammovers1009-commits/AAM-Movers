
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TabType, Job, JobStatus, CompanySettings, 
  SmartPricing, DailyBriefing, Crew, MoveLogistics,
  Employee, TimeEntry, ChatMessage, ReadinessChecklist,
  Receipt, UserRole, PayrollRecord
} from './types';
import { 
  calculate3TierPricing, generateMorningBriefing 
} from './services/geminiService';

const DEFAULT_SETTINGS: CompanySettings = {
  name: 'Elite Movers HQ',
  phone: '555-010-9988',
  serviceArea: ['Minneapolis', 'St. Paul', 'Brooklyn Park', 'Bloomington'],
  baseHourlyRate: 150,
  minChargeHours: 3,
  depositAmount: 50,
  crewSizes: [2, 3, 4, 5, 6],
  processingFeeRate: 0.029
};

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'e1',
    name: 'Mike Johnson',
    role: 'crew-lead',
    phone: '555-123-4567',
    email: 'mike@elitemovers.com',
    address: '123 Pine St, Minneapolis, MN',
    status: 'active',
    hireDate: '2024-01-15',
    payroll: {
      routingNumber: '123456789',
      accountNumber: '987654321',
      bankName: 'First National',
      taxId: 'SSN-XX-1234',
      w9Status: 'verified',
      paymentHistory: [
        { id: 'p1', date: '2024-02-01', amount: 2450, type: 'salary', note: 'Feb Salary' },
        { id: 'p2', date: '2024-03-01', amount: 2450, type: 'salary', note: 'Mar Salary' }
      ]
    }
  },
  {
    id: 'e2',
    name: 'Steve Miller',
    role: 'mover',
    phone: '555-987-6543',
    email: 'steve@elitemovers.com',
    address: '456 Oak Ave, St. Paul, MN',
    status: 'active',
    hireDate: '2024-03-10',
    payroll: {
      routingNumber: '987654321',
      accountNumber: '123456789',
      bankName: 'Chase',
      taxId: 'SSN-XX-5678',
      w9Status: 'pending',
      paymentHistory: []
    }
  }
];

const INITIAL_CREWS: Crew[] = [
  { id: 'c1', name: 'Alpha Crew', employeeIds: ['e1'], status: 'available' },
  { id: 'c2', name: 'Bravo Squad', employeeIds: ['e2'], status: 'available' }
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES);
  const [crews, setCrews] = useState<Crew[]>(INITIAL_CREWS);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [isBriefingVisible, setIsBriefingVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobSubTab, setJobSubTab] = useState<'overview' | 'readiness' | 'photos'>('overview');
  const [settingsTab, setSettingsTab] = useState<'company' | 'roster' | 'crews' | 'payroll' | 'receipts'>('company');
  const [dispatchSort, setDispatchSort] = useState<'none' | 'score-desc' | 'score-asc'>('none');
  const [jobsSearch, setJobsSearch] = useState('');

  const currentUserId = 'e1';
  const currentUser = useMemo(() => employees.find(e => e.id === currentUserId), [employees]);
  const activeTimeEntry = useMemo(() => timeEntries.find(t => t.employeeId === currentUserId && !t.clockOut), [timeEntries]);
  const currentJob = useMemo(() => jobs.find(j => j.id === selectedJobId), [jobs, selectedJobId]);

  const stats = useMemo(() => {
    const leadsToday = jobs.filter(j => j.status === 'new').length;
    const jobsToday = jobs.filter(j => j.status === 'booked' || j.status === 'in-progress').length;
    const revenueProtected = jobs.reduce((acc, job) => {
      if (job.selectedTier && job.pricing.tiers[job.selectedTier]) {
        return acc + job.pricing.tiers[job.selectedTier].totalWithFees + (job.pricing.tip || 0);
      }
      return acc;
    }, 0);
    const atRisk = jobs.filter(j => j.readinessScore < 50 && j.status === 'booked').length;
    return { leadsToday, jobsToday, revenueProtected, atRisk };
  }, [jobs]);

  const handleRunPricing = async () => {
    setIsProcessing(true);
    try {
      const result = await calculate3TierPricing(builderLogistics, settings);
      setBuilderPricing(result);
    } catch (error) {
      console.error("Pricing failed", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveQuoteAsLead = (tier: 'minimal' | 'recommended' | 'winTheJob') => {
    if (!builderPricing) return;
    const newJob: Job = {
      id: Math.random().toString(36).substr(2, 9),
      customerName: builderCustomer.name || 'Anonymous',
      customerPhone: builderCustomer.phone || 'N/A',
      customerEmail: builderCustomer.email || 'N/A',
      status: 'new',
      serviceType: 'Local',
      logistics: {
        ...builderLogistics,
        pickupAddress: 'TBD',
        dropoffAddress: 'TBD',
        elevator: false,
        truckSize: '26ft Box'
      } as MoveLogistics,
      pricing: { ...builderPricing, tip: builderTip },
      selectedTier: tier,
      readinessScore: 0,
      checklist: { deposit: false, address: false, inventory: false, elevator: false, confirmation: false, agreementSigned: false },
      riskFlags: [],
      leadSource: 'Web',
      notes: '',
      photos: []
    };
    setJobs([newJob, ...jobs]);
    setActiveTab('leads');
    setBuilderPricing(null);
    setBuilderCustomer({ name: '', phone: '', email: '' });
    setBuilderTip(0);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const [builderLogistics, setBuilderLogistics] = useState<Partial<MoveLogistics>>({
    date: new Date().toISOString().split('T')[0],
    timeWindow: '08:00 - 10:00',
    crewSize: 3,
    walkDistance: 'Medium',
    stairsPickup: 0,
    stairsDropoff: 0,
    mileage: 10,
    heavyItemsCount: 0,
    packingType: 'None',
    isWeekend: false,
    isSameDay: false,
    isMonthEnd: false,
    useCreditCard: false,
    estimatedHours: 4,
    timelineView: 'Day',
    durationDays: 1,
    timelineNotes: ''
  });
  const [builderPricing, setBuilderPricing] = useState<SmartPricing | null>(null);
  const [builderCustomer, setBuilderCustomer] = useState({ name: '', phone: '', email: '' });
  const [builderTip, setBuilderTip] = useState(0);

  useEffect(() => {
    const savedJobs = localStorage.getItem('ss_jobs_v3');
    const savedTime = localStorage.getItem('ss_time_v3');
    const savedEmployees = localStorage.getItem('ss_employees_v3');
    const savedCrews = localStorage.getItem('ss_crews_v3');
    const savedReceipts = localStorage.getItem('ss_receipts_v3');
    if (savedJobs) setJobs(JSON.parse(savedJobs));
    if (savedTime) setTimeEntries(JSON.parse(savedTime));
    if (savedEmployees) setEmployees(JSON.parse(savedEmployees));
    if (savedCrews) setCrews(JSON.parse(savedCrews));
    if (savedReceipts) setReceipts(JSON.parse(savedReceipts));
  }, []);

  useEffect(() => {
    localStorage.setItem('ss_jobs_v3', JSON.stringify(jobs));
    localStorage.setItem('ss_time_v3', JSON.stringify(timeEntries));
    localStorage.setItem('ss_employees_v3', JSON.stringify(employees));
    localStorage.setItem('ss_crews_v3', JSON.stringify(crews));
    localStorage.setItem('ss_receipts_v3', JSON.stringify(receipts));
  }, [jobs, timeEntries, employees, crews, receipts]);

  const sortedDispatchJobs = useMemo(() => {
    const activeJobs = jobs.filter(j => ['booked', 'in-progress', 'quoted', 'new'].includes(j.status));
    if (dispatchSort === 'score-desc') return [...activeJobs].sort((a, b) => b.readinessScore - a.readinessScore);
    if (dispatchSort === 'score-asc') return [...activeJobs].sort((a, b) => a.readinessScore - b.readinessScore);
    return activeJobs;
  }, [jobs, dispatchSort]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => 
      j.customerName.toLowerCase().includes(jobsSearch.toLowerCase()) ||
      j.customerPhone.includes(jobsSearch) ||
      j.customerEmail.toLowerCase().includes(jobsSearch.toLowerCase())
    );
  }, [jobs, jobsSearch]);

  const handleClockToggle = (mileage?: number) => {
    if (activeTimeEntry) {
      setTimeEntries(prev => prev.map(t => t.id === activeTimeEntry.id ? { ...t, clockOut: new Date().toISOString(), mileage: mileage || t.mileage } : t));
    } else {
      const newEntry: TimeEntry = {
        id: Math.random().toString(36).substr(2, 9),
        employeeId: currentUserId,
        clockIn: new Date().toISOString()
      };
      setTimeEntries([newEntry, ...timeEntries]);
    }
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newReceipt: Receipt = {
          id: Math.random().toString(36).substr(2, 9),
          title: 'Manual Receipt',
          amount: 0,
          category: 'Fuel',
          date: new Date().toISOString().split('T')[0],
          imageUrl: reader.result as string,
          uploadedBy: currentUser?.name || 'System'
        };
        setReceipts([newReceipt, ...receipts]);
      };
      reader.readAsDataURL(file);
    }
  };

  const getProbationEndDate = (startDate: string) => {
    if (!startDate) return 'N/A';
    const date = new Date(startDate);
    date.setDate(date.getDate() + 90);
    return date.toISOString().split('T')[0];
  };

  const isProbationActive = (startDate: string) => {
    if (!startDate) return false;
    const end = new Date(getProbationEndDate(startDate));
    return new Date() < end;
  };

  const updateJobChecklist = (field: keyof ReadinessChecklist) => {
    if (!selectedJobId) return;
    setJobs(prev => prev.map(j => {
      if (j.id === selectedJobId) {
        const nextChecklist = { ...j.checklist, [field]: !j.checklist[field] };
        const totalItems = Object.keys(nextChecklist).length;
        const checkedItems = Object.values(nextChecklist).filter(Boolean).length;
        return { ...j, checklist: nextChecklist, readinessScore: Math.round((checkedItems / totalItems) * 100) };
      }
      return j;
    }));
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after' | 'damage') => {
    const file = e.target.files?.[0];
    if (file && selectedJobId) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setJobs(prev => prev.map(j => (j.id === selectedJobId ? {
          ...j,
          photos: [...j.photos, { url: reader.result as string, type, timestamp: new Date().toISOString() }]
        } : j)));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Global Sidebar */}
      <aside className="w-24 bg-slate-900 border-r border-white/5 flex flex-col items-center py-10 gap-8 shrink-0 z-50">
        <div className="w-14 h-14 bg-indigo-600 rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-indigo-600/20">SS</div>
        <nav className="flex flex-col gap-6 flex-1">
          <NavIcon icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSelectedJobId(null); }} label="HQ" />
          <NavIcon icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7" active={activeTab === 'leads'} onClick={() => { setActiveTab('leads'); setSelectedJobId(null); }} label="Leads" />
          <NavIcon icon="M12 4v16m8-8H4" active={activeTab === 'builder'} onClick={() => { setActiveTab('builder'); setSelectedJobId(null); }} label="Quote" />
          <NavIcon icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" active={activeTab === 'jobs'} onClick={() => { setActiveTab('jobs'); setSelectedJobId(null); }} label="Jobs" />
          <NavIcon icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" active={activeTab === 'dispatch'} onClick={() => { setActiveTab('dispatch'); setSelectedJobId(null); }} label="Board" />
          <NavIcon icon="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" active={activeTab === 'crew'} onClick={() => { setActiveTab('crew'); setSelectedJobId(null); }} label="Crew Port" />
        </nav>
        <button onClick={() => { setActiveTab('settings'); setSelectedJobId(null); }} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'settings' ? 'bg-white text-slate-950' : 'bg-white/5 text-white/40'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-950 relative">
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-slate-900/40 backdrop-blur-xl shrink-0 z-40">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-black tracking-tighter uppercase leading-none">{selectedJobId ? 'COMMAND FOCUS' : activeTab}</h1>
            {selectedJobId && (
              <button onClick={() => setSelectedJobId(null)} className="text-[10px] font-black uppercase text-white/40 hover:text-white">← HQ</button>
            )}
          </div>
          <div className="flex items-center gap-4">
            {activeTab === 'crew' && activeTimeEntry && (
              <div className="bg-white/5 px-4 py-2 rounded-xl flex items-center gap-3">
                <span className="text-[8px] font-black text-white/30 uppercase">Mileage</span>
                <input 
                  type="number" 
                  placeholder="Daily Miles" 
                  className="bg-transparent text-xs font-black text-indigo-400 outline-none w-20"
                  onChange={(e) => setTimeEntries(prev => prev.map(t => t.id === activeTimeEntry.id ? { ...t, mileage: parseFloat(e.target.value) } : t))}
                />
              </div>
            )}
            <button onClick={() => handleClockToggle()} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTimeEntry ? 'bg-rose-600' : 'bg-emerald-600'} shadow-xl`}>
              {activeTimeEntry ? 'Clock Out' : 'Clock In'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 scrollbar-hide">
          {activeTab === 'jobs' && !selectedJobId && (
            <div className="max-w-7xl mx-auto space-y-8">
               <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-4xl font-black tracking-tighter uppercase">Job Inventory</h2>
                    <p className="text-[10px] font-bold text-white/30 uppercase mt-2 tracking-[0.2em]">Comprehensive Fleet History & Pipeline</p>
                  </div>
                  <div className="relative w-96">
                    <input 
                      type="text" 
                      placeholder="Search Customer, Phone, or Email..." 
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-sm font-medium focus:ring-2 ring-indigo-500 outline-none transition-all"
                      value={jobsSearch}
                      onChange={(e) => setJobsSearch(e.target.value)}
                    />
                    <svg className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
               </div>

               <div className="space-y-4">
                  {filteredJobs.map(job => {
                    const assignedCrew = crews.find(c => c.id === job.crewId);
                    return (
                      <div 
                        key={job.id} 
                        onClick={() => setSelectedJobId(job.id)}
                        className="bg-slate-900 border border-white/5 p-8 rounded-[3.5rem] flex items-center justify-between group cursor-pointer hover:border-indigo-500/40 transition-all hover:bg-slate-900/60 shadow-xl"
                      >
                         <div className="flex items-center gap-10">
                            <div className="w-16 h-16 bg-white/5 rounded-3xl flex flex-col items-center justify-center text-center">
                               <p className="text-[8px] font-black uppercase text-white/20">Day</p>
                               <p className="text-xl font-black">{new Date(job.logistics.date).getDate() || '??'}</p>
                            </div>
                            <div className="space-y-1">
                               <div className="flex items-center gap-4">
                                  <h3 className="text-xl font-black uppercase">{job.customerName}</h3>
                                  <span className={`px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                    job.status === 'booked' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                    job.status === 'in-progress' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 
                                    'bg-white/5 text-white/40 border border-white/10'
                                  }`}>
                                     {job.status}
                                  </span>
                               </div>
                               <div className="flex items-center gap-6 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                  <span className="flex items-center gap-2">
                                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                     {job.customerPhone}
                                  </span>
                                  <span className="flex items-center gap-2">
                                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                     {job.customerEmail}
                                  </span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-16">
                            <div className="text-right">
                               <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Assigned Unit</p>
                               <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${assignedCrew ? 'bg-emerald-400' : 'bg-rose-500'}`}></div>
                                  <p className="text-xs font-black uppercase text-indigo-400">{assignedCrew?.name || 'Unassigned'}</p>
                               </div>
                            </div>
                            <div className="text-right">
                               <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Contracted Value</p>
                               <p className="text-xl font-black text-white">${(job.pricing.tiers[job.selectedTier || 'recommended'].totalWithFees + (job.pricing.tip || 0)).toLocaleString()}</p>
                            </div>
                            <button className="bg-white/5 p-4 rounded-2xl group-hover:bg-indigo-600 transition-all">
                               <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                            </button>
                         </div>
                      </div>
                    );
                  })}
                  {filteredJobs.length === 0 && (
                    <div className="h-64 border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center justify-center text-white/10 italic">
                       No jobs found matching your criteria
                    </div>
                  )}
               </div>
            </div>
          )}

          {activeTab === 'dispatch' && !selectedJobId && (
            <div className="max-w-7xl mx-auto space-y-10">
               <div className="flex justify-between items-center bg-slate-900 border border-white/5 p-8 rounded-[3rem] shadow-2xl">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tight">Active Job Board</h2>
                    <p className="text-[10px] font-bold text-white/30 uppercase mt-1">Real-time Readiness Monitoring</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-white/30 uppercase">Sort Readiness:</span>
                    <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                      <button onClick={() => setDispatchSort('none')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${dispatchSort === 'none' ? 'bg-indigo-600 text-white' : 'text-white/40'}`}>Reset</button>
                      <button onClick={() => setDispatchSort('score-desc')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${dispatchSort === 'score-desc' ? 'bg-indigo-600 text-white' : 'text-white/40'}`}>High First</button>
                      <button onClick={() => setDispatchSort('score-asc')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${dispatchSort === 'score-asc' ? 'bg-indigo-600 text-white' : 'text-white/40'}`}>Low First</button>
                    </div>
                  </div>
               </div>

               <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedDispatchJobs.map(job => {
                    const isAtRisk = job.readinessScore < 70;
                    return (
                      <div 
                        key={job.id} 
                        onClick={() => setSelectedJobId(job.id)}
                        className={`bg-slate-900 border-2 rounded-[3.5rem] p-8 space-y-6 transition-all hover:scale-[1.02] cursor-pointer group relative overflow-hidden ${isAtRisk ? 'border-rose-600/50 shadow-[0_0_40px_-10px_rgba(225,29,72,0.3)] animate-pulse-slow' : 'border-white/5 shadow-2xl'}`}
                      >
                         <div className="flex justify-between items-start">
                            <div className="space-y-1">
                               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{job.status}</p>
                               <h3 className="text-xl font-black uppercase leading-tight">{job.customerName}</h3>
                            </div>
                            <div className="text-right">
                               <div className={`text-2xl font-black ${isAtRisk ? 'text-rose-500' : 'text-emerald-400'}`}>{job.readinessScore}%</div>
                               <p className="text-[8px] font-black text-white/30 uppercase">Ready</p>
                            </div>
                         </div>

                         {isAtRisk && (
                           <div className="bg-rose-600/20 border border-rose-500/30 p-3 rounded-2xl flex items-center gap-3">
                              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                              <p className="text-[10px] font-black uppercase text-rose-400">Caution: Missing Dependencies</p>
                           </div>
                         )}

                         <div className="space-y-3 pt-4 border-t border-white/5">
                            <div className="flex justify-between text-[10px] font-black uppercase">
                               <span className="text-white/30 tracking-widest">Date</span>
                               <span>{job.logistics.date}</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-black uppercase">
                               <span className="text-white/30 tracking-widest">Crew Size</span>
                               <span>{job.logistics.crewSize} Movers</span>
                            </div>
                            <div className="flex justify-between text-[10px] font-black uppercase">
                               <span className="text-white/30 tracking-widest">Deposit</span>
                               <span className={job.checklist.deposit ? 'text-emerald-400' : 'text-rose-500'}>{job.checklist.deposit ? 'Paid' : 'Unpaid'}</span>
                            </div>
                         </div>

                         <button className="w-full bg-white/5 py-4 rounded-3xl text-[10px] font-black uppercase transition-all group-hover:bg-indigo-600 group-hover:text-white">Review Logistics</button>
                      </div>
                    );
                  })}
                  {sortedDispatchJobs.length === 0 && (
                    <div className="col-span-full h-80 border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center justify-center text-white/10 italic">
                       No active jobs scheduled on the board
                    </div>
                  )}
               </div>
            </div>
          )}

          {activeTab === 'crew' && (
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="bg-indigo-600 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Member Command</p>
                <h2 className="text-4xl font-black mb-6">{currentUser?.name}</h2>
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">Status</p>
                    <div className="flex items-center gap-2">
                       <div className={`w-2 h-2 rounded-full ${activeTimeEntry ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`}></div>
                       <p className="text-xs font-black uppercase">{activeTimeEntry ? 'Active Shift' : 'Off Clock'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">90-Day Probation</p>
                    <p className="text-xs font-black uppercase text-white">
                       {isProbationActive(currentUser?.hireDate || '') ? `Ends: ${getProbationEndDate(currentUser?.hireDate || '')}` : 'Completed ✓'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-white/5 p-10 rounded-[3.5rem] space-y-8">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Action Center</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input type="file" accept="image/*" capture="environment" className="hidden" ref={receiptInputRef} onChange={handleReceiptUpload} />
                  <button onClick={() => receiptInputRef.current?.click()} className="h-40 bg-emerald-600/10 border-2 border-emerald-500/30 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-emerald-400 hover:bg-emerald-600/20 transition-all">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest">Snap Tax Receipt</span>
                  </button>
                  <button className="h-40 bg-white/5 border-2 border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-white/40">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest">Safety Check-In</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-6xl mx-auto space-y-12 py-6">
              <div className="flex justify-between items-end">
                <h2 className="text-4xl font-black tracking-tighter uppercase">Operations Hub</h2>
                <div className="flex gap-2 bg-white/5 p-1 rounded-2xl">
                  {['company', 'roster', 'crews', 'payroll', 'receipts'].map(t => (
                    <button 
                      key={t}
                      onClick={() => setSettingsTab(t as any)} 
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settingsTab === t ? 'bg-indigo-600 text-white' : 'text-white/40'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {settingsTab === 'crews' && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {crews.map(crew => (
                    <div key={crew.id} className="bg-slate-900 border border-white/5 p-8 rounded-[3.5rem] space-y-6">
                      <h4 className="text-2xl font-black uppercase tracking-tighter text-indigo-400">{crew.name}</h4>
                      <div className="space-y-2">
                        {crew.employeeIds.map(eid => {
                          const emp = employees.find(e => e.id === eid);
                          return (
                            <div key={eid} className="bg-white/5 p-3 rounded-xl text-[10px] font-black uppercase flex justify-between">
                              <span>{emp?.name}</span>
                              <span className="text-white/20">{emp?.role}</span>
                            </div>
                          );
                        })}
                      </div>
                      <button className="w-full bg-white/5 py-4 rounded-2xl text-[10px] font-black uppercase border border-white/5">Edit Roster</button>
                    </div>
                  ))}
                  <button onClick={() => setCrews([...crews, { id: Math.random().toString(), name: 'New Crew', employeeIds: [], status: 'available' }])} className="border-2 border-dashed border-white/10 rounded-[3.5rem] flex flex-col items-center justify-center p-12 gap-4 text-white/20 hover:text-indigo-400 transition-all">
                    <div className="text-3xl font-black">+</div>
                    <span className="text-[10px] font-black uppercase">Launch New Unit</span>
                  </button>
                </div>
              )}

              {settingsTab === 'roster' && (
                <div className="grid gap-6">
                  {employees.map(emp => (
                    <div key={emp.id} className="bg-slate-900 border border-white/5 p-8 rounded-[3.5rem] grid lg:grid-cols-5 gap-8 items-center">
                      <div className="space-y-1 col-span-1">
                        <p className="text-[8px] font-black text-white/30 uppercase">Employee</p>
                        <h4 className="text-xl font-black uppercase">{emp.name}</h4>
                      </div>
                      <div className="space-y-1 col-span-1">
                        <p className="text-[8px] font-black text-white/30 uppercase">Role Assignment</p>
                        <select 
                          className="w-full bg-white/5 p-3 rounded-xl text-[10px] font-black uppercase text-indigo-400 border-none outline-none"
                          value={emp.role}
                          onChange={(e) => setEmployees(prev => prev.map(p => p.id === emp.id ? { ...p, role: e.target.value as UserRole } : p))}
                        >
                          <option value="owner">Owner</option>
                          <option value="ops-manager">Ops Manager</option>
                          <option value="crew-lead">Crew Lead</option>
                          <option value="mover">Mover</option>
                        </select>
                      </div>
                      <div className="space-y-1 col-span-1">
                        <p className="text-[8px] font-black text-white/30 uppercase">Hire Date</p>
                        <input type="date" value={emp.hireDate} onChange={e => setEmployees(prev => prev.map(p => p.id === emp.id ? { ...p, hireDate: e.target.value } : p))} className="w-full bg-white/5 p-3 rounded-xl text-[10px] font-black outline-none" />
                      </div>
                      <div className="space-y-1 col-span-1">
                        <p className="text-[8px] font-black text-white/30 uppercase">Probation Monitor</p>
                        <div className="bg-white/5 p-3 rounded-xl text-[10px] font-black text-indigo-400">
                          Ends: {getProbationEndDate(emp.hireDate)}
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                         <button className="bg-white/5 p-3 rounded-xl text-[8px] font-black uppercase">Edit Bio</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {settingsTab === 'payroll' && (
                <div className="space-y-12">
                   {employees.map(emp => (
                     <section key={emp.id} className="bg-slate-900 border border-white/5 p-10 rounded-[4rem] space-y-10">
                        <div className="flex justify-between items-center border-b border-white/5 pb-6">
                           <div>
                              <h3 className="text-3xl font-black uppercase">{emp.name}</h3>
                              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">YTD Total: ${(emp.payroll.paymentHistory.reduce((s, p) => s + p.amount, 0)).toLocaleString()}</p>
                           </div>
                           <button className="bg-indigo-600 px-8 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl shadow-indigo-600/20">Execute Payment Record</button>
                        </div>
                        <div className="grid lg:grid-cols-3 gap-12">
                           <div className="space-y-6">
                              <h4 className="text-[10px] font-black uppercase text-white/30">Onboarding Data</h4>
                              <div className="space-y-4">
                                 <div className="bg-white/5 p-4 rounded-2xl">
                                    <p className="text-[8px] font-black text-white/30 uppercase">W-9 Form Status</p>
                                    <p className={`text-xs font-black uppercase ${emp.payroll.w9Status === 'verified' ? 'text-emerald-400' : 'text-rose-400'}`}>{emp.payroll.w9Status}</p>
                                 </div>
                                 <div className="bg-white/5 p-4 rounded-2xl">
                                    <p className="text-[8px] font-black text-white/30 uppercase">Bank Protocol</p>
                                    <p className="text-xs font-black">{emp.payroll.bankName} • Acc: ****{emp.payroll.accountNumber.slice(-4)}</p>
                                 </div>
                                 <div className="bg-white/5 p-4 rounded-2xl">
                                    <p className="text-[8px] font-black text-white/30 uppercase">Routing ID</p>
                                    <p className="text-xs font-black">{emp.payroll.routingNumber}</p>
                                 </div>
                              </div>
                           </div>
                           <div className="lg:col-span-2 space-y-6">
                              <h4 className="text-[10px] font-black uppercase text-white/30">Tax Record: Payment History</h4>
                              <div className="space-y-3 max-h-72 overflow-y-auto scrollbar-hide">
                                 {emp.payroll.paymentHistory.map(pay => (
                                   <div key={pay.id} className="bg-white/5 p-6 rounded-3xl flex justify-between items-center border border-white/5 shadow-inner">
                                      <div>
                                         <p className="text-xs font-black uppercase">{pay.date}</p>
                                         <p className="text-[9px] opacity-40 font-bold uppercase tracking-tight">{pay.note}</p>
                                      </div>
                                      <p className="text-xl font-black text-emerald-400">${pay.amount.toLocaleString()}</p>
                                   </div>
                                 ))}
                                 {emp.payroll.paymentHistory.length === 0 && <p className="text-center py-10 text-[10px] text-white/10 uppercase font-black italic">No records found for current tax year</p>}
                              </div>
                           </div>
                        </div>
                     </section>
                   ))}
                </div>
              )}

              {settingsTab === 'receipts' && (
                <div className="space-y-10">
                   <div className="flex justify-between items-center bg-slate-900 border border-white/5 p-10 rounded-[3rem]">
                      <div>
                         <h3 className="text-3xl font-black uppercase">Tax Evidence Vault</h3>
                         <p className="text-[10px] font-bold text-white/30 uppercase mt-1">Audit-ready receipt management for fleet & ops expenses</p>
                      </div>
                      <button onClick={() => receiptInputRef.current?.click()} className="bg-emerald-600 px-10 py-4 rounded-[2rem] text-[10px] font-black uppercase shadow-xl shadow-emerald-600/20 flex items-center gap-4">
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                         Register New Expense
                      </button>
                   </div>
                   <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {receipts.map(rec => (
                        <div key={rec.id} className="bg-slate-900 border border-white/5 p-6 rounded-[3.5rem] space-y-6 group">
                           <div className="aspect-[4/3] bg-black/40 rounded-[2.5rem] overflow-hidden border border-white/10 relative">
                              <img src={rec.imageUrl} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                                 <button className="text-[8px] font-black uppercase text-white underline">Download High-Res Audit Copy</button>
                              </div>
                           </div>
                           <div className="space-y-4 px-2">
                              <div className="space-y-1">
                                 <label className="text-[8px] font-black uppercase text-white/20">Tax Label / Title</label>
                                 <input className="w-full bg-white/5 p-3 rounded-xl text-[10px] font-black uppercase border-none text-white focus:ring-1 ring-indigo-500" value={rec.title} onChange={e => setReceipts(prev => prev.map(r => r.id === rec.id ? { ...r, title: e.target.value } : r))} />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-white/20">IRS Category</label>
                                    <select className="w-full bg-white/5 p-3 rounded-xl text-[10px] font-black uppercase border-none" value={rec.category} onChange={e => setReceipts(prev => prev.map(r => r.id === rec.id ? { ...r, category: e.target.value as any } : r))}>
                                       <option>Fuel</option><option>Equipment</option><option>Maintenance</option><option>Office</option><option>Other</option>
                                    </select>
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[8px] font-black uppercase text-white/20">Total Amount</label>
                                    <input type="number" className="w-full bg-white/5 p-3 rounded-xl text-[10px] font-black uppercase border-none text-emerald-400" value={rec.amount} onChange={e => setReceipts(prev => prev.map(r => r.id === rec.id ? { ...r, amount: parseFloat(e.target.value) } : r))} />
                                 </div>
                              </div>
                              <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-white/20 pt-4 border-t border-white/5">
                                 <span>User: {rec.uploadedBy}</span>
                                 <span>Date: {rec.date}</span>
                              </div>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'builder' && (
            <div className="max-w-6xl mx-auto py-10">
               <div className="grid lg:grid-cols-2 gap-16">
                  <div className="space-y-12">
                     <section className="space-y-8">
                        <h2 className="text-3xl font-black tracking-tighter uppercase">Quote Genesis</h2>
                        <div className="space-y-4">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase text-white/30 ml-2">Lead Identification</label>
                              <input placeholder="Full Customer Name" className="w-full bg-slate-900 p-6 rounded-[2rem] border border-white/5 font-black text-sm outline-none focus:ring-4 ring-indigo-500/20" value={builderCustomer.name} onChange={e => setBuilderCustomer({...builderCustomer, name: e.target.value})} />
                              <div className="grid grid-cols-2 gap-4">
                                 <input placeholder="Phone" className="bg-slate-900 p-6 rounded-[2rem] border border-white/5 font-black text-sm outline-none" value={builderCustomer.phone} onChange={e => setBuilderCustomer({...builderCustomer, phone: e.target.value})} />
                                 <input placeholder="Email" className="bg-slate-900 p-6 rounded-[2rem] border border-white/5 font-black text-sm outline-none" value={builderCustomer.email} onChange={e => setBuilderCustomer({...builderCustomer, email: e.target.value})} />
                              </div>
                           </div>
                        </div>
                     </section>

                     <section className="space-y-8">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Planning Horizon</h3>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase text-white/30 ml-2">Timeline Context</label>
                              <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                                 {['Day', 'Week', 'Month'].map(v => (
                                   <button 
                                     key={v}
                                     onClick={() => setBuilderLogistics({...builderLogistics, timelineView: v as any})}
                                     className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${builderLogistics.timelineView === v ? 'bg-indigo-600 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                   >
                                     {v}
                                   </button>
                                 ))}
                              </div>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                              <LogisticsCounter label="Total Days" value={builderLogistics.durationDays || 1} onChange={v => setBuilderLogistics({...builderLogistics, durationDays: Math.max(1, v)})} />
                              <LogisticsCounter label="Daily Hrs" value={builderLogistics.estimatedHours || 0} onChange={v => setBuilderLogistics({...builderLogistics, estimatedHours: v})} />
                           </div>
                        </div>
                        
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase text-white/30 ml-2">Timeline Details</label>
                           <textarea 
                              placeholder="e.g. Phase 1 packing Mon, Phase 2 load Tue..." 
                              className="w-full bg-slate-900 p-4 rounded-2xl border border-white/5 font-black text-xs outline-none focus:ring-2 ring-indigo-500/40 h-20 resize-none scrollbar-hide"
                              value={builderLogistics.timelineNotes}
                              onChange={e => setBuilderLogistics({...builderLogistics, timelineNotes: e.target.value})}
                           />
                        </div>

                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">MVP Logistics Matrix</h3>
                        <div className="grid grid-cols-3 gap-4">
                           <div className="space-y-2 col-span-3">
                              <label className="text-[9px] font-black uppercase text-white/30 ml-2">Team Strategy (Base Rate Lock)</label>
                              <div className="flex gap-2">
                                {[2, 3, 4].map(sz => (
                                  <button key={sz} onClick={() => setBuilderLogistics({...builderLogistics, crewSize: sz as any})} className={`flex-1 py-4 rounded-2xl text-xs font-black transition-all ${builderLogistics.crewSize === sz ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'bg-white/5 text-white/40'}`}>
                                    {sz} Unit Team
                                  </button>
                                ))}
                              </div>
                           </div>
                           <LogisticsCounter label="Stairs (Pick)" value={builderLogistics.stairsPickup || 0} onChange={v => setBuilderLogistics({...builderLogistics, stairsPickup: v})} />
                           <LogisticsCounter label="Stairs (Drop)" value={builderLogistics.stairsDropoff || 0} onChange={v => setBuilderLogistics({...builderLogistics, stairsDropoff: v})} />
                           <LogisticsCounter label="Total Miles" value={builderLogistics.mileage || 0} onChange={v => setBuilderLogistics({...builderLogistics, mileage: v})} />
                           <LogisticsSelector label="Walk Load" options={['Short', 'Medium', 'Long']} value={builderLogistics.walkDistance!} onChange={v => setBuilderLogistics({...builderLogistics, walkDistance: v as any})} />
                           <LogisticsCounter label="Heavies" value={builderLogistics.heavyItemsCount || 0} onChange={v => setBuilderLogistics({...builderLogistics, heavyItemsCount: v})} />
                           <LogisticsSelector label="Packing" options={['None', 'Partial', 'Full']} value={builderLogistics.packingType!} onChange={v => setBuilderLogistics({...builderLogistics, packingType: v as any})} />
                        </div>
                        
                        <div className="bg-white/5 p-8 rounded-[3rem] space-y-4">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Financial Optimization</h4>
                           <div className="grid grid-cols-2 gap-4">
                              <LogisticsToggle label="Charge 2.9% Fee" checked={builderLogistics.useCreditCard} onChange={v => setBuilderLogistics({...builderLogistics, useCreditCard: v})} />
                              <div className="space-y-1">
                                 <label className="text-[8px] font-black uppercase text-white/30 ml-2">Manual Tip ($)</label>
                                 <input type="number" className="w-full bg-slate-900 px-4 py-3.5 rounded-2xl text-sm font-black outline-none border border-white/5" value={builderTip} onChange={e => setBuilderTip(parseInt(e.target.value) || 0)} />
                              </div>
                           </div>
                        </div>

                        <button onClick={handleRunPricing} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-indigo-600/30 hover:scale-[1.02] active:scale-95 transition-all">
                           Ignite Calculator Logic
                        </button>
                     </section>
                  </div>

                  <div className="space-y-12">
                     <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Locked 3-Tier Proposal</h3>
                     {builderPricing ? (
                       <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                          <PricingTierCard tier={builderPricing.tiers.minimal} onSelect={() => saveQuoteAsLead('minimal')} color="border-slate-800" />
                          <PricingTierCard tier={builderPricing.tiers.recommended} onSelect={() => saveQuoteAsLead('recommended')} color="border-indigo-600" isBest />
                          <PricingTierCard tier={builderPricing.tiers.winTheJob} onSelect={() => saveQuoteAsLead('winTheJob')} color="border-emerald-600" />
                       </div>
                     ) : (
                       <div className="h-full border-2 border-dashed border-white/5 rounded-[4rem] flex flex-col items-center justify-center p-10 text-center space-y-4">
                          <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-white/10 animate-pulse">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          </div>
                          <p className="text-white/20 font-black text-sm uppercase italic">System awaiting logistics input...</p>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'leads' && !selectedJobId && (
            <div className="max-w-7xl mx-auto space-y-10">
               <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">Global Pipeline</h2>
                  <button onClick={() => setActiveTab('builder')} className="bg-indigo-600 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20">Init New Quote</button>
               </div>
               
               <div className="flex gap-6 overflow-x-auto pb-10 scrollbar-hide">
                  {['new', 'contacted', 'quoted', 'deposit-paid', 'booked'].map(status => (
                    <div key={status} className="min-w-[320px] space-y-4">
                       <div className="flex justify-between items-center px-4">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">{status.replace('-', ' ')}</h3>
                          <span className="bg-white/5 text-[10px] font-black px-2 py-0.5 rounded">{jobs.filter(j => j.status === status).length}</span>
                       </div>
                       <div className="space-y-4">
                          {jobs.filter(j => j.status === status).map(job => (
                            <div key={job.id} onClick={() => setSelectedJobId(job.id)} className="bg-slate-900 border border-white/5 p-6 rounded-[2.5rem] shadow-xl hover:border-indigo-500/40 cursor-pointer transition-all group relative overflow-hidden">
                               <div className="flex justify-between items-start mb-4">
                                  <div>
                                     <p className="font-black text-sm uppercase">{job.customerName}</p>
                                     <p className="text-[10px] text-white/40 uppercase font-bold tracking-tighter mt-1">{job.logistics.date}</p>
                                  </div>
                                  <div className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${job.leadSource === 'GBP' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white/40'}`}>{job.leadSource}</div>
                               </div>
                               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-6 truncate">{job.logistics.pickupAddress}</p>
                               <div className="flex gap-2">
                                  <button onClick={(e) => e.stopPropagation()} className="flex-1 bg-white/5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Text</button>
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedJobId(job.id); }} className="flex-1 bg-indigo-600 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all">Open</button>
                               </div>
                            </div>
                          ))}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'dashboard' && !selectedJobId && (
            <div className="max-w-7xl mx-auto space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard label="Leads Pulse" value={stats.leadsToday.toString()} color="text-white" />
                <StatCard label="Jobs Active" value={stats.jobsToday.toString()} color="text-indigo-400" />
                <StatCard label="Revenue Guarded" value={`$${stats.revenueProtected.toLocaleString()}`} color="text-emerald-400" />
                <StatCard label="Critical Alerts" value={stats.atRisk.toString()} color="text-rose-400" />
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-[3rem] p-10 flex items-center justify-between shadow-2xl">
                <div>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Team Readiness</p>
                   <p className="text-2xl font-black">{employees.filter(e => timeEntries.some(t => t.employeeId === e.id && !t.clockOut)).length} On Clock / {employees.length} Total Fleet</p>
                </div>
                <button onClick={() => setActiveTab('crew')} className="bg-white/5 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-white/10 transition-all">Launch Team Monitor</button>
              </div>
            </div>
          )}

          {selectedJobId && currentJob && (
             <JobDetailView 
                job={currentJob} 
                subTab={jobSubTab} 
                setSubTab={setJobSubTab} 
                onClose={() => setSelectedJobId(null)} 
                updateChecklist={updateJobChecklist}
                onCapture={handlePhotoCapture}
                fileInputRef={fileInputRef}
             />
          )}
        </div>
      </main>

      {isProcessing && (
        <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-3xl flex items-center justify-center">
           <div className="w-20 h-20 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-2xl shadow-indigo-500/20"></div>
        </div>
      )}
      
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; border-color: rgba(225,29,72,0.5); }
          50% { opacity: 0.85; border-color: rgba(225,29,72,0.2); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
};

const JobDetailView: React.FC<{ job: Job, subTab: string, setSubTab: (t: any) => void, onClose: () => void, updateChecklist: (f: any) => void, onCapture: any, fileInputRef: any }> = ({ job, subTab, setSubTab, onClose, updateChecklist, onCapture, fileInputRef }) => (
   <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
         <div>
            <div className="flex items-center gap-4 mb-2">
               <h2 className="text-4xl font-black tracking-tighter uppercase">{job.customerName}</h2>
               <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${job.status === 'booked' ? 'bg-emerald-500 text-white' : 'bg-indigo-500 text-white'}`}>
                  {job.status}
               </span>
            </div>
            <p className="text-white/40 font-bold uppercase tracking-widest text-xs truncate max-w-xl">{job.logistics.pickupAddress} → {job.logistics.dropoffAddress}</p>
         </div>
         <div className="text-right space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Contracted Value</p>
            <p className="text-5xl font-black tracking-tighter text-indigo-400">
               ${(job.pricing.tiers[job.selectedTier || 'recommended'].totalWithFees + (job.pricing.tip || 0)).toLocaleString()}
            </p>
         </div>
      </div>

      <div className="flex gap-1 bg-white/5 p-1 rounded-2xl w-fit">
         {['overview', 'readiness', 'photos'].map(t => (
            <button key={t} onClick={() => setSubTab(t as any)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${subTab === t ? 'bg-white text-slate-950' : 'text-white/40 hover:text-white'}`}>{t}</button>
         ))}
      </div>

      {subTab === 'overview' && (
         <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 border border-white/5 p-12 rounded-[4rem] space-y-8">
               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Structural Detail</h3>
               <div className="grid grid-cols-2 gap-8">
                  <div>
                     <p className="text-[8px] font-black uppercase text-white/20 mb-2">Move Date</p>
                     <p className="text-lg font-black">{job.logistics.date}</p>
                  </div>
                  <div>
                     <p className="text-[8px] font-black uppercase text-white/20 mb-2">Duration</p>
                     <p className="text-lg font-black">{job.logistics.durationDays} Day(s)</p>
                  </div>
                  <div>
                     <p className="text-[8px] font-black uppercase text-white/20 mb-2">Team Unit</p>
                     <p className="text-lg font-black">{job.logistics.crewSize} Person Crew</p>
                  </div>
                  <div>
                     <p className="text-[8px] font-black uppercase text-white/20 mb-2">Timeline Notes</p>
                     <p className="text-xs font-bold text-white/60">{job.logistics.timelineNotes || 'N/A'}</p>
                  </div>
               </div>
            </div>
         </div>
      )}

      {subTab === 'readiness' && (
         <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-slate-900 border border-white/5 p-12 rounded-[4.5rem] flex flex-col items-center justify-center text-center space-y-8 shadow-2xl">
               <div className="relative w-64 h-64 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                     <circle cx="50%" cy="50%" r="45%" fill="none" stroke="currentColor" strokeWidth="12" className="text-white/5" />
                     <circle cx="50%" cy="50%" r="45%" fill="none" stroke="currentColor" strokeWidth="12" className="text-indigo-500" strokeDasharray={`${job.readinessScore * 2.82 * 2.5} 706`} />
                  </svg>
                  <p className="text-7xl font-black tracking-tighter">{job.readinessScore}%</p>
               </div>
            </div>
            <div className="bg-slate-900 border border-white/5 p-12 rounded-[4.5rem] space-y-6 shadow-2xl">
               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Checklist Protocol</h3>
               <div className="space-y-4">
                  <CheckItem label="Deposit Secured" checked={job.checklist.deposit} onClick={() => updateChecklist('deposit')} />
                  <CheckItem label="Agreement Signed" checked={job.checklist.agreementSigned} onClick={() => updateChecklist('agreementSigned')} />
                  <CheckItem label="Inventory Verified" checked={job.checklist.inventory} onClick={() => updateChecklist('inventory')} />
                  <CheckItem label="Final Confirmation" checked={job.checklist.confirmation} onClick={() => updateChecklist('confirmation')} />
               </div>
            </div>
         </div>
      )}

      {subTab === 'photos' && (
         <div className="space-y-8">
            <div className="flex justify-between items-center px-4">
               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Fleet Asset Protection</h3>
               <div className="flex gap-2">
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={(e) => onCapture(e, 'before')} />
                  <button onClick={() => fileInputRef.current?.click()} className="bg-indigo-600 px-10 py-5 rounded-[2.5rem] text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center gap-4">
                     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                     Add Photo Evidence
                  </button>
               </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
               {job.photos.map((photo, i) => (
                  <div key={i} className="group relative aspect-square bg-white/5 rounded-[3rem] overflow-hidden border border-white/10 shadow-lg">
                     <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="Asset" />
                  </div>
               ))}
               {job.photos.length === 0 && <div className="col-span-full h-64 border-2 border-dashed border-white/5 rounded-[3.5rem] flex items-center justify-center text-[10px] font-black text-white/10 uppercase italic">No photographic evidence logged</div>}
            </div>
         </div>
      )}
   </div>
);

const NavIcon: React.FC<{ icon: string, active: boolean, onClick: () => void, label: string }> = ({ icon, active, onClick, label }) => (
  <button onClick={onClick} className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all group relative ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={icon} /></svg>
    <span className="absolute left-full ml-4 px-3 py-1 bg-slate-800 text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-all uppercase font-black tracking-widest z-50">{label}</span>
  </button>
);

const StatCard: React.FC<{ label: string, value: string, color: string }> = ({ label, value, color }) => (
  <div className="bg-slate-900 border border-white/5 p-8 rounded-[3.5rem] shadow-xl hover:border-white/20 transition-all group">
    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 group-hover:translate-x-1 transition-transform">{label}</p>
    <p className={`text-6xl font-black tracking-tighter ${color} leading-none`}>{value}</p>
  </div>
);

const CheckItem: React.FC<{ label: string, checked: boolean, onClick: () => void }> = ({ label, checked, onClick }) => (
  <button onClick={onClick} className={`w-full p-6 rounded-[2rem] border flex items-center justify-between transition-all ${checked ? 'bg-indigo-600/20 border-indigo-500/40 text-white shadow-inner' : 'bg-white/5 border-white/5 text-white/40'}`}>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center ${checked ? 'bg-indigo-500 border-indigo-500' : 'border-white/20'}`}>
       {checked && <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
    </div>
  </button>
);

const LogisticsCounter: React.FC<{ label: string, value: number, onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 text-center shadow-inner">
    <p className="text-[9px] font-black text-white/30 uppercase mb-3">{label}</p>
    <div className="flex items-center justify-center gap-5">
       <button onClick={() => onChange(Math.max(0, value - 1))} className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-xl font-black hover:bg-white/10 transition-all">-</button>
       <span className="text-2xl font-black">{value}</span>
       <button onClick={() => onChange(value + 1)} className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-xl font-black hover:bg-white/10 transition-all">+</button>
    </div>
  </div>
);

const LogisticsSelector: React.FC<{ label: string, options: string[], value: string, onChange: (v: string) => void }> = ({ label, options, value, onChange }) => (
  <div className="bg-slate-900 p-6 rounded-[2.5rem] border border-white/5 text-center shadow-inner">
    <p className="text-[9px] font-black text-white/30 uppercase mb-3">{label}</p>
    <div className="flex flex-wrap gap-2 justify-center">
       {options.map(opt => (
         <button key={opt} onClick={() => onChange(opt)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${value === opt ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 text-white/40'}`}>{opt}</button>
       ))}
    </div>
  </div>
);

const LogisticsToggle: React.FC<{ label: string, checked?: boolean, onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button onClick={() => onChange(!checked)} className={`p-6 rounded-[2.5rem] border transition-all flex items-center justify-center gap-4 ${checked ? 'bg-indigo-600/20 border-indigo-500/40 text-white shadow-inner' : 'bg-slate-900 border-white/5 text-white/40 opacity-50'}`}>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const PricingTierCard: React.FC<{ tier: any, onSelect: () => void, color: string, isBest?: boolean }> = ({ tier, onSelect, color, isBest }) => (
  <button onClick={onSelect} className={`w-full p-10 bg-slate-900 rounded-[4.5rem] border-2 text-left transition-all hover:scale-[1.02] active:scale-95 group relative overflow-hidden shadow-2xl ${color}`}>
    {isBest && <div className="absolute top-0 right-0 bg-indigo-600 text-white px-10 py-4 rounded-bl-[3rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-xl">ELITE SELECTION</div>}
    <div className="flex justify-between items-end">
       <div>
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/30 mb-3">{tier.label}</p>
          <p className="text-6xl font-black tracking-tighter leading-none">${tier.totalWithFees.toLocaleString()}</p>
          <div className="flex gap-6 mt-6">
             <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Incl. Fee: ${tier.processingFee.toLocaleString()}</p>
             <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Min Deposit: ${tier.depositDue.toLocaleString()}</p>
          </div>
       </div>
       <div className="text-right">
          <p className="text-[11px] font-black text-emerald-400 uppercase tracking-widest mb-2">{tier.margin}% PROFIT</p>
          <p className="text-[11px] text-white/30 uppercase font-bold max-w-[180px] leading-relaxed">{tier.description}</p>
       </div>
    </div>
  </button>
);

export default App;
