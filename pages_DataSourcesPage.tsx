import { useState, useMemo, useEffect, useRef } from 'react';
import {
  FlaskConical, Globe2, FileText, Landmark, ShoppingBag, TrendingUp,
  Brain, Search, X, ExternalLink, CheckCircle2, ArrowRight,
  ArrowLeftRight, Database, Wifi, WifiOff, RefreshCw,
  Upload, Download, Trash2, AlertCircle, CheckCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';

// ── Types ──────────────────────────────────────────────────────────────────────

type SyncDirection = 'in' | 'out' | 'both';

interface SyncRow {
  label: string;
  target: string;
  direction: SyncDirection;
}

interface DataSource {
  id: string;
  name: string;
  category: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  status: 'connected' | 'not_connected';
  lastSync: string;
  shortDesc: string;
  longDesc: string;
  liveLink: string | null;
  liveLinkLabel: string | null;
  syncs: SyncRow[];
}

// ── Data ───────────────────────────────────────────────────────────────────────

const SOURCES: DataSource[] = [
  {
    id: 'openfda',
    name: 'openFDA Drug NDC',
    category: 'Regulatory Databases',
    icon: FlaskConical,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    status: 'connected',
    lastSync: 'Live',
    shortDesc: 'FDA drug product & substance data',
    longDesc:
      'Real-time access to the FDA Drug Product Database via the openFDA API. Provides labeler codes, NDC numbers, active ingredient names, and product classifications used for exact-match and conflict screening.',
    liveLink: 'https://open.fda.gov/apis/drug/ndc/',
    liveLinkLabel: 'open.fda.gov',
    syncs: [
      { label: 'Drug Names', target: 'Brand Screening', direction: 'in' },
      { label: 'NDC Codes', target: 'Conflict Detection', direction: 'in' },
      { label: 'Active Ingredients', target: 'Similarity Scoring', direction: 'in' },
    ],
  },
  {
    id: 'rxnorm',
    name: 'RxNorm / NIH',
    category: 'Regulatory Databases',
    icon: Globe2,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    status: 'connected',
    lastSync: 'Live',
    shortDesc: 'Normalized drug nomenclature (NLM)',
    longDesc:
      'The National Library of Medicine\'s RxNorm API provides normalized names for clinical drugs. Used to detect phonetic and spelling similarities between brand name candidates and existing approved drugs.',
    liveLink: 'https://rxnav.nlm.nih.gov/',
    liveLinkLabel: 'rxnav.nlm.nih.gov',
    syncs: [
      { label: 'Drug Concepts', target: 'Brand Screening', direction: 'in' },
      { label: 'Phonetic Variants', target: 'Similarity Scoring', direction: 'in' },
    ],
  },
  {
    id: 'dailymed',
    name: 'DailyMed (FDA)',
    category: 'Regulatory Databases',
    icon: FileText,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    status: 'connected',
    lastSync: 'Live',
    shortDesc: 'FDA drug labeling information',
    longDesc:
      'DailyMed provides up-to-date drug labeling submitted to the FDA. The platform queries this database for brand name conflicts, therapeutic area data, and approved drug label searches during screening.',
    liveLink: 'https://dailymed.nlm.nih.gov/',
    liveLinkLabel: 'dailymed.nlm.nih.gov',
    syncs: [
      { label: 'Drug Labels', target: 'Brand Screening', direction: 'in' },
      { label: 'Therapeutic Areas', target: 'Market Intelligence', direction: 'in' },
    ],
  },
  {
    id: 'trademark',
    name: 'Trademark Registry',
    category: 'IP & Trademark',
    icon: Landmark,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    status: 'connected',
    lastSync: '5 min ago',
    shortDesc: 'Pharma IP registry & conflict data',
    longDesc:
      'Internal pharmaceutical trademark registry database tracking registered brand names, owners, registration numbers, and IP clearance status. Feeds into the trademark conflict scoring component of the risk engine.',
    liveLink: 'https://www.uspto.gov/trademarks',
    liveLinkLabel: 'uspto.gov',
    syncs: [
      { label: 'Trademark Records', target: 'IP Conflict Detection', direction: 'in' },
      { label: 'Brand Submissions', target: 'Trademark Registry', direction: 'out' },
    ],
  },
  {
    id: 'market',
    name: 'Market Database',
    category: 'Market Intelligence',
    icon: TrendingUp,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    status: 'connected',
    lastSync: '10 min ago',
    shortDesc: 'Pharma market listings & presence',
    longDesc:
      'Internal pharmaceutical market listings database tracking active drug brands, therapeutic categories, manufacturers, and market presence across geographies. Drives the market intelligence and competitive landscape tabs.',
    liveLink: null,
    liveLinkLabel: null,
    syncs: [
      { label: 'Market Listings', target: 'Market Intelligence', direction: 'both' },
      { label: 'Brand Presence', target: 'Risk Scoring', direction: 'in' },
    ],
  },
  {
    id: 'epharmacy',
    name: 'E-Pharmacy Database',
    category: 'Market Intelligence',
    icon: ShoppingBag,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    status: 'connected',
    lastSync: '15 min ago',
    shortDesc: 'Online pharmacy listing data',
    longDesc:
      'Tracks drug brand availability, pricing presence, and listing data across major e-pharmacy platforms. Used to detect e-pharmacy conflicts and measure online brand exposure during risk screening.',
    liveLink: null,
    liveLinkLabel: null,
    syncs: [
      { label: 'Online Listings', target: 'E-Pharmacy Conflicts', direction: 'in' },
      { label: 'Pricing Signals', target: 'Market Intelligence', direction: 'in' },
    ],
  },
  {
    id: 'claude',
    name: 'Claude AI (Anthropic)',
    category: 'AI Services',
    icon: Brain,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    status: 'connected',
    lastSync: 'Live',
    shortDesc: 'AI brand generation & risk assessment',
    longDesc:
      'Anthropic\'s Claude AI powers intelligent brand name generation, semantic risk assessment, and AI recommendation narratives. Used across Brand Analysis (AI Assessment tab) and the AI Name Generator.',
    liveLink: 'https://www.anthropic.com/',
    liveLinkLabel: 'anthropic.com',
    syncs: [
      { label: 'Brand Screening Data', target: 'AI Risk Assessment', direction: 'both' },
      { label: 'Generated Names', target: 'AI Generator', direction: 'out' },
    ],
  },
];

const CATEGORIES = ['All', 'Regulatory Databases', 'IP & Trademark', 'Market Intelligence', 'AI Services'];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: DataSource['status'] }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-100 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      Not Connected
    </span>
  );
}

