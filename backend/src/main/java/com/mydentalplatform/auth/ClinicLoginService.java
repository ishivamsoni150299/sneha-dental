package com.mydentalplatform.auth;

import java.time.Clock;
import java.time.Instant;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClinicLoginService {
    private final AuthUserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final Clock clock;

    public ClinicLoginService(
        AuthUserRepository userRepository,
        RefreshTokenRepository refreshTokenRepository,
        PasswordEncoder passwordEncoder,
        TokenService tokenService
    ) {
        this(userRepository, refreshTokenRepository, passwordEncoder, tokenService, Clock.systemUTC());
    }

    ClinicLoginService(
        AuthUserRepository userRepository,
        RefreshTokenRepository refreshTokenRepository,
        PasswordEncoder passwordEncoder,
        TokenService tokenService,
        Clock clock
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.clock = clock;
    }

    @Transactional
    public LoginResult login(String email, String password, String userAgent) {
        AuthUser user = userRepository.findByEmail(email)
            .filter(candidate -> candidate.passwordHash() != null)
            .filter(candidate -> passwordEncoder.matches(password, candidate.passwordHash()))
            .orElseThrow(() -> new AuthException("Invalid email or password."));

        if (!user.enabled()) throw new AuthException("This account is disabled.");
        if (user.passwordMigrationRequired()) {
            throw new PasswordMigrationRequiredException();
        }
        if (!user.emailVerified()) throw new AuthException("Verify your email before signing in.");
        if (user.role() == UserRole.PATIENT) throw new AuthException("Use mobile verification to sign in.");

        Instant now = clock.instant();
        TokenService.RefreshToken refreshToken = tokenService.createRefreshToken(now);
        refreshTokenRepository.create(user.id(), refreshToken.hash(), refreshToken.expiresAt(), userAgent);
        return new LoginResult(
            tokenService.createAccessToken(user, now),
            tokenService.accessTokenExpiresInSeconds(),
            refreshToken,
            user);
    }

    @Transactional
    public LoginResult refresh(String refreshTokenValue, String userAgent) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw new AuthException("Refresh token is required.");
        }
        Instant now = clock.instant();
        RefreshTokenRepository.RefreshSession session = refreshTokenRepository
            .findActiveForUpdate(tokenService.hashRefreshToken(refreshTokenValue), now)
            .orElseThrow(() -> new AuthException("Refresh token is invalid or expired."));
        AuthUser user = session.user();
        if (!user.enabled() || user.passwordMigrationRequired()) {
            throw new AuthException("This session is no longer valid.");
        }

        TokenService.RefreshToken replacement = tokenService.createRefreshToken(now);
        java.util.UUID replacementId = refreshTokenRepository.create(
            user.id(), replacement.hash(), replacement.expiresAt(), userAgent);
        refreshTokenRepository.revokeAndReplace(session.tokenId(), replacementId, now);
        return new LoginResult(
            tokenService.createAccessToken(user, now),
            tokenService.accessTokenExpiresInSeconds(),
            replacement,
            user);
    }

    public record LoginResult(
        String accessToken,
        long expiresIn,
        TokenService.RefreshToken refreshToken,
        AuthUser user
    ) {
    }
}