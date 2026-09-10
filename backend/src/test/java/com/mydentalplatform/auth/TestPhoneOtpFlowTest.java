package com.mydentalplatform.auth;

import java.time.*;
import java.util.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TestPhoneOtpFlowTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final SupabaseOtpClient provider = mock(SupabaseOtpClient.class);
    private final AuthUserRepository users = mock(AuthUserRepository.class);
    private final ClinicLoginService login = mock(ClinicLoginService.class);
    private final TokenService tokens = mock(TokenService.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private OtpLoginService service;

    @BeforeEach void setup() {
        var mode = new TestPhoneOtp(true, Instant.parse("2026-09-13T00:00:00Z"),
            Clock.fixed(Instant.parse("2026-09-10T00:00:00Z"), ZoneOffset.UTC));
        service = new OtpLoginService(provider, jdbc, users, login, tokens, manager, mode);
        when(jdbc.queryForObject(contains("auth_otp_limits"), eq(Integer.class), any(Object[].class))).thenReturn(1);
        when(tokens.hashRefreshToken(anyString())).thenReturn("test-hash");
    }

    @Test void sendSkipsSmsOnlyForAllowlistedNumber() {
        service.send(TestPhoneOtp.PHONE, "patient");
        verifyNoInteractions(provider);
        verify(jdbc).update(contains("insert into auth_challenges"), eq(TestPhoneOtp.PHONE), eq("test-hash"));
        service.send("+919473903052", "patient");
        verify(provider).send("+919473903052", true, "/");
    }

    @Test void wrongCodeAndMissingOrConsumedChallengeCannotLogin() {
        assertThrows(AuthException.class, () -> service.verify(TestPhoneOtp.PHONE, "patient", "000000", null, null));
        assertThrows(AuthException.class, () -> service.verify(TestPhoneOtp.PHONE, "patient", "947390", null, null));
        verifyNoInteractions(provider, login, users);
    }

    @Test void validChallengeLogsInPatientWithoutCreatingProviderIdentity() {
        when(jdbc.update(contains("and expires_at > now()"), any(Object[].class))).thenReturn(1);
        var user = new AuthUser(UUID.randomUUID(), null, UserRole.PATIENT, null, TestPhoneOtp.PHONE,
            null, false, true, true, false);
        when(users.findByPhone(TestPhoneOtp.PHONE)).thenReturn(Optional.of(user));
        service.verify(TestPhoneOtp.PHONE, "patient", "947390", null, "test-agent");
        verify(login).verifiedLogin(user, "test-agent");
        verifyNoInteractions(provider);
        verify(jdbc, never()).update(contains("supabase_user_id"), any(Object[].class));
    }

    @Test void staffAndDisabledAccountsCannotUseTestLogin() {
        when(jdbc.update(contains("and expires_at > now()"), any(Object[].class))).thenReturn(1);
        for (var role : new UserRole[]{UserRole.PLATFORM_ADMIN, UserRole.CLINIC_ADMIN, UserRole.DENTIST, UserRole.PATIENT}) {
            var user = new AuthUser(UUID.randomUUID(), null, role, null, TestPhoneOtp.PHONE,
                null, false, true, role != UserRole.PATIENT, false);
            when(users.findByPhone(TestPhoneOtp.PHONE)).thenReturn(Optional.of(user));
            assertThrows(AuthException.class, () -> service.verify(TestPhoneOtp.PHONE, "patient", "947390", null, null));
        }
        verifyNoInteractions(login);
    }

    @Test void testModeStillEnforcesRateLimit() {
        when(jdbc.queryForObject(contains("auth_otp_limits"), eq(Integer.class), any(Object[].class))).thenReturn(11);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> service.verify(TestPhoneOtp.PHONE, "patient", "947390", null, null));
        verifyNoInteractions(login, provider, users);
    }
}
