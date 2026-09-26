# Session Validation Caching Plan

## Current Design

`VerifiedSessionFilter` performs a live PostgreSQL query on every authenticated request:

```sql
SELECT EXISTS(
  SELECT 1 FROM users u JOIN refresh_tokens rt ON rt.user_id = u.id
  WHERE u.id = ? AND u.enabled
    AND replace(u.role::text, '_', '-') = ?
    AND u.clinic_id IS NOT DISTINCT FROM ?::uuid
    AND rt.family_id = ? AND rt.revoked_at IS NULL
    AND LEAST(rt.expires_at, rt.family_expires_at) > now()
    ...
)
```

### Why this is acceptable now

- At current scale (~100–1 000 QPS), the query hits indexed columns and runs in <1 ms.
- The immediate revocation guarantee is a strong security property: disabled users, changed roles, and revoked sessions stop instantly.
- Virtual threads (Spring Boot 3.4+) prevent this blocking I/O from exhausting the thread pool.

## Future Caching Strategy

When request volume exceeds ~5 000 QPS, introduce a short-TTL local cache:

### Phase 1: Caffeine local cache

1. Add a `session_version` (`bigint NOT NULL DEFAULT 1`) column to `users`.
2. Increment `session_version` on: password change, role change, `enabled` toggle, explicit session revocation.
3. Cache key: `(user_id, family_id)` → `SessionValidity { valid, sessionVersion, expiresAt }`.
4. TTL: 30–60 seconds. On cache hit, compare `session_version` in JWT claim with cached value.
5. On mismatch or cache miss, fall through to the live DB query.

### Phase 2: Redis (multi-instance)

If the application scales horizontally beyond a single JVM:

1. Replace Caffeine with Redis (`SET EX` with 30–60 s TTL).
2. On revocation events, publish a Redis pub/sub message to invalidate across instances.
3. Alternatively, use the `session_version` approach — each instance's Caffeine cache naturally expires within the TTL window.

### Benchmark thresholds

| Scale | Recommendation |
|---|---|
| <1 000 QPS | Live DB query (current) |
| 1 000–5 000 QPS | Monitor query latency; prepare Caffeine integration |
| >5 000 QPS | Deploy Caffeine cache with session_version |
| Multi-instance >5 000 QPS | Add Redis or pub/sub invalidation |

## Migration checklist

- [ ] Add `session_version` column to `users` (Flyway migration)
- [ ] Add `sv` claim to JWT in `TokenService.createAccessToken()`
- [ ] Implement `CachingSessionFilter` wrapping `VerifiedSessionFilter`
- [ ] Add cache invalidation hooks to `ClinicLoginService.logout()`, password change, role change
- [ ] Load test at target QPS to validate cache hit rates
