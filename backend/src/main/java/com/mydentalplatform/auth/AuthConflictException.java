package com.mydentalplatform.auth;

public class AuthConflictException extends AuthException {
    public AuthConflictException(String message) {
        super(message);
    }
}