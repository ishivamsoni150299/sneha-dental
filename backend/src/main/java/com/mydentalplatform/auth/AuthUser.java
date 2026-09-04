package com.mydentalplatform.auth;

import java.util.UUID;

public record AuthUser(
    UUID id,
    UUID clinicId,
    UserRole role,
    String email,
    String phoneE164,
    String passwordHash,
    boolean emailVerified,
    boolean phoneVerified,
    boolean enabled,
    boolean passwordMigrationRequired
) {
}