import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { scrapeTradingViewTelemetry } from '../../src/tradingview/telemetry';
import { validateTelemetryIntegrity } from '../../src/tradingview/telemetry-integrity';
import type { ScreenshotMeta, TradingViewTelemetryMetric, TradingViewTelemetrySnapshot } from '../../src/types';

describe('TradingView telemetry scraping', () => {
  it('parses real Data Window CTX rows and accepts supported schema 1 data as valid', () => {
    loadDataWindowFixture(dataWindowFixture());

    const telemetry = scrapeTradingViewTelemetry('BTCUSD.P', '4H');

    expect(telemetry).not.toBeNull();
    expect(telemetry?.valid).toBe(true);
    expect(telemetry?.quality).toBe('valid');
    expect(telemetry?.errors).toEqual([]);
    expect(telemetry?.warnings).toEqual([]);
    expect(telemetry?.metrics['CTX|META|SCHEMA']?.value).toBe(1);
    expect(telemetry?.metrics['CTX|META|CURRENT_ONLY']?.value).toBe(1);
    expect(telemetry?.metrics['CTX|META|BAR_TIME']?.value).toBe(1785931200000);
    expect(telemetry?.metrics['CTX|PRICE|CLOSE']?.value).toBe(64464.5);
    expect(telemetry?.metrics['CTX|DIST|PDH|PCT']?.value).toBe(-0);
    expect(telemetry?.metrics['CTX|SESSION|FRANKFURT|OPEN']?.value).toBeNull();
    expect(telemetry?.metrics['CTX|CROSS|NASDAQ|PRICE']?.value).toBe(29689.7);
  });

  it('rejects hidden Market Context rows instead of treating stale hidden data as valid', () => {
    loadDataWindowFixture(dataWindowFixture({ primaryHidden: true }));

    const telemetry = scrapeTradingViewTelemetry('BTCUSD.P', '4H');

    expect(telemetry?.valid).toBe(false);
    expect(telemetry?.errors).toContain('primary Market Context Telemetry indicator is hidden in TradingView');
  });
});

describe('TradingView telemetry integrity validation', () => {
  it('rejects saved telemetry captured by the old all-one scraper', () => {
    const screenshot = screenshotWithTelemetry(corruptedTelemetry());
    const result = validateTelemetryIntegrity([screenshot]).get(screenshot.key);

    expect(result?.status).toBe('invalid');
    expect(result?.promptEligible).toBe(false);
    expect(result?.reason).toContain('older broken scraper');
  });
});

function loadDataWindowFixture(html: string): void {
  const window = parseHTML(html);

  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: window.HTMLElement, configurable: true });
}

