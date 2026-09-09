'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';

type Stage = 'job' | 'authority' | 'activity' | 'result';
type ActivityStep = 'quote' | 'payment' | 'delivery';
type Provider = { id: string; name: string; detail: string; price: number };
type RunConfig = {
  brief: string;
  budget: number;
  perPurchase: number;
  expiry: number;
  providerIds: string[];
  expiresAt: number;
};
export type JobWorkspaceProps = { accountHref?: string };

const PROVIDERS: Provider[] = [
  {
    id: 'market-index',
    name: 'Market Index',
    detail: 'Supplier pricing source',
    price: 0.85,
  },
  {
    id: 'vendor-lens',
    name: 'Vendor Lens',
    detail: 'Company intelligence source',
    price: 0.7,
  },
  {
    id: 'trade-ledger',
    name: 'Trade Ledger',
    detail: 'Import and delivery source',
    price: 1.15,
  },
];
const DEFAULT_BRIEF =
  'Compare three reliable suppliers for recycled aluminum cans. Include pricing, lead time, and one clear recommendation.';
const PREMIUM_PRICE = 2.25;
const money = (value: number) => `${value.toFixed(2)} USDC`;
const finitePositive = (value: string) => {
  const parsed = Number(value);
  return (
    /^\d+(\.\d{1,6})?$/.test(value) &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    parsed <= 1_000_000
  );
};

