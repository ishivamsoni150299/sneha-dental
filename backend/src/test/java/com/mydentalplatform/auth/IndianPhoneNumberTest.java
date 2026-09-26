package com.mydentalplatform.auth;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

class IndianPhoneNumberTest {
    @Test void acceptsOnlyUnambiguousIndianMobiles() {
        assertEquals("+919876543210", IndianPhoneNumber.parse("9876543210").e164());
        assertEquals("9876543210", IndianPhoneNumber.parse("+919876543210").national());
        for (String invalid : new String[] { "19876543210", "919876543210", "foo9876543210", "+91 9876543210", "5876543210" }) {
            assertThrows(ResponseStatusException.class, () -> IndianPhoneNumber.parse(invalid), invalid);
        }
    }
}
