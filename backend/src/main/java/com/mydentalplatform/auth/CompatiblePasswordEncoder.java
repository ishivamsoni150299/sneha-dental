package com.mydentalplatform.auth;

import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Keeps existing BCrypt credentials usable while new passwords use Argon2id. */
public final class CompatiblePasswordEncoder implements PasswordEncoder {
    private final PasswordEncoder argon = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    private final PasswordEncoder bcrypt = new BCryptPasswordEncoder();

    @Override public String encode(CharSequence password) { return argon.encode(password); }

    @Override public boolean matches(CharSequence password, String hash) {
        if (password == null || hash == null) return false;
        try {
            if (hash.startsWith("$argon2id$")) return argon.matches(password, hash);
            if (hash.matches("^\\$2[aby]\\$.*")) return bcrypt.matches(password, hash);
            return false;
        } catch (IllegalArgumentException error) { return false; }
    }
}
