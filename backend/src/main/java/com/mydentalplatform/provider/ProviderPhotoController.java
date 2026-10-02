package com.mydentalplatform.provider;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import javax.imageio.ImageIO;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ProviderPhotoController {
    private static final int MAX_UPLOAD = 5 * 1024 * 1024;
    private final JdbcTemplate jdbc;
    public ProviderPhotoController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @PutMapping(value = "/api/providers/me/photo", consumes = {"image/jpeg", "image/png"})
    public Map<String, String> upload(@AuthenticationPrincipal Jwt jwt, HttpServletRequest request) throws IOException {
        UUID id = owner(jwt);
        byte[] input = request.getInputStream().readNBytes(MAX_UPLOAD + 1);
        if (input.length > MAX_UPLOAD) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Choose a JPG or PNG smaller than 5 MB.");
        byte[] photo = normalize(input);
        String url = "/api/public/provider-photos/" + id + "?v=" + UUID.randomUUID();
        jdbc.update("UPDATE providers SET photo_bytes = ?, photo_url = ?, updated_at = now() WHERE id = ?", photo, url, id);
        return Map.of("photoUrl", url);
    }

    @DeleteMapping("/api/providers/me/photo")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal Jwt jwt) {
        jdbc.update("UPDATE providers SET photo_bytes = null, photo_url = null, updated_at = now() WHERE id = ?", owner(jwt));
    }

    @GetMapping("/api/providers/me/photo")
    public ResponseEntity<byte[]> ownPhoto(@AuthenticationPrincipal Jwt jwt) { return photo(owner(jwt), false); }

    @GetMapping("/api/public/provider-photos/{id}")
    public ResponseEntity<byte[]> publicPhoto(@PathVariable UUID id) { return photo(id, true); }

    private ResponseEntity<byte[]> photo(UUID id, boolean publishedOnly) {
        var rows = jdbc.query("SELECT photo_bytes FROM providers WHERE id = ? AND photo_bytes IS NOT NULL" +
            (publishedOnly ? " AND active = true AND verification_status = 'verified'" : ""), (rs, row) -> rs.getBytes(1), id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo not found.");
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff").body(rows.getFirst());
    }

    private UUID owner(Jwt jwt) {
        if (jwt == null || !"dentist".equals(jwt.getClaimAsString("role")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dentist access required.");
        var ids = jdbc.queryForList("SELECT id FROM providers WHERE user_id = ?", UUID.class, UUID.fromString(jwt.getSubject()));
        if (ids.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dentist profile not found.");
        return ids.getFirst();
    }

    /** Decode a bounded raster, resize and re-encode so metadata and arbitrary uploaded bytes are never served. */
    static byte[] normalize(byte[] input) {
        try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new IOException();
            var reader = readers.next();
            try {
                if (!Set.of("JPEG", "PNG").contains(reader.getFormatName().toUpperCase(Locale.ROOT))) throw new IOException();
                reader.setInput(stream);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || (long) width * height > 20_000_000) throw new IOException();
                var source = reader.read(0);
                double scale = Math.min(1, 512.0 / Math.max(width, height));
                var resized = new BufferedImage(Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)), BufferedImage.TYPE_INT_RGB);
                var graphics = resized.createGraphics();
                try {
                    graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, resized.getWidth(), resized.getHeight());
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(source, 0, 0, resized.getWidth(), resized.getHeight(), null);
                } finally { graphics.dispose(); }
                var output = new ByteArrayOutputStream(); ImageIO.write(resized, "jpeg", output);
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException | RuntimeException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a valid JPG or PNG photo, up to 20 megapixels.");
        }
    }
}
