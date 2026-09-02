import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  Sparkles, Loader2, CheckCircle, AlertTriangle, XCircle,
  Brain, Volume2, Shield, Pill, AlertCircle, Download,
  Star, FlaskConical, Heart, Target as TargetIcon, Zap, ChevronDown, RotateCcw,
  ShoppingCart, FileText,
} from 'lucide-react';
import { downloadNameDetailReport, downloadBulkNamesReport } from '@/lib/report';
import { toast } from 'sonner';
import { apiClient } from '@/api/client';
import { useCart } from '@/contexts/CartContext';
import { CaseSelector } from '@/components/CaseSelector';
import { GenerationProgress } from '@/components/GenerationProgress';
import { getCase, type BrandCase } from '@/lib/caseStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, getRecommendationColor, getRecommendationLabel } from '@/lib/utils';
import type { GeneratedName } from '@/types';

const THERAPEUTIC_AREAS = [
  'Cardiovascular', 'Neurology', 'Diabetes', 'Oncology', 'Respiratory',
  'Rheumatology', 'Dermatology', 'Gastroenterology', 'Nephrology',
  'Infectious Disease', 'Immunology', 'Metabolism', 'Ophthalmology',
  'Psychiatry', 'Endocrinology',
];

const GEOGRAPHIES = ['India', 'Global', 'US', 'EU', 'APAC', 'Latin America', 'Middle East', 'UK'];
const NAMING_STYLES = [
  'Coined Word', 'Modern & Scientific', 'Classic & Professional',
  'Descriptive Action', 'Metaphorical', 'Benefit-focused',
];

const MAX_SHORTLIST = 5;

const DEFAULT_FORM = {
  molecule: '',
  therapeutic_area: '',
  ailment: '',
  treatment: '',
  emotion_connected: '',
  outcome: '',
  geography: '',
  product_attributes: '',
  naming_style: '',
  description: '',
  count: '10',
};

function CollapsibleCard({
  title, icon, iconColor, defaultOpen = true, children,
}: {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/60 transition-colors"
      >
        <span className="text-sm flex items-center gap-2 text-gray-700 uppercase tracking-wide font-semibold">
          {icon}
          {title}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform duration-200', iconColor, !open && '-rotate-90')} />
      </button>
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-5 pt-1 space-y-3 border-t border-gray-50">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">{value.toFixed(0)}</span>
      </div>
      <Progress value={value} className="h-1.5" indicatorClassName={`bg-${color}-500`} />
    </div>
  );
}

