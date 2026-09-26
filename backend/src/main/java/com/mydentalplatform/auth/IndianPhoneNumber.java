package com.mydentalplatform.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Accepts only a ten-digit Indian mobile or its explicit +91 form. */
public record IndianPhoneNumber(String e164) {
    public static IndianPhoneNumber parse(String value) {
        String input = value == null ? "" : value.trim();
        String digits;
        if (input.matches("[6-9][0-9]{9}")) digits = input;
        else if (input.matches("\\+91[6-9][0-9]{9}")) digits = input.substring(3);
        else throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit Indian mobile number.");
        return new IndianPhoneNumber("+91" + digits);
    }

    public String national() { return e164.substring(3); }
}
