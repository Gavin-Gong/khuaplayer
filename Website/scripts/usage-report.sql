-- Private report: update-check installations, not people or playback DAU.
-- Today is partial; all windows include today's UTC date.
SELECT 'today (UTC, partial)' AS metric, COUNT(DISTINCT installation_hash) AS installations
FROM update_installations WHERE day = date('now')
UNION ALL
SELECT 'last 7 UTC dates', COUNT(DISTINCT installation_hash)
FROM update_installations WHERE day BETWEEN date('now', '-6 days') AND date('now')
UNION ALL
SELECT 'last 30 UTC dates', COUNT(DISTINCT installation_hash)
FROM update_installations WHERE day BETWEEN date('now', '-29 days') AND date('now');

SELECT day, installations FROM update_daily_totals ORDER BY day DESC LIMIT 90;

-- Attribute each installation to its most recently observed version.
WITH recent AS (
  SELECT version, ROW_NUMBER() OVER (PARTITION BY installation_hash ORDER BY day DESC) AS position
  FROM update_installations WHERE day BETWEEN date('now', '-29 days') AND date('now')
)
SELECT version, COUNT(*) AS installations FROM recent WHERE position = 1
GROUP BY version ORDER BY installations DESC;
