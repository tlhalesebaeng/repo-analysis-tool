-- 002: metric-spec revisions.
--
-- The final metric specification scopes all metrics to non-merge commits
-- reachable from a reference commit (default HEAD), and defines author
-- ownership as a churn fraction instead of a blame-based line count.

ALTER TABLE repositories ADD COLUMN reference TEXT NOT NULL DEFAULT 'HEAD';

-- Blame output is no longer needed; ownership = author churn / total churn.
DROP TABLE file_ownership;
