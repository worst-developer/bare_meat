import type {
  CoinglassFundingRateSymbol,
  CoinglassGenericPage,
  CoinglassLiquidationsTotals,
  CoinglassLongShortRatio,
  CoinglassOpenInterest,
  CoinglassSection,
  CoinglassSymbol,
} from './types';
import { COINGLASS_SYMBOLS } from './types';

const EXCHANGES = ['binance', 'bybit', 'okx', 'cme'] as const;
const LIQUIDATION_PERIODS = ['1h', '4h', '12h', '24h'] as const;
const TRACKED_SPOT_NETFLOW_SYMBOLS: CoinglassSymbol[] = [...COINGLASS_SYMBOLS];
type ParsedScalar = string | number | boolean;
type ParsedValue = ParsedScalar | ParsedRecord | ParsedRecord[] | string[];
interface ParsedRecord {
  [key: string]: ParsedValue;
}

export function parseCoinglassPage(
  document: Document,
  section: CoinglassSection,
  symbol: CoinglassSymbol
): unknown {
  if (isChallengePage(document)) {
    throw new Error('Coinglass challenge or protection page is visible; solve it in the opened tab and retry');
  }

  if (section === 'openInterest') return withoutNullish(parseOpenInterest(document, symbol));
  if (section === 'fundingRateSymbol') return withoutNullish(parseFundingRateSymbol(document, symbol));
  if (section === 'liquidationsTotals') return withoutNullish(parseLiquidationsTotals(document, symbol));
  if (section === 'fundingRate') return withoutNullish(parseFundingRateOverview(document, symbol));
  if (section === 'longShortRatio') return withoutNullish(parseLongShortRatio(document));
  if (section === 'basis') return withoutNullish(parseBasis(document, symbol));
  if (section === 'etf') return withoutNullish(parseEtf(document, symbol));
  if (section === 'spotInflowOutflow') return withoutNullish(parseSpotInflowOutflow(document, symbol));
  return withoutNullish(parseGenericPage(document, symbol));
}

export function parseGenericPage(document: Document, symbol?: CoinglassSymbol): CoinglassGenericPage {
  const title = text(document.querySelector('h1')) || document.title || 'Coinglass page';
  const selectedSymbol = symbol ?? selectedTabText(document, [...COINGLASS_SYMBOLS]) as CoinglassSymbol | undefined;
  const selectedTimeframe = selectedTabText(document, ['1 hour', '4 hour', '12 hour', '24 hour']);
  return {
    title,
    selectedSymbol,
    selectedTimeframe,
    cards: extractCards(document),
    tables: extractTables(document),
    warnings: [],
  };
}

export function parseOpenInterest(document: Document, symbol: CoinglassSymbol): CoinglassOpenInterest {
  const row = findRow(document, symbol);
  const rowTexts = row ? cellTexts(row) : [];
  const values = rowTexts.flatMap(extractNumbers);
  const money = rowTexts.flatMap(extractMoneyValues);
  const percentages = rowTexts.flatMap(extractPercentValues);
  const tables = extractTables(document);
  const exchanges = pickOpenInterestExchangeRows(tables);
  const majorExchangesOiUsd = sumValues(Object.values(exchanges).map((exchange) => exchange.oiUsd));

  return compactRecord({
    oiUsd: money[1] ?? money[0] ?? values.find((value) => Math.abs(value) > 1_000_000) ?? majorExchangesOiUsd,
    change1hPct: percentages[0],
    change4hPct: percentages[1],
    change24hPct: percentages[2],
    oi24hVol: money[2],
    exchanges,
    rawRow: rowTexts,
  }) as unknown as CoinglassOpenInterest;
}

