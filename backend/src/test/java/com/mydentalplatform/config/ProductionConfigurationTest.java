package com.mydentalplatform.config;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ProductionConfigurationTest {
    @Test void rejectsDevelopmentCredentialsAndInsecureCookies() {
        assertThrows(IllegalStateException.class, () -> new ProductionConfiguration(true, true, "https://example.test", "secret"));
        assertThrows(IllegalStateException.class, () -> new ProductionConfiguration(false, false, "https://example.test", "secret"));
        assertThrows(IllegalStateException.class, () -> new ProductionConfiguration(false, true, "http://localhost", "secret"));
        assertDoesNotThrow(() -> new ProductionConfiguration(false, true, "https://example.test", "unique-secret"));
    }
}
