package com.mydentalplatform.auth;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingMobileVerificationTest {
    @Test
    void realDatabaseProofIsPhoneBoundExpiringSingleUseAndRollsBackWithFailedBooking() throws Exception {
        try (var postgres = EmbeddedPostgres.builder().setPort(0).start()) {
            var ds = postgres.getPostgresDatabase(); var jdbc = new JdbcTemplate(ds);
            jdbc.execute("create table booking_mobile_verifications(token_hash varchar(128) primary key, phone text, expires_at timestamptz, consumed_at timestamptz)");
            jdbc.execute("create table auth_otp_limits(key_hash varchar(128) primary key, window_start timestamptz, attempts integer)");
            var tokens = mock(TokenService.class); when(tokens.hashRefreshToken(anyString())).thenAnswer(call -> call.getArgument(0));
            var twilio = mock(TwilioVerifyClient.class); when(twilio.available()).thenReturn(true);
            var service = new BookingMobileVerification(jdbc, tokens, twilio, false);
            assertTrue(service.status().get("required"), "Configuring Twilio automatically requires verification");
            assertThrows(ResponseStatusException.class, () -> service.consume("9999999999", null));
            String proof = service.verify("9999999999", "123456");
            verify(twilio).check("+919999999999", "123456");
            assertThrows(ResponseStatusException.class, () -> service.consume("8888888888", proof));
            var transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
            assertThrows(IllegalStateException.class, () -> transaction.execute(status -> {
                service.consume("9999999999", proof); throw new IllegalStateException("slot was taken");
            }));
            service.consume("9999999999", proof);
            assertThrows(ResponseStatusException.class, () -> service.consume("9999999999", proof));
            String expired = service.verify("9999999999", "123456");
            jdbc.update("update booking_mobile_verifications set expires_at = now() - interval '1 minute' where token_hash = ?", expired);
            assertThrows(ResponseStatusException.class, () -> service.consume("9999999999", expired));
            doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST)).when(twilio).check(anyString(), eq("000000"));
            int count = jdbc.queryForObject("select count(*) from booking_mobile_verifications", Integer.class);
            assertThrows(ResponseStatusException.class, () -> service.verify("9999999999", "000000"));
            assertEquals(count, jdbc.queryForObject("select count(*) from booking_mobile_verifications", Integer.class));
            service.send("8888888888"); service.send("8888888888"); service.send("8888888888");
            assertThrows(ResponseStatusException.class, () -> service.send("8888888888"));
            verify(twilio, times(3)).send("+918888888888");
        }
    }

    @Test
    void explicitlyRequiredVerificationFailsClosedWithoutConfiguredProvider() {
        var twilio = mock(TwilioVerifyClient.class);
        var service = new BookingMobileVerification(mock(JdbcTemplate.class), mock(TokenService.class), twilio, true);
        assertTrue(service.status().get("required")); assertFalse(service.status().get("available"));
        assertThrows(ResponseStatusException.class, () -> service.consume("9999999999", null));
    }
}