export function parseFundingRateSymbol(document: Document, symbol: CoinglassSymbol): CoinglassFundingRateSymbol {
  const cards = extractCards(document);
  const averageKey = findKey(cards, ['avg funding', 'average funding']);
  const spreadKey = findKey(cards, ['funding spread', 'spread']);
  const highestKey = findKey(cards, ['highest funding']);
  const lowestKey = findKey(cards, ['lowest funding']);
  const exchangeRows = pickExchangeRows(extractTables(document));

  return compactRecord({
    average: averageKey ? firstPercent(cards[averageKey] ?? '') : undefined,
    spread: spreadKey ? firstPercent(cards[spreadKey] ?? '') : undefined,
    highest: highestKey ? cards[highestKey] : undefined,
    lowest: lowestKey ? cards[lowestKey] : undefined,
    binance: exchangeFunding(exchangeRows.binance),
    bybit: exchangeFunding(exchangeRows.bybit),
    okx: exchangeFunding(exchangeRows.okx),
    rawCards: cards,
  }) as unknown as CoinglassFundingRateSymbol;
}

export function parseLiquidationsTotals(document: Document, symbol: CoinglassSymbol): CoinglassLiquidationsTotals {
  const row = findRow(document, symbol);
  const rowTexts = row ? cellTexts(row) : [];
  const candidates = rowTexts
    .slice(4)
    .flatMap((value) => extractNumbers(value.replace(/[$,%]/g, '')));
  const output: CoinglassLiquidationsTotals = {
    '1h': compactRecord({ long: candidates[0], short: candidates[1] }) as CoinglassLiquidationsTotals['1h'],
    '4h': compactRecord({ long: candidates[2], short: candidates[3] }) as CoinglassLiquidationsTotals['4h'],
    '12h': compactRecord({ long: candidates[4], short: candidates[5] }) as CoinglassLiquidationsTotals['12h'],
    '24h': compactRecord({ long: candidates[6], short: candidates[7] }) as CoinglassLiquidationsTotals['24h'],
    rawRow: rowTexts,
  };
  return output;
}

export function parseLongShortRatio(document: Document): CoinglassLongShortRatio {
  const selected = selectedTabText(document, ['1 hour', '4 hour', '12 hour', '24 hour']);
  const timeframe = normalizePeriod(selected) ?? '4h';
  const bodyText = documentText(document);
  const longMatch = bodyText.match(/(\d+H|\d+\s*hour)\s+Long Volume\s*\$?\s*([0-9.,]+[KMBT]?)/i);
  const shortMatch = bodyText.match(/(\d+H|\d+\s*hour)\s+Short Volume\s*\$?\s*([0-9.,]+[KMBT]?)/i);
  const cards = extractCards(document);
  const longCard = Object.entries(cards).find(([key]) => key.toLowerCase().includes('long volume'));
  const shortCard = Object.entries(cards).find(([key]) => key.toLowerCase().includes('short volume'));

  return compactRecord({
    timeframe,
    longVolume: longMatch?.[2] ? parseNumber(longMatch[2]) : longCard ? firstNumericValue(longCard[1]) : undefined,
    shortVolume: shortMatch?.[2] ? parseNumber(shortMatch[2]) : shortCard ? firstNumericValue(shortCard[1]) : undefined,
    longPct: firstPercentNear(bodyText, 'Long Volume'),
    shortPct: secondPercentNear(bodyText, 'Short Volume') ?? complementPercent(firstPercentNear(bodyText, 'Long Volume')),
    exchanges: pickLongShortExchangeRows(extractTables(document)),
  }) as unknown as CoinglassLongShortRatio;
}

export function parseFundingRateOverview(document: Document, symbol: CoinglassSymbol): unknown {
  const cards = extractCards(document);
  const row = findRow(document, symbol);
  const cells = row ? cellTexts(row) : [];
  const rates = cells.slice(1).map(firstPercent);
  const volumeWeighted = firstPercent(cards[`${symbol} Volume-Weighted Funding Rate`] ?? '');
  const exchangeRates = rates.filter((rate): rate is number => rate !== null);
  return compactRecord({
    title: text(document.querySelector('h1')) || 'Funding rates',
    symbol,
    oiWeighted: firstPercent(cards[`${symbol} OI-Weighted Funding Rate`] ?? '') ?? volumeWeighted ?? average(exchangeRates),
    volumeWeighted,
    exchanges: {
      binance: compactRecord({ rate: rates[0] }),
      okx: compactRecord({ rate: rates[1] }),
      bybit: compactRecord({ rate: rates[2] }),
    },
    highest: splitRankedFunding(cards['Highest Funding Rate'] ?? ''),
    lowest: splitRankedFunding(cards['Lowest Funding Rate'] ?? ''),
  });
}

