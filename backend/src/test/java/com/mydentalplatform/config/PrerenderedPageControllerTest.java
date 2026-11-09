package com.mydentalplatform.config;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PrerenderedPageControllerTest {
    @TempDir Path directory;

    @ParameterizedTest
    @ValueSource(strings = {"/", "/privacy", "/terms", "/dentists", "/dentists/noida", "/business"})
    void servesGetAndHeadFromConfiguredStaticLocations(String route) throws Exception {
        String resource = route.equals("/") || route.equals("/privacy") || route.equals("/terms")
            ? "index.html" : route.substring(1) + "/index.html";
        Path file = directory.resolve(resource);
        Files.createDirectories(file.getParent());
        String html = "<html><body>Configured page: " + route + "</body></html>";
        Files.writeString(file, html);
        var controller = new PrerenderedPageController(new DefaultResourceLoader(),
            new String[] {"classpath:/missing-test-assets/", directory.toUri().toString()});
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(get(route)).andExpect(status().isOk()).andExpect(content().string(html));
        // MockMvc does not apply the servlet container's HEAD body suppression.
        mvc.perform(head(route)).andExpect(status().isOk())
            .andExpect(header().longValue("Content-Length", Files.size(file)));
    }
}