export default function JobWorkspace({
  accountHref = '/accounts',
}: JobWorkspaceProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [stage, setStage] = useState<Stage>('job');
  const [activityStep, setActivityStep] = useState<ActivityStep>('quote');
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [budget, setBudget] = useState('3');
  const [perPurchase, setPerPurchase] = useState('1.5');
  const [expiry, setExpiry] = useState('24');
  const [providers, setProviders] = useState(
    PROVIDERS.map((provider) => provider.id),
  );
  const [runConfig, setRunConfig] = useState<RunConfig | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const selectedProviders = useMemo(
    () => PROVIDERS.filter((provider) => providers.includes(provider.id)),
    [providers],
  );
  const quoteTotal = selectedProviders.reduce(
    (total, provider) => total + provider.price,
    0,
  );
  const values = {
    budget: Number(budget),
    perPurchase: Number(perPurchase),
    expiry: Number(expiry),
  };
  const validLimits =
    finitePositive(budget) &&
    finitePositive(perPurchase) &&
    finitePositive(expiry) &&
    values.perPurchase <= values.budget;
  const quoteWithinMandate =
    quoteTotal <= values.budget &&
    selectedProviders.every((provider) => provider.price <= values.perPurchase);
  const config = runConfig ?? { brief, ...values, providerIds: providers };
  const lockedProviders = PROVIDERS.filter((provider) =>
    config.providerIds.includes(provider.id),
  );
  const lockedQuote = lockedProviders.reduce(
    (total, provider) => total + provider.price,
    0,
  );
  const premiumBlocked =
    PREMIUM_PRICE > config.perPurchase ||
    lockedQuote + PREMIUM_PRICE > config.budget;
  const stageIndex = ['job', 'authority', 'activity', 'result'].indexOf(stage);

  function toggleProvider(id: string) {
    if (!runConfig) {
      setProviders((current) =>
        current.includes(id)
          ? current.filter((provider) => provider !== id)
          : [...current, id],
      );
      setError('');
    }
  }
  function beginAuthority() {
    if (!brief.trim() || brief.trim().length < 13)
      return setError('Add a little more detail to the job brief.');
    if (!selectedProviders.length)
      return setError('Select at least one approved provider.');
    if (!validLimits)
      return setError(
        'Use finite positive values, with the per-purchase limit within the total budget.',
      );
    if (!quoteWithinMandate)
      return setError(
        'The selected source quotes exceed this mandate. Increase the limits or select fewer sources.',
      );
    setError('');
    setStage('authority');
  }
  function runExample() {
    if (revoked)
      return setError(
        'This mandate is revoked. Start again to create a new example run.',
      );
    if (!validLimits)
      return setError(
        'Review the mandate values: use finite positive values and keep per purchase within budget.',
      );
    if (!selectedProviders.length || !quoteWithinMandate)
      return setError(
        'The edited source quotes exceed this mandate. Increase the limits or select fewer sources.',
      );
    setRunConfig({
      brief: brief.trim(),
      budget: values.budget,
      perPurchase: values.perPurchase,
      expiry: values.expiry,
      providerIds: [...providers],
      expiresAt: Date.now() + values.expiry * 3_600_000,
    });
    setActivityStep('quote');
    setError('');
    setStage('activity');
  }
  function advanceActivity() {
    if (runConfig && Date.now() >= runConfig.expiresAt) {
      setError("This mandate expired. Start again to authorize a new example run.");
      return;
    }
    if (revoked)
      return setError(
        'Mandate revoked. Previous activity remains viewable, but no new step can run.',
      );
    setError('');
    if (activityStep === 'quote') setActivityStep('payment');
    else if (activityStep === 'payment') setActivityStep('delivery');
    else setStage('result');
  }
  function advance() {
    if (stage === 'job') beginAuthority();
    else if (stage === 'authority') runExample();
    else if (stage === 'activity') advanceActivity();
  }
  function reset() {
    setStage('job');
    setActivityStep('quote');
    setBrief(DEFAULT_BRIEF);
    setBudget('3');
    setPerPurchase('1.5');
    setExpiry('24');
    setProviders(PROVIDERS.map((provider) => provider.id));
    setRunConfig(null);
    setRevoked(false);
    setError('');
    setShowDetails(false);
  }
  const activityLabel =
    activityStep === 'delivery' ? 'View result' : 'Run next step';
  const activityStatus =
    activityStep === 'quote'
      ? 'Quote ready'
      : activityStep === 'payment'
        ? 'Payment ready'
        : 'Delivery ready';

  return (
    <section
      className="job-workspace"
      aria-label="Wayleave job workspace"
      data-ready={ready}
    >
      <div className="job-context">
        <div>
          <p className="job-eyebrow">EXAMPLE JOURNEY</p>
          <h1 className="job-title">Give your agent a job.</h1>
          <p className="job-lede">
            It finds paid information, stays within your mandate, and returns an
            illustrative answer.
          </p>
        </div>
        <a className="job-account-link" href={accountHref}>
          Real account controls <ExternalLink size={14} />
        </a>
      </div>
      <div className="job-layout">
        <div className="job-progress" aria-label="Journey progress">
          {(['job', 'authority', 'activity', 'result'] as const).map(
            (item, index) => (
              <div
                className={`job-progress-step ${index === stageIndex ? 'job-progress-step-active' : index < stageIndex ? 'job-progress-step-complete' : ''}`}
                key={item}
                aria-current={index === stageIndex ? 'step' : undefined}
              >
                <span className="job-progress-number">
                  {index < stageIndex ? <Check size={13} /> : index + 1}
                </span>
                <span>
                  <strong>{item[0].toUpperCase() + item.slice(1)}</strong>
                  <small>
                    {item === 'job'
                      ? 'Brief'
                      : item === 'authority'
                        ? 'Scope'
                        : item === 'activity'
                          ? 'Proof'
                          : 'Answer'}
                  </small>
                </span>
              </div>
            ),
          )}
        </div>
        <section className="job-main-panel">
          <div className="job-panel-kicker">
            <span>RESEARCHAGENT</span>
            <span className="job-simulated-badge">SIMULATED</span>
          </div>
          {stage === 'job' && (
            <section className="job-section">
              <label className="job-field-label" htmlFor="job-brief">
                Job brief
              </label>
              <textarea
                id="job-brief"
                disabled={!ready}
                className="job-brief-input"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={4}
              />
              <p className="job-field-hint">
                Your brief stays with the mandate and appears in the final
                report.
              </p>
              <div className="job-section-divider" />
              <div className="job-section-heading">
                <div>
                  <p className="job-field-label">Approved sources</p>
                  <p className="job-field-hint">
                    Only these sources may receive simulated payments.
                  </p>
                </div>
                <span className="job-count-label">
                  {selectedProviders.length} selected
                </span>
              </div>
              <div className="job-provider-list">
                {PROVIDERS.map((provider) => (
                  <label
                    className={`job-provider ${providers.includes(provider.id) ? 'job-provider-selected' : ''}`}
                    key={provider.id}
                  >
                    <input
                      type="checkbox"
                      disabled={!ready}
                      checked={providers.includes(provider.id)}
                      onChange={() => toggleProvider(provider.id)}
                    />
                    <span className="job-provider-check">
                      {providers.includes(provider.id) && <Check size={12} />}
                    </span>
                    <span className="job-provider-copy">
                      <strong>{provider.name}</strong>
                      <small>{provider.detail}</small>
                    </span>
                    <span className="job-provider-price">
                      {money(provider.price)}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
          {stage === 'authority' && (
            <section className="job-section">
              <div className="job-authority-intro">
                <span className="job-icon-circle">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <p className="job-section-title">Review the authority</p>
                  <p className="job-field-hint">
                    Once the example starts, these values are frozen.
                  </p>
                </div>
                <button
                  type="button"
                  className="job-inline-edit"
                  onClick={() => setStage('job')}
                >
                  Edit job
                </button>
              </div>
              <div className="job-brief-summary">
                <span>Job brief</span>
                <p>{brief}</p>
              </div>
              <div className="job-authority-card">
                <div className="job-authority-amount">
                  <span>Total budget</span>
                  <strong>{money(config.budget)}</strong>
                  <small>available for this job</small>
                </div>
                <div className="job-authority-rule">
                  <span>Approved sources</span>
                  <strong>
                    {lockedProviders
                      .map((provider) => provider.name)
                      .join(', ')}
                  </strong>
                </div>
                <div className="job-authority-rule">
                  <span>Per purchase</span>
                  <strong>{money(config.perPurchase)}</strong>
                </div>
                <div className="job-authority-rule">
                  <span>Expires in</span>
                  <strong>{config.expiry} hours</strong>
                </div>
              </div>
              <span className="job-evidence-note">
                <LockKeyhole size={14} /> Example policy only · no live wallet,
                ENS, Arc, or Ledger connection
              </span>
            </section>
          )}
          {stage === 'activity' && (
            <section className="job-section">
              <div className="job-activity-heading">
                <div>
                  <p className="job-section-title">Agent activity</p>
                  <p className="job-field-hint">
                    Local example state advances one decision at a time.
                  </p>
                </div>
                <span className="job-running-label">
                  <span className="job-status-dot" /> {activityStatus}
                </span>
              </div>
              <div className="job-feed" aria-label="Example activity feed">
                <div className="job-feed-item job-feed-done">
                  <span className="job-feed-icon">
                    <Check size={14} />
                  </span>
                  <div>
                    <strong>Job accepted</strong>
                    <small>Brief and approved source list saved locally</small>
                  </div>
                  <time>done</time>
                </div>
                <div
                  className={`job-feed-item ${activityStep === 'quote' ? 'job-feed-current' : 'job-feed-done'}`}
                >
                  <span className="job-feed-icon">
                    {activityStep === 'quote' ? '2' : <Check size={14} />}
                  </span>
                  <div>
                    <strong>Quote selected</strong>
                    <small>
                      {activityStep === 'quote'
                        ? 'Ready to compare the approved source quotes'
                        : `${lockedProviders.length} sources · ${money(lockedQuote)} total`}
                    </small>
                  </div>
                  <time>{activityStep === 'quote' ? 'next' : 'done'}</time>
                </div>
                <div
                  className={`job-feed-item ${activityStep === 'payment' ? 'job-feed-current' : activityStep === 'delivery' ? 'job-feed-done' : ''}`}
                >
                  <span className="job-feed-icon">
                    {activityStep === 'payment' ? (
                      '3'
                    ) : activityStep === 'delivery' ? (
                      <Check size={14} />
                    ) : (
                      '3'
                    )}
                  </span>
                  <div>
                    <strong>Simulated payment</strong>
                    <small>
                      {activityStep === 'payment'
                        ? 'Review the deterministic payment decision'
                        : activityStep === 'delivery'
                          ? `${money(lockedQuote)} example spend recorded locally`
                          : 'Waiting for quote selection'}
                    </small>
                  </div>
                  <time>
                    {activityStep === 'payment'
                      ? 'next'
                      : activityStep === 'delivery'
                        ? 'done'
                        : 'queued'}
                  </time>
                </div>
                {premiumBlocked && (
                  <div className="job-feed-item job-feed-blocked">
                    <span className="job-feed-icon">
                      <X size={14} />
                    </span>
                    <div>
                      <strong>Optional premium dataset blocked</strong>
                      <small>
                        {money(PREMIUM_PRICE)} exceeds the frozen authority
                      </small>
                    </div>
                    <span className="job-blocked-label">Blocked</span>
                  </div>
                )}
                <div
                  className={`job-feed-item ${activityStep === 'delivery' ? 'job-feed-current' : ''}`}
                >
                  <span className="job-feed-icon">
                    {activityStep === 'delivery' ? (
                      '4'
                    ) : (
                      <FileCheck2 size={14} />
                    )}
                  </span>
                  <div>
                    <strong>Report assembly</strong>
                    <small>
                      {activityStep === 'delivery'
                        ? 'Ready to assemble the illustrative report'
                        : 'Waiting for local delivery step'}
                    </small>
                  </div>
                  <time>{activityStep === 'delivery' ? 'next' : 'queued'}</time>
                </div>
              </div>
            </section>
          )}
          {stage === 'result' && (
            <section className="job-section">
              <div className="job-result-heading">
                <div>
                  <p className="job-section-title">Illustrative report ready</p>
                  <p className="job-field-hint">
                    Assembled locally from the selected source simulations and
                    your brief.
                  </p>
                </div>
                <span className="job-result-status">
                  <Check size={14} /> Local example
                </span>
              </div>
              <article className="job-result-card">
                <span className="job-result-kicker">
                  ILLUSTRATIVE COMPARISON
                </span>
                <h2>Example supplier comparison</h2>
                <p>
                  Fictional supplier summaries were assembled from the selected
                  simulated sources. Review them as a product-flow example; they
                  are not live supplier data or verified delivery.
                </p>
                <div className="job-result-brief">
                  <span>Your brief</span>
                  <p>{config.brief}</p>
                </div>
                <div className="job-fictional-suppliers">
                  <div>
                    <strong>Northstar Metals</strong>
                    <span>Illustrative price · $1,840 / tonne</span>
                    <small>Fictional supplier row</small>
                  </div>
                  <div>
                    <strong>Harbor Alloy Co.</strong>
                    <span>Illustrative price · $1,920 / tonne</span>
                    <small>Fictional supplier row</small>
                  </div>
                  <div>
                    <strong>GreenLoop Supply</strong>
                    <span>Illustrative price · $2,010 / tonne</span>
                    <small>Fictional supplier row</small>
                  </div>
                </div>
                <div className="job-result-metrics">
                  <div>
                    <span>Sources simulated</span>
                    <strong>{lockedProviders.length}</strong>
                  </div>
                  <div>
                    <span>Example spend</span>
                    <strong>{money(lockedQuote)}</strong>
                  </div>
                  <div>
                    <span>Delivery state</span>
                    <strong>Example delivered</strong>
                  </div>
                </div>
              </article>
              <button
                type="button"
                className="job-details-toggle"
                onClick={() => setShowDetails((current) => !current)}
                aria-expanded={showDetails}
              >
                <span>Example receipts & evidence</span>
                <ChevronDown
                  size={16}
                  className={showDetails ? 'job-chevron-open' : ''}
                />
              </button>
              {showDetails && (
                <div className="job-receipts">
                  {lockedProviders.map((provider) => (
                    <div key={provider.id}>
                      <span>{provider.name}</span>
                      <strong>{money(provider.price)}</strong>
                      <small>Local example evidence · no onchain receipt</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {error && (
            <div className="job-error" role="alert">
              <CircleAlert size={16} />
              {error}
            </div>
          )}
          <div className="job-action-row">
            <button
              type="button"
              className="job-primary-action"
              disabled={!ready}
              onClick={stage === 'result' ? reset : advance}
            >
              {stage === 'result' ? (
                <RotateCcw size={16} />
              ) : (
                <ArrowRight size={16} />
              )}
              {stage === 'job'
                ? 'Review authority'
                : stage === 'authority'
                  ? 'Run example journey'
                  : stage === 'activity'
                    ? activityLabel
                    : 'Start again'}
            </button>
            {stage !== 'result' && (
              <span className="job-action-note">
                <Clock3 size={14} /> No live transactions are sent
              </span>
            )}
            {stage !== 'job' && stage !== 'result' && (
              <button
                type="button"
                className="job-reset-secondary"
                onClick={reset}
              >
                <RotateCcw size={14} /> Start again
              </button>
            )}
          </div>
        </section>
        <aside className="job-side-panel" aria-label="Job controls">
          <div className="job-side-heading">
            <div>
              <p className="job-side-kicker">MANDATE</p>
              <h2>Keep it bounded.</h2>
            </div>
            <WalletCards size={18} />
          </div>
          <div className="job-limit-fields">
            <label>
              Budget
              <input
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                disabled={!ready || Boolean(runConfig)}
                aria-invalid={!finitePositive(budget)}
              />
              <span>USDC total</span>
            </label>
            <label>
              Per purchase
              <input
                inputMode="decimal"
                value={perPurchase}
                onChange={(event) => setPerPurchase(event.target.value)}
                disabled={!ready || Boolean(runConfig)}
                aria-invalid={
                  !finitePositive(perPurchase) ||
                  values.perPurchase > values.budget
                }
              />
              <span>USDC max</span>
            </label>
            <label>
              Expiry
              <input
                inputMode="numeric"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                disabled={!ready || Boolean(runConfig)}
                aria-invalid={!finitePositive(expiry)}
              />
              <span>hours</span>
            </label>
          </div>
          <div className="job-validation">
            {!validLimits && (
              <>
                <CircleAlert size={14} /> Use finite positive values and keep
                per purchase within budget.
              </>
            )}
          </div>
          <div className="job-next-review">
            <span>Next review</span>
            <strong>
              {stage === 'job'
                ? 'Before the agent runs'
                : stage === 'authority'
                  ? 'Before spending begins'
                  : 'After each local step'}
            </strong>
          </div>
          <div className="job-side-divider" />
          <div className="job-sponsor-list">
            <p className="job-side-kicker">CONNECTION STATUS</p>
            <span>ENS · Not connected</span>
            <span>Arc · Not connected</span>
            <span>Ledger · Not connected</span>
          </div>
          <p className="job-side-footnote">
            Open evidence details to inspect the local simulation. Live sponsor
            connections are not enabled in this view.
          </p>
          <button
            type="button"
            className={`job-revoke-action ${revoked ? 'job-revoke-action-revoked' : ''}`}
            onClick={() => {
              setRevoked(true);
              setError(
                'Mandate revoked. Previous local activity remains viewable.',
              );
            }}
            disabled={!ready || !runConfig || revoked}
          >
            <XCircle size={15} />
            {revoked ? 'Mandate revoked' : 'Revoke mandate'}
          </button>
        </aside>
      </div>
    </section>
  );
}
