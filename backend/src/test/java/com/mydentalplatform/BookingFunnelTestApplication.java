package com.mydentalplatform;

import com.mydentalplatform.auth.TwilioVerifyClient;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.Mockito.*;

/** Browser-test launcher. Never packaged in the production artifact; only SMS delivery is simulated. */
public class BookingFunnelTestApplication {
    public static void main(String[] args) {
        String database = System.getenv().getOrDefault("JDBC_DATABASE_URL", "");
        if (!"1".equals(System.getenv("E2E_ISOLATED_DB")) || !database.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/.*(?:e2e|test).*"))
            throw new IllegalStateException("Use an isolated local E2E database.");
        SpringApplication.run(new Class<?>[]{PlatformApplication.class, SmsFixture.class}, args);
    }
    @TestConfiguration(proxyBeanMethods = false)
    public static class SmsFixture {
        @Bean @Primary TwilioVerifyClient fixtureTwilio() {
            var client = mock(TwilioVerifyClient.class);
            when(client.available()).thenReturn(true);
            doAnswer(call -> { if (!"123456".equals(call.getArgument(1))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Incorrect code. Please try again."); return null; })
                .when(client).check(anyString(), anyString());
            return client;
        }
    }
}
