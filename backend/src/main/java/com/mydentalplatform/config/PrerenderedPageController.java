package com.mydentalplatform.config;

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

    @GetMapping(value = "/business", produces = MediaType.TEXT_HTML_VALUE)
    @ResponseBody
    Resource business() {
        return new ClassPathResource("static/business/index.html");
    }
}
