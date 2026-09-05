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
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final ClinicLoginService loginService;
    private final PasswordResetService passwordResetService;
    private final boolean secureCookies;

    public AuthController(
        ClinicLoginService loginService,
        PasswordResetService passwordResetService,
        @Value("${platform.auth.secure-cookies}") boolean secureCookies
    ) {
        this.loginService = loginService;
        this.passwordResetService = passwordResetService;
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

    @PostMapping("/clinic/signup")
    ResponseEntity<LoginResponse> clinicSignup(
        @Valid @RequestBody SignupRequest request,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.signup(
            request.email(), request.password(), servletRequest.getHeader(HttpHeaders.USER_AGENT));
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

    @PostMapping("/logout")
    ResponseEntity<Void> logout(
        @CookieValue(name = "refresh_token", required = false) String refreshToken
    ) {
        loginService.logout(refreshToken);
        return ResponseEntity.noContent()
            .header(HttpHeaders.SET_COOKIE, expiredRefreshCookie().toString())
            .build();
    }

    @PostMapping("/password-reset/request")
    ResponseEntity<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        passwordResetService.request(request.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password-reset/complete")
    ResponseEntity<Void> completePasswordReset(@Valid @RequestBody PasswordResetCompletion request) {
        passwordResetService.complete(request.email(), request.token(), request.password());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        String clinicId = jwt.getClaimAsString("clinic_id");
        return new UserResponse(
            UUID.fromString(jwt.getSubject()),
            clinicId == null ? null : UUID.fromString(clinicId),
            jwt.getClaimAsString("role"),
            jwt.getClaimAsString("email"));
    }

    private ResponseEntity<LoginResponse> loginResponse(ClinicLoginService.LoginResult result) {
        ResponseCookie cookie = refreshCookie(result.refreshToken().value())
            .maxAge(Duration.between(java.time.Instant.now(), result.refreshToken().expiresAt()))
            .build();
        AuthUser user = result.user();
        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new LoginResponse(
                result.accessToken(), result.expiresIn(),
                new UserResponse(user.id(), user.clinicId(), user.role().claimValue(), user.email())));
    }

    private ResponseCookie.ResponseCookieBuilder refreshCookie(String value) {
        return ResponseCookie.from("refresh_token", value)
            .httpOnly(true)
            .secure(secureCookies)
            .sameSite("Strict")
            .path("/api/auth");
    }

    private ResponseCookie expiredRefreshCookie() {
        return refreshCookie("").maxAge(Duration.ZERO).build();
    }

    @ExceptionHandler(AuthException.class)
    ResponseEntity<ErrorResponse> authFailure(AuthException error) {
        String code = error instanceof PasswordMigrationRequiredException
            ? "password_migration_required"
            : "invalid_credentials";
        int status = error instanceof AuthConflictException ? 409 : 401;
        return ResponseEntity.status(status).body(new ErrorResponse(code, error.getMessage()));
    }

    record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {
    }

    record SignupRequest(
        @Email @NotBlank String email,
        @NotBlank @jakarta.validation.constraints.Size(min = 8, max = 72) String password
    ) {
    }

    record PasswordResetRequest(@Email @NotBlank String email) {
    }

    record PasswordResetCompletion(
        @Email @NotBlank String email,
        @NotBlank String token,
        @NotBlank @jakarta.validation.constraints.Size(min = 8, max = 72) String password
    ) {
    }

    record LoginResponse(String accessToken, long expiresIn, UserResponse user) {
    }

    record UserResponse(UUID id, UUID clinicId, String role, String email) {
    }

    record ErrorResponse(String code, String message) {
    }
}