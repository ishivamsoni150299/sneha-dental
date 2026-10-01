package com.mydentalplatform.config;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.core.io.Resource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.AbstractResourceResolver;
import org.springframework.web.servlet.resource.ResourceResolverChain;

@Configuration
public class SpaRoutingConfig implements WebMvcConfigurer {
    @Value("${spring.web.resources.static-locations:classpath:/static/}")
    private String[] staticLocations;

    static boolean isBrowserNavigation(HttpServletRequest request) {
        String path = request.getRequestURI();
        String accept = request.getHeader("Accept");
        return "GET".equals(request.getMethod()) && accept != null && accept.contains("text/html")
            && !path.contains(".")
            && !reservedPath(path, "/api") && !reservedPath(path, "/actuator")
            && !reservedPath(path, "/webhooks");
    }

    private static boolean reservedPath(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**").addResourceLocations(staticLocations)
            .resourceChain(true).addResolver(new AbstractResourceResolver() {
                @Override
                protected Resource resolveResourceInternal(HttpServletRequest request, String path,
                    List<? extends Resource> locations, ResourceResolverChain chain) {
                    Resource resource = chain.resolveResource(request, path, locations);
                    if (resource == null && request != null && isBrowserNavigation(request)) {
                        return chain.resolveResource(request, "index.html", locations);
                    }
                    return resource;
                }

                @Override
                protected String resolveUrlPathInternal(String path, List<? extends Resource> locations,
                    ResourceResolverChain chain) {
                    return chain.resolveUrlPath(path, locations);
                }
            });
    }

    static final String[] ROUTES = {
        "/business", "/business/**", "/professional", "/professional/**",
        "/dentists", "/dentists/**", "/dentist/**", "/clinic/**",
        "/services", "/about", "/appointment", "/appointment/**",
        "/appointments", "/account", "/account/recovery", "/platform/login", "/coming-soon", "/video-test",
        "/admin", "/admin/**",
        "/gallery", "/testimonials", "/contact", "/my-appointment",
        "/privacy", "/terms"
    };

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        for (String route : ROUTES) {
            if ("/dentists".equals(route) || "/business".equals(route)) {
                continue;
            }
            registry.addViewController(route).setViewName("forward:/index.html");
        }
    }
}
