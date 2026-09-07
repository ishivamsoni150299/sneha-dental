package com.mydentalplatform.auth;

import java.time.Duration;
import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

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
    private final OtpLoginService otp;

    public AuthController(
        ClinicLoginService loginService,
        PasswordResetService passwordResetService,
        OtpLoginService otp,
        @Value("${platform.auth.secure-cookies}") boolean secureCookies
    ) {
        this.loginService = loginService;
        this.passwordResetService = passwordResetService;
        this.secureCookies = secureCookies;
        this.otp = otp;
    }

    @PostMapping("/otp/request")
    ResponseEntity<Void> requestOtp(@Valid @RequestBody OtpRequest request) {
        otp.send(request.identity(), request.portal());
        return ResponseEntity.accepted().cacheControl(org.springframework.http.CacheControl.noStore()).build();
    }

    @PostMapping("/otp/verify")
    ResponseEntity<LoginResponse> verifyOtp(@Valid @RequestBody OtpVerification request, HttpServletRequest servletRequest) {
        return loginResponse(otp.verify(request.identity(), request.portal(), request.code(), request.fullName(), servletRequest.getHeader(HttpHeaders.USER_AGENT)));
    }

    @PostMapping("/clinic/login")
    ResponseEntity<LoginResponse> clinicLogin(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.login(
            request.email().trim(), request.password(), servletRequest.getHeader(HttpHeaders.USER_AGENT));
        if (result.user().role() == UserRole.DENTIST) {
            loginService.logout(result.refreshToken().value());
            throw new AuthException("Use the dentist portal to sign in.");
        }
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

    @PostMapping("/professional/login")
    ResponseEntity<LoginResponse> professionalLogin(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.login(
            request.email().trim(), request.password(), servletRequest.getHeader(HttpHeaders.USER_AGENT));
        if (result.user().role() != UserRole.DENTIST) {
            loginService.logout(result.refreshToken().value());
            throw new AuthException("Use the portal connected to your account.");
        }
        return loginResponse(result);
    }

    @PostMapping("/professional/signup")
    ResponseEntity<LoginResponse> professionalSignup(
        @Valid @RequestBody ProfessionalSignupRequest request,
        HttpServletRequest servletRequest
    ) {
        ClinicLoginService.LoginResult result = loginService.signupProfessional(
            request.email(), request.password(), request.fullName(),
            servletRequest.getHeader(HttpHeaders.USER_AGENT));
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
            jwt.getClaimAsString("email"), jwt.getClaimAsString("phone"),
            Boolean.TRUE.equals(jwt.getClaim("email_verified")), Boolean.TRUE.equals(jwt.getClaim("phone_verified")));
    }

    private ResponseEntity<LoginResponse> loginResponse(ClinicLoginService.LoginResult result) {
        ResponseCookie cookie = refreshCookie(result.refreshToken().value())
            .maxAge(Duration.between(java.time.Instant.now(), result.refreshToken().expiresAt()))
            .build();
        AuthUser user = result.user();
        return ResponseEntity.ok()
            .cacheControl(org.springframework.http.CacheControl.noStore())
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(new LoginResponse(
                result.accessToken(), result.expiresIn(),
                new UserResponse(user.id(), user.clinicId(), user.role().claimValue(), user.email(), user.phoneE164(), user.emailVerified(), user.phoneVerified())));
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

    record ProfessionalSignupRequest(
        @Email @NotBlank String email,
        @NotBlank @Size(min = 2, max = 160) String fullName,
        @NotBlank @Size(min = 8, max = 72) String password
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

    record UserResponse(UUID id, UUID clinicId, String role, String email, String phoneNumber, boolean emailVerified, boolean phoneVerified) {
    }

    record OtpRequest(@NotBlank @Size(max=254) String identity, @NotBlank @jakarta.validation.constraints.Pattern(regexp="clinic|platform|dentist|patient") String portal) {}
    record OtpVerification(@NotBlank @Size(max=254) String identity, @NotBlank @jakarta.validation.constraints.Pattern(regexp="clinic|platform|dentist|patient") String portal,
        @NotBlank @jakarta.validation.constraints.Pattern(regexp="[0-9]{6,10}") String code, @Size(max=160) String fullName) {}

    record ErrorResponse(String code, String message) {
    }
}