export function parseBasis(document: Document, symbol: CoinglassSymbol): unknown {
  return {
    title: text(document.querySelector('h1')) || 'Basis',
    symbol,
    exchanges: pickBasisExchangeRows(extractTables(document)),
  };
}

export function parseEtf(document: Document, symbol: CoinglassSymbol): unknown {
  const cards = extractCards(document);
  return {
    title: text(document.querySelector('h1, h2')) || `${symbol} ETF`,
    symbol,
    totalNetInflow: moneyFromCard(cards, 'Total Net Inflow'),
    dailyNetInflow: moneyFromCard(cards, 'Daily Total Net Inflow'),
    dailyTradingVolume: moneyFromCard(cards, 'Daily Trading Volume'),
    totalNetAssets: moneyFromCard(cards, 'Total Net Assets'),
    lastUpdate: firstCardUpdate(cards),
    tables: extractTables(document).slice(0, 2),
  };
}

export function parseSpotInflowOutflow(document: Document, symbol: CoinglassSymbol): unknown {
  assertSpotInflowOutflowPage(document);

  const tables = filterTablesBySymbols(extractTables(document).slice(0, 5), TRACKED_SPOT_NETFLOW_SYMBOLS);
  if (tables.length === 0) {
    throw new Error(`Coinglass spot inflow/outflow ${COINGLASS_SYMBOLS.join('/')} table data was not found`);
  }

  return {
    title: text(document.querySelector('h1, h2')) || 'Spot inflow/outflow',
    symbol,
    symbolRows: tables.flatMap((table) => table.rows.filter((row) => rowMatchesSymbol(row, symbol))),
    tables,
  };
}

export function isChallengePage(document: Document): boolean {
  const content = `${document.title} ${documentText(document)}`.toLowerCase();
  return content.includes('checking your browser')
    || content.includes('ddos')
    || content.includes('cloudflare')
    || content.includes('verify you are human')
    || content.includes('just a moment');
}

function assertSpotInflowOutflowPage(document: Document): void {
  const heading = text(document.querySelector('h1, h2')).toLowerCase();
  const title = document.title.toLowerCase();
  const content = `${document.title} ${documentText(document)}`.toLowerCase();

  if (title.includes('donations') || heading.includes('donations')) {
    throw new Error('Coinglass spot inflow/outflow URL redirected to Donations page');
  }

  if (heading.includes('basis') && !hasSpotFlowTerms(content)) {
    throw new Error('Coinglass spot inflow/outflow URL returned Basis page');
  }

  if (!hasSpotFlowTerms(content)) {
    throw new Error('Coinglass spot inflow/outflow page was not found at this URL');
  }
}

function hasSpotFlowTerms(content: string): boolean {
  const hasFlow = /\b(inflow|outflow|netflow|net flow)\b/i.test(content);
  const hasScope = /\b(spot|exchange)\b/i.test(content);
  return hasFlow && hasScope;
}

export function extractTables(document: Document): Array<{ title: string; headers: string[]; rows: Array<Record<string, string>> }> {
  const antTables = Array.from(document.querySelectorAll('.ant-table-container'))
    .map((container) => antTableToData(container))
    .filter((table) => table.rows.length > 0);
  if (antTables.length > 0) return antTables;

  return Array.from(document.querySelectorAll('table'))
    .map((table) => tableToData(table))
    .filter((table) => table.rows.length > 0);
}

function antTableToData(container: Element): { title: string; headers: string[]; rows: Array<Record<string, string>> } {
  const headers = Array.from(container.querySelectorAll('.ant-table-header th')).map(text).filter(Boolean);
  const rows = Array.from(container.querySelectorAll('.ant-table-body tbody tr'))
    .filter((row) => !row.getAttribute('aria-hidden'))
    .map((row) => rowToRecord(row, headers))
    .filter((row) => Object.values(row).some(Boolean));
  return { title: nearestHeading(container), headers, rows };
}

