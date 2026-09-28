-- No IPs, user agents, raw installation tokens, media data, or exact times.
CREATE TABLE update_installations (
    day TEXT NOT NULL,
    installation_hash TEXT NOT NULL CHECK(length(installation_hash) = 64),
    version TEXT NOT NULL CHECK(length(version) <= 11),
    PRIMARY KEY (day, installation_hash)
) WITHOUT ROWID;

CREATE TABLE update_daily_totals (
    day TEXT PRIMARY KEY NOT NULL,
    installations INTEGER NOT NULL CHECK(installations >= 0)
) WITHOUT ROWID;
