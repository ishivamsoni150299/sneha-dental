-- V10: Denormalize review ratings onto the clinics table for fast marketplace sorting/filtering.

ALTER TABLE clinics ADD COLUMN rating_count smallint NOT NULL DEFAULT 0;
ALTER TABLE clinics ADD COLUMN average_rating numeric(3,2) DEFAULT NULL;

-- Backfill from existing published reviews
UPDATE clinics c
SET rating_count = sub.cnt,
    average_rating = sub.avg
FROM (
    SELECT clinic_id, count(*)::smallint AS cnt, round(avg(rating), 2) AS avg
    FROM appointment_reviews
    WHERE moderation_status = 'published'
    GROUP BY clinic_id
) sub
WHERE c.id = sub.clinic_id;

-- Index for marketplace sort-by-rating
CREATE INDEX idx_clinics_average_rating ON clinics (average_rating DESC NULLS LAST) WHERE active = true AND marketplace_status = 'verified';
