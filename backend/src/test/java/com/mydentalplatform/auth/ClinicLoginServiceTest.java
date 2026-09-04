package com.mydentalplatform.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class ClinicLoginServiceTest {
    private static final Instant NOW = Instant.parse("2026-09-04T08:00:00Z");

    private AuthUserRepository userRepository;
    private RefreshTokenRepository refreshTokenRepository;
    private PasswordEncoder passwordEncoder;
    private TokenService tokenService;
    private ClinicLoginService loginService;

    @BeforeEach
    void setUp() {
        userRepository = mock(AuthUserRepository.class);
        refreshTokenRepository = mock(RefreshTokenRepository.class);
        passwordEncoder = mock(PasswordEncoder.class);
        tokenService = mock(TokenService.class);
        loginService = new ClinicLoginService(
            userRepository,
            refreshTokenRepository,
            passwordEncoder,
            tokenService,
            Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void issuesTokensAndPersistsOnlyTheRefreshTokenHash() {
        AuthUser user = clinicAdmin(false);
        TokenService.RefreshToken refreshToken = new TokenService.RefreshToken(
            "plain-refresh-token", "hashed-refresh-token", NOW.plusSeconds(604_800));
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correct-password", user.passwordHash())).thenReturn(true);
        when(tokenService.createAccessToken(user, NOW)).thenReturn("access-token");
        when(tokenService.createRefreshToken(NOW)).thenReturn(refreshToken);
        when(tokenService.accessTokenExpiresInSeconds()).thenReturn(900L);

        ClinicLoginService.LoginResult result = loginService.login(
            "owner@example.com", "correct-password", "test-browser");

        assertEquals("access-token", result.accessToken());
        assertEquals("plain-refresh-token", result.refreshToken().value());
        verify(refreshTokenRepository).create(
            user.id(), "hashed-refresh-token", refreshToken.expiresAt(), "test-browser");
    }

    @Test
    void requiresResetForMigratedFirebasePassword() {
        AuthUser user = clinicAdmin(true);
        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correct-password", user.passwordHash())).thenReturn(true);

        assertThrows(PasswordMigrationRequiredException.class, () ->
            loginService.login("owner@example.com", "correct-password", "test-browser"));

        verify(refreshTokenRepository, never()).create(any(), any(), any(), any());
        verify(tokenService, never()).createAccessToken(eq(user), any());
    }

    private AuthUser clinicAdmin(boolean passwordMigrationRequired) {
        return new AuthUser(
            UUID.fromString("f982a5a0-c77d-4fb9-a45b-e35fe73556b1"),
            UUID.fromString("4aeb5bad-8de9-4121-a750-9e6ca0d879b3"),
            UserRole.CLINIC_ADMIN,
            "owner@example.com",
            null,
            "$2a$12$password-hash",
            true,
            false,
            true,
            passwordMigrationRequired);
    }
}