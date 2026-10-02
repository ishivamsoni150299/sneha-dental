ALTER TABLE providers ADD COLUMN photo_bytes bytea;
ALTER TABLE providers ADD CONSTRAINT provider_photo_size CHECK (octet_length(photo_bytes) <= 524288);
