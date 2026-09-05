package com.mydentalplatform.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {
    static final String[] ROUTES = {
        "/business", "/business/**", "/dentists", "/dentists/**",
        "/services", "/about", "/appointment", "/appointment/**",
        "/appointments", "/platform/login", "/coming-soon",
        "/admin", "/admin/**",
        "/gallery", "/testimonials", "/contact", "/my-appointment",
        "/privacy", "/terms"
    };

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        for (String route : ROUTES) {
            registry.addViewController(route).setViewName("forward:/index.html");
        }
    }
}
