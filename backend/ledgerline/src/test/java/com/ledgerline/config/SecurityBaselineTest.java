package com.ledgerline.config;

import com.ledgerline.LedgerLineApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityBaselineTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("Security Rule: Unauthenticated requests to protected routes return 401 Problem JSON without stack trace")
    void unauthenticatedRequestsToProtectedRoutesReturn401ProblemJsonWithoutStackTrace() throws Exception {
        mockMvc.perform(get("/api/accounts")
                        .accept(MediaType.APPLICATION_PROBLEM_JSON, MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(content().string(not(containsString("Exception"))))
                .andExpect(content().string(not(containsString("trace"))));
    }

    @Test
    @DisplayName("Security Rule: CORS rejects unallowed origins and never permits wildcards")
    void corsRejectsUnallowedOrigins() throws Exception {
        mockMvc.perform(options("/api/health")
                        .header("Origin", "http://evil-attacker.com")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Security Rule: CORS accepts configured frontend origin")
    void corsAcceptsConfiguredFrontendOrigin() throws Exception {
        mockMvc.perform(options("/api/health")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    @DisplayName("Security Rule: Short JWT secret less than 32 bytes fails application startup immediately")
    void shortJwtSecretFailsApplicationStartup() {
        SpringApplicationBuilder builder = new SpringApplicationBuilder(LedgerLineApplication.class)
                .profiles("test")
                .properties("spring.main.banner-mode=off");

        assertThatThrownBy(() -> builder.run("--ledgerline.jwt.secret=too-short-secret"))
                .hasRootCauseInstanceOf(IllegalStateException.class)
                .hasStackTraceContaining("JWT_SECRET must be configured and contain at least 32 bytes");
    }
}