export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/\s+/g, '').replace(/,/g, '');
  const match = cleaned.match(/(-?\+?\d+(?:\.\d+)?)([KMBT])?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace('+', ''));
  if (!Number.isFinite(amount)) return null;
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : suffix === 'T' ? 1_000_000_000_000 : 1;
  return amount * multiplier;
}

function tableToData(table: HTMLTableElement): { title: string; headers: string[]; rows: Array<Record<string, string>> } {
  const headers = Array.from(table.querySelectorAll('thead th')).map(text).filter(Boolean);
  const title = nearestHeading(table);
  const rows = Array.from(table.querySelectorAll('tbody tr'))
    .filter((row) => !row.getAttribute('aria-hidden'))
    .map((row) => rowToRecord(row, headers))
    .filter((row) => Object.values(row).some(Boolean));

  return { title, headers, rows };
}

function rowToRecord(row: Element, headers: string[]): Record<string, string> {
  const cells = cellTexts(row);
  const result: Record<string, string> = {};
  cells.forEach((cell, index) => {
    result[headers[index] || `col${index}`] = cell;
  });
  return result;
}

function extractCards(document: Document): Record<string, string> {
  const cards: Record<string, string> = {};
  const headings = Array.from(document.querySelectorAll('h2, h3, h4, h5, .MuiTypography-h5'));
  for (const heading of headings) {
    const label = text(heading);
    if (!label) continue;
    const container = closestUsefulContainer(heading);
    const value = text(container).replace(label, '').trim();
    if (value && value.length < 500) cards[label] = value;
  }
  return cards;
}

function pickExchangeRows(tables: Array<{ rows: Array<Record<string, string>> }>): Record<string, Record<string, string | number>> {
  const result: Record<string, Record<string, string | number>> = {};
  for (const exchange of EXCHANGES) {
    const row = tables.flatMap((table) => table.rows).find((candidate) => {
      return Object.values(candidate).some((value) => value.toLowerCase().includes(exchange));
    });
    result[exchange] = row ?? {};
  }
  return result;
}

function pickOpenInterestExchangeRows(tables: Array<{ rows: Array<Record<string, string>> }>): Record<string, Record<string, string | number>> {
  const result: Record<string, Record<string, string | number>> = {};
  for (const exchange of EXCHANGES) {
    const cells = findExchangeCells(tables, exchange);
    result[exchange] = cells.length > 0 ? compactRecord({
      rank: parseNumber(cells[0] ?? ''),
      exchange: cells[1] ?? exchange,
      oiCoin: parseNumber(cells[2] ?? ''),
      oiUsd: parseNumber(cells[3] ?? ''),
      sharePct: firstPercent(cells[4] ?? ''),
      change1hPct: firstPercent(cells[5] ?? ''),
      change4hPct: firstPercent(cells[6] ?? ''),
      change24hPct: firstPercent(cells[7] ?? ''),
      longShortRatio: parseNumber(cells[8] ?? ''),
    }) as Record<string, string | number> : {};
  }
  return result;
}

function pickLongShortExchangeRows(tables: Array<{ rows: Array<Record<string, string>> }>): Record<string, Record<string, string | number>> {
  const result: Record<string, Record<string, string | number>> = {};
  for (const exchange of ['binance', 'okx', 'bybit'] as const) {
    const cells = findExchangeCells(tables, exchange);
    result[exchange] = cells.length > 0 ? compactRecord({
      rank: parseNumber(cells[0] ?? ''),
      exchange: cells[1] ?? exchange,
      sentiment: cells[2],
      retailRatio: parseNumber(cells[3] ?? ''),
      whalePositionRatio: parseNumber(cells[4] ?? ''),
      whaleAccountRatio: parseNumber(cells[5] ?? ''),
      takerBuySellRatio: firstRatio(cells[6] ?? ''),
      takerBuyPct: firstPercent(cells[6] ?? ''),
      takerSellPct: secondPercent(cells[6] ?? ''),
    }) as Record<string, string | number> : {};
  }
  result.cme = {};
  return result;
}

