package com.mydentalplatform.appointment;

import java.util.*;

public final class AppointmentTransitions {
    private static final Map<String, Set<String>> NEXT = Map.of(
        "pending", Set.of("confirmed", "declined", "cancelled"),
        "confirmed", Set.of("checked_in", "completed", "no_show", "cancelled"),
        "checked_in", Set.of("completed", "cancelled"));
    private AppointmentTransitions() {}
    public static boolean allows(String from, String to) {
        return to != null && NEXT.getOrDefault(from, Set.of()).contains(to);
    }
}
