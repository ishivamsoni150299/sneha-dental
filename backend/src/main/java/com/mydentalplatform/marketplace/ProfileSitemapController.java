package com.mydentalplatform.marketplace;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.*;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import com.mydentalplatform.clinic.ClinicQueryService;
import com.mydentalplatform.provider.PublicProviderService;

@Controller
public class ProfileSitemapController {
    private static final int PAGE_SIZE = 10000;
    private final ClinicQueryService clinics;
    private final PublicProviderService providers;
    private final ProfileHtmlRenderer html;
    private final ResourceLoader resources;
    private final String[] locations;
    public ProfileSitemapController(ClinicQueryService clinics, PublicProviderService providers, ProfileHtmlRenderer html,
        ResourceLoader resources, @Value("${spring.web.resources.static-locations:classpath:/static/}") String[] locations) {
        this.clinics = clinics; this.providers = providers; this.html = html; this.resources = resources; this.locations = locations;
    }
    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    @ResponseBody
    public ResponseEntity<String> index() {
        int pages = (profiles().size() + PAGE_SIZE - 1) / PAGE_SIZE;
        var paths = new ArrayList<String>(); paths.add("/sitemap-pages.xml");
        for (int page = 1; page <= pages; page++) paths.add("/sitemap-profiles/" + page + ".xml");
        return xml("sitemapindex", "sitemap", paths);
    }
    @GetMapping(value = "/sitemap-pages.xml", produces = MediaType.APPLICATION_XML_VALUE)
    @ResponseBody
    public ResponseEntity<String> pages() throws Exception {
        String source = null;
        for (String location : locations) {
            var resource = resources.getResource(location + "sitemap.xml");
            if (resource.exists()) { source = resource.getContentAsString(StandardCharsets.UTF_8); break; }
        }
        if (source == null) throw new IllegalStateException("Static sitemap unavailable");
        var matcher = Pattern.compile("<loc>([^<]+)</loc>").matcher(source);
        var paths = new LinkedHashSet<String>();
        while (matcher.find()) {
            String path = java.net.URI.create(matcher.group(1)).getPath();
            if (path.equals("/dentists")
                || path.matches("/dentists/(noida|delhi|gurugram|ghaziabad|faridabad)")
                || Set.of("/dentists/noida/sector-75", "/dentists/delhi/south-delhi", "/dentists/gurugram/cyber-city").contains(path)
                || path.matches("/dentists/(root-canal|dental-implants|braces|teeth-whitening|cleaning-scaling|emergency)/(noida|delhi|gurugram)")
                || Set.of("/business", "/professional", "/business/privacy", "/business/terms").contains(path)) paths.add(path);
        }
        return xml("urlset", "url", new ArrayList<>(paths));
    }
    @GetMapping(value = "/sitemap-profiles/{page:[0-9]+}.xml", produces = MediaType.APPLICATION_XML_VALUE)
    @ResponseBody
    public ResponseEntity<String> profiles(@PathVariable int page) {
        var paths = profiles();
        long start = ((long) page - 1) * PAGE_SIZE;
        if (page < 1 || start >= paths.size()) return ResponseEntity.notFound().header("X-Robots-Tag", "noindex").build();
        return xml("urlset", "url", paths.subList((int) start, Math.min((int) start + PAGE_SIZE, paths.size())));
    }
    private List<String> profiles() {
        var paths = new TreeSet<String>();
        for (String slug : clinics.publishedSlugs()) if (valid(slug)) paths.add("/clinic/" + slug);
        for (String slug : providers.publishedSlugs()) if (valid(slug)) paths.add("/dentist/" + slug);
        return new ArrayList<>(paths);
    }
    private boolean valid(String slug) { return slug != null && slug.matches("[a-z0-9]+(?:-[a-z0-9]+)*"); }
    private ResponseEntity<String> xml(String root, String item, List<String> paths) {
        StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><" + root + " xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">");
        for (String path : paths) xml.append("<").append(item).append("><loc>").append(ProfileHtmlRenderer.escape(html.url(path))).append("</loc></").append(item).append(">");
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(xml.append("</" + root + ">").toString());
    }
    @ExceptionHandler(Exception.class)
    @ResponseBody
    ResponseEntity<String> unavailable() { return ResponseEntity.status(503).header("X-Robots-Tag", "noindex").cacheControl(CacheControl.noStore()).body("Sitemap temporarily unavailable"); }
}
