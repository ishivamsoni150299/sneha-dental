package com.mydentalplatform.auth;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

public final class PatientIdentity {
    private PatientIdentity() {}
    public static String requirePhone(Jwt jwt, String suppliedPhone) {
        if (jwt == null || !"patient".equals(jwt.getClaimAsString("role")) || !Boolean.TRUE.equals(jwt.getClaim("phone_verified")))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Verify your mobile number to continue.");
        String phone = jwt.getClaimAsString("phone");
        String supplied = suppliedPhone == null ? "" : suppliedPhone.replaceAll("[^0-9]", "");
        if (phone == null || supplied.length() < 10 || !phone.endsWith(supplied.substring(supplied.length() - 10)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Use the mobile number verified for this session.");
        return phone;
    }
}
