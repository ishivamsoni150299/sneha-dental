package com.mydentalplatform.config;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
final class PrerenderedPageController {
    @GetMapping(value = "/dentists", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource dentists() {
        return new ClassPathResource("static/dentists/index.html");
    }

    @GetMapping(value = {
        "/dentists/noida", "/dentists/delhi", "/dentists/gurugram",
        "/dentists/noida/sector-75", "/dentists/root-canal/noida",
        "/dentists/dental-implants/delhi"
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
