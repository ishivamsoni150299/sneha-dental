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

    @Test
    void rotatesRefreshTokenAndRevokesTheUsedToken() {
        AuthUser user = clinicAdmin(false);
        UUID oldTokenId = UUID.fromString("dd28433c-f1e8-4b0c-9950-09c777156c3d");
        UUID newTokenId = UUID.fromString("cb916957-ed8b-440b-a05a-e8f42dfa1335");
        TokenService.RefreshToken replacement = new TokenService.RefreshToken(
            "new-plain-token", "new-token-hash", NOW.plusSeconds(604_800));
        when(tokenService.hashRefreshToken("old-plain-token")).thenReturn("old-token-hash");
        when(refreshTokenRepository.findActiveForUpdate("old-token-hash", NOW))
            .thenReturn(Optional.of(new RefreshTokenRepository.RefreshSession(oldTokenId, user)));
        when(tokenService.createRefreshToken(NOW)).thenReturn(replacement);
        when(refreshTokenRepository.create(
            user.id(), replacement.hash(), replacement.expiresAt(), "test-browser"))
            .thenReturn(newTokenId);
        when(tokenService.createAccessToken(user, NOW)).thenReturn("new-access-token");
        when(tokenService.accessTokenExpiresInSeconds()).thenReturn(900L);

        ClinicLoginService.LoginResult result = loginService.refresh("old-plain-token", "test-browser");

        assertEquals("new-access-token", result.accessToken());
        assertEquals("new-plain-token", result.refreshToken().value());
        verify(refreshTokenRepository).revokeAndReplace(oldTokenId, newTokenId, NOW);
    }

    @Test
    void logoutRevokesThePresentedRefreshTokenHash() {
        when(tokenService.hashRefreshToken("plain-refresh-token")).thenReturn("refresh-token-hash");

        loginService.logout("plain-refresh-token");

        verify(refreshTokenRepository).revokeByHash("refresh-token-hash", NOW);
    }

    @Test
    void signupHashesPasswordAndStartsAnIncompleteClinicSession() {
        AuthUser user = new AuthUser(
            UUID.randomUUID(), null, UserRole.INCOMPLETE_SIGNUP, "new@example.com", null,
            "encoded-password", true, false, true, false);
        TokenService.RefreshToken refreshToken = new TokenService.RefreshToken(
            "plain-refresh-token", "hashed-refresh-token", NOW.plusSeconds(604_800));
        when(userRepository.findByEmail("new@example.com")).thenReturn(Optional.empty());
        when(passwordEncoder.encode("strong-password")).thenReturn("encoded-password");
        when(userRepository.createClinicSignup("new@example.com", "encoded-password")).thenReturn(user);
        when(tokenService.createRefreshToken(NOW)).thenReturn(refreshToken);
        when(tokenService.createAccessToken(user, NOW)).thenReturn("access-token");
        when(tokenService.accessTokenExpiresInSeconds()).thenReturn(900L);

        ClinicLoginService.LoginResult result = loginService.signup(
            "NEW@example.com", "strong-password", "test-browser");

        assertEquals(UserRole.INCOMPLETE_SIGNUP, result.user().role());
        verify(refreshTokenRepository).create(
            user.id(), "hashed-refresh-token", refreshToken.expiresAt(), "test-browser");
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