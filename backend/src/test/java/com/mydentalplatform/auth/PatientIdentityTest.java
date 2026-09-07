package com.mydentalplatform.auth;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class PatientIdentityTest {
    @Test void rejectsUnverifiedAndDifferentPhoneIdentities() {
        var jwt = Jwt.withTokenValue("test").header("alg", "HS256").subject("patient")
            .claim("role", "patient").claim("phone", "+919876543210").claim("phone_verified", true).build();
        assertEquals("+919876543210", PatientIdentity.requirePhone(jwt, "9876543210"));
        assertThrows(ResponseStatusException.class, () -> PatientIdentity.requirePhone(jwt, "9999999999"));
        assertThrows(ResponseStatusException.class, () -> PatientIdentity.requirePhone(null, "9876543210"));
        var unverified = Jwt.withTokenValue("test").header("alg", "HS256").subject("patient")
            .claim("role", "patient").claim("phone", "+919876543210").claim("phone_verified", false).build();
        assertThrows(ResponseStatusException.class, () -> PatientIdentity.requirePhone(unverified, "9876543210"));
    }
}