function NameDetailModal({ name, open, onClose }: { name: GeneratedName; open: boolean; onClose: () => void }) {
  const cart = useCart();
  const navigate = useNavigate();
  const inCart = cart.has(name.generated_name);

  const viewFullScreening = () => {
    onClose();
    navigate(`/?q=${encodeURIComponent(name.generated_name)}`);
  };

  const handleAddToCart = () => {
    const added = cart.add({
      brand_name: name.generated_name,
      source_type: 'generated',
      generated_name_id: name.id,
      therapeutic_area: name.therapeutic_area,
      risk_score: name.risk_score,
      risk_level: name.recommendation_status === 'high_risk' ? 'HIGH'
        : name.recommendation_status === 'review_required' ? 'MEDIUM' : 'LOW',
    });
    if (added) toast.success(`"${name.generated_name}" added to review batch`);
    else toast.info(`"${name.generated_name}" is already in your review batch`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3 text-2xl">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Pill className="w-5 h-5 text-orange-600" />
            </div>
            {name.generated_name}
            <span className={cn('text-sm px-3 py-1 rounded-full border font-medium', getRecommendationColor(name.recommendation_status))}>
              {getRecommendationLabel(name.recommendation_status)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-2 overflow-y-auto flex-1 pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div className={cn('p-4 rounded-xl border text-center', name.risk_score < 30 ? 'bg-green-50 border-green-200' : name.risk_score < 60 ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200')}>
              <p className="text-xs text-gray-500 mb-1">Risk Score</p>
              <p className={cn('text-3xl font-bold', name.risk_score < 30 ? 'text-green-600' : name.risk_score < 60 ? 'text-orange-500' : 'text-red-600')}>
                {name.risk_score.toFixed(0)}
              </p>
              <p className="text-xs text-gray-400">/ 100</p>
            </div>
            <div className="p-4 rounded-xl border bg-orange-50 border-orange-200 text-center">
              <p className="text-xs text-gray-500 mb-1">Availability</p>
              <p className="text-3xl font-bold text-orange-600">{name.availability_score.toFixed(0)}</p>
              <p className="text-xs text-gray-400">/ 100</p>
            </div>
          </div>

          <div className="space-y-3">
            <ScoreBar label="Risk Score" value={name.risk_score} color="red" />
            <ScoreBar label="Availability" value={name.availability_score} color="green" />
            <ScoreBar label="Memorability" value={name.memorability_score} color="blue" />
            <ScoreBar label="Pronunciation Ease" value={name.pronunciation_score} color="purple" />
          </div>

          {name.trademark_availability && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <Shield className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">Trademark Availability</p>
                <p className="text-sm font-semibold text-gray-800">{name.trademark_availability}</p>
              </div>
            </div>
          )}

          {name.phonetic_analysis && (
            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="w-4 h-4 text-orange-600" />
                <p className="text-sm font-semibold text-orange-800">Phonetic Analysis</p>
              </div>
              <p className="text-sm text-gray-700">{name.phonetic_analysis}</p>
            </div>
          )}

          {name.semantic_analysis && (
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-purple-600" />
                <p className="text-sm font-semibold text-purple-800">Semantic Profile</p>
              </div>
              <p className="text-sm text-gray-700">{name.semantic_analysis}</p>
            </div>
          )}

          {name.conflict_details?.rationale && (
            <div className={cn(
              'p-4 rounded-xl border',
              name.recommendation_status === 'recommended'
                ? 'bg-green-50 border-green-200'
                : name.recommendation_status === 'review_required'
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className={cn('w-4 h-4', name.recommendation_status === 'recommended' ? 'text-green-600' : name.recommendation_status === 'review_required' ? 'text-orange-500' : 'text-red-600')} />
                <p className={cn('text-sm font-semibold', name.recommendation_status === 'recommended' ? 'text-green-800' : name.recommendation_status === 'review_required' ? 'text-orange-800' : 'text-red-800')}>
                  Decision Rationale
                </p>
              </div>
              <p className="text-sm text-gray-700">{name.conflict_details.rationale}</p>
            </div>
          )}

          {name.conflict_details?.top_conflicts && name.conflict_details.top_conflicts.length > 0 && (
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                Conflicting Brands Detected ({name.conflict_details.top_conflicts.length})
              </p>
              <div className="space-y-2">
                {name.conflict_details.top_conflicts.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-gray-900">{c.name}</span>
                      {c.owner && <span className="text-gray-400 ml-1">· {c.owner}</span>}
                      <span className="ml-2 text-gray-500">{c.source}</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span className="text-gray-500">{c.similarity_type}</span>
                      <span className={cn(
                        'font-bold px-1.5 py-0.5 rounded text-xs',
                        c.similarity_score >= 0.7 ? 'text-red-700 bg-red-100' :
                        c.similarity_score >= 0.45 ? 'text-orange-700 bg-orange-100' :
                        'text-green-700 bg-green-100'
                      )}>
                        {Math.round(c.similarity_score * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {name.ai_explanation && (
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-800">AI Recommendation</p>
              </div>
              <p className="text-sm text-gray-700">{name.ai_explanation}</p>
            </div>
          )}

          <Button
            className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
            onClick={viewFullScreening}
          >
            <Shield className="w-4 h-4" /> View Full Risk Screening
          </Button>

          <div className="flex gap-2 pt-1 flex-wrap">
            <Button className="flex-1" variant="outline" onClick={onClose}>Close</Button>
            <Button className="flex-1 gap-2" onClick={() => downloadNameDetailReport(name)}>
              <Download className="w-4 h-4" /> Download
            </Button>
            <Button
              className="flex-1 gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={inCart}
              onClick={handleAddToCart}
            >
              {inCart ? <CheckCircle className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
              {inCart ? 'In Review Batch' : 'Add to Review Batch'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function loadSession<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || '') as T; } catch { return fallback; }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AIGeneratorPage() {
  const [form, setForm] = useState(() => loadSession('pharma_gen_form', DEFAULT_FORM));
  const [cachedResults, setCachedResults] = useState<GeneratedName[]>(() =>
    loadSession('pharma_gen_results', [])
  );
  const cart = useCart();
  const [selectedName, setSelectedName] = useState<GeneratedName | null>(null);
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const [cartSelection, setCartSelection] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'risk_asc' | 'risk_desc' | 'availability' | 'memorability'>('risk_asc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'recommended' | 'review_required' | 'high_risk'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const autoCaseRef = useRef<string | null>(null);

  const mutation = useMutation({
    // Pass an explicit request to bypass form state (used when auto-generating
    // from a case on redirect, where form state hasn't settled yet).
    mutationFn: (override?: Parameters<typeof apiClient.generateBrandNames>[0]) =>
      apiClient.generateBrandNames(override ?? {
        molecule: form.molecule || undefined,
        therapeutic_area: form.therapeutic_area || undefined,
        ailment: form.ailment || undefined,
        treatment: form.treatment || undefined,
        emotion_connected: form.emotion_connected || undefined,
        outcome: form.outcome || undefined,
        geography: form.geography || undefined,
        product_attributes: form.product_attributes || undefined,
        naming_style: form.naming_style || undefined,
        description: form.description || undefined,
        count: parseInt(form.count, 10),
      }),
    onSuccess: (data) => {
      setCachedResults(data);
      setShortlisted(new Set());
      setCartSelection(new Set());
      sessionStorage.setItem('pharma_gen_results', JSON.stringify(data));
    },
  });

  const cartRiskLevel = (n: GeneratedName) =>
    n.recommendation_status === 'high_risk' ? 'HIGH'
      : n.recommendation_status === 'review_required' ? 'MEDIUM' : 'LOW';

  const updateForm = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    sessionStorage.setItem('pharma_gen_form', JSON.stringify(next));
  };

  const applyCase = (c: BrandCase | null) => {
    setSelectedCaseId(c?.case_id ?? '');
    if (!c) return;
    updateForm({
      molecule: c.generic_name || '',
      therapeutic_area: c.therapy || c.segment || '',
      ailment: c.ailment || '',
      product_attributes: c.promoting_indications || '',
    });
    toast.success(`Loaded ${c.case_id} — ${c.generic_name}`);
  };

  // Auto-load + auto-generate when redirected from the Suggestion Form
  // with ?case=<id> (e.g. the form's "Generate Names" button).
  useEffect(() => {
    const caseId = searchParams.get('case');
    if (!caseId || autoCaseRef.current === caseId) return;
    const c = getCase(caseId);
    if (!c) return;
    autoCaseRef.current = caseId;
    applyCase(c);
    mutation.mutate({
      molecule: c.generic_name || undefined,
      therapeutic_area: c.therapy || c.segment || undefined,
      ailment: c.ailment || undefined,
      product_attributes: c.promoting_indications || undefined,
      count: 10,
    });
    // clear the param so a manual re-generate / refresh doesn't re-trigger
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const toggleShortlist = (id: string) => {
    setShortlisted(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SHORTLIST) {
        next.add(id);
      } else {
        toast.info(`You can shortlist up to ${MAX_SHORTLIST} names for submission`);
      }
      return next;
    });
  };

  const toggleCartSelection = (id: string) => {
    setCartSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addSelectedToCart = () => {
    const picked = results.filter(n => cartSelection.has(n.id));
    let added = 0;
    picked.forEach(n => {
      const ok = cart.add({
        brand_name: n.generated_name,
        source_type: 'generated',
        generated_name_id: n.id,
        therapeutic_area: n.therapeutic_area,
        risk_score: n.risk_score,
        risk_level: cartRiskLevel(n),
      });
      if (ok) added += 1;
    });
    if (added > 0) toast.success(`${added} name(s) added to review batch`);
    else toast.info('Selected name(s) are already in your review batch');
    setCartSelection(new Set());
  };

  const handleClear = () => {
    setForm(DEFAULT_FORM);
    setCachedResults([]);
    setShortlisted(new Set());
    setCartSelection(new Set());
    setSelectedName(null);
    setSortBy('risk_asc');
    setFilterStatus('all');
    setCollapsedGroups(new Set());
    mutation.reset();
    sessionStorage.removeItem('pharma_gen_form');
    sessionStorage.removeItem('pharma_gen_results');
    toast.success('Cleared — starting fresh');
  };

  const results = mutation.data ?? cachedResults;
  const recommended = results.filter((n) => n.recommendation_status === 'recommended');
  const review = results.filter((n) => n.recommendation_status === 'review_required');
  const highRisk = results.filter((n) => n.recommendation_status === 'high_risk');
  const shortlistedNames = results.filter(n => shortlisted.has(n.id));

  const filteredResults = filterStatus === 'all' ? results : results.filter(n => n.recommendation_status === filterStatus);
  const sortedResults = [...filteredResults].sort((a, b) => {
    if (sortBy === 'risk_asc') return a.risk_score - b.risk_score;
    if (sortBy === 'risk_desc') return b.risk_score - a.risk_score;
    if (sortBy === 'availability') return b.availability_score - a.availability_score;
    return b.memorability_score - a.memorability_score;
  });
  const cardGroups = [
    { key: 'recommended', label: 'Recommended', Icon: CheckCircle, color: 'green', items: sortedResults.filter(n => n.recommendation_status === 'recommended') },
    { key: 'review_required', label: 'Review Required', Icon: AlertTriangle, color: 'orange', items: sortedResults.filter(n => n.recommendation_status === 'review_required') },
    { key: 'high_risk', label: 'High Risk', Icon: XCircle, color: 'red', items: sortedResults.filter(n => n.recommendation_status === 'high_risk') },
  ].filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-orange-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">Coin a Brand Name</h1>
              <p className="text-gray-500 text-sm">AI-powered brand name generation using molecule, therapy area, ailment, treatment, emotion, and product outcome criteria</p>
            </div>
            <Button
              variant="outline"
              className="gap-2 text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600"
              onClick={handleClear}
              disabled={mutation.isPending}
              title="Reset the form and clear generated names"
            >
              <RotateCcw className="w-4 h-4" /> Clear
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Generation Parameters Panel */}
          <div className="lg:col-span-1 space-y-4 lg:sticky lg:top-6 self-start">
            {/* Case selector — prefill from a saved suggestion form */}
            <CollapsibleCard title="Load from Suggestion Form" icon={<FileText className="w-4 h-4 text-orange-600" />} defaultOpen={false}>
              <CaseSelector value={selectedCaseId} onSelect={applyCase} />
              {selectedCaseId && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Parameters prefilled from <span className="font-mono text-orange-600">{selectedCaseId}</span>
                </p>
              )}
            </CollapsibleCard>

            {/* Knockout Rules Reminder */}
            <CollapsibleCard
              title="Knockout Rules"
              icon={<AlertTriangle className="w-4 h-4 text-orange-600" />}
              defaultOpen={false}
            >
              <ul className="text-xs text-orange-700 space-y-1.5">
                {[
                  'No names derived from molecule/INN stems',
                  'No disease or ailment descriptors',
                  'No chemical compound derivations',
                  'No minor variations of existing brands',
                  'No names sharing significant prefix/suffix',
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-orange-400 mt-0.5">·</span>{rule}
                  </li>
                ))}
              </ul>
            </CollapsibleCard>

            {/* Free-text brief — combine everything above in your own words */}
            <Card className="overflow-hidden">
              <div className="px-6 py-4">
                <span className="text-sm flex items-center gap-2 text-gray-700 uppercase tracking-wide font-semibold">
                  <Sparkles className="w-4 h-4 text-orange-600" />
                  Describe It Your Way
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  Optional — combine all of the above in a free-text brief. The AI honours this closely.
                </p>
                <textarea
                  className="mt-3 w-full min-h-[90px] text-sm rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 p-3 resize-y placeholder:text-gray-400"
                  placeholder="e.g. A modern, confident name for a once-weekly Type 2 diabetes injection that conveys control and vitality — easy to pronounce in English and Hindi, 2–3 syllables."
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                />
              </div>
            </Card>

            {/* Generate Names — below all the boxes, always visible */}
            <div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => mutation.mutate(undefined)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" /> Generate Names</>
                )}
              </Button>
              {mutation.isError && (
                <p className="text-red-500 text-xs text-center mt-2">Generation failed. Please try again.</p>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-2 overflow-y-auto max-h-[calc(100vh-140px)] pr-2 space-y-4">
            {mutation.isPending && (
              <GenerationProgress
                isGenerating={mutation.isPending}
                moleculeName={form.molecule || activeCase?.generic_name}
              />
            )}

            {!mutation.isPending && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-80 text-center gap-4">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Brain className="w-8 h-8 text-gray-300" />
                </div>
                <div>
                  <p className="font-semibold text-gray-500 mb-1">No names generated yet</p>
                  <p className="text-sm text-gray-400">Fill in the product details and naming criteria, then click Generate Names</p>
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{results.length} names generated</p>
                    <p className="text-sm text-gray-400">
                      {shortlisted.size > 0
                        ? <><Star className="w-3.5 h-3.5 text-orange-500 inline mr-1" />{shortlisted.size}/{MAX_SHORTLIST} shortlisted for download</>
                        : 'Tick names to add to the review batch · Star to shortlist for download · Click a name for details'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3">
                      <div className="text-center">
                        <p className="text-xl font-bold text-green-600">{recommended.length}</p>
                        <p className="text-xs text-gray-400">Recommended</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-orange-500">{review.length}</p>
                        <p className="text-xs text-gray-400">Review</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-red-500">{highRisk.length}</p>
                        <p className="text-xs text-gray-400">High Risk</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 text-gray-600 border-gray-200 hover:border-orange-400 hover:text-orange-600"
                      onClick={() => downloadBulkNamesReport(results, { molecule: form.molecule, therapeutic_area: form.therapeutic_area, geography: form.geography })}>
                      <Download className="w-4 h-4" /> Download All
                    </Button>
                  </div>
                </div>

                {/* Cart selection action bar (checkbox-driven) */}
                {cartSelection.size > 0 && (
                  <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShoppingCart className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span className="text-sm font-semibold text-purple-800 whitespace-nowrap">
                        {cartSelection.size} name{cartSelection.size > 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button size="sm" variant="outline" className="border-gray-300 text-gray-600 hover:bg-gray-100"
                        onClick={() => setCartSelection(new Set())}>
                        Clear
                      </Button>
                      <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                        onClick={addSelectedToCart}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Add {cartSelection.size} to Review Batch
                      </Button>
                    </div>
                  </div>
                )}

                {/* Shortlist action bar */}
                {shortlisted.size > 0 && (
                  <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-orange-500 fill-orange-400" />
                      <span className="text-sm font-semibold text-orange-800">
                        {shortlisted.size} of {MAX_SHORTLIST} names shortlisted
                      </span>
                      <span className="text-xs text-orange-600">
                        {shortlistedNames.map(n => n.generated_name).join(', ')}
                      </span>
                    </div>
                    <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100 gap-1.5"
                      onClick={() => downloadBulkNamesReport(shortlistedNames, { molecule: form.molecule, therapeutic_area: form.therapeutic_area, geography: form.geography })}>
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                  </div>
                )}

                {/* Sort & Filter Bar */}
                <div className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Sort by</span>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-8 text-xs w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="risk_asc">Risk Score — Low → Medium</SelectItem>
                        <SelectItem value="risk_desc">Risk Score — Medium → Low</SelectItem>
                        <SelectItem value="availability">Availability — Best first</SelectItem>
                        <SelectItem value="memorability">Memorability — Best first</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-px h-5 bg-gray-200 hidden sm:block" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Show</span>
                    <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                      <SelectTrigger className="h-8 text-xs w-52">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All names ({results.length})</SelectItem>
                        <SelectItem value="recommended">Recommended only ({recommended.length})</SelectItem>
                        <SelectItem value="review_required">Review Required only ({review.length})</SelectItem>
                        <SelectItem value="high_risk">High Risk only ({highRisk.length})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Grouped Name Cards */}
                <div className="space-y-3">
                  {cardGroups.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.key);
                    const { Icon } = group;
                    const headerCls = group.color === 'green'
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : group.color === 'orange'
                      ? 'bg-orange-50 border-orange-200 text-orange-800'
                      : 'bg-red-50 border-red-200 text-red-800';
                    const iconCls = group.color === 'green' ? 'text-green-600' : group.color === 'orange' ? 'text-orange-500' : 'text-red-600';
                    const badgeCls = group.color === 'green'
                      ? 'bg-green-100 text-green-800'
                      : group.color === 'orange'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-red-100 text-red-800';
                    const borderAccent = group.color === 'green' ? 'border-l-green-500' : group.color === 'orange' ? 'border-l-orange-400' : 'border-l-red-500';

                    return (
                      <div key={group.key} className="rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        {/* Section header */}
                        <button
                          className={cn('w-full flex items-center justify-between px-4 py-3 border-b', headerCls)}
                          onClick={() => setCollapsedGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                            return next;
                          })}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn('w-4 h-4', iconCls)} />
                            <span className="text-sm font-semibold">{group.label}</span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-bold', badgeCls)}>{group.items.length}</span>
                          </div>
                          <ChevronDown className={cn('w-4 h-4 transition-transform duration-200', iconCls, isCollapsed && '-rotate-90')} />
                        </button>

                        {/* Cards grid */}
                        {!isCollapsed && (
                          <div className="p-3 bg-gray-50/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {group.items.map((name) => (
                              <div
                                key={name.id}
                                className={cn(
                                  'relative bg-white rounded-xl border-l-4 border border-gray-100 p-4 transition-all group',
                                  borderAccent,
                                  cartSelection.has(name.id) ? 'shadow-md ring-1 ring-purple-300'
                                    : shortlisted.has(name.id) ? 'shadow-md ring-1 ring-orange-200'
                                    : 'hover:shadow-md hover:border-gray-200'
                                )}
                              >
                                {/* Cart select checkbox */}
                                <label
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                                  className="absolute top-3 left-3 z-10 flex items-center cursor-pointer"
                                  title={cartSelection.has(name.id) ? 'Remove from selection' : 'Select to add to review batch'}
                                >
                                  <input
                                    type="checkbox"
                                    checked={cartSelection.has(name.id)}
                                    onChange={() => toggleCartSelection(name.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                  />
                                </label>

                                {/* Shortlist star */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleShortlist(name.id); }}
                                  className={cn(
                                    'absolute top-3 right-3 p-1.5 rounded-lg transition-colors z-10',
                                    shortlisted.has(name.id) ? 'bg-orange-100 text-orange-500' : 'text-gray-300 hover:text-orange-400 hover:bg-orange-50'
                                  )}
                                  title={shortlisted.has(name.id) ? 'Remove from shortlist' : shortlisted.size >= MAX_SHORTLIST ? 'Shortlist full (max 5)' : 'Add to shortlist'}
                                >
                                  <Star className={cn('w-4 h-4', shortlisted.has(name.id) && 'fill-orange-400')} />
                                </button>

                                <button className="text-left w-full" onClick={() => setSelectedName(name)}>
                                  {/* Name + area */}
                                  <div className="pl-7 pr-8 mb-3">
                                    <p className="text-base font-bold text-gray-900 group-hover:text-orange-600 transition-colors leading-tight">
                                      {name.generated_name}
                                    </p>
                                    {name.therapeutic_area && (
                                      <p className="text-xs text-gray-400 mt-0.5">{name.therapeutic_area}</p>
                                    )}
                                  </div>

                                  {/* 4 mini score badges */}
                                  <div className="grid grid-cols-4 gap-1 mb-3">
                                    <div className={cn('rounded-lg border px-1 py-1.5 text-center', name.risk_score < 30 ? 'bg-green-50 text-green-700 border-green-200' : name.risk_score < 60 ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-red-50 text-red-700 border-red-200')}>
                                      <p className="text-xs font-bold leading-none">{name.risk_score.toFixed(0)}</p>
                                      <p className="text-[10px] mt-0.5 opacity-70">Risk</p>
                                    </div>
                                    <div className={cn('rounded-lg border px-1 py-1.5 text-center', name.availability_score >= 70 ? 'bg-green-50 text-green-700 border-green-200' : name.availability_score >= 40 ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-red-50 text-red-700 border-red-200')}>
                                      <p className="text-xs font-bold leading-none">{name.availability_score.toFixed(0)}</p>
                                      <p className="text-[10px] mt-0.5 opacity-70">Avail</p>
                                    </div>
                                    <div className="rounded-lg border px-1 py-1.5 text-center bg-blue-50 text-blue-700 border-blue-200">
                                      <p className="text-xs font-bold leading-none">{name.memorability_score.toFixed(0)}</p>
                                      <p className="text-[10px] mt-0.5 opacity-70">Mem.</p>
                                    </div>
                                    <div className="rounded-lg border px-1 py-1.5 text-center bg-purple-50 text-purple-700 border-purple-200">
                                      <p className="text-xs font-bold leading-none">{name.pronunciation_score.toFixed(0)}</p>
                                      <p className="text-[10px] mt-0.5 opacity-70">Pron.</p>
                                    </div>
                                  </div>

                                  {/* Risk progress bar */}
                                  <div className="space-y-1 mb-3">
                                    <div className="flex justify-between text-xs text-gray-400">
                                      <span className="flex items-center gap-1"><Shield className="w-3 h-3" />Risk</span>
                                      <span className={cn('font-semibold', name.risk_score < 30 ? 'text-green-600' : name.risk_score < 60 ? 'text-orange-500' : 'text-red-600')}>
                                        {name.risk_score.toFixed(0)}
                                      </span>
                                    </div>
                                    <Progress value={name.risk_score} className="h-1.5"
                                      indicatorClassName={name.risk_score < 30 ? 'bg-green-500' : name.risk_score < 60 ? 'bg-orange-400' : 'bg-red-500'} />
                                  </div>

                                  {/* Status + trademark */}
                                  <div className="pt-3 border-t border-gray-50 flex items-center justify-between gap-2 flex-wrap">
                                    <span className={cn('text-xs px-2 py-1 rounded-full border font-medium', getRecommendationColor(name.recommendation_status))}>
                                      {getRecommendationLabel(name.recommendation_status)}
                                    </span>
                                    {name.trademark_availability && (
                                      <span className="text-xs text-gray-400 flex items-center gap-1 min-w-0">
                                        <Shield className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate">{name.trademark_availability}</span>
                                      </span>
                                    )}
                                  </div>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cardGroups.length === 0 && (
                    <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-xl border border-gray-100">
                      No names match the selected filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedName && (
        <NameDetailModal
          name={selectedName}
          open={!!selectedName}
          onClose={() => setSelectedName(null)}
        />
      )}
    </div>
  );
}
