package com.mydentalplatform.config;

import com.mydentalplatform.PlatformApplication;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.SpringApplication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "DEPLOYMENT_DATABASE_SMOKE", matches = "true")
class ProductionStartupTest {
    @Test
    void productionStartsMigratesAndServesDatabaseHealth() throws Exception {
        try (var context = SpringApplication.run(PlatformApplication.class,
            "--spring.profiles.active=production", "--server.port=0")) {
            assertEquals(0, context.getBean(Flyway.class).info().pending().length);
            String port = context.getEnvironment().getRequiredProperty("local.server.port");
            var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
                .timeout(Duration.ofSeconds(30)).GET().build();
            try (var client = HttpClient.newHttpClient()) {
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertEquals(200, response.statusCode());
                assertTrue(response.body().contains("\"service\":\"mydentalplatform-java\""));
                assertTrue(response.body().contains("\"status\":\"ok\""));
            }
        }
    }
}