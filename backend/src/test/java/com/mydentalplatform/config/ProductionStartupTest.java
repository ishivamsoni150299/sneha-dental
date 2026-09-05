package com.mydentalplatform.config;

import com.mydentalplatform.PlatformApplication;
import com.mydentalplatform.auth.AuthException;
import com.mydentalplatform.auth.ClinicLoginService;
import com.mydentalplatform.auth.UserRole;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@EnabledIfEnvironmentVariable(named = "DEPLOYMENT_DATABASE_SMOKE", matches = "true")
class ProductionStartupTest {
    @Test
    void productionStartsMigratesAndServesDatabaseHealth() throws Exception {
        try (var context = SpringApplication.run(PlatformApplication.class,
            "--spring.profiles.active=production", "--server.port=0")) {
            assertEquals(0, context.getBean(Flyway.class).info().pending().length);
            String adminPassword = System.getenv("DEPLOYMENT_ADMIN_PASSWORD");
            if (adminPassword != null) {
                var loginService = context.getBean(ClinicLoginService.class);
                var login = loginService.login(System.getenv("DEPLOYMENT_ADMIN_EMAIL"), adminPassword, "deployment-smoke");
                assertEquals(UserRole.PLATFORM_ADMIN, login.user().role());
                var refreshed = loginService.refresh(login.refreshToken().value(), "deployment-smoke");
                assertThrows(AuthException.class,
                    () -> loginService.refresh(login.refreshToken().value(), "deployment-smoke"));
                loginService.logout(refreshed.refreshToken().value());
                assertThrows(AuthException.class,
                    () -> loginService.refresh(refreshed.refreshToken().value(), "deployment-smoke"));
            }
            String port = context.getEnvironment().getRequiredProperty("local.server.port");
            var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
                .timeout(Duration.ofSeconds(30)).GET().build();
            try (var client = HttpClient.newHttpClient()) {
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                assertEquals(200, response.statusCode());
                assertTrue(response.body().contains("\"service\":\"mydentalplatform-java\""));
                assertTrue(response.body().contains("\"status\":\"ok\""));
                assertStatus(client, port, "/api/marketplace/clinics?region=pune", 200);
                assertStatus(client, port, "/api/marketplace/clinics", 400);
                assertStatus(client, port, "/api/auth/me", 401);
                if (System.getenv("SPRING_WEB_RESOURCES_STATIC_LOCATIONS") != null) {
                    for (String route : new String[] {"/", "/index.html", "/platform/login", "/appointments"}) {
                        var page = assertStatus(client, port, route, 200);
                        assertTrue(page.body().contains("<app-root"), route);
                    }
                }
            }
        }
    }

    private HttpResponse<String> assertStatus(HttpClient client, String port, String path, int expected)
        throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .timeout(Duration.ofSeconds(30)).GET().build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(expected, response.statusCode(), path);
        return response;
    }
}