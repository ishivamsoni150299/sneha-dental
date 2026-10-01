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
    private final org.springframework.core.io.ResourceLoader resources;
    private final String[] staticLocations;
    PrerenderedPageController(org.springframework.core.io.ResourceLoader resources,
        @org.springframework.beans.factory.annotation.Value("${spring.web.resources.static-locations:classpath:/static/}") String[] staticLocations) {
        this.resources = resources; this.staticLocations = staticLocations;
    }
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
    Resource dentists(HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        if (request.getParameterMap().keySet().stream().anyMatch(java.util.Set.of("q", "treatment", "location", "mode", "fee", "rating", "gender")::contains))
            response.setHeader("X-Robots-Tag", "noindex, follow");
        return new ClassPathResource("static/dentists/index.html");
    }

    @GetMapping(value = {"/privacy", "/terms"}, produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    ResponseEntity<Resource> legalAlias(HttpServletRequest request) {
        if (java.util.Set.of("mydentalplatform.com", "www.mydentalplatform.com").contains(request.getServerName().toLowerCase()))
            return ResponseEntity.status(HttpStatus.PERMANENT_REDIRECT).header("Location", "/business" + request.getRequestURI()).build();
        return ResponseEntity.ok(new ClassPathResource("static/index.html"));
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

    @GetMapping(value = {"/business", "/professional", "/account", "/account/recovery", "/business/privacy", "/business/terms"}, produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource platformPage(HttpServletRequest request) {
        for (String location : staticLocations) {
            Resource page = resources.getResource(location + request.getRequestURI().substring(1) + "/index.html");
            if (page.exists()) return page;
        }
        return resources.getResource(staticLocations[0] + "index.html");
    }
}
