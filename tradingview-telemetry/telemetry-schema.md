# Telemetry Schema

Schema version: `2`

All fields are numeric and use `CTX|<GROUP>|<SUBGROUP>|<METRIC>`. Disabled or unavailable values are `na`; field names never change.

## Core groups

| Pattern | Unit | Meaning |
| --- | --- | --- |
| `CTX|META|SCHEMA` | number | Schema version. |
| `CTX|META|CURRENT_ONLY` | bool 0/1 | `1` only on the latest bar. |
| `CTX|META|BAR_TIME` | Unix ms | Current bar open time. |
| `CTX|META|BAR_CONFIRMED` | bool 0/1 | Current bar confirmation state. |
| `CTX|PRICE|CLOSE` | price | Chart close. |
| `CTX|LEVEL|DO/PDH/PDL/WO/PWH/PWL/MO/PMH/PML` | price | Daily, weekly, and monthly reference levels. |
| `CTX|DIST|PDH/PDL|PCT` | percent | Signed level distance from close. |
| `CTX|VOLATILITY|ATR/ATR_PCT` | price/percent | ATR and normalized ATR. |
| `CTX|VOLATILITY|DAY_RANGE_ATR/SESSION_RANGE_ATR` | ATR multiple | Developing range divided by ATR. |
| `CTX|RANGE|DAY_USED_PCT/SESSION_USED_PCT` | percent | Developing range divided by rolling normal range. |
| `CTX|VWAP|DAY/WEEK/MONTH/SESSION` | price | Anchored VWAP values. |
| `CTX|VOL|RVOL/SESSION_RVOL` | ratio | Bar and developing-session relative volume. |
| `CTX|VP|FIXED|POC/VAH/VAL` | price | Optional approximate fixed-range profile levels. They are `na` unless approximate profile export is explicitly enabled. |

## Sessions and statistics

`ASIA`, `FRANKFURT`, `LONDON`, and `NY` expose stable `OPEN`, `HIGH`, `LOW`, `RANGE_PCT`, and `ACTIVE` fields. Asia, London, and NY also expose `RETURN_PCT`. Schema 2 calculates these values from intrabars, so boundaries such as New York `09:30` do not inherit an entire hourly chart candle.

| Field | Enum / unit | Meaning |
| --- | --- | --- |
| `CTX|SESSION|LONDON|SWEEP_ASIA_STATE` | 0..3 | `0` none, `1` high, `2` low, `3` both. |
| `CTX|SESSION|NY|SWEEP_LONDON_STATE` | 0..3 | `0` none, `1` high, `2` low, `3` both. |
| `CTX|STAT|ASIA/LONDON/NY|MED_RANGE_PCT` | percent | Median completed-session range for selected sample size. |

## Structure and local technical state

| Pattern | Enum / unit | Meaning |
| --- | --- | --- |
| `CTX|STRUCT|STATE` | -2..2 | Protected-swing external trend; magnitude 2 means matching full EMA alignment. |
| `CTX|STRUCT|LAST_SWING_HIGH/LAST_SWING_LOW/LAST_BOS/LAST_CHOCH` | price | Latest confirmed external pivots and close/wick-confirmed protected-structure breaks. |
| `CTX|STRUCT|BARS_SINCE_BOS` | bars | Bars since latest structure break. |
| `CTX|EMA|20/50/100/200` | price | Local chart EMA values. |
| `CTX|EMA|STACK` | -2..2 | EMA alignment classification. |
| `CTX|EMA|NEAREST_DIST_PCT` | percent | Absolute distance to nearest configured EMA. |
| `CTX|SWEEP|PDH/PDL/PWH/PWL` | 0..3 | `0` untouched, `1` swept, `2` accepted beyond, `3` swept and reclaimed. |

## Cross-market and CME

Each of `USDTD`, `BTCD`, `ETHBTC`, `DXY`, `NASDAQ`, `SPX`, `VIX`, and `US10Y` exposes `PRICE`, `RET_1H`, `RET_4H`, and `RET_1D`. Returns are percent changes of the latest source-timeframe close against its prior close.

`CTX|CME|FRI_CLOSE`, `MON_OPEN`, `GAP_TOP`, and `GAP_BOTTOM` are prices. `CTX|CME|GAP_OPEN` is bool `0/1` and turns off after the daily CME range fills the Friday-close boundary.
