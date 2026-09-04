package com.mydentalplatform.auth;

import java.time.Duration;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final ClinicLoginService loginService;
    private final boolean secureCookies;

    public AuthController(
        ClinicLoginService loginService,
        @Value("${platform.auth.secure-cookies}") boolean secureCookies
    ) {
        this.loginService = loginService;
        this.secureCookies = secureCookies;
    }

    @PostMapping("/clinic/login")
    ResponseEntity<LoginResponse> clinicLogin(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.login(
            request.email().trim(), request.password(), servletRequest.getHeader(HttpHeaders.USER_AGENT));
        return loginResponse(result);
    }

    @PostMapping("/refresh")
    ResponseEntity<LoginResponse> refresh(
        @CookieValue(name = "refresh_token", required = false) String refreshToken,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.refresh(
            refreshToken, servletRequest.getHeader(HttpHeaders.USER_AGENT));
        return loginResponse(result);
    }

    private ResponseEntity<LoginResponse> loginResponse(ClinicLoginService.LoginResult result) {
        ResponseCookie cookie = ResponseCookie.from("refresh_token", result.refreshToken().value())
            .httpOnly(true)
            .secure(secureCookies)
            .sameSite("Strict")
            .path("/api/auth")
            .maxAge(Duration.between(java.time.Instant.now(), result.refreshToken().expiresAt()))
            .build();
        AuthUser user = result.user();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new LoginResponse(
                result.accessToken(), result.expiresIn(),
                new UserResponse(user.id(), user.clinicId(), user.role().claimValue(), user.email())));
    }

    @ExceptionHandler(AuthException.class)
    ResponseEntity<ErrorResponse> authFailure(AuthException error) {
        String code = error instanceof PasswordMigrationRequiredException
            ? "password_migration_required"
            : "invalid_credentials";
        return ResponseEntity.status(401).body(new ErrorResponse(code, error.getMessage()));
    }

    record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {
    }

    record LoginResponse(String accessToken, long expiresIn, UserResponse user) {
    }

    record UserResponse(UUID id, UUID clinicId, String role, String email) {
    }

    record ErrorResponse(String code, String message) {
    }
}