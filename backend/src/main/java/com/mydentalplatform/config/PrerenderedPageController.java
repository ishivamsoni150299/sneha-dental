package com.mydentalplatform.config;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
final class PrerenderedPageController {
    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    ResponseEntity<Resource> home(HttpServletRequest request) {
        String host = request.getServerName().toLowerCase();
        if ("mydentalplatform.com".equals(host) || "www.mydentalplatform.com".equals(host)) {
            return ResponseEntity.status(HttpStatus.PERMANENT_REDIRECT)
                .header("Location", "/dentists")
                .build();
        }
        return ResponseEntity.ok(new ClassPathResource("static/index.html"));
    }

    @GetMapping(value = "/dentists", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource dentists() {
        return new ClassPathResource("static/dentists/index.html");
    }

    @GetMapping(value = {
        "/dentists/noida", "/dentists/delhi", "/dentists/gurugram",
        "/dentists/ghaziabad", "/dentists/faridabad",
        "/dentists/noida/sector-75", "/dentists/delhi/south-delhi",
        "/dentists/gurugram/cyber-city",
        "/dentists/root-canal/delhi", "/dentists/root-canal/noida", "/dentists/root-canal/gurugram",
        "/dentists/dental-implants/delhi", "/dentists/dental-implants/noida", "/dentists/dental-implants/gurugram",
        "/dentists/braces/delhi", "/dentists/braces/noida",
        "/dentists/teeth-whitening/delhi", "/dentists/teeth-whitening/noida",
        "/dentists/cleaning-scaling/delhi", "/dentists/cleaning-scaling/noida",
        "/dentists/emergency/delhi", "/dentists/emergency/noida"
    }, produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource dentistLandingPage(HttpServletRequest request) {
        return new ClassPathResource("static" + request.getRequestURI() + "/index.html");
    }

    @GetMapping(value = "/business", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource business() {
        return new ClassPathResource("static/business/index.html");
    }
}
