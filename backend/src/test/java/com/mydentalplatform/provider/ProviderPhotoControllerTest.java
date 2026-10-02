package com.mydentalplatform.provider;

import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class ProviderPhotoControllerTest {
    @Test void resizesAndConvertsPngToJpeg() throws Exception {
        var source = new BufferedImage(1200, 800, BufferedImage.TYPE_INT_ARGB);
        var input = new ByteArrayOutputStream(); ImageIO.write(source, "png", input);
        byte[] output = ProviderPhotoController.normalize(input.toByteArray());
        var image = ImageIO.read(new ByteArrayInputStream(output));
        assertEquals(512, image.getWidth()); assertEquals(341, image.getHeight());
        assertEquals(0xff, output[0] & 255); assertEquals(0xd8, output[1] & 255);
        assertTrue(output.length < 524288);
    }
    @Test void rejectsNonImagesAndSvg() {
        assertThrows(ResponseStatusException.class, () -> ProviderPhotoController.normalize("not a photo".getBytes()));
        assertThrows(ResponseStatusException.class, () -> ProviderPhotoController.normalize("<svg xmlns='http://www.w3.org/2000/svg'></svg>".getBytes()));
    }
}
