package com.mydentalplatform.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        for (String route : new String[] {
            "/business", "/business/**", "/dentists", "/dentists/**",
            "/services", "/about", "/appointment", "/appointment/**",
            "/gallery", "/testimonials", "/contact", "/my-appointment",
            "/privacy", "/terms"
        }) {
            registry.addViewController(route).setViewName("forward:/index.html");
        }
    }
}