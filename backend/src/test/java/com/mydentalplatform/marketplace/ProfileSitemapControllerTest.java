package com.mydentalplatform.marketplace;

import java.nio.file.*;
import java.util.*;
import java.util.stream.IntStream;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.DefaultResourceLoader;
import com.mydentalplatform.clinic.ClinicQueryService;
import com.mydentalplatform.provider.PublicProviderService;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProfileSitemapControllerTest {
    @TempDir Path folder;
    @Test void includesAllRegionsDeduplicatesAndSplitsWithoutFalseTimestamps() throws Exception {
        var clinics = mock(ClinicQueryService.class); var providers = mock(PublicProviderService.class);
        when(clinics.publishedSlugs()).thenReturn(List.of("pune-clinic", "pune-clinic", "invalid/slug"));
        var slugs = new ArrayList<>(IntStream.range(0, 10001).mapToObj(i -> "dentist-" + i).toList());
        slugs.add("dentist-0"); when(providers.publishedSlugs()).thenReturn(slugs);
        var resources = new DefaultResourceLoader(); String[] locations = {folder.toUri().toString()};
        var controller = new ProfileSitemapController(clinics, providers,
            new ProfileHtmlRenderer(resources, locations, "https://public.example.test", new ObjectMapper()), resources, locations);
        var index = controller.index().getBody();
        assertTrue(index.contains("/sitemap-profiles/2.xml")); assertFalse(index.contains("/sitemap-profiles/3.xml"));
        String first = controller.profiles(1).getBody(), second = controller.profiles(2).getBody();
        assertEquals(10000, urls(first)); assertEquals(2, urls(second));
        assertTrue(first.contains("/clinic/pune-clinic")); assertFalse(first.contains("lastmod"));
        assertFalse(first.contains("invalid/slug")); assertFalse(first.contains("/dentists/dentist-"));
        assertEquals(404, controller.profiles(0).getStatusCode().value());
        assertEquals(404, controller.profiles(3).getStatusCode().value());
        when(providers.publishedSlugs()).thenReturn(List.of()); when(clinics.publishedSlugs()).thenReturn(List.of());
        assertFalse(controller.index().getBody().contains("sitemap-profiles"));
        assertEquals(404, controller.profiles(1).getStatusCode().value());
    }
    @Test void staticPagesExcludeAliasesBookingsAndAccounts() throws Exception {
        Files.writeString(folder.resolve("sitemap.xml"), "<urlset>" + String.join("", List.of("/", "/dentists", "/dentists/noida", "/dentists/old-profile", "/dentists/old-profile/book", "/appointments", "/account", "/business")
            .stream().map(path -> "<url><loc>https://old.example" + path + "</loc><lastmod>2000-01-01</lastmod></url>").toList()) + "</urlset>");
        var resources = new DefaultResourceLoader(); String[] locations = {folder.toUri().toString()};
        var controller = new ProfileSitemapController(mock(ClinicQueryService.class), mock(PublicProviderService.class),
            new ProfileHtmlRenderer(resources, locations, "https://public.example.test", new ObjectMapper()), resources, locations);
        String page = controller.pages().getBody(); assertEquals(3, urls(page));
        assertTrue(page.contains("https://public.example.test/dentists/noida"));
        assertFalse(page.contains("old-profile")); assertFalse(page.contains("lastmod")); assertFalse(page.contains("old.example"));
    }
    private int urls(String xml) throws Exception {
        var factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        return factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8))).getElementsByTagName("url").getLength();
    }
}
