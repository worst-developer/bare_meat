import React, { useState } from 'react';
import { COINGLASS_SYMBOLS, type ChatTarget, type CoinglassSymbol, type TradingViewChartPreset } from '../../../src/types';
import ChatTargetForm from './ChatTargetForm';
import { logoForProvider, providerLogoNeedsBackplate } from '../logos';
import { DEFAULT_TRADINGVIEW_TIMEFRAMES } from '../../../src/tradingview/auto-capture';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatTargets: ChatTarget[];
  onSaveChatTarget: (target: ChatTarget) => void;
  onDeleteChatTarget: (targetId: string) => void;
  onUpdateChatTarget: (target: ChatTarget) => void;
  tradingViewPresets: TradingViewChartPreset[];
  onSaveTradingViewPreset: (preset: TradingViewChartPreset) => void;
  onDeleteTradingViewPreset: (presetId: string) => void;
  onUpdateTradingViewPreset: (preset: TradingViewChartPreset) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  chatTargets,
  onSaveChatTarget,
  onDeleteChatTarget,
  onUpdateChatTarget,
  tradingViewPresets,
  onSaveTradingViewPreset,
  onDeleteTradingViewPreset,
  onUpdateTradingViewPreset,
}: SettingsModalProps) {
  const [editingTarget, setEditingTarget] = useState<ChatTarget | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TradingViewChartPreset | undefined>(undefined);
  const [showPresetForm, setShowPresetForm] = useState(false);

  if (!isOpen) return null;

  const handleSaveChatTarget = (target: ChatTarget) => {
    if (editingTarget) {
      onUpdateChatTarget(target);
    } else {
      onSaveChatTarget(target);
    }
    setShowForm(false);
    setEditingTarget(undefined);
  };

  const handleEditTarget = (target: ChatTarget) => {
    setEditingTarget(target);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTarget(undefined);
  };

  const handleAddNewTarget = () => {
    setEditingTarget(undefined);
    setShowForm(true);
  };

  const handleSaveTradingViewPreset = (preset: TradingViewChartPreset) => {
    if (editingPreset) {
      onUpdateTradingViewPreset(preset);
    } else {
      onSaveTradingViewPreset(preset);
    }
    setShowPresetForm(false);
    setEditingPreset(undefined);
  };

  const handleEditTradingViewPreset = (preset: TradingViewChartPreset) => {
    setEditingPreset(preset);
    setShowPresetForm(true);
  };

  const handleCloseTradingViewPresetForm = () => {
    setShowPresetForm(false);
    setEditingPreset(undefined);
  };

  const handleAddTradingViewPreset = () => {
    setEditingPreset(undefined);
    setShowPresetForm(true);
  };

  return (
    <div className="modal modal-open settings-modal">
      <div className="modal-box settings-modal__box">
        <div className="settings-modal__header">
          <div>
            <h2 className="settings-modal__title">Settings</h2>
          </div>
          <button className="btn btn-ghost btn-square btn-sm" type="button" aria-label="Close settings" onClick={onClose}>
            x
          </button>
        </div>

        <div className="settings-modal__content">
          {showForm ? (
            <ChatTargetForm
              initialData={editingTarget}
              onSave={handleSaveChatTarget}
              onCancel={handleCloseForm}
            />
          ) : showPresetForm ? (
            <TradingViewPresetForm
              initialData={editingPreset}
              onSave={handleSaveTradingViewPreset}
              onCancel={handleCloseTradingViewPresetForm}
            />
          ) : (
            <div className="settings-stack">
            <div className="settings-section">
              <div className="settings-section__toolbar">
                <h3 className="settings-section__title">TradingView charts</h3>
                <div className="settings-section__actions">
                  <button className="btn btn-sm" type="button" onClick={handleAddTradingViewPreset}>
                    Add
                  </button>
                </div>
              </div>

              {tradingViewPresets.length === 0 ? (
                <div className="empty-state settings-empty">
                  No TradingView charts configured.
                </div>
              ) : (
                <div className="settings-target-list">
                  {tradingViewPresets.map((preset) => (
                    <div key={preset.id} className="settings-target">
                      <div className="settings-target__top">
                        <div className="settings-target__main">
                          <h4 className="settings-target__name">{preset.name} · {preset.symbol}</h4>
                          <div className="settings-target__url">{preset.chartUrl}</div>
                        </div>
                        <input
                          className="toggle toggle-sm"
                          type="checkbox"
                          aria-label={`${preset.name} enabled`}
                          checked={preset.enabled}
                          onChange={(event) => onUpdateTradingViewPreset({ ...preset, enabled: event.target.checked })}
                        />
                      </div>
                      <div className="settings-target__actions">
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleEditTradingViewPreset(preset)}>
                          Edit
                        </button>
                        <button className="btn btn-error btn-soft btn-sm" type="button" onClick={() => onDeleteTradingViewPreset(preset.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-section">
              <div className="settings-section__toolbar">
                <h3 className="settings-section__title">Chat targets</h3>
                <div className="settings-section__actions">
                  <button className="btn btn-sm" type="button" onClick={handleAddNewTarget}>
                    Add
                  </button>
                </div>
              </div>

              {chatTargets.length === 0 ? (
                <div className="empty-state settings-empty">
                  No chat targets configured.
                </div>
              ) : (
                <div className="settings-target-list">
                  {chatTargets.map((target) => (
                    <div key={target.id} className="settings-target">
                      <div className="settings-target__top">
                        <div className="settings-target__main">
                          <h4 className="settings-target__name settings-target__name--logo">
                            <img
                              className={`service-logo-image agent-logo-image${providerLogoNeedsBackplate(target.provider) ? ' service-logo-image--backplate' : ''}`}
                              src={logoForProvider(target.provider)}
                              alt=""
                              aria-hidden="true"
                            />
                            {target.name}
                          </h4>
                          <div className="settings-target__url">{target.chatUrl}</div>
                        </div>
                        <input
                          className="toggle toggle-sm"
                          type="checkbox"
                          aria-label={`${target.name} enabled`}
                          checked={target.enabled}
                          onChange={(event) => onUpdateChatTarget({ ...target, enabled: event.target.checked })}
                        />
                      </div>
                      <div className="settings-target__actions">
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => handleEditTarget(target)}>
                          Edit
                        </button>
                        <button className="btn btn-error btn-soft btn-sm" type="button" onClick={() => onDeleteChatTarget(target.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>
      <button className="modal-backdrop" type="button" aria-label="Close settings" onClick={onClose}>close</button>
    </div>
  );
}

function TradingViewPresetForm({
  initialData,
  onSave,
  onCancel,
}: {
  initialData?: TradingViewChartPreset;
  onSave: (preset: TradingViewChartPreset) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [symbol, setSymbol] = useState(initialData?.symbol || '');
  const [coinglassSymbol, setCoinglassSymbol] = useState<CoinglassSymbol | ''>(initialData?.coinglassSymbol || '');
  const [chartUrl, setChartUrl] = useState(initialData?.chartUrl || '');
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);
  const [error, setError] = useState('');

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    const nextName = name.trim();
    const nextSymbol = symbol.trim();
    const nextUrl = chartUrl.trim();
    if (!nextName || !nextSymbol || !isTradingViewUrl(nextUrl)) {
      setError('Name, symbol and a valid TradingView URL are required.');
      return;
    }
    onSave({
      id: initialData?.id || `tv_${Date.now()}`,
      name: nextName,
      symbol: nextSymbol,
      coinglassSymbol: coinglassSymbol || null,
      chartUrl: nextUrl,
      enabled,
      timeframes: initialData?.timeframes ?? DEFAULT_TRADINGVIEW_TIMEFRAMES,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="chat-target-form">
      <h2 className="settings-section__title">
        {initialData ? 'Edit TradingView chart' : 'Add TradingView chart'}
      </h2>

      <label className="form-control">
        <span className="label-text">Name</span>
        <input className="input input-bordered" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="BTC" />
      </label>

      <label className="form-control">
        <span className="label-text">Symbol</span>
        <input className="input input-bordered" type="text" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="BTCUSDT.P" />
      </label>

      <label className="form-control">
        <span className="label-text">CoinGlass coin</span>
        <select
          className="select"
          value={coinglassSymbol}
          onChange={(event) => setCoinglassSymbol(event.target.value as CoinglassSymbol | '')}
        >
          <option value="">Do not scrape CoinGlass</option>
          {COINGLASS_SYMBOLS.map((coin) => (
            <option key={coin} value={coin}>{coin}</option>
          ))}
        </select>
      </label>

      <label className="form-control">
        <span className="label-text">Chart URL</span>
        <input className="input input-bordered" type="text" value={chartUrl} onChange={(event) => setChartUrl(event.target.value)} placeholder="https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT.P" />
      </label>

      <label className="chat-target-form__enabled" aria-label="Enabled">
        <input className="toggle toggle-sm" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      </label>

      {error && <div className="form-error">{error}</div>}

      <div className="chat-target-form__actions">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" type="submit">
          {initialData ? 'Save changes' : 'Create chart'}
        </button>
      </div>
    </form>
  );
}

function isTradingViewUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith('tradingview.com');
  } catch {
    return false;
  }
}
