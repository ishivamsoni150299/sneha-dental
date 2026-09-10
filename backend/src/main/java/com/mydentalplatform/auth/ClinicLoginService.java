package com.mydentalplatform.auth;

import java.time.Clock;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired
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

        if (user.role() == UserRole.PATIENT) throw new AuthException("Use mobile verification to sign in.");

        return verifiedLogin(user, userAgent);
    }

    @Transactional
    public LoginResult signup(String email, String password, String userAgent) {
        String normalizedEmail = email.trim().toLowerCase(java.util.Locale.ROOT);
        if (userRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new AuthConflictException("An account already exists for this email.");
        }
        AuthUser user = userRepository.createClinicSignup(
            normalizedEmail, passwordEncoder.encode(password));
        return verifiedLogin(user, userAgent);
    }

    @Transactional
    public LoginResult signupProfessional(String email, String password, String fullName, String userAgent) {
        String normalizedEmail = email.trim().toLowerCase(java.util.Locale.ROOT);
        if (userRepository.findByEmail(normalizedEmail).isPresent()) {
            throw new AuthConflictException("An account already exists for this email.");
        }
        AuthUser user = userRepository.createProfessionalSignup(
            normalizedEmail, passwordEncoder.encode(password), fullName);
        return verifiedLogin(user, userAgent);
    }

    @Transactional
    public LoginResult refresh(String refreshTokenValue, String userAgent) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) {
            throw new AuthException("Refresh token is required.");
        }
        Instant now = clock.instant();
        RefreshTokenRepository.RefreshSession session = refreshTokenRepository
            .findActiveForUpdate(tokenService.hashRefreshToken(refreshTokenValue), now)
            .orElseThrow(() -> {
                refreshTokenRepository.revokeReplayedFamily(tokenService.hashRefreshToken(refreshTokenValue), now);
                return new AuthException("Refresh token is invalid or expired. Sign in again.");
            });
        AuthUser user = session.user();
        if (!user.enabled() || user.passwordMigrationRequired() ||
            (user.role() == UserRole.PATIENT ? !user.phoneVerified() : user.passwordHash() == null)) {
            throw new AuthException("This session is no longer valid.");
        }

        TokenService.RefreshToken candidate = tokenService.createRefreshToken(now);
        TokenService.RefreshToken replacement = new TokenService.RefreshToken(candidate.value(), candidate.hash(),
            candidate.expiresAt().isBefore(session.familyExpiresAt()) ? candidate.expiresAt() : session.familyExpiresAt());
        java.util.UUID replacementId = refreshTokenRepository.create(
            user.id(), replacement.hash(), replacement.expiresAt(), userAgent, session.familyId(), session.familyExpiresAt());
        refreshTokenRepository.revokeAndReplace(session.tokenId(), replacementId, now);
        return new LoginResult(
            tokenService.createAccessToken(user, now, session.familyId()),
            tokenService.accessTokenExpiresInSeconds(),
            replacement,
            user);
    }

    @Transactional
    public void logout(String refreshTokenValue) {
        if (refreshTokenValue == null || refreshTokenValue.isBlank()) return;
        refreshTokenRepository.revokeByHash(
            tokenService.hashRefreshToken(refreshTokenValue), clock.instant());
    }

    @Transactional
    public LoginResult verifiedLogin(AuthUser user, String userAgent) {
        if (!user.enabled()) throw new AuthException("This account is disabled.");
        Instant now = clock.instant();
        var refresh = tokenService.createRefreshToken(now);
        var family = java.util.UUID.randomUUID();
        refreshTokenRepository.create(user.id(), refresh.hash(), refresh.expiresAt(), userAgent, family, refresh.expiresAt());
        return new LoginResult(tokenService.createAccessToken(user, now, family), tokenService.accessTokenExpiresInSeconds(), refresh, user);
    }

    public record LoginResult(
        String accessToken,
        long expiresIn,
        TokenService.RefreshToken refreshToken,
        AuthUser user
    ) {
    }
}
