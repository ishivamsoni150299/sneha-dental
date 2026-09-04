package com.mydentalplatform.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class TokenService {
    private final JwtEncoder jwtEncoder;
    private final SecureRandom secureRandom = new SecureRandom();
    private final String issuer;
    private final Duration accessTokenTtl;
    private final Duration refreshTokenTtl;

    public TokenService(
        JwtEncoder jwtEncoder,
        @Value("${platform.auth.issuer}") String issuer,
        @Value("${platform.auth.access-token-ttl}") Duration accessTokenTtl,
        @Value("${platform.auth.refresh-token-ttl}") Duration refreshTokenTtl
    ) {
        this.jwtEncoder = jwtEncoder;
        this.issuer = issuer;
        this.accessTokenTtl = accessTokenTtl;
        this.refreshTokenTtl = refreshTokenTtl;
    }

    public String createAccessToken(AuthUser user, Instant issuedAt) {
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
            .issuer(issuer)
            .subject(user.id().toString())
            .issuedAt(issuedAt)
            .expiresAt(issuedAt.plus(accessTokenTtl))
            .claim("role", user.role().claimValue())
            .claim("email_verified", user.emailVerified())
            .claim("phone_verified", user.phoneVerified());
        if (user.email() != null) claims.claim("email", user.email());
        if (user.phoneE164() != null) claims.claim("phone", user.phoneE164());
        if (user.clinicId() != null) claims.claim("clinic_id", user.clinicId().toString());

        return jwtEncoder.encode(JwtEncoderParameters.from(
            JwsHeader.with(MacAlgorithm.HS256).build(), claims.build())).getTokenValue();
    }

    public RefreshToken createRefreshToken(Instant issuedAt) {
        byte[] bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return new RefreshToken(value, sha256(value), issuedAt.plus(refreshTokenTtl));
    }

    public long accessTokenExpiresInSeconds() {
        return accessTokenTtl.toSeconds();
    }

    public String hashRefreshToken(String value) {
        return sha256(value);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable.", error);
        }
    }

    public record RefreshToken(String value, String hash, Instant expiresAt) {
    }
}