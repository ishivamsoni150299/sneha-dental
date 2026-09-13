package com.mydentalplatform.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;

class PasswordEncodingTest {
    @Test void productionEncoderCanHashAndVerifyPasswords() {
        var encoder = new SecurityConfig().passwordEncoder();
        var hash = encoder.encode("Example-password-928!");
        assertTrue(hash.length() <= 100, "Must fit the deployed users.password_hash column");
        assertTrue(encoder.matches("Example-password-928!", hash));
        assertFalse(encoder.matches("wrong-password", hash));
    }
    @Test void existingBcryptAccountsStillWork() {
        var encoder = new SecurityConfig().passwordEncoder();
        var hash = new BCryptPasswordEncoder().encode("Existing-password-72!");
        assertTrue(encoder.matches("Existing-password-72!", hash));
        assertFalse(encoder.matches("wrong-password", hash));
        assertFalse(encoder.matches("anything", "invalid-hash"));
    }
}
