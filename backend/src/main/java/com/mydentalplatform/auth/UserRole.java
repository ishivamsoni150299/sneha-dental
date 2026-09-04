package com.mydentalplatform.auth;

public enum UserRole {
    CLINIC_ADMIN("clinic-admin"),
    PLATFORM_ADMIN("platform-admin"),
    PATIENT("patient");

    private final String claimValue;

    UserRole(String claimValue) {
        this.claimValue = claimValue;
    }

    public String claimValue() {
        return claimValue;
    }

    static UserRole fromDatabase(String value) {
        return valueOf(value.toUpperCase());
    }
}