function dataWindowFixture(options: { primaryHidden?: boolean } = {}): string {
  const primaryAction = options.primaryHidden ? 'Show data' : 'Hide data';
  const primaryHiddenClass = options.primaryHidden ? ' hidden-_gbYDtbd' : '';

  return `
    <div class="widgetbar-page active">
      <div data-test-id-widget-type="object_tree" class="widget-aKdZqnMd widgetbar-widget widgetbar-widget-object_tree">
        <div class="widgetHeader-aKdZqnMd">
          <button role="tab" id="data-window" aria-selected="true">Data window</button>
        </div>
        <div class="container-UNtFS6lU" role="treegrid">
          <div class="view-_gbYDtbd" tabindex="-1" aria-disabled="true">
            <div class="values-_gbYDtbd">
              <div class="item-_gbYDtbd">
                <div class="itemTitle-_gbYDtbd apply-overflow-tooltip" data-test-id-value-title="Date">Date</div>
                <div><span>Wed 05 Aug '26</span></div>
              </div>
              <div class="item-_gbYDtbd">
                <div class="itemTitle-_gbYDtbd apply-overflow-tooltip" data-test-id-value-title="Time">Time</div>
                <div><span>15:00</span></div>
              </div>
            </div>
          </div>
          <div class="view-_gbYDtbd hoverEnable-_gbYDtbd" tabindex="-1" data-role="menuitem" role="row" data-id="_seriesId">
            <div class="header-_gbYDtbd">
              <span class="headerTitle-_gbYDtbd apply-common-tooltip" title="BTCUSD Perpetual Contract">BTCUSD.P · 4h · Bybit</span>
              <button aria-label="Hide data" data-tooltip="Hide data"></button>
            </div>
          </div>
          <div class="view-_gbYDtbd${primaryHiddenClass} hoverEnable-_gbYDtbd" tabindex="-1" data-role="menuitem" role="row" data-id="UgrXPo">
            <div class="header-_gbYDtbd">
              <span class="headerTitle-_gbYDtbd apply-common-tooltip">Market Context Telemetry [Agent] (0900-1500:1234567, Asia/Tokyo)</span>
              <button aria-label="${primaryAction}" data-tooltip="${primaryAction}"></button>
            </div>
            <div class="values-_gbYDtbd">
              ${row('CTX|META|SCHEMA', '1.0')}
              ${row('CTX|META|CURRENT_ONLY', '1.0')}
              ${row('CTX|META|BAR_TIME', '1,785,931,200,000.0')}
              ${row('CTX|META|BAR_CONFIRMED', '0.0')}
              ${row('CTX|PRICE|CLOSE', '64,464.5')}
              ${row('CTX|VOLATILITY|ATR', '587.5')}
              ${row('CTX|VOLATILITY|ATR_PCT', '0.9')}
              ${row('CTX|VOLATILITY|DAY_RANGE_ATR', '1.5')}
              ${row('CTX|VOLATILITY|SESSION_RANGE_ATR', '∅')}
              ${row('CTX|LEVEL|DO', '64,020.1')}
              ${row('CTX|LEVEL|PDH', '64,458.8')}
              ${row('CTX|LEVEL|PDL', '63,241.1')}
              ${row('CTX|DIST|PDH|PCT', '−0.0')}
              ${row('CTX|DIST|PDL|PCT', '−1.9')}
              ${row('CTX|SESSION|ASIA|OPEN', '64,020.1')}
              ${row('CTX|SESSION|ASIA|HIGH', '64,443.9')}
              ${row('CTX|SESSION|ASIA|LOW', '63,870.2')}
              ${row('CTX|SESSION|ASIA|RANGE_PCT', '0.9')}
              ${row('CTX|SESSION|ASIA|RETURN_PCT', '0.1')}
              ${row('CTX|SESSION|ASIA|ACTIVE', '0.0')}
              ${row('CTX|SESSION|FRANKFURT|OPEN', '∅')}
              ${row('CTX|SESSION|FRANKFURT|HIGH', '∅')}
              ${row('CTX|SESSION|FRANKFURT|LOW', '∅')}
              ${row('CTX|SESSION|FRANKFURT|RANGE_PCT', '∅')}
              ${row('CTX|SESSION|FRANKFURT|ACTIVE', '0.0')}
              ${row('CTX|SESSION|LONDON|OPEN', '64,083.2')}
              ${row('CTX|SESSION|LONDON|HIGH', '64,199.0')}
              ${row('CTX|SESSION|LONDON|LOW', '63,931.8')}
              ${row('CTX|SESSION|LONDON|RANGE_PCT', '0.4')}
              ${row('CTX|SESSION|LONDON|RETURN_PCT', '−0.1')}
              ${row('CTX|SESSION|LONDON|ACTIVE', '0.0')}
              ${row('CTX|SESSION|NY|OPEN', '64,039.2')}
              ${row('CTX|SESSION|NY|HIGH', '64,326.3')}
              ${row('CTX|SESSION|NY|LOW', '63,800.4')}
              ${row('CTX|SESSION|NY|RANGE_PCT', '0.8')}
              ${row('CTX|SESSION|NY|RETURN_PCT', '0.2')}
              ${row('CTX|SESSION|NY|ACTIVE', '0.0')}
              ${row('CTX|VWAP|DAY', '64,220.3')}
              ${row('CTX|VOL|RVOL', '1.9')}
              ${row('CTX|RANGE|DAY_USED_PCT', '61.3')}
              ${row('CTX|VP|FIXED|POC', '64,038.6')}
              ${row('CTX|STRUCT|STATE', '−1.0')}
            </div>
          </div>
          <div class="view-_gbYDtbd hoverEnable-_gbYDtbd" tabindex="-1" data-role="menuitem" role="row" data-id="0bYOhO">
            <div class="header-_gbYDtbd">
              <span class="headerTitle-_gbYDtbd apply-common-tooltip">Agent Context - Cross Market (USDT.D · CRYPTOCAP, BTC.D · CRYPTOCAP, ETHBTC · Binance)</span>
              <button aria-label="Hide data" data-tooltip="Hide data"></button>
            </div>
            <div class="values-_gbYDtbd">
              ${row('CTX|META|SCHEMA', '1.0')}
              ${row('CTX|META|CURRENT_ONLY', '1.0')}
              ${row('CTX|META|BAR_TIME', '1,785,931,200,000.0')}
              ${row('CTX|CROSS|USDTD|PRICE', '8.4')}
              ${row('CTX|CROSS|USDTD|RET_1H', '−0.1')}
              ${row('CTX|CROSS|BTCD|PRICE', '59.3')}
              ${row('CTX|CROSS|ETHBTC|PRICE', '0.0')}
              ${row('CTX|CROSS|NASDAQ|PRICE', '29,689.7')}
              ${row('CTX|CROSS|SPX|PRICE', '∅')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function row(label: string, value: string): string {
  return `
    <div class="item-_gbYDtbd">
      <div class="itemTitle-_gbYDtbd apply-overflow-tooltip" data-test-id-value-title="${label}">${label}</div>
      <div><span style="color: rgb(41, 98, 255);">${value}</span></div>
    </div>
  `;
}

function screenshotWithTelemetry(telemetry: TradingViewTelemetrySnapshot): ScreenshotMeta {
  return {
    id: 'shot',
    key: 'BTCUSD.P::4H',
    symbol: 'BTCUSD.P',
    normalizedSymbol: 'BTCUSD.P',
    timeframe: '4H',
    blobId: 'blob',
    hash: 'hash',
    mimeType: 'image/png',
    capturedAt: Date.now(),
    rawTradingView: {
      intervalValue: '240',
    },
    tradingViewTelemetry: telemetry,
  };
}

function corruptedTelemetry(): TradingViewTelemetrySnapshot {
  const metrics: Record<string, TradingViewTelemetryMetric> = {
    'CTX|META|SCHEMA': metric('CTX|META|SCHEMA', 1),
    'CTX|META|CURRENT_ONLY': metric('CTX|META|CURRENT_ONLY', 1),
    'CTX|META|BAR_TIME': metric('CTX|META|BAR_TIME', 1785931200000),
  };

  for (let index = 0; index < 35; index += 1) {
    const label = `CTX|LEVEL|BROKEN_${index}`;
    metrics[label] = metric(label, 1);
  }

  return {
    indicatorTitle: 'Market Context Telemetry [Agent]',
    schema: 1,
    symbol: 'BTCUSD.P',
    timeframe: '4H',
    capturedAt: Date.now(),
    valid: true,
    quality: 'valid',
    errors: [],
    metrics,
  };
}

function metric(label: string, value: number): TradingViewTelemetryMetric {
  return {
    label,
    value,
    rawValue: String(value),
  };
}
