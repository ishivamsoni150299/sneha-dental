package com.mydentalplatform.video;

import java.time.Instant;

public interface VideoRoomClient {
    boolean configured();
    Session createSession(String roomName, Instant opens, Instant expires, boolean host);

    record Session(String url, String token, String expiresAt, String provider) {
        public Session(String url, String token, String expiresAt) { this(url, token, expiresAt, "daily"); }
    }
}