function pickBasisExchangeRows(tables: Array<{ rows: Array<Record<string, string>> }>): Record<string, Record<string, string | number>> {
  const result: Record<string, Record<string, string | number>> = {};
  for (const exchange of ['binance', 'bybit', 'okx'] as const) {
    const cells = findExchangeCells(tables, exchange);
    result[exchange] = cells.length > 0 ? compactRecord({
      exchange: cells[0] ?? exchange,
      index: parseNumber(cells[1] ?? ''),
      quarterly: firstNumber(cells[2] ?? ''),
      quarterlyBasis: secondSignedNumber(cells[2] ?? ''),
      quarterlyPremiumPct: firstPercent(cells[3] ?? ''),
      nextQuarterly: firstNumber(cells[4] ?? ''),
      nextQuarterlyBasis: secondSignedNumber(cells[4] ?? ''),
      nextQuarterlyPremiumPct: firstPercent(cells[5] ?? ''),
      weekly: firstNumber(cells[6] ?? ''),
      weeklyBasis: secondSignedNumber(cells[6] ?? ''),
      weeklyPremiumPct: firstPercent(cells[7] ?? ''),
    }) as Record<string, string | number> : {};
  }
  return result;
}

function findExchangeCells(tables: Array<{ rows: Array<Record<string, string>> }>, exchange: string): string[] {
  const row = tables.flatMap((table) => table.rows).find((candidate) => {
    return Object.values(candidate).some((value) => value.toLowerCase().includes(exchange));
  });
  return row ? Object.values(row).map(String) : [];
}

function exchangeFunding(row: Record<string, string | number> | undefined): { rate?: number; nextSettlement?: string; raw?: string[] } | undefined {
  if (!row || Object.keys(row).length === 0) return undefined;
  const raw = Object.values(row).map(String);
  return compactRecord({
    rate: raw.map(firstPercent).find((value) => value !== null),
    nextSettlement: raw.find((value) => /\d{1,2}:\d{2}|\d+\s*(m|h|hour|min)/i.test(value)),
    raw,
  }) as { rate?: number; nextSettlement?: string; raw?: string[] };
}

function findRow(document: Document, symbol: CoinglassSymbol): HTMLTableRowElement | null {
  const direct = document.querySelector<HTMLTableRowElement>(`tr[data-row-key="${symbol}"]`);
  if (direct) return direct;
  return Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr')).find((row) => {
    const cells = cellTexts(row);
    return cells.some((cell) => cell === symbol || cell.includes(`${symbol} `) || cell.includes(`${symbol}/`));
  }) ?? null;
}

function cellTexts(row: Element): string[] {
  return Array.from(row.querySelectorAll('td, th')).map(text).filter(Boolean);
}

function text(element: Element | Document | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function documentText(document: Document): string {
  return text(document.body) || text(document.documentElement) || text(document);
}

function extractNumbers(value: string): number[] {
  return [...value.matchAll(/[-+]?\$?\d[\d,.]*(?:\.\d+)?[KMBT]?%?/gi)]
    .map((match) => parseNumber(match[0]))
    .filter((number): number is number => number !== null);
}

function extractMoneyValues(value: string): number[] {
  return [...value.matchAll(/\$[-+]?\d[\d,.]*(?:\.\d+)?[KMBT]?/gi)]
    .map((match) => parseNumber(match[0]))
    .filter((number): number is number => number !== null);
}

function extractPercentValues(value: string): number[] {
  return [...value.matchAll(/[-+]?\d[\d,.]*(?:\.\d+)?%/gi)]
    .map((match) => firstPercent(match[0]))
    .filter((number): number is number => number !== null);
}

function firstPercent(value: string): number | null {
  const match = value.match(/[-+]?\d[\d,.]*(?:\.\d+)?%/);
  return match ? parseNumber(match[0]) : null;
}

function firstNumericValue(value: string): number | null {
  return extractNumbers(value)[0] ?? null;
}

function firstNumber(value: string): number | null {
  return extractNumbers(value)[0] ?? null;
}

function secondSignedNumber(value: string): number | null {
  return [...value.matchAll(/[+-]\d[\d,.]*(?:\.\d+)?[KMBT]?/gi)]
    .map((match) => parseNumber(match[0]))
    .find((number): number is number => number !== null) ?? null;
}

function secondPercent(value: string): number | null {
  return extractPercentValues(value)[1] ?? null;
}

function firstPercentNear(value: string, label: string): number | null {
  const index = value.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return null;
  return firstPercent(value.slice(Math.max(0, index - 80), index + 120));
}

function secondPercentNear(value: string, label: string): number | null {
  const index = value.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return null;
  return secondPercent(value.slice(Math.max(0, index - 80), index + 120));
}

function complementPercent(value: number | null): number | null {
  return value === null ? null : Number((100 - value).toFixed(8));
}

function firstRatio(value: string): number | null {
  return parseNumber(value.match(/^\d+(?:\.\d+)?/)?.[0] ?? '');
}

function sumValues(values: Array<string | number | null | undefined>): number | null {
  const numbers = values
    .map((value) => typeof value === 'number' ? value : typeof value === 'string' ? parseNumber(value) : null)
    .filter((value): value is number => value !== null);
  return numbers.length > 0 ? numbers.reduce((sum, value) => sum + value, 0) : null;
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(8));
}

