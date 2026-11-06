package com.ledgerline.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    private final String allowedOrigin;
    private final ObjectMapper objectMapper;

    public SecurityConfig(
            @Value("${ledgerline.cors.allowed-origin:http://localhost:5173}") String allowedOrigin,
            ObjectMapper objectMapper) {
        this.allowedOrigin = allowedOrigin;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // CSRF is disabled: this is a stateless REST API using Authorization Bearer JWT tokens without session cookies.
        http.csrf(AbstractHttpConfigurer::disable);

        http.cors(cors -> cors.configurationSource(corsConfigurationSource()));

        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        http.headers(headers -> headers
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(contentType -> {})
                .httpStrictTransportSecurity(hsts -> hsts
                        .includeSubDomains(true)
                        .maxAgeInSeconds(31536000))
        );

        http.authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                .anyRequest().authenticated()
        );

        http.exceptionHandling(exceptions -> exceptions
                .authenticationEntryPoint((request, response, authException) -> {
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType("application/problem+json");
                    Map<String, Object> problem = Map.of(
                            "type", "about:blank",
                            "title", "Unauthorized",
                            "status", 401,
                            "detail", "Full authentication is required to access this resource",
                            "timestamp", Instant.now().toString()
                    );
                    response.getWriter().write(objectMapper.writeValueAsString(problem));
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    response.setContentType("application/problem+json");
                    Map<String, Object> problem = Map.of(
                            "type", "about:blank",
                            "title", "Forbidden",
                            "status", 403,
                            "detail", "You do not have permission to access this resource",
                            "timestamp", Instant.now().toString()
                    );
                    response.getWriter().write(objectMapper.writeValueAsString(problem));
                })
        );

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // Strict single origin from configuration. Never wildcard "*".
        config.setAllowedOrigins(List.of(allowedOrigin));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key"));
        config.setExposedHeaders(List.of("Idempotent-Replayed"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // Enforce BCrypt strength 12 as per security specification
        return new BCryptPasswordEncoder(12);
    }
}

