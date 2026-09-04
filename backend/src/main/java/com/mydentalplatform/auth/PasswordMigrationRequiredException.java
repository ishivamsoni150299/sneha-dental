package com.mydentalplatform.auth;

public class PasswordMigrationRequiredException extends AuthException {
    public PasswordMigrationRequiredException() {
        super("Reset your password to finish migrating your account.");
    }
}