function compactRecord(record: Record<string, unknown>): ParsedRecord {
  return withoutNullish(record) as ParsedRecord;
}

function withoutNullish(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNullish);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null && item !== undefined)
      .map(([key, item]) => [key, withoutNullish(item)])
  );
}

function rowMatchesSymbol(row: Record<string, string>, symbol: CoinglassSymbol): boolean {
  return Object.values(row).some((value) => {
    const normalized = value.toUpperCase();
    return normalized === symbol || normalized.includes(`${symbol}/`) || normalized.includes(`${symbol} `);
  });
}

function filterTablesBySymbols<T extends { rows: Array<Record<string, string>> }>(
  tables: T[],
  symbols: CoinglassSymbol[]
): T[] {
  return tables
    .map((table) => ({
      ...table,
      rows: table.rows.filter((row) => symbols.some((symbol) => rowMatchesSymbol(row, symbol))),
    }))
    .filter((table) => table.rows.length > 0);
}

function moneyFromCard(cards: Record<string, string>, label: string): number | null {
  const key = findKey(cards, [label.toLowerCase()]);
  return key ? extractMoneyValues(cards[key] ?? '')[0] ?? null : null;
}

function firstCardUpdate(cards: Record<string, string>): string | undefined {
  return Object.values(cards)
    .map((value) => value.match(/Last update\s*:\s*([^$]+)$/i)?.[1]?.trim())
    .find(Boolean);
}

function splitRankedFunding(value: string): Array<{ exchange: string; pair: string; rate: number | null }> {
  const matches = [...value.matchAll(/([A-Za-z]+)\s*([A-Z0-9]+\/[A-Z0-9]+)?\s*(-?\d+(?:\.\d+)?%)/g)];
  return matches.slice(0, 5).map((match) => ({
    exchange: match[1] ?? '',
    pair: match[2] ?? '',
    rate: firstPercent(match[3] ?? ''),
  }));
}

function findKey(cards: Record<string, string>, labels: string[]): string | null {
  const entries = Object.keys(cards);
  return entries.find((key) => labels.some((label) => key.toLowerCase().includes(label))) ?? null;
}

function selectedTabText(document: Document, options: string[]): string | undefined {
  const selected = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"], .Mui-selected'))
    .map(text)
    .find((value) => options.some((option) => value.toLowerCase() === option.toLowerCase()));
  return selected;
}

function normalizePeriod(value: string | undefined): '1h' | '4h' | '12h' | '24h' | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  if (normalized === '1hour' || normalized === '1h') return '1h';
  if (normalized === '4hour' || normalized === '4h') return '4h';
  if (normalized === '12hour' || normalized === '12h') return '12h';
  if (normalized === '24hour' || normalized === '24h') return '24h';
  return null;
}

function nearestHeading(table: Element): string {
  let current: Element | null = table;
  for (let depth = 0; current && depth < 5; depth++) {
    const heading = current.querySelector?.('h1, h2, h3');
    if (heading) return text(heading);
    current = current.parentElement;
  }
  return 'Table';
}

function closestUsefulContainer(element: Element): Element {
  return element.closest('.MuiCard-root')
    ?? element.closest('.ant-col')
    ?? element.closest('.MuiBox-root')
    ?? element.parentElement
    ?? element;
}