function SyncArrow({ direction }: { direction: SyncDirection }) {
  if (direction === 'both') return <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
  if (direction === 'out') return <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 rotate-0" />;
  return <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 rotate-180" />;
}

// ── Detail Panel ───────────────────────────────────────────────────────────────

function DetailPanel({ source, onClose }: { source: DataSource; onClose: () => void }) {
  const Icon = source.icon;
  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', source.iconBg)}>
          <Icon className={cn('w-6 h-6', source.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base leading-tight">{source.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{source.category}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Status row */}
        <div className="flex items-center gap-3">
          <StatusChip status={source.status} />
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <RefreshCw className="w-3 h-3" />
            Last sync: {source.lastSync}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-600 leading-relaxed">{source.longDesc}</p>

        {/* What syncs */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">What syncs</p>
          <div className="space-y-2">
            {source.syncs.map((s, i) => (
              <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-sm text-gray-700 font-medium flex-1">{s.label}</span>
                <SyncArrow direction={s.direction} />
                <span className="text-sm text-gray-500 flex-1 text-right">{s.target}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live link */}
        {source.liveLink && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Portal</p>
            <a
              href={source.liveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors text-orange-700 font-medium text-sm group"
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{source.liveLinkLabel}</span>
              <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </a>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 py-4 border-t border-gray-100 space-y-2">
        <Button
          className={cn(
            'w-full font-semibold',
            source.status === 'connected'
              ? 'bg-green-700 hover:bg-green-800 text-white cursor-default'
              : 'bg-orange-600 hover:bg-orange-700 text-white',
          )}
          disabled={source.status === 'connected'}
        >
          {source.status === 'connected' ? (
            <><CheckCircle2 className="w-4 h-4 mr-2" /> Connected</>
          ) : (
            <><Wifi className="w-4 h-4 mr-2" /> Connect</>
          )}
        </Button>
        {source.status === 'connected' && (
          <Button variant="outline" className="w-full text-gray-500 border-gray-200 hover:border-red-200 hover:text-red-500">
            <WifiOff className="w-4 h-4 mr-2" /> Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Import Result type ─────────────────────────────────────────────────────────

interface ImportResult {
  type: string;
  inserted: number;
  skipped: number;
  errors: string[];
  total_rows: number;
}

// ── Import Card ────────────────────────────────────────────────────────────────

interface ImportCardProps {
  type: 'trademark' | 'market' | 'epharmacy';
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  recordCount: number;
  onImported: () => void;
}

function ImportCard({ type, title, subtitle, icon: Icon, iconColor, iconBg, recordCount, onImported }: ImportCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearMode, setClearMode] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await apiClient.importData(type, file, clearMode);
      setResult(res);
      onImported();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Import failed. Check the file format.');
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleClear() {
    if (!confirm(`Delete all ${title} records from the database? This cannot be undone.`)) return;
    setClearing(true);
    setResult(null);
    setError(null);
    try {
      await apiClient.clearImportData(type);
      onImported();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Clear failed.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-100 transition-all">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', iconBg)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{title}</p>
          <p className="text-xs text-gray-400">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {recordCount.toLocaleString()} records
        </span>
      </div>

      {/* Controls */}
      <div className="space-y-2">
        {/* Template download */}
        <button
          onClick={() => apiClient.downloadImportTemplate(type)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-500 hover:border-orange-300 hover:text-orange-600 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download template CSV
        </button>

        {/* Clear on import toggle */}
        <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={clearMode}
            onChange={e => setClearMode(e.target.checked)}
            className="w-3.5 h-3.5 accent-orange-500"
          />
          <span className="text-xs text-gray-500">Replace existing records on import</span>
        </label>

        {/* Upload button */}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white text-xs h-9"
        >
          {loading ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing…</>
          ) : (
            <><Upload className="w-3.5 h-3.5 mr-1.5" /> Upload CSV / Excel</>
          )}
        </Button>

        {/* Clear table */}
        {recordCount > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {clearing ? 'Clearing…' : 'Clear all records'}
          </button>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-100">
          <div className="flex items-center gap-1.5 text-green-700 text-xs font-semibold mb-1">
            <CheckCircle className="w-3.5 h-3.5" />
            Import complete
          </div>
          <div className="flex gap-4 text-xs text-gray-600">
            <span><span className="font-semibold text-green-700">{result.inserted}</span> inserted</span>
            <span><span className="font-semibold text-gray-500">{result.skipped}</span> skipped</span>
            <span className="text-gray-400">of {result.total_rows} rows</span>
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowErrors(v => !v)}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
              >
                <AlertCircle className="w-3 h-3" />
                {result.errors.length} row errors
                {showErrors ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showErrors && (
                <div className="mt-1 max-h-24 overflow-y-auto text-[10px] text-red-500 space-y-0.5">
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function DataSourcesPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_superuser === true;
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [importStats, setImportStats] = useState<{ trademark: number; market: number; epharmacy: number } | null>(null);

  function refreshStats() {
    if (!isAdmin) return;
    apiClient.getImportStats().then(setImportStats).catch(() => {});
  }

  useEffect(() => { refreshStats(); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedCount = SOURCES.filter(s => s.status === 'connected').length;

  const filtered = useMemo(() => {
    return SOURCES.filter(s => {
      const matchesCategory = activeCategory === 'All' || s.category === activeCategory;
      const matchesSearch =
        !search.trim() ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase()) ||
        s.shortDesc.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  return (
    <div className="min-h-screen bg-[#fffaf5] relative">
      {/* Overlay when panel is open */}
      {selectedSource && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          role="button"
          tabIndex={0}
          aria-label="Close panel"
          onClick={() => setSelectedSource(null)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') setSelectedSource(null); }}
        />
      )}

      {/* Detail panel */}
      {selectedSource && (
        <DetailPanel source={selectedSource} onClose={() => setSelectedSource(null)} />
      )}

      {/* Hero */}
      <div
        className="px-8 py-8 border-b border-orange-100"
        style={{ background: 'linear-gradient(160deg, #fffaf5 0%, #fef0de 70%, #fad4a0 100%)' }}
      >
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Data Infrastructure
          </p>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">
            Data Sources
          </h1>
          <p className="text-gray-500 text-sm mb-5">
            {SOURCES.length} sources available &bull; {connectedCount} connected
          </p>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search data sources..."
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-orange-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder:text-gray-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">
        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium border transition-all',
                activeCategory === cat
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-800',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No sources match your search</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(source => {
              const Icon = source.icon;
              return (
                <button
                  key={source.id}
                  onClick={() => setSelectedSource(source)}
                  className="group text-left bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', source.iconBg)}>
                        <Icon className={cn('w-5 h-5', source.iconColor)} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm leading-tight group-hover:text-orange-700 transition-colors">
                          {source.name}
                        </p>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                          {source.category}
                        </span>
                      </div>
                    </div>
                    <StatusChip status={source.status} />
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{source.shortDesc}</p>
                  {source.liveLink && (
                    <div className="mt-3 flex items-center gap-1 text-[10px] text-orange-500 font-medium">
                      <ExternalLink className="w-3 h-3" />
                      {source.liveLinkLabel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Import Data — admin only */}
        {isAdmin && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4 text-orange-600" />
              <h2 className="text-base font-bold text-gray-900">Import Data</h2>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Upload real pharmaceutical data from IP India, CDSCO, or e-pharmacy sources.
              Download a template first to see the expected column format.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <ImportCard
                type="trademark"
                title="Trademark Registry"
                subtitle="IP India trademark export"
                icon={Landmark}
                iconColor="text-purple-600"
                iconBg="bg-purple-100"
                recordCount={importStats?.trademark ?? 0}
                onImported={refreshStats}
              />
              <ImportCard
                type="market"
                title="Market Brands"
                subtitle="CDSCO drug list / market data"
                icon={TrendingUp}
                iconColor="text-green-600"
                iconBg="bg-green-100"
                recordCount={importStats?.market ?? 0}
                onImported={refreshStats}
              />
              <ImportCard
                type="epharmacy"
                title="E-Pharmacy Brands"
                subtitle="1mg / PharmEasy / Netmeds listings"
                icon={ShoppingBag}
                iconColor="text-teal-600"
                iconBg="bg-teal-100"
                recordCount={importStats?.epharmacy ?? 0}
                onImported={refreshStats}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
