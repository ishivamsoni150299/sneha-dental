package com.mydentalplatform.marketplace;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;
import tools.jackson.databind.ObjectMapper;

/** Uses the application shell for every visitor, with escaped public content. */
@Service
public class ProfileHtmlRenderer {
    private final ResourceLoader resources;
    private final String[] locations;
    private final String origin;
    private final ObjectMapper mapper;
    public ProfileHtmlRenderer(ResourceLoader resources,
        @Value("${spring.web.resources.static-locations:classpath:/static/}") String[] locations,
        @Value("${platform.public-base-url}") String origin, ObjectMapper mapper) {
        this.resources = resources; this.locations = locations; this.origin = origin.replaceAll("/+$", ""); this.mapper = mapper;
    }
    public String url(String path) { return origin + path; }
    public String imageUrl(String image) {
        return image == null || image.isBlank() ? url("/og-default.svg") : image.startsWith("/") ? url(image) : image;
    }
    public static String escape(Object value) { return HtmlUtils.htmlEscape(value == null ? "" : value.toString()); }
    public String render(String title, String description, String path, String image, String summary, List<Map<String, Object>> graph) throws IOException {
        String html = null;
        for (String location : locations) {
            var resource = resources.getResource(location + "index.html");
            if (resource.exists()) { html = resource.getContentAsString(StandardCharsets.UTF_8); break; }
        }
        if (html == null) throw new IOException("Application shell unavailable");
        html = html.replaceAll("(?is)<title\\b[^>]*>.*?</title>", "")
            .replaceAll("(?is)<meta\\b[^>]*(?:name|property)\\s*=\\s*[\"'](?:description|robots|googlebot|geo\\.[^\"']*|ICBM|og:[^\"']*|twitter:[^\"']*)[\"'][^>]*>", "")
            .replaceAll("(?is)<link\\b[^>]*rel\\s*=\\s*[\"']canonical[\"'][^>]*>", "")
            .replaceAll("(?is)<link\\b[^>]*hreflang\\s*=\\s*[\"'][^\"']*[\"'][^>]*>", "")
            .replaceAll("(?is)<script\\b[^>]*type\\s*=\\s*[\"']application/ld\\+json[\"'][^>]*>.*?</script>", "");
        String canonical = url(path);
        var entities = new ArrayList<>(graph);
        entities.add(Map.of("@type", "BreadcrumbList", "itemListElement", List.of(
            Map.of("@type", "ListItem", "position", 1, "name", "Dentists", "item", url("/dentists")),
            Map.of("@type", "ListItem", "position", 2, "name", graph.getFirst().get("name"), "item", canonical))));
        String photo = imageUrl(image);
        String schema = mapper.writeValueAsString(Map.of("@context", "https://schema.org", "@graph", entities))
            .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026");
        String head = "<title>" + escape(title) + "</title><link rel=\"canonical\" href=\"" + escape(canonical) + "\">"
            + "<link rel=\"alternate\" hreflang=\"en-IN\" href=\"" + escape(canonical) + "\"><link rel=\"alternate\" hreflang=\"x-default\" href=\"" + escape(canonical) + "\">"
            + meta("description", description, false) + meta("robots", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1", false)
            + meta("googlebot", "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1", false)
            + meta("og:title", title, true) + meta("og:description", description, true) + meta("og:url", canonical, true)
            + meta("og:type", "website", true) + meta("og:image", photo, true)
            + meta("twitter:card", "summary_large_image", false) + meta("twitter:title", title, false)
            + meta("twitter:description", description, false) + meta("twitter:image", photo, false)
            + "<script type=\"application/ld+json\" id=\"seo-schema\">" + schema + "</script>";
        return html.replace("</head>", head + "</head>").replaceFirst("(?s)<app-root[^>]*>.*?</app-root>",
            Matcher.quoteReplacement("<app-root>" + summary + "</app-root>"));
    }
    private String meta(String name, String value, boolean property) {
        return "<meta " + (property ? "property" : "name") + "=\"" + name + "\" content=\"" + escape(value) + "\">";
    }
